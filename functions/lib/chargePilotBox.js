"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BOX_PRICE_CENTS = exports.HOLIDAY_ID = void 0;
exports.boxPriceCentsForKids = boxPriceCentsForKids;
exports.boxPriceForUser = boxPriceForUser;
exports.checkoutTotalsAfterCredit = checkoutTotalsAfterCredit;
exports.computeCommittedBoxTotals = computeCommittedBoxTotals;
exports.settleLockCredit = settleLockCredit;
exports.isHanukkahBoxOrder = isHanukkahBoxOrder;
exports.isOpenHanukkahBoxOrder = isOpenHanukkahBoxOrder;
exports.openHanukkahBoxOrder = openHanukkahBoxOrder;
exports.notifyHanukkahBoxChargeFailed = notifyHanukkahBoxChargeFailed;
exports.retryFailedHanukkahBoxCharges = retryFailedHanukkahBoxCharges;
exports.fulfillHanukkahBoxOrder = fulfillHanukkahBoxOrder;
exports.chargeSinglePilotBoxOrder = chargeSinglePilotBoxOrder;
exports.runChargeEligiblePilotBoxOrders = runChargeEligiblePilotBoxOrders;
exports.chargePilotBoxOrderForUser = chargePilotBoxOrderForUser;
const logger = require("./logger");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const shipstation_1 = require("./shipstation");
const email_1 = require("./email");
const loginLinks_1 = require("./loginLinks");
const orderEmails_1 = require("./orderEmails");
const untraditionalCio_1 = require("./untraditionalCio");
const boxRules_1 = require("./rav/boxRules");
const promoPricing_1 = require("./promoPricing");
exports.HOLIDAY_ID = 'hanukkah-2026';
exports.DEFAULT_BOX_PRICE_CENTS = 8000;
/** First kid is in the list price; each extra kid adds a fee, even if that kid's lines are donated. */
function boxPriceCentsForKids(kidCount, listCents = exports.DEFAULT_BOX_PRICE_CENTS) {
    return listCents + Math.max(0, kidCount - 1) * boxRules_1.PRICING_POLICY.perExtraKidCents;
}
/** Kid count matches My Box: the box owner's `users/{uid}/children`, minimum 1. */
async function boxPriceForUser(db, userId, configData) {
    const listCents = typeof configData.boxPriceCents === 'number' ? configData.boxPriceCents : exports.DEFAULT_BOX_PRICE_CENTS;
    const kids = userId ? (await db.collection(`users/${userId}/children`).get()).size : 0;
    const kidCount = Math.max(1, kids);
    return { boxPriceCents: boxPriceCentsForKids(kidCount, listCents), kidCount };
}
const SHIPPING_FLAT_CENTS = 0;
const EXPEDITED_SHIPPING_CENTS = 1500;
const CHECKOUT_TAX_RATE = 0.075;
/**
 * A discount comes off first, then credit covers what's left of the merchandise. Tax applies only
 * to the unpaid remainder. `discountCents` is computed on the subtotal (not shipping) by the caller.
 */
function checkoutTotalsAfterCredit(merchandiseCents, giftCreditCents, platformCreditCents, discountCents = 0) {
    const discountApplied = Math.min(Math.max(0, Math.round(discountCents)), Math.max(0, merchandiseCents));
    const merchandise = Math.max(0, merchandiseCents) - discountApplied;
    const giftCreditApplied = Math.min(Math.max(0, giftCreditCents), merchandise);
    const platformCreditApplied = Math.min(Math.max(0, platformCreditCents), merchandise - giftCreditApplied);
    const taxableCents = merchandise - giftCreditApplied - platformCreditApplied;
    const taxCents = Math.round(taxableCents * CHECKOUT_TAX_RATE);
    return {
        discountApplied,
        giftCreditApplied,
        platformCreditApplied,
        creditApplied: giftCreditApplied + platformCreditApplied,
        taxCents,
        totalCents: taxableCents + taxCents,
    };
}
function chargeableLineTotal(lineItems) {
    return lineItems.reduce((s, li) => { var _a, _b; return s + ((_a = li.unitCents) !== null && _a !== void 0 ? _a : 0) * ((_b = li.quantity) !== null && _b !== void 0 ? _b : 1); }, 0);
}
function orderSubtotalCents(lineItems, boxPriceCents) {
    const hasIncluded = lineItems.some((li) => li.unitCents === 0 || li.slotId);
    const base = hasIncluded ? boxPriceCents : 0;
    return base + chargeableLineTotal(lineItems);
}
/**
 * Final totals from the current draft and the credit available to it. `promo` is the discount
 * snapshot recorded at checkout; it reprices against the final subtotal.
 */
function computeCommittedBoxTotals(lineItems, boxPriceCents, expeditedShipping, giftCreditApplied, platformCreditApplied, promo) {
    const subtotalCents = orderSubtotalCents(lineItems, boxPriceCents);
    const shippingCents = SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
    const priced = checkoutTotalsAfterCredit(subtotalCents + shippingCents, giftCreditApplied, platformCreditApplied, (0, promoPricing_1.discountCentsForTerms)(promo, subtotalCents));
    return {
        lineItems,
        subtotalCents,
        shippingCents,
        discountCents: priced.discountApplied,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        creditAppliedCents: priced.creditApplied,
        giftCreditAppliedCents: priced.giftCreditApplied,
        platformCreditAppliedCents: priced.platformCreditApplied,
    };
}
/**
 * Credit settles at lock: what checkout reserved plus anything granted since, capped at the final
 * box. Returns the totals and the household balance left afterwards (unused reserve goes back).
 */
function settleLockCredit(lineItems, boxPriceCents, expeditedShipping, reserved, balance, promo) {
    const totals = computeCommittedBoxTotals(lineItems, boxPriceCents, expeditedShipping, reserved.gift + balance.gift, reserved.platform + balance.platform, promo);
    return {
        totals,
        balance: {
            gift: reserved.gift + balance.gift - totals.giftCreditAppliedCents,
            platform: reserved.platform + balance.platform - totals.platformCreditAppliedCents,
        },
    };
}
function cents(v) {
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
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
/** A Hanukkah box that lock will still charge. Cancelled and already-charged orders are not open. */
function isOpenHanukkahBoxOrder(order, holidayId = exports.HOLIDAY_ID) {
    if (order.status !== 'committed' && order.status !== 'pending')
        return false;
    if (!isHanukkahBoxOrder(order))
        return false;
    return typeof order.holidayId !== 'string' || order.holidayId === holidayId;
}
function createdMs(data) {
    const created = data.createdAt;
    if (created && typeof created === 'object' && typeof created.toMillis === 'function')
        return created.toMillis();
    if (typeof created === 'string')
        return Date.parse(created) || 0;
    return 0;
}
/** The open box to keep when checkout is submitted again. Oldest first, so a duplicate commit never replaces it. */
function openHanukkahBoxOrder(docs, holidayId = exports.HOLIDAY_ID) {
    var _a;
    const open = docs.filter((d) => isOpenHanukkahBoxOrder(d.data, holidayId));
    open.sort((a, b) => createdMs(a.data) - createdMs(b.data));
    return (_a = open[0]) !== null && _a !== void 0 ? _a : null;
}
const ORDERS_URL = 'https://grapejuice-pilot.web.app/orders';
function customerFacingChargeFailure(message) {
    return !/stripe is not configured/i.test(message);
}
/** One decline email per charge attempt. Webhook and the charge function can both call this. */
async function notifyHanukkahBoxChargeFailed(db, householdId, orderId, attempt, message) {
    var _a, _b, _c, _d;
    if (!customerFacingChargeFailure(message))
        return;
    const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 1;
    const ref = db.doc(`households/${householdId}/orders/${orderId}`);
    const claimed = await db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(ref);
        if (!snap.exists)
            return false;
        const sentFor = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.chargeFailureEmailForAttempt;
        if (typeof sentFor === 'number' && sentFor >= safeAttempt)
            return false;
        tx.update(ref, { chargeFailureEmailForAttempt: safeAttempt });
        return true;
    });
    if (!claimed)
        return;
    const snap = await ref.get();
    const order = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
    const userId = typeof order.userId === 'string' ? order.userId : '';
    let to = '';
    if (userId) {
        const userSnap = await db.doc(`users/${userId}`).get();
        to = String((_c = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : '').trim();
    }
    if (!to.includes('@')) {
        const address = order.shippingAddress;
        to = String((_d = address === null || address === void 0 ? void 0 : address.email) !== null && _d !== void 0 ? _d : '').trim();
    }
    if (!to.includes('@')) {
        await ref.update({ chargeFailureEmailForAttempt: firestore_1.FieldValue.delete() });
        return;
    }
    try {
        const result = await (0, email_1.sendEmail)({
            to,
            template: 'box-charge-failed',
            data: { ordersUrl: ORDERS_URL, message },
        });
        if (result === 'skipped') {
            await ref.update({ chargeFailureEmailForAttempt: firestore_1.FieldValue.delete() });
        }
    }
    catch (err) {
        logger.error('Hanukkah box charge-failure email failed', { orderId, err });
        await ref.update({ chargeFailureEmailForAttempt: firestore_1.FieldValue.delete() });
    }
}
/**
 * After a new card is saved: charge any box whose lock has passed and whose last charge failed.
 * Before lock, drop the stale failure so Orders stops asking them to update the card.
 */
async function retryFailedHanukkahBoxCharges(db, stripe, householdId) {
    const open = await db.collection(`households/${householdId}/orders`).where('status', '==', 'committed').get();
    for (const doc of open.docs) {
        const data = doc.data();
        if (data.holidayId && data.holidayId !== exports.HOLIDAY_ID)
            continue;
        if (!data.chargeFailureMessage)
            continue;
        if (!isHanukkahBoxOrder(data) || !isLockPassed(data.lockAt)) {
            await doc.ref.update({
                chargeFailureMessage: firestore_1.FieldValue.delete(),
                updatedAt: new Date().toISOString(),
            });
            continue;
        }
        try {
            await chargeSinglePilotBoxOrder(db, stripe, householdId, doc.id);
        }
        catch (err) {
            logger.error('Retry after card update failed', { householdId, orderId: doc.id, err });
        }
    }
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
        if (email && (await (0, orderEmails_1.claimOrderEmail)(orderRef, 'orderConfirmedEmail'))) {
            try {
                await (0, email_1.sendEmail)({
                    to: email,
                    template: (0, orderEmails_1.orderConfirmationTemplate)(order),
                    data: {
                        orderId,
                        totalCents: order.totalCents,
                        estimatedDelivery: order.estimatedDelivery,
                        order_url: await (0, loginLinks_1.orderViewUrl)(db, { uid: userId, email, householdId, orderId }),
                    },
                });
                await orderRef.update({ orderConfirmedEmailSentAt: new Date().toISOString() });
            }
            catch (emailErr) {
                await orderRef.update({ orderConfirmedEmailClaimedAt: firestore_1.FieldValue.delete() }).catch(() => undefined);
                logger.error('Hanukkah box order confirmation email failed', { orderId, emailErr });
            }
        }
        if (email) {
            // Exit signal for the guest-box recovery campaigns (Untraditional workspace).
            await (0, untraditionalCio_1.untraditionalMarkSafe)(email, {
                grapejuice_order_placed: true,
                grapejuice_order_placed_at: new Date().toISOString(),
            });
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
        const exported = await (0, shipstation_1.exportOrderToShipStation)({
            orderId,
            householdId,
            shippingAddress: (_d = order.shippingAddress) !== null && _d !== void 0 ? _d : {},
            lineItems: (_e = order.lineItems) !== null && _e !== void 0 ? _e : [],
            totalCents: (_f = order.totalCents) !== null && _f !== void 0 ? _f : 0,
            expeditedShipping: order.expeditedShipping === true,
        });
        await orderRef.update(Object.assign({ shipStationExportedAt: new Date().toISOString() }, (exported.externalId ? { shipStationOrderId: exported.externalId } : {})));
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
    await orderRef.update(Object.assign(Object.assign({ status: 'confirmed', confirmedAt: firestore_1.FieldValue.serverTimestamp(), lineItems: totals.lineItems, subtotalCents: totals.subtotalCents, shippingCents: totals.shippingCents, discountCents: totals.discountCents, taxCents: totals.taxCents, totalCents: totals.totalCents, creditAppliedCents: totals.creditAppliedCents, giftCreditAppliedCents: totals.giftCreditAppliedCents, platformCreditAppliedCents: totals.platformCreditAppliedCents }, ((extra === null || extra === void 0 ? void 0 : extra.stripePaymentIntentId) ? { stripePaymentIntentId: extra.stripePaymentIntentId } : {})), { chargeFailedAt: firestore_1.FieldValue.delete(), chargeFailureMessage: firestore_1.FieldValue.delete() }));
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
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
    const { boxPriceCents } = await boxPriceForUser(db, typeof order.userId === 'string' ? order.userId : null, configData);
    const expeditedShipping = order.expeditedShipping === true;
    const promo = (_g = order.promo) !== null && _g !== void 0 ? _g : null;
    const legacyPiId = typeof order.stripePaymentIntentId === 'string' ? order.stripePaymentIntentId.trim() : '';
    if (legacyPiId && stripe) {
        const legacyPi = await stripe.paymentIntents.retrieve(legacyPiId);
        if (legacyPi.status === 'succeeded') {
            const paidTotals = computeCommittedBoxTotals(draftLineItems, boxPriceCents, expeditedShipping, cents(order.giftCreditAppliedCents), cents(order.platformCreditAppliedCents), promo);
            await markHanukkahBoxConfirmed(db, householdId, orderId, orderRef, paidTotals, {
                stripePaymentIntentId: legacyPiId,
            });
            return { outcome: 'charged', orderId, totalCents: paidTotals.totalCents, paymentIntentId: legacyPiId };
        }
        await cancelLegacyPaymentIntent(stripe, legacyPiId);
    }
    const hhRef = db.doc(`households/${householdId}`);
    const totals = await db.runTransaction(async (tx) => {
        var _a, _b;
        const [fresh, hh] = await Promise.all([tx.get(orderRef), tx.get(hhRef)]);
        const o = (_a = fresh.data()) !== null && _a !== void 0 ? _a : {};
        if (o.status !== 'committed' && o.status !== 'pending')
            return null;
        const h = (_b = hh.data()) !== null && _b !== void 0 ? _b : {};
        const before = { gift: cents(h.giftCreditCents), platform: cents(h.platformCreditCents) };
        const settled = settleLockCredit(draftLineItems, boxPriceCents, expeditedShipping, { gift: cents(o.giftCreditAppliedCents), platform: cents(o.platformCreditAppliedCents) }, hh.exists ? before : { gift: 0, platform: 0 }, promo);
        if (hh.exists && (settled.balance.gift !== before.gift || settled.balance.platform !== before.platform)) {
            tx.update(hhRef, {
                giftCreditCents: settled.balance.gift,
                platformCreditCents: settled.balance.platform,
                updatedAt: new Date().toISOString(),
            });
        }
        tx.update(orderRef, {
            creditAppliedCents: settled.totals.creditAppliedCents,
            giftCreditAppliedCents: settled.totals.giftCreditAppliedCents,
            platformCreditAppliedCents: settled.totals.platformCreditAppliedCents,
        });
        return settled.totals;
    });
    if (!totals) {
        return { outcome: 'skipped', orderId, reason: 'Order status changed' };
    }
    const priorAttempts = typeof order.chargeAttemptCount === 'number' && Number.isFinite(order.chargeAttemptCount)
        ? Math.max(0, Math.floor(order.chargeAttemptCount))
        : 0;
    const chargeAttempt = priorAttempts + 1;
    await orderRef.update({
        lineItems: totals.lineItems,
        subtotalCents: totals.subtotalCents,
        shippingCents: totals.shippingCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        creditAppliedCents: totals.creditAppliedCents,
        chargeAttemptedAt: new Date().toISOString(),
        // Bump so each intentional retry (new card, Dev charge, schedule) gets a fresh
        // Stripe idempotency key. A fixed `charge-pilot-box-${orderId}` key blocked
        // retries after a decline when payment_method / amount differed.
        chargeAttemptCount: chargeAttempt,
    });
    if (totals.totalCents === 0) {
        await markHanukkahBoxConfirmed(db, householdId, orderId, orderRef, totals);
        return { outcome: 'confirmed_zero', orderId };
    }
    const hhSnap = await db.doc(`households/${householdId}`).get();
    const hhData = (_h = hhSnap.data()) !== null && _h !== void 0 ? _h : {};
    const customerId = (_j = hhData.stripeCustomerId) !== null && _j !== void 0 ? _j : '';
    const paymentMethodId = hhData.stripeDefaultPaymentMethodId;
    if (!stripe) {
        return recordChargeFailure(db, orderRef, householdId, orderId, chargeAttempt, 'Stripe is not configured');
    }
    if (!customerId || !paymentMethodId) {
        return recordChargeFailure(db, orderRef, householdId, orderId, chargeAttempt, 'No saved payment method on file');
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
                userId: String((_k = order.userId) !== null && _k !== void 0 ? _k : ''),
                type: 'hanukkah_box',
                chargeAttempt: String(chargeAttempt),
            },
        }, { idempotencyKey: `charge-pilot-box-${orderId}-attempt-${chargeAttempt}` });
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
        return recordChargeFailure(db, orderRef, householdId, orderId, chargeAttempt, message);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Charge failed';
        logger.error('chargeSinglePilotBoxOrder failed', { householdId, orderId, err });
        return recordChargeFailure(db, orderRef, householdId, orderId, chargeAttempt, message);
    }
}
async function recordChargeFailure(db, orderRef, householdId, orderId, attempt, message) {
    await orderRef.update({
        chargeFailedAt: new Date().toISOString(),
        chargeFailureMessage: message,
    });
    await notifyHanukkahBoxChargeFailed(db, householdId, orderId, attempt, message);
    return { outcome: 'failed', orderId, message };
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