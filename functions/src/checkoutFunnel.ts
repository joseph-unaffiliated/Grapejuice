import { onCall, HttpsError } from './sentry';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { geoFromRequest, ipGeoField, type IpGeo } from './geo';
import { GUEST_SESSION_TTL_DAYS, keptEntry, validateVisitorId } from './guestSessions';
import { cleanGiftEntry } from './giftFunnel';

/**
 * Box checkout funnel: when each visitor first reached each payment-page step,
 * plus every error that may have left them stuck.
 *
 *   checkoutFunnel/{visitorId}  steps.{view|payment|card|purchased} (ISO time),
 *   attempts.commit (count), errors.{stage} {count, lastMessage, lastAt},
 *   uid, householdId, entry, ipGeo; TTL on `expireAt`
 *
 * Same visitor id as guestSessions/{visitorId}. Functions only (firestore.rules).
 * "Stuck" = a doc with view/payment but no purchased, especially with errors —
 * query the collection directly until the admin dashboard grows a tab for it.
 */

export const CHECKOUT_FUNNEL_STEPS = ['view', 'payment', 'card', 'purchased'] as const;
export type CheckoutFunnelStep = (typeof CHECKOUT_FUNNEL_STEPS)[number];

export const CHECKOUT_ERROR_STAGES = ['address', 'setup', 'card', 'commit', 'load'] as const;
export type CheckoutErrorStage = (typeof CHECKOUT_ERROR_STAGES)[number];

const HOUSEHOLD_ID_RE = /^[A-Za-z0-9]{10,40}$/;
const MAX_ERROR_MESSAGE = 200;

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export type CheckoutStepInput = {
  step: CheckoutFunnelStep | null;
  commitAttempt: boolean;
  error: { stage: CheckoutErrorStage; message: string } | null;
  householdId: string | null;
  entry: JsonRecord | null;
};

export function validateCheckoutStepInput(raw: unknown): CheckoutStepInput {
  const data = isRecord(raw) ? raw : {};
  const step =
    typeof data.step === 'string' && (CHECKOUT_FUNNEL_STEPS as readonly string[]).includes(data.step)
      ? (data.step as CheckoutFunnelStep)
      : null;
  let error: CheckoutStepInput['error'] = null;
  if (isRecord(data.error)) {
    const stage = data.error.stage;
    if (typeof stage === 'string' && (CHECKOUT_ERROR_STAGES as readonly string[]).includes(stage)) {
      const message =
        typeof data.error.message === 'string' && data.error.message.length > 0
          ? data.error.message.slice(0, MAX_ERROR_MESSAGE)
          : 'Unknown error';
      error = { stage: stage as CheckoutErrorStage, message };
    }
  }
  if (!step && !error && data.commitAttempt !== true) {
    throw new HttpsError('invalid-argument', 'Invalid checkout step.');
  }
  return {
    step,
    commitAttempt: data.commitAttempt === true,
    error,
    householdId:
      typeof data.householdId === 'string' && HOUSEHOLD_ID_RE.test(data.householdId)
        ? data.householdId
        : null,
    entry: cleanGiftEntry(data.entry),
  };
}

/** First time wins for each step; errors accumulate with counts. Repeat no-ops skip the write. */
export async function recordCheckoutFunnelStep(
  db: FirebaseFirestore.Firestore,
  visitorId: string,
  input: CheckoutStepInput,
  uid: string | null,
  geoFor: () => IpGeo | null,
  now: Date = new Date()
): Promise<{ ok: true; skipped?: 'unchanged' }> {
  const ref = db.doc(`checkoutFunnel/${visitorId}`);
  const prior = (await ref.get()).data();
  const steps = isRecord(prior?.steps) ? prior.steps : {};
  const newStep = input.step != null && !steps[input.step];
  const newUid = uid != null && !prior?.uid;
  const newHousehold = input.householdId != null && !prior?.householdId;
  const changed = Boolean(prior) && (newStep || newUid || newHousehold || input.error != null || input.commitAttempt);
  if (prior && !changed) return { ok: true, skipped: 'unchanged' };

  const entry = keptEntry(input.entry, isRecord(prior?.entry) ? prior.entry : null);
  const geo = prior?.ipGeo ? null : geoFor();
  const nowIso = now.toISOString();
  await ref.set(
    {
      ...(newStep ? { steps: { [input.step as string]: nowIso } } : {}),
      ...(input.commitAttempt ? { attempts: { commit: FieldValue.increment(1) } } : {}),
      ...(input.error
        ? {
            errors: {
              [input.error.stage]: {
                count: FieldValue.increment(1),
                lastMessage: input.error.message,
                lastAt: nowIso,
              },
            },
            lastErrorAt: nowIso,
          }
        : {}),
      ...(newUid ? { uid } : {}),
      ...(newHousehold ? { householdId: input.householdId } : {}),
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

/** Fire-and-forget from src/services/analytics/checkoutFunnel.ts. Unauthenticated, like recordGiftStep. */
export const recordCheckoutStep = onCall({ memory: '512MiB' }, async (request) => {
  const data = (request.data ?? {}) as { visitorId?: unknown };
  const visitorId = validateVisitorId(data.visitorId);
  const input = validateCheckoutStepInput(request.data);
  return recordCheckoutFunnelStep(
    getFirestore(),
    visitorId,
    input,
    request.auth?.uid ?? null,
    () => geoFromRequest(request.rawRequest)
  );
});
