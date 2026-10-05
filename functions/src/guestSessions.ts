import * as logger from 'firebase-functions/logger';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'crypto';
import { untraditionalDeletePerson } from './untraditionalCio';

/**
 * Guest box recovery — server-side copy of a signed-out visitor's in-progress box.
 *
 * Collections (all client access denied in firestore.rules; functions only):
 *   guestSessions/{visitorId}      snapshot + summary flags, TTL on `expireAt` (60 days)
 *   guestResumeTokens/{sha256}     one-click resume links minted by retentionLead (30 days)
 *   retentionLeadEvents/{sha256}   dedupe + audit for forwarded Retention leads
 *
 * TTL policy (one-time, not part of `firebase deploy`):
 *   gcloud firestore fields ttls update expireAt --collection-group=guestSessions --project=grapejuice-pilot
 *   gcloud firestore fields ttls update expiresAt --collection-group=guestResumeTokens --project=grapejuice-pilot
 */

export const GUEST_SESSION_SCHEMA_VERSION = 1;
export const GUEST_SESSION_TTL_DAYS = 60;
export const RESUME_TOKEN_TTL_DAYS = 30;
/** Resume links are meant for one person; cap re-use so a leaked link cannot be hammered. */
export const RESUME_TOKEN_MAX_USES = 25;
export const SNAPSHOT_MAX_BYTES = 50_000;
const SAVE_MIN_INTERVAL_MS = 2_000;

export const VISITOR_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SNAPSHOT_TOP_LEVEL_KEYS = new Set(['v', 'guest', 'gift', 'entry', 'path']);

const APP_ORIGIN = process.env.GJ_APP_ORIGIN?.trim() || 'https://grapejuice.co';

export function appOrigin(): string {
  return APP_ORIGIN;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function emailHash(email: string): string {
  return sha256Hex(email.trim().toLowerCase());
}

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function arrayLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

export type GuestSessionSummary = {
  hasBox: boolean;
  hasGiftDraft: boolean;
  boxItemCount: number;
  kidCount: number;
  onboardingStep: string | null;
};

/** Derive the flags the lead function and campaigns key off. Mirrors src/stores/guestSessionStore.ts. */
export function summarizeSnapshot(snapshot: JsonRecord): GuestSessionSummary {
  const guest = isRecord(snapshot.guest) ? snapshot.guest : {};
  const gift = isRecord(snapshot.gift) ? snapshot.gift : null;
  const giftDraft = gift && isRecord(gift.draft) ? gift.draft : null;
  const lineItems = arrayLen(guest.lineItems);
  const giftItems = giftDraft ? arrayLen(giftDraft.lineItems) : 0;
  const kids = Array.isArray(guest.childDrafts)
    ? guest.childDrafts.filter((c) => isRecord(c) && c.role !== 'adult').length
    : 0;
  const hasBox =
    lineItems > 0 || guest.boxRevealComplete === true || guest.onboardingComplete === true;
  const hasGiftDraft = !!giftDraft && (gift?.status === 'incomplete' || giftItems > 0);
  return {
    hasBox,
    hasGiftDraft,
    boxItemCount: lineItems || giftItems,
    kidCount: kids,
    onboardingStep: typeof guest.onboardingStep === 'string' ? guest.onboardingStep : null,
  };
}

export function validateSnapshot(raw: unknown): JsonRecord {
  if (!isRecord(raw)) throw new HttpsError('invalid-argument', 'snapshot must be an object.');
  for (const key of Object.keys(raw)) {
    if (!SNAPSHOT_TOP_LEVEL_KEYS.has(key)) {
      throw new HttpsError('invalid-argument', `snapshot: unknown key "${key}".`);
    }
  }
  if (raw.v !== GUEST_SESSION_SCHEMA_VERSION) {
    throw new HttpsError('invalid-argument', 'snapshot: unsupported version.');
  }
  if (raw.guest !== undefined && !isRecord(raw.guest)) {
    throw new HttpsError('invalid-argument', 'snapshot.guest must be an object.');
  }
  if (raw.gift !== undefined && raw.gift !== null && !isRecord(raw.gift)) {
    throw new HttpsError('invalid-argument', 'snapshot.gift must be an object or null.');
  }
  if (raw.entry !== undefined && raw.entry !== null && !isRecord(raw.entry)) {
    throw new HttpsError('invalid-argument', 'snapshot.entry must be an object or null.');
  }
  if (raw.path !== undefined && typeof raw.path !== 'string') {
    throw new HttpsError('invalid-argument', 'snapshot.path must be a string.');
  }
  const bytes = Buffer.byteLength(JSON.stringify(raw), 'utf8');
  if (bytes > SNAPSHOT_MAX_BYTES) {
    throw new HttpsError('invalid-argument', `snapshot too large (${bytes} bytes).`);
  }
  return raw;
}

export function validateVisitorId(raw: unknown): string {
  if (typeof raw !== 'string' || !VISITOR_ID_RE.test(raw)) {
    throw new HttpsError('invalid-argument', 'Invalid visitorId.');
  }
  return raw;
}

function expireAtFrom(now: Date, days: number): Timestamp {
  return Timestamp.fromMillis(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export type SaveGuestSessionResult = { ok: true; skipped?: 'rate_limited' | 'empty' };

/**
 * Upsert guestSessions/{visitorId}. Rate-limited per visitor; preserves createdAt,
 * convertedUid and lead linkage across saves.
 */
export async function saveGuestSessionRecord(
  db: FirebaseFirestore.Firestore,
  visitorId: string,
  snapshot: JsonRecord,
  now: Date = new Date()
): Promise<SaveGuestSessionResult> {
  const summary = summarizeSnapshot(snapshot);
  const ref = db.doc(`guestSessions/${visitorId}`);
  const snap = await ref.get();
  const prior = snap.data();
  const priorUpdated = prior?.updatedAt instanceof Timestamp ? prior.updatedAt.toMillis() : 0;
  if (priorUpdated && now.getTime() - priorUpdated < SAVE_MIN_INTERVAL_MS) {
    return { ok: true, skipped: 'rate_limited' };
  }
  const entry = isRecord(snapshot.entry) ? snapshot.entry : null;
  await ref.set(
    {
      schemaVersion: GUEST_SESSION_SCHEMA_VERSION,
      snapshot,
      ...summary,
      path: typeof snapshot.path === 'string' ? snapshot.path.slice(0, 200) : null,
      entry,
      createdAt: prior?.createdAt ?? Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      expireAt: expireAtFrom(now, GUEST_SESSION_TTL_DAYS),
      convertedUid: prior?.convertedUid ?? null,
      convertedAt: prior?.convertedAt ?? null,
      lastLeadEmailHash: prior?.lastLeadEmailHash ?? null,
      lastLeadAt: prior?.lastLeadAt ?? null,
      resumeCount: prior?.resumeCount ?? 0,
      saveCount: FieldValue.increment(1),
    },
    { merge: true }
  );
  return { ok: true };
}

/** Callable used by the debounced client sync (src/hooks/useGuestSessionSync.ts). Unauthenticated. */
export const saveGuestSession = onCall(async (request) => {
  const data = (request.data ?? {}) as { visitorId?: unknown; snapshot?: unknown };
  const visitorId = validateVisitorId(data.visitorId);
  const snapshot = validateSnapshot(data.snapshot);
  return saveGuestSessionRecord(getFirestore(), visitorId, snapshot);
});

const BEACON_ORIGINS = [
  'https://grapejuice.co',
  'https://www.grapejuice.co',
  'https://app.grapejuice.co',
  'https://grapejuice-pilot.web.app',
  'https://grapejuice-pilot.firebaseapp.com',
];

/**
 * `navigator.sendBeacon` target for the last edit before the tab closes. Body is text/plain
 * JSON (a "simple" request, so no CORS preflight is needed at pagehide). Same validation
 * as the callable; the client never reads the response.
 */
export const saveGuestSessionBeacon = onRequest({ cors: BEACON_ORIGINS }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  try {
    const raw = typeof req.body === 'string' ? req.body : req.rawBody?.toString('utf8') ?? '';
    const parsed = (
      raw ? JSON.parse(raw) : isRecord(req.body) ? req.body : {}
    ) as { visitorId?: unknown; snapshot?: unknown };
    const visitorId = validateVisitorId(parsed.visitorId);
    const snapshot = validateSnapshot(parsed.snapshot);
    await saveGuestSessionRecord(getFirestore(), visitorId, snapshot);
    res.status(204).send('');
  } catch (err) {
    const code = err instanceof HttpsError ? 400 : 500;
    if (code === 500) logger.error('saveGuestSessionBeacon failed', err);
    res.status(code).send('');
  }
});

/** Strip children's first names from a saved snapshot (the account now holds them). */
export function scrubChildNames(snapshot: JsonRecord): JsonRecord {
  const guest = isRecord(snapshot.guest) ? snapshot.guest : null;
  if (!guest || !Array.isArray(guest.childDrafts)) return snapshot;
  return {
    ...snapshot,
    guest: {
      ...guest,
      childDrafts: guest.childDrafts.map((c) => (isRecord(c) ? { ...c, name: '' } : c)),
    },
  };
}

/**
 * Called by persistGuestToAccount after sign-up: records the account so recovery emails stop,
 * and scrubs child names from the stored snapshot.
 */
export const markGuestSessionConverted = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = (request.data ?? {}) as { visitorId?: unknown };
  const visitorId = validateVisitorId(data.visitorId);
  const db = getFirestore();
  const ref = db.doc(`guestSessions/${visitorId}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, found: false };
  const stored = snap.data() ?? {};
  const scrubbed = isRecord(stored.snapshot) ? scrubChildNames(stored.snapshot) : null;
  await ref.set(
    {
      convertedUid: request.auth.uid,
      convertedAt: FieldValue.serverTimestamp(),
      ...(scrubbed ? { snapshot: scrubbed } : null),
    },
    { merge: true }
  );
  return { ok: true, found: true };
});

export type MintedResumeToken = { token: string; url: string; hash: string };

/** Mint a one-click resume link; only the SHA-256 of the token is stored. */
export async function mintResumeToken(
  db: FirebaseFirestore.Firestore,
  visitorId: string,
  leadEmail: string,
  now: Date = new Date()
): Promise<MintedResumeToken> {
  const token = randomBytes(32).toString('base64url');
  const hash = sha256Hex(token);
  await db.doc(`guestResumeTokens/${hash}`).set({
    visitorId,
    emailHash: emailHash(leadEmail),
    createdAt: Timestamp.fromDate(now),
    expiresAt: expireAtFrom(now, RESUME_TOKEN_TTL_DAYS),
    usedCount: 0,
    lastUsedAt: null,
  });
  return { token, hash, url: `${APP_ORIGIN}/?resume=${token}` };
}

export type ResumeGuestSessionResult =
  | { status: 'ok'; visitorId: string; snapshot: JsonRecord; converted: boolean; hasBox: boolean }
  | { status: 'invalid' | 'expired' | 'gone' };

export async function resumeGuestSessionByToken(
  db: FirebaseFirestore.Firestore,
  token: string,
  now: Date = new Date()
): Promise<ResumeGuestSessionResult> {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) return { status: 'invalid' };
  const tokenRef = db.doc(`guestResumeTokens/${sha256Hex(token)}`);
  const tokenSnap = await tokenRef.get();
  const tok = tokenSnap.data();
  if (!tok) return { status: 'invalid' };
  const expires = tok.expiresAt instanceof Timestamp ? tok.expiresAt.toMillis() : 0;
  if (!expires || expires < now.getTime()) return { status: 'expired' };
  if ((tok.usedCount ?? 0) >= RESUME_TOKEN_MAX_USES) return { status: 'expired' };
  const visitorId = tok.visitorId as string;
  const sessionRef = db.doc(`guestSessions/${visitorId}`);
  const sessionSnap = await sessionRef.get();
  const session = sessionSnap.data();
  if (!session || !isRecord(session.snapshot)) return { status: 'gone' };
  await Promise.all([
    tokenRef.set({ usedCount: FieldValue.increment(1), lastUsedAt: Timestamp.fromDate(now) }, { merge: true }),
    sessionRef.set(
      {
        resumeCount: FieldValue.increment(1),
        lastResumedAt: Timestamp.fromDate(now),
        // A click means the box is still wanted — give it another full window.
        expireAt: expireAtFrom(now, GUEST_SESSION_TTL_DAYS),
      },
      { merge: true }
    ),
  ]);
  return {
    status: 'ok',
    visitorId,
    snapshot: session.snapshot,
    converted: typeof session.convertedUid === 'string' && session.convertedUid.length > 0,
    hasBox: session.hasBox === true,
  };
}

/** `?resume=TOKEN` → saved snapshot (src/navigation/ResumeLinkEffect.tsx). Unauthenticated. */
/** Kept warm: a cold start leaves an email click on the storefront for seconds before the box opens. */
export const resumeGuestSession = onCall({ minInstances: 1 }, async (request) => {
  const data = (request.data ?? {}) as { token?: unknown };
  if (typeof data.token !== 'string') throw new HttpsError('invalid-argument', 'token required.');
  return resumeGuestSessionByToken(getFirestore(), data.token);
});

/**
 * Daily purge of expired sessions and tokens. A Firestore TTL policy on `expireAt` /
 * `expiresAt` (see header) does the same thing natively; this keeps retention honest even
 * before that policy is enabled.
 */
export async function purgeExpiredGuestData(
  db: FirebaseFirestore.Firestore,
  now: Date = new Date()
): Promise<{ sessions: number; tokens: number }> {
  const cutoff = Timestamp.fromDate(now);
  const counts = { sessions: 0, tokens: 0 };
  for (const [collection, field, key] of [
    ['guestSessions', 'expireAt', 'sessions'],
    ['guestResumeTokens', 'expiresAt', 'tokens'],
  ] as const) {
    // Bounded per run; the schedule picks up the rest tomorrow.
    const snap = await db.collection(collection).where(field, '<=', cutoff).limit(400).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    counts[key] = snap.size;
  }
  return counts;
}

export const scheduledPurgeGuestSessions = onSchedule('every day 04:00', async () => {
  const counts = await purgeExpiredGuestData(getFirestore());
  logger.info('scheduledPurgeGuestSessions', counts);
});

/** Mirrors firestore.rules isAdmin() — pilot ops allowlist with plus-aliases. */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return /^(brendan|joseph|maya)(\+[^@]*)?@unaffiliated\.co$/i.test(email.trim());
}

/**
 * Data-rights path: remove everything we hold for a lead email — guest sessions linked to it,
 * resume tokens, lead events, and the Untraditional Customer.io person. Admin only.
 */
export const deleteGuestDataByEmail = onCall(
  async (request) => {
    if (!isAdminEmail(request.auth?.token?.email)) {
      throw new HttpsError('permission-denied', 'Admin only.');
    }
    const data = (request.data ?? {}) as { email?: unknown };
    if (typeof data.email !== 'string' || !data.email.includes('@')) {
      throw new HttpsError('invalid-argument', 'email required.');
    }
    const hash = emailHash(data.email);
    const db = getFirestore();
    const [sessions, tokens, events] = await Promise.all([
      db.collection('guestSessions').where('lastLeadEmailHash', '==', hash).get(),
      db.collection('guestResumeTokens').where('emailHash', '==', hash).get(),
      db.collection('retentionLeadEvents').where('emailHash', '==', hash).get(),
    ]);
    const batch = db.batch();
    for (const d of [...sessions.docs, ...tokens.docs, ...events.docs]) batch.delete(d.ref);
    await batch.commit();
    let customerio = false;
    try {
      customerio = await untraditionalDeletePerson(data.email);
    } catch (err) {
      logger.error('deleteGuestDataByEmail: Customer.io delete failed', err);
    }
    logger.info('deleteGuestDataByEmail', {
      by: request.auth?.token?.email,
      sessions: sessions.size,
      tokens: tokens.size,
      events: events.size,
      customerio,
    });
    return { sessions: sessions.size, tokens: tokens.size, events: events.size, customerio };
  }
);
