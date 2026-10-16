"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordGiftStep = exports.GIFT_FUNNEL_STEPS = void 0;
exports.cleanGiftEntry = cleanGiftEntry;
exports.validateGiftStepInput = validateGiftStepInput;
exports.recordGiftFunnelStep = recordGiftFunnelStep;
const sentry_1 = require("./sentry");
const firestore_1 = require("firebase-admin/firestore");
const geo_1 = require("./geo");
const guestSessions_1 = require("./guestSessions");
/**
 * Gift flow funnel: when each visitor first reached each gift step, signed in or not.
 *
 *   giftFunnel/{visitorId}  steps.{step} (ISO time), path, uid, inviteIds, entry, ipGeo; TTL on `expireAt`
 *
 * Same visitor id as guestSessions/{visitorId}. Functions only (firestore.rules); read by the
 * admin dashboard's Gift funnel tab, which takes paid / claimed from the linked giftInvites.
 */
exports.GIFT_FUNNEL_STEPS = [
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
];
const GIFT_PATHS = new Set(['credit_only', 'customize']);
const INVITE_ID_RE = /^[A-Za-z0-9]{10,40}$/;
const MAX_INVITE_IDS = 20;
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const shortString = (v, max) => typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;
/** Same shape as a guest session's `entry`; anything else is dropped. */
function cleanGiftEntry(raw) {
    if (!isRecord(raw))
        return null;
    const utm = {};
    if (isRecord(raw.utm)) {
        for (const [k, v] of Object.entries(raw.utm).slice(0, 10)) {
            const s = shortString(v, 200);
            if (/^[a-z_]{1,30}$/.test(k) && s)
                utm[k] = s;
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
function validateGiftStepInput(raw) {
    const data = isRecord(raw) ? raw : {};
    const step = data.step;
    if (typeof step !== 'string' || !exports.GIFT_FUNNEL_STEPS.includes(step)) {
        throw new sentry_1.HttpsError('invalid-argument', 'Invalid step.');
    }
    const path = typeof data.path === 'string' && GIFT_PATHS.has(data.path) ? data.path : null;
    const inviteId = typeof data.inviteId === 'string' && INVITE_ID_RE.test(data.inviteId) ? data.inviteId : null;
    return { step: step, path, inviteId, entry: cleanGiftEntry(data.entry) };
}
/** First time wins for each step; repeat calls that add nothing new skip the write. */
async function recordGiftFunnelStep(db, visitorId, input, uid, geoFor, now = new Date()) {
    var _a;
    const ref = db.doc(`giftFunnel/${visitorId}`);
    const prior = (await ref.get()).data();
    const steps = isRecord(prior === null || prior === void 0 ? void 0 : prior.steps) ? prior.steps : {};
    const inviteIds = Array.isArray(prior === null || prior === void 0 ? void 0 : prior.inviteIds) ? prior.inviteIds : [];
    const newStep = !steps[input.step];
    const newPath = input.path != null && input.path !== (prior === null || prior === void 0 ? void 0 : prior.path);
    const newUid = uid != null && !(prior === null || prior === void 0 ? void 0 : prior.uid);
    const newInvite = input.inviteId != null && !inviteIds.includes(input.inviteId) && inviteIds.length < MAX_INVITE_IDS;
    if (prior && !newStep && !newPath && !newUid && !newInvite)
        return { ok: true, skipped: 'unchanged' };
    const entry = (0, guestSessions_1.keptEntry)(input.entry, isRecord(prior === null || prior === void 0 ? void 0 : prior.entry) ? prior.entry : null);
    const geo = (prior === null || prior === void 0 ? void 0 : prior.ipGeo) ? null : geoFor();
    await ref.set(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (newStep ? { steps: { [input.step]: now.toISOString() } } : {})), (newPath ? { path: input.path } : {})), (newUid ? { uid } : {})), (newInvite ? { inviteIds: firestore_1.FieldValue.arrayUnion(input.inviteId) } : {})), (entry ? { entry } : {})), (geo ? { ipGeo: (0, geo_1.ipGeoField)(geo) } : {})), { createdAt: (_a = prior === null || prior === void 0 ? void 0 : prior.createdAt) !== null && _a !== void 0 ? _a : firestore_1.Timestamp.fromDate(now), updatedAt: firestore_1.Timestamp.fromDate(now), expireAt: firestore_1.Timestamp.fromMillis(now.getTime() + guestSessions_1.GUEST_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000) }), { merge: true });
    return { ok: true };
}
/** Fire-and-forget from src/services/analytics/giftFunnel.ts. Unauthenticated, like saveGuestSession. */
exports.recordGiftStep = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a, _b, _c;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const visitorId = (0, guestSessions_1.validateVisitorId)(data.visitorId);
    const input = validateGiftStepInput(request.data);
    return recordGiftFunnelStep((0, firestore_1.getFirestore)(), visitorId, input, (_c = (_b = request.auth) === null || _b === void 0 ? void 0 : _b.uid) !== null && _c !== void 0 ? _c : null, () => (0, geo_1.geoFromRequest)(request.rawRequest));
});
//# sourceMappingURL=giftFunnel.js.map