"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordCheckoutStep = exports.CHECKOUT_ERROR_STAGES = exports.CHECKOUT_FUNNEL_STEPS = void 0;
exports.validateCheckoutStepInput = validateCheckoutStepInput;
exports.recordCheckoutFunnelStep = recordCheckoutFunnelStep;
const sentry_1 = require("./sentry");
const firestore_1 = require("firebase-admin/firestore");
const geo_1 = require("./geo");
const guestSessions_1 = require("./guestSessions");
const giftFunnel_1 = require("./giftFunnel");
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
exports.CHECKOUT_FUNNEL_STEPS = ['view', 'payment', 'card', 'purchased'];
exports.CHECKOUT_ERROR_STAGES = ['address', 'setup', 'card', 'commit', 'load'];
const HOUSEHOLD_ID_RE = /^[A-Za-z0-9]{10,40}$/;
const MAX_ERROR_MESSAGE = 200;
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function validateCheckoutStepInput(raw) {
    const data = isRecord(raw) ? raw : {};
    const step = typeof data.step === 'string' && exports.CHECKOUT_FUNNEL_STEPS.includes(data.step)
        ? data.step
        : null;
    let error = null;
    if (isRecord(data.error)) {
        const stage = data.error.stage;
        if (typeof stage === 'string' && exports.CHECKOUT_ERROR_STAGES.includes(stage)) {
            const message = typeof data.error.message === 'string' && data.error.message.length > 0
                ? data.error.message.slice(0, MAX_ERROR_MESSAGE)
                : 'Unknown error';
            error = { stage: stage, message };
        }
    }
    if (!step && !error && data.commitAttempt !== true) {
        throw new sentry_1.HttpsError('invalid-argument', 'Invalid checkout step.');
    }
    return {
        step,
        commitAttempt: data.commitAttempt === true,
        error,
        householdId: typeof data.householdId === 'string' && HOUSEHOLD_ID_RE.test(data.householdId)
            ? data.householdId
            : null,
        entry: (0, giftFunnel_1.cleanGiftEntry)(data.entry),
    };
}
/** First time wins for each step; errors accumulate with counts. Repeat no-ops skip the write. */
async function recordCheckoutFunnelStep(db, visitorId, input, uid, geoFor, now = new Date()) {
    var _a;
    const ref = db.doc(`checkoutFunnel/${visitorId}`);
    const prior = (await ref.get()).data();
    const steps = isRecord(prior === null || prior === void 0 ? void 0 : prior.steps) ? prior.steps : {};
    const newStep = input.step != null && !steps[input.step];
    const newUid = uid != null && !(prior === null || prior === void 0 ? void 0 : prior.uid);
    const newHousehold = input.householdId != null && !(prior === null || prior === void 0 ? void 0 : prior.householdId);
    const changed = Boolean(prior) && (newStep || newUid || newHousehold || input.error != null || input.commitAttempt);
    if (prior && !changed)
        return { ok: true, skipped: 'unchanged' };
    const entry = (0, guestSessions_1.keptEntry)(input.entry, isRecord(prior === null || prior === void 0 ? void 0 : prior.entry) ? prior.entry : null);
    const geo = (prior === null || prior === void 0 ? void 0 : prior.ipGeo) ? null : geoFor();
    const nowIso = now.toISOString();
    await ref.set(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (newStep ? { steps: { [input.step]: nowIso } } : {})), (input.commitAttempt ? { attempts: { commit: firestore_1.FieldValue.increment(1) } } : {})), (input.error
        ? {
            errors: {
                [input.error.stage]: {
                    count: firestore_1.FieldValue.increment(1),
                    lastMessage: input.error.message,
                    lastAt: nowIso,
                },
            },
            lastErrorAt: nowIso,
        }
        : {})), (newUid ? { uid } : {})), (newHousehold ? { householdId: input.householdId } : {})), (entry ? { entry } : {})), (geo ? { ipGeo: (0, geo_1.ipGeoField)(geo) } : {})), { createdAt: (_a = prior === null || prior === void 0 ? void 0 : prior.createdAt) !== null && _a !== void 0 ? _a : firestore_1.Timestamp.fromDate(now), updatedAt: firestore_1.Timestamp.fromDate(now), expireAt: firestore_1.Timestamp.fromMillis(now.getTime() + guestSessions_1.GUEST_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000) }), { merge: true });
    return { ok: true };
}
/** Fire-and-forget from src/services/analytics/checkoutFunnel.ts. Unauthenticated, like recordGiftStep. */
exports.recordCheckoutStep = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a, _b, _c;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const visitorId = (0, guestSessions_1.validateVisitorId)(data.visitorId);
    const input = validateCheckoutStepInput(request.data);
    return recordCheckoutFunnelStep((0, firestore_1.getFirestore)(), visitorId, input, (_c = (_b = request.auth) === null || _b === void 0 ? void 0 : _b.uid) !== null && _c !== void 0 ? _c : null, () => (0, geo_1.geoFromRequest)(request.rawRequest));
});
//# sourceMappingURL=checkoutFunnel.js.map