import { auth } from '../../lib/firebase';

/** Forced refreshes are throttled per user by Firebase (auth/quota-exceeded) — never more than one per window. */
const FORCED_REFRESH_COOLDOWN_MS = 30_000;

let inflight: { uid: string; force: boolean; promise: Promise<void> } | null = null;
let lastForcedRefresh: { uid: string; at: number } | null = null;

function getToken(uid: string, force: boolean): Promise<void> {
  const user = auth?.currentUser;
  if (!user || user.uid !== uid) return Promise.resolve();
  if (inflight && inflight.uid === uid && (inflight.force || !force)) return inflight.promise;
  const promise = user
    .getIdToken(force)
    .then(() => {
      if (force) lastForcedRefresh = { uid, at: Date.now() };
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { uid, force, promise };
  return promise;
}

/**
 * Ensure Firestore requests include auth token (fixes Expo Go permission races).
 * Uses the cached token (refreshed only when expired); concurrent callers share one request.
 */
export function ensureAuthTokenReady(uid: string, options?: { forceRefresh?: boolean }): Promise<void> {
  return getToken(uid, options?.forceRefresh === true);
}

function isPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

/**
 * Run a Firestore call for `uid`. Right after sign-in / account creation the rules can see a stale
 * token — on `permission-denied`, force one token refresh (shared, rate-limited) and retry once.
 */
export async function withAuthRetry<T>(uid: string, op: () => Promise<T>): Promise<T> {
  await ensureAuthTokenReady(uid);
  const startedAt = Date.now();
  try {
    return await op();
  } catch (error) {
    if (!isPermissionDenied(error) || auth?.currentUser?.uid !== uid) throw error;
    const last = lastForcedRefresh?.uid === uid ? lastForcedRefresh.at : 0;
    if (last < startedAt) {
      if (Date.now() - last < FORCED_REFRESH_COOLDOWN_MS) throw error;
      await ensureAuthTokenReady(uid, { forceRefresh: true });
    }
    return op();
  }
}
