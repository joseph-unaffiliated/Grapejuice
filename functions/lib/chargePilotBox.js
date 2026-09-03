"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BOX_PRICE_CENTS = exports.HOLIDAY_ID = void 0;
exports.computeCommittedBoxTotals = computeCommittedBoxTotals;
exports.fulfillHanukkahBoxOrder = fulfillHanukkahBoxOrder;
exports.chargeSinglePilotBoxOrder = chargeSinglePilotBoxOrder;
exports.runChargeEligiblePilotBoxOrders = runChargeEligiblePilotBoxOrders;
exports.chargePilotBoxOrderForUser = chargePilotBoxOrderForUser;
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const shipstation_1 = require("./shipstation");
const email_1 = require("./email");
exports.HOLIDAY_ID = 'hanukkah-2026';
exports.DEFAULT_BOX_PRICE_CENTS = 8000;
const SHIPPING_FLAT_CENTS = 0;
const EXPEDITED_SHIPPING_CENTS = 1500;
const CHECKOUT_TAX_RATE = 0.075;
function chargeableLineTotal(lineItems) {
    return lineItems.reduce((s, li) => { var _a, _b; return s + ((_a = li.unitCents) !== null && _a !== void 0 ? _a : 0) * ((_b = li.quantity) !== null && _b !== void 0 ? _b : 1); }, 0);
}
function orderSubtotalCents(lineItems, boxPriceCents) {
    const hasIncluded = lineItems.some((li) => li.unitCents === 0 || li.slotId);
    const base = hasIncluded ? boxPriceCents : 0;
    return base + chargeableLineTotal(lineItems);
}
/** Final totals from current draft + credits frozen on the order at commit. */
function computeCommittedBoxTotals(lineItems, boxPriceCents, expeditedShipping, giftCreditApplied, platformCreditApplied) {
    const subtotalCents = orderSubtotalCents(lineItems, boxPriceCents);
    const shippingCents = SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
    const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
    const preCredit = subtotalCents + shippingCents + taxCents;
    const totalCents = Math.max(0, preCredit - giftCreditApplied - platformCreditApplied);
    return {
        lineItems,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        creditAppliedCents: giftCreditApplied + platformCreditApplied,
        giftCreditAppliedCents: giftCreditApplied,
        platformCreditAppliedCents: platformCreditApplied,
    };
}
function isLockPassed(lockAt) {
    if (!lockAt)
        return false;
    return Date.now() >= new Date(lockAt).getTime();
}
function isHanukkahBoxOrder(order) {
    if (order.orderType === 'marketplace' || order.orderType === 'received_gift')
        return false;
    if (order.orderType === 'hanukkah_box')
        return true;
    return order.holidayId === exports.HOLIDAY_ID || !order.orderType;
}
/** Email + ShipStation after a Hanukkah box order is paid (or $0 confirmed). Idempotent. */
async function fulfillHanukkahBoxOrder(db, householdId, orderId, orderInput) {
    var _a, _b, _c, _d, _e, _f;
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const orderSnap = await orderRef.get();
    const order = (_a = orderInput !== null && orderInput !== void 0 ? orderInput : orderSnap.data()) !== null && _a !== void 0 ? _a : {};
    const userId = order.userId;
    if (!order.orderConfirmedEmailSentAt && userId) {
        const userSnap = await db.doc(`users/${userId}`).get();
        const email = (_c = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : '';
        if (email) {
            try {
                await (0, email_1.sendEmail)({
                    to: email,
                    template: 'order-confirmed',
                    data: {
                        orderId,
                        totalCents: order.totalCents,
                        estimatedDelivery: order.estimatedDelivery,
                    },
                });
                await orderRef.update({ orderConfirmedEmailSentAt: new Date().toISOString() });
            }
            catch (emailErr) {
                logger.error('Hanukkah box order confirmation email failed', { orderId, emailErr });
            }
        }
    }
    if (order.playthrough === true) {
        logger.info('ShipStation export skipped (visitor playthrough)', { orderId });
        return;
    }
    if (order.shipStationExportedAt) {
        return;
    }
    try {
        await (0, shipstation_1.exportOrderToShipStation)({
            orderId,
            householdId,
            shippingAddress: (_d = order.shippingAddress) !== null && _d !== void 0 ? _d : {},
            lineItems: (_e = order.lineItems) !== null && _e !== void 0 ? _e : [],
            totalCents: (_f = order.totalCents) !== null && _f !== void 0 ? _f : 0,
            expeditedShipping: order.expeditedShipping === true,
        });
        await orderRef.update({ shipStationExportedAt: new Date().toISOString() });
    }
    catch (shipErr) {
        logger.error('Hanukkah box ShipStation export failed', { orderId, shipErr });
    }
}
async function markHanukkahBoxConfirmed(db, householdId, orderId, orderRef, totals, extra) {
    var _a;
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists)
        return;
    const prior = (_a = orderSnap.data()) !== null && _a !== void 0 ? _a : {};
    if (prior.status === 'confirmed' || prior.status === 'shipped' || prior.status === 'delivered') {
        await fulfillHanukkahBoxOrder(db, householdId, orderId, prior);
        return;
    }
    await orderRef.update(Object.assign(Object.assign({ status: 'confirmed', confirmedAt: firestore_1.FieldValue.serverTimestamp(), lineItems: totals.lineItems, subtotalCents: totals.subtotalCents, shippingCents: totals.shippingCents, taxCents: totals.taxCents, totalCents: totals.totalCents, creditAppliedCents: totals.creditAppliedCents, giftCreditAppliedCents: totals.giftCreditAppliedCents, platformCreditAppliedCents: totals.platformCreditAppliedCents }, ((extra === null || extra === void 0 ? void 0 : extra.stripePaymentIntentId) ? { stripePaymentIntentId: extra.stripePaymentIntentId } : {})), { chargeFailedAt: firestore_1.FieldValue.delete(), chargeFailureMessage: firestore_1.FieldValue.delete() }));
    const merged = Object.assign(Object.assign(Object.assign({}, prior), totals), { status: 'confirmed' });
    await fulfillHanukkahBoxOrder(db, householdId, orderId, merged);
}
async function cancelLegacyPaymentIntent(stripe, paymentIntentId) {
    try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status === 'succeeded')
            return;
        if (pi.status === 'canceled')
            return;
        await stripe.paymentIntents.cancel(paymentIntentId);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already.*(cancel|cancell)/i.test(msg)) {
            logger.warn('Could not cancel legacy PaymentIntent before recharge', { paymentIntentId, err });
        }
    }
}
/**
 * Charge one committed Hanukkah box order (final draft totals).
 * @param force — QA only: charge even if lockAt is still in the future.
 */
async function chargeSinglePilotBoxOrder(db, stripe, householdId, orderId, options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        return { outcome: 'skipped', orderId, reason: 'Order not found' };
    }
    const order = (_a = orderSnap.data()) !== null && _a !== void 0 ? _a : {};
    if (!isHanukkahBoxOrder(order)) {
        return { outcome: 'skipped', orderId, reason: 'Not a Hanukkah box order' };
    }
    const status = order.status;
    if (status === 'confirmed' || status === 'shipped' || status === 'delivered') {
        return { outcome: 'skipped', orderId, reason: 'Already confirmed' };
    }
    if (status === 'cancelled') {
        return { outcome: 'skipped', orderId, reason: 'Order cancelled' };
    }
    if (status !== 'committed' && status !== 'pending') {
        return { outcome: 'skipped', orderId, reason: `Unexpected status: ${status}` };
    }
    const lockAt = (_b = order.lockAt) !== null && _b !== void 0 ? _b : null;
    if (!(options === null || options === void 0 ? void 0 : options.force) && !isLockPassed(lockAt)) {
        return { outcome: 'skipped', orderId, reason: 'Lock date not reached' };
    }
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${exports.HOLIDAY_ID}`).get();
    const draftLineItems = (_e = (_d = (_c = draftSnap.data()) === null || _c === void 0 ? void 0 : _c.lineItems) !== null && _d !== void 0 ? _d : order.lineItems) !== null && _e !== void 0 ? _e : [];
    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = (_f = configSnap.data()) !== null && _f !== void 0 ? _f : {};
    const boxPriceCents = typeof configData.boxPriceCents === 'number' ? configData.boxPriceCents : exports.DEFAULT_BOX_PRICE_CENTS;
    const giftCreditApplied = typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
    const platformCreditApplied = typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
    const expeditedShipping = order.expeditedShipping === true;
    const totals = computeCommittedBoxTotals(draftLineItems, boxPriceCents, expeditedShipping, giftCreditApplied, platformCreditApplied);
    const legacyPiId = typeof order.stripePaymentIntentId === 'string' ? order.stripePaymentIntentId.trim() : '';
    if (legacyPiId && stripe) {
        const legacyPi = await stripe.paymentIntents.retrieve(legacyPiId);
        if (legacyPi.status === 'succeeded') {
            await markHanukkahBoxConfirmed(db, householdId, orderId, orderRef, totals, {
                stripePaymentIntentId: legacyPiId,
            });
            return { outcome: 'charged', orderId, totalCents: totals.totalCents, paymentIntentId: legacyPiId };
        }
        await cancelLegacyPaymentIntent(stripe, legacyPiId);
    }
    await orderRef.update({
        lineItems: totals.lineItems,
        subtotalCents: totals.subtotalCents,
        shippingCents: totals.shippingCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        creditAppliedCents: totals.creditAppliedCents,
        chargeAttemptedAt: new Date().toISOString(),
    });
    if (totals.totalCents === 0) {
        await markHanukkahBoxConfirmed(db, householdId, orderId, orderRef, totals);
        return { outcome: 'confirmed_zero', orderId };
    }
    const hhSnap = await db.doc(`households/${householdId}`).get();
    const hhData = (_g = hhSnap.data()) !== null && _g !== void 0 ? _g : {};
    const customerId = (_h = hhData.stripeCustomerId) !== null && _h !== void 0 ? _h : '';
    const paymentMethodId = hhData.stripeDefaultPaymentMethodId;
    if (!stripe) {
        const message = 'Stripe is not configured';
        await orderRef.update({
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: message,
        });
        return { outcome: 'failed', orderId, message };
    }
    if (!customerId || !paymentMethodId) {
        const message = 'No saved payment method on file';
        await orderRef.update({
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: message,
        });
        return { outcome: 'failed', orderId, message };
    }
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: totals.totalCents,
            currency: 'usd',
            customer: customerId,
            payment_method: paymentMethodId,
            confirm: true,
            off_session: true,
            metadata: {
                householdId,
                orderId,
                userId: String((_j = order.userId) !== null && _j !== void 0 ? _j : ''),
                type: 'hanukkah_box',
            },
        }, { idempotencyKey: `charge-pilot-box-${orderId}` });
        await orderRef.update({ stripePaymentIntentId: paymentIntent.id });
        if (paymentIntent.status === 'succeeded') {
            await markHanukkahBoxConfirmed(db, householdId, orderId, orderRef, totals, {
                stripePaymentIntentId: paymentIntent.id,
            });
            return {
                outcome: 'charged',
                orderId,
                totalCents: totals.totalCents,
                paymentIntentId: paymentIntent.id,
            };
        }
        if (paymentIntent.status === 'processing') {
            return {
                outcome: 'charged',
                orderId,
                totalCents: totals.totalCents,
                paymentIntentId: paymentIntent.id,
            };
        }
        const message = `PaymentIntent status: ${paymentIntent.status}`;
        await orderRef.update({
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: message,
        });
        return { outcome: 'failed', orderId, message };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Charge failed';
        logger.error('chargeSinglePilotBoxOrder failed', { householdId, orderId, err });
        await orderRef.update({
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: message,
        });
        return { outcome: 'failed', orderId, message };
    }
}
/** Charge all committed Hanukkah box orders past lock (or force-eligible in batch). */
async function runChargeEligiblePilotBoxOrders(db, stripe, options) {
    var _a;
    const snap = await db
        .collectionGroup('orders')
        .where('status', '==', 'committed')
        .where('holidayId', '==', exports.HOLIDAY_ID)
        .get();
    let charged = 0;
    let confirmedZero = 0;
    let failed = 0;
    let skipped = 0;
    for (const doc of snap.docs) {
        const order = doc.data();
        const householdId = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (!householdId || !isHanukkahBoxOrder(order)) {
            skipped += 1;
            continue;
        }
        const result = await chargeSinglePilotBoxOrder(db, stripe, householdId, doc.id, options);
        switch (result.outcome) {
            case 'charged':
                charged += 1;
                break;
            case 'confirmed_zero':
                confirmedZero += 1;
                break;
            case 'failed':
                failed += 1;
                break;
            case 'skipped':
                skipped += 1;
                break;
            default:
                skipped += 1;
        }
    }
    logger.info('runChargeEligiblePilotBoxOrders complete', {
        charged,
        confirmedZero,
        failed,
        skipped,
        force: (options === null || options === void 0 ? void 0 : options.force) === true,
    });
    return { charged, confirmedZero, failed, skipped };
}
/** Callable wrapper — household member can charge their own order (QA: force=true). */
async function chargePilotBoxOrderForUser(db, stripe, uid, householdId, orderId, force) {
    var _a, _b;
    const hhSnap = await db.doc(`households/${householdId}`).get();
    if (!hhSnap.exists)
        throw new https_1.HttpsError('not-found', 'Household not found.');
    const memberIds = (_b = (_a = hhSnap.data()) === null || _a === void 0 ? void 0 : _a.memberIds) !== null && _b !== void 0 ? _b : [];
    if (!memberIds.includes(uid)) {
        throw new https_1.HttpsError('permission-denied', 'Not a member of this household.');
    }
    return chargeSinglePilotBoxOrder(db, stripe, householdId, orderId, { force });
}
//# sourceMappingURL=chargePilotBox.js.map