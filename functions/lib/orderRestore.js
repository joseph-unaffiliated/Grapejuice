"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restorePilotBoxOrder = void 0;
const logger = require("./logger");
const sentry_1 = require("./sentry");
const firestore_1 = require("firebase-admin/firestore");
const catalogInventory_1 = require("./catalogInventory");
const chargePilotBox_1 = require("./chargePilotBox");
const orderRestoreRules_1 = require("./orderRestoreRules");
const ACTIVE_BOX_STATUSES = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
/**
 * Undo cancelPilotBoxOrder: back to `committed` with the same items, address and saved card,
 * re-taking the credits cancel returned and re-holding box stock. The household's box draft is
 * reset to the order's items, since My Box syncs the draft onto a committed order (and the charge
 * at lock prices from the draft). When the card, address or credit is gone, the draft is still
 * reset and the client is sent through checkout instead.
 */
exports.restorePilotBoxOrder = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '').trim();
    const orderId = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.orderId) !== null && _e !== void 0 ? _e : '').trim();
    if (!householdId || !orderId) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    const db = (0, firestore_1.getFirestore)();
    const householdRef = db.doc(`households/${householdId}`);
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const draftRef = db.doc(`households/${householdId}/boxDrafts/${catalogInventory_1.HOLIDAY_ID}`);
    const lockAt = (_g = (_f = (await db.doc(`config/${catalogInventory_1.HOLIDAY_ID}`).get()).data()) === null || _f === void 0 ? void 0 : _f.lockAt) !== null && _g !== void 0 ? _g : null;
    const outcome = await db.runTransaction(async (tx) => {
        var _a, _b;
        const [householdSnap, orderSnap, otherOrders] = await Promise.all([
            tx.get(householdRef),
            tx.get(orderRef),
            tx.get(db.collection(`households/${householdId}/orders`).where('status', 'in', ACTIVE_BOX_STATUSES)),
        ]);
        if (!householdSnap.exists)
            throw new sentry_1.HttpsError('not-found', 'Household not found.');
        const household = (_a = householdSnap.data()) !== null && _a !== void 0 ? _a : {};
        const memberIds = Array.isArray(household.memberIds) ? household.memberIds : [];
        if (!memberIds.includes(uid)) {
            throw new sentry_1.HttpsError('permission-denied', 'Not a member of this household.');
        }
        if (!orderSnap.exists)
            throw new sentry_1.HttpsError('not-found', 'Order not found.');
        const order = (_b = orderSnap.data()) !== null && _b !== void 0 ? _b : {};
        const verdict = (0, orderRestoreRules_1.restoreEligibility)({
            order,
            isBoxOrder: (0, chargePilotBox_1.isHanukkahBoxOrder)(order),
            household,
            lockAt,
            otherActiveBox: otherOrders.docs.some((d) => d.id !== orderId && (0, chargePilotBox_1.isHanukkahBoxOrder)(d.data())),
        });
        if (!verdict.ok && verdict.code !== 'needs_checkout') {
            throw new sentry_1.HttpsError('failed-precondition', verdict.message, { code: verdict.code });
        }
        const checkout = !verdict.ok && verdict.code === 'needs_checkout'
            ? { ok: false, reason: verdict.reason, message: verdict.message }
            : null;
        const lineItems = order.lineItems;
        const draftReset = {
            holidayId: catalogInventory_1.HOLIDAY_ID,
            lineItems,
            updatedAt: new Date().toISOString(),
            updatedBy: uid,
            lastChangeSource: 'order-restore',
        };
        if (checkout) {
            tx.set(draftRef, draftReset, { merge: true });
            return checkout;
        }
        let queueStockHolds = () => { };
        if (order.playthrough !== true) {
            try {
                queueStockHolds = await (0, catalogInventory_1.reserveBoxLinesInTx)(db, tx, lineItems);
            }
            catch (err) {
                if (err instanceof sentry_1.HttpsError) {
                    throw new sentry_1.HttpsError('failed-precondition', `${err.message} Check out again with a swap to restore your box.`, { code: 'sold_out' });
                }
                throw err;
            }
        }
        // All reads are done; writes only from here.
        queueStockHolds();
        tx.update(orderRef, {
            status: 'committed',
            lockAt,
            restoredAt: firestore_1.FieldValue.serverTimestamp(),
            restoredByUid: uid,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        const giftApplied = typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
        const platformApplied = typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
        if (giftApplied > 0 || platformApplied > 0) {
            tx.update(householdRef, Object.assign(Object.assign(Object.assign({}, (giftApplied > 0 ? { giftCreditCents: firestore_1.FieldValue.increment(-giftApplied) } : {})), (platformApplied > 0 ? { platformCreditCents: firestore_1.FieldValue.increment(-platformApplied) } : {})), { updatedAt: new Date().toISOString() }));
        }
        tx.set(draftRef, draftReset, { merge: true });
        return { ok: true };
    });
    if (!outcome.ok) {
        return { status: 'needs_checkout', orderId, reason: outcome.reason, message: outcome.message };
    }
    // cancelPilotBoxOrder turned the lock reminder back on; a committed box doesn't need it.
    await db.doc(`users/${uid}`).set({ lockReminderEligible: false, updatedAt: new Date().toISOString() }, { merge: true });
    try {
        const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
        logger.info('restorePilotBoxOrder box allocations', Object.assign({ orderId }, alloc));
    }
    catch (allocErr) {
        logger.error('restorePilotBoxOrder recomputeBoxAllocations failed', { orderId, allocErr });
    }
    return { status: 'committed', orderId, lockAt };
});
//# sourceMappingURL=orderRestore.js.map