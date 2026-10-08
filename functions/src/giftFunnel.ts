import { onCall, HttpsError } from './sentry';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { geoFromRequest, ipGeoField, type IpGeo } from './geo';
import { GUEST_SESSION_TTL_DAYS, keptEntry, validateVisitorId } from './guestSessions';

/**
 * Gift flow funnel: when each visitor first reached each gift step, signed in or not.
 *
 *   giftFunnel/{visitorId}  steps.{step} (ISO time), path, uid, inviteIds, entry, ipGeo; TTL on `expireAt`
 *
 * Same visitor id as guestSessions/{visitorId}. Functions only (firestore.rules); read by the
 * admin dashboard's Gift funnel tab, which takes paid / claimed from the linked giftInvites.
 */

export const GIFT_FUNNEL_STEPS = [
  'landing',
  'start',
  'path',
  'family',
  'email',
  'box',
  'note',
  'send',
  'checkout',
  'paid',
] as const;
export type GiftFunnelStep = (typeof GIFT_FUNNEL_STEPS)[number];

const GIFT_PATHS = new Set(['credit_only', 'customize']);
const INVITE_ID_RE = /^[A-Za-z0-9]{10,40}$/;
const MAX_INVITE_IDS = 20;

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const shortString = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;

/** Same shape as a guest session's `entry`; anything else is dropped. */
export function cleanGiftEntry(raw: unknown): JsonRecord | null {
  if (!isRecord(raw)) return null;
  const utm: Record<string, string> = {};
  if (isRecord(raw.utm)) {
    for (const [k, v] of Object.entries(raw.utm).slice(0, 10)) {
      const s = shortString(v, 200);
      if (/^[a-z_]{1,30}$/.test(k) && s) utm[k] = s;
    }
  }
  const entry = {
    utm: Object.keys(utm).length ? utm : null,
    fbclid: shortString(raw.fbclid, 500),
    referrer: shortString(raw.referrer, 300),
    landingPath: shortString(raw.landingPath, 200),
  };
  return Object.values(entry).some((v) => v != null) ? entry : null;
}

export type GiftStepInput = {
  step: GiftFunnelStep;
  path: string | null;
  inviteId: string | null;
  entry: JsonRecord | null;
};

export function validateGiftStepInput(raw: unknown): GiftStepInput {
  const data = isRecord(raw) ? raw : {};
  const step = data.step;
  if (typeof step !== 'string' || !(GIFT_FUNNEL_STEPS as readonly string[]).includes(step)) {
    throw new HttpsError('invalid-argument', 'Invalid step.');
  }
  const path = typeof data.path === 'string' && GIFT_PATHS.has(data.path) ? data.path : null;
  const inviteId = typeof data.inviteId === 'string' && INVITE_ID_RE.test(data.inviteId) ? data.inviteId : null;
  return { step: step as GiftFunnelStep, path, inviteId, entry: cleanGiftEntry(data.entry) };
}

/** First time wins for each step; repeat calls that add nothing new skip the write. */
export async function recordGiftFunnelStep(
  db: FirebaseFirestore.Firestore,
  visitorId: string,
  input: GiftStepInput,
  uid: string | null,
  geoFor: () => IpGeo | null,
  now: Date = new Date()
): Promise<{ ok: true; skipped?: 'unchanged' }> {
  const ref = db.doc(`giftFunnel/${visitorId}`);
  const prior = (await ref.get()).data();
  const steps = isRecord(prior?.steps) ? prior.steps : {};
  const inviteIds = Array.isArray(prior?.inviteIds) ? (prior.inviteIds as unknown[]) : [];
  const newStep = !steps[input.step];
  const newPath = input.path != null && input.path !== prior?.path;
  const newUid = uid != null && !prior?.uid;
  const newInvite = input.inviteId != null && !inviteIds.includes(input.inviteId) && inviteIds.length < MAX_INVITE_IDS;
  if (prior && !newStep && !newPath && !newUid && !newInvite) return { ok: true, skipped: 'unchanged' };

  const entry = keptEntry(input.entry, isRecord(prior?.entry) ? prior.entry : null);
  const geo = prior?.ipGeo ? null : geoFor();
  await ref.set(
    {
      ...(newStep ? { steps: { [input.step]: now.toISOString() } } : {}),
      ...(newPath ? { path: input.path } : {}),
      ...(newUid ? { uid } : {}),
      ...(newInvite ? { inviteIds: FieldValue.arrayUnion(input.inviteId) } : {}),
      ...(entry ? { entry } : {}),
      ...(geo ? { ipGeo: ipGeoField(geo) } : {}),
      createdAt: prior?.createdAt ?? Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      expireAt: Timestamp.fromMillis(now.getTime() + GUEST_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
    { merge: true }
  );
  return { ok: true };
}

/** Fire-and-forget from src/services/analytics/giftFunnel.ts. Unauthenticated, like saveGuestSession. */
export const recordGiftStep = onCall({ memory: '512MiB' }, async (request) => {
  const data = (request.data ?? {}) as { visitorId?: unknown };
  const visitorId = validateVisitorId(data.visitorId);
  const input = validateGiftStepInput(request.data);
  return recordGiftFunnelStep(
    getFirestore(),
    visitorId,
    input,
    request.auth?.uid ?? null,
    () => geoFromRequest(request.rawRequest)
  );
});
