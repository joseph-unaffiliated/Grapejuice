"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordGuestBoxHistory = exports.recordBoxDraftHistory = void 0;
exports.carryGuestDefaultToHousehold = carryGuestDefaultToHousehold;
/**
 * Box history: every write that changes a box's lines appends a `history` entry under the box
 * (who, what changed, the full lines before and after), and `history/default` keeps the box the
 * builder handed them. Covers account drafts (households/{h}/boxDrafts/{holiday}) and signed-out
 * boxes and gift drafts (guestSessions/{visitor}).
 *
 * Writers say who they are with `lastChangeSource` on the box document (the app sets it on every
 * save; jobs and scripts set their own label). It is consumed here and cleared, so a stale label
 * never sticks to a later write.
 */
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const boxHistoryDiff_1 = require("./boxHistoryDiff");
const boxAuditLoad_1 = require("./boxAuditLoad");
const boxAuditJob_1 = require("./boxAuditJob");
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' && v ? v : null);
async function recordList(historyRef, list, source, by, beforeRaw, afterRaw) {
    var _a;
    const before = (0, boxHistoryDiff_1.historyLines)(beforeRaw);
    const after = (0, boxHistoryDiff_1.historyLines)(afterRaw);
    const changes = (0, boxHistoryDiff_1.diffBoxLines)(before, after);
    if (!changes.length)
        return false;
    const at = new Date().toISOString();
    await historyRef.add((0, boxHistoryDiff_1.withoutUndefined)({ at, source, by, list, changes, before, after }));
    const defaultRef = historyRef.doc('default');
    const existing = (_a = (await defaultRef.get()).data()) === null || _a === void 0 ? void 0 : _a[list];
    const next = (0, boxHistoryDiff_1.nextDefault)(existing, source, after);
    if (next)
        await defaultRef.set({ [list]: (0, boxHistoryDiff_1.withoutUndefined)(Object.assign(Object.assign({}, next), { at })) }, { merge: true });
    return true;
}
/** The included-items audit never blocks history. */
async function audited(path, run) {
    try {
        await run();
    }
    catch (err) {
        logger.warn('boxHistory: box audit failed', { path, err: String(err) });
    }
}
async function clearSource(ref, after) {
    if (!after || !('lastChangeSource' in after))
        return;
    await ref.update({ lastChangeSource: firestore_2.FieldValue.delete() }).catch((err) => {
        logger.warn('boxHistory: could not clear lastChangeSource', { path: ref.path, err: String(err) });
    });
}
exports.recordBoxDraftHistory = (0, firestore_1.onDocumentWritten)({ document: 'households/{householdId}/boxDrafts/{holidayId}', memory: '256MiB' }, (0, sentry_1.withSentry)(async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
    const afterSnap = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after;
    const after = (afterSnap === null || afterSnap === void 0 ? void 0 : afterSnap.exists) ? afterSnap.data() : undefined;
    const ref = (_e = (afterSnap !== null && afterSnap !== void 0 ? afterSnap : (_d = event.data) === null || _d === void 0 ? void 0 : _d.before)) === null || _e === void 0 ? void 0 : _e.ref;
    if (!ref)
        return;
    const source = (_f = str(after === null || after === void 0 ? void 0 : after.lastChangeSource)) !== null && _f !== void 0 ? _f : (after ? 'unknown' : 'deleted');
    const changed = await recordList(ref.collection('history'), 'box', source, str(after === null || after === void 0 ? void 0 : after.updatedBy), before === null || before === void 0 ? void 0 : before.lineItems, after === null || after === void 0 ? void 0 : after.lineItems);
    await clearSource(ref, after);
    if (changed && event.params.holidayId === boxAuditLoad_1.BOX_AUDIT_HOLIDAY_ID) {
        await audited(ref.path, () => (0, boxAuditJob_1.refreshAccountBoxAudit)(ref.firestore, event.params.householdId, ref.path, after));
    }
}));
function guestLists(data) {
    const snapshot = isRecord(data === null || data === void 0 ? void 0 : data.snapshot) ? data.snapshot : {};
    const guest = isRecord(snapshot.guest) ? snapshot.guest : {};
    const gift = isRecord(snapshot.gift) && isRecord(snapshot.gift.draft) ? snapshot.gift.draft : {};
    return { box: guest.lineItems, gift: gift.lineItems, builtAt: str(guest.boxBuiltAt) };
}
exports.recordGuestBoxHistory = (0, firestore_1.onDocumentWritten)({ document: 'guestSessions/{visitorId}', memory: '256MiB' }, (0, sentry_1.withSentry)(async (event) => {
    var _a, _b, _c;
    const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
    const afterSnap = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after;
    if (!(afterSnap === null || afterSnap === void 0 ? void 0 : afterSnap.exists))
        return;
    const after = afterSnap.data();
    const prev = guestLists(before);
    const next = guestLists(after);
    const jobSource = str(after === null || after === void 0 ? void 0 : after.lastChangeSource);
    const boxSource = jobSource !== null && jobSource !== void 0 ? jobSource : (next.builtAt && next.builtAt !== prev.builtAt ? 'default-build' : 'customer');
    const historyRef = afterSnap.ref.collection('history');
    const boxChanged = await recordList(historyRef, 'box', boxSource, null, prev.box, next.box);
    const giftChanged = await recordList(historyRef, 'gift', jobSource !== null && jobSource !== void 0 ? jobSource : 'customer', null, prev.gift, next.gift);
    await clearSource(afterSnap.ref, after);
    if (boxChanged || giftChanged) {
        await audited(afterSnap.ref.path, () => (0, boxAuditJob_1.refreshGuestBoxAudits)(afterSnap.ref.firestore, afterSnap.ref.path, after));
    }
}));
/**
 * After a signed-out visitor creates an account: their household's default box is the one
 * they were first handed as a guest, unless the household already has a real build.
 */
async function carryGuestDefaultToHousehold(db, visitorId, householdId, holidayId) {
    var _a, _b;
    const guestDefault = (_a = (await db.doc(`guestSessions/${visitorId}/history/default`).get()).data()) === null || _a === void 0 ? void 0 : _a.box;
    if (!isRecord(guestDefault))
        return;
    const ref = db.doc(`households/${householdId}/boxDrafts/${holidayId}/history/default`);
    const current = (_b = (await ref.get()).data()) === null || _b === void 0 ? void 0 : _b.box;
    if (isRecord(current) && current.source === 'default-build')
        return;
    await ref.set({ box: Object.assign(Object.assign({}, guestDefault), { fromGuestSession: visitorId }) }, { merge: true });
}
//# sourceMappingURL=boxHistory.js.map