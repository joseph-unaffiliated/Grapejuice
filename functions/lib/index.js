"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledReleaseStaleMarketplaceReservations = exports.scheduledChargePilotBoxes = exports.scheduledSetupNudges = exports.scheduledGiftConfirmReminders = exports.scheduledLockReminders = exports.scheduledDebriefReminders = exports.sendDebriefReminders = exports.reopenReceivedGiftBox = exports.acceptReceivedGiftBox = exports.convertReceivedGiftToCredit = exports.createReceivedGiftCheckout = exports.updateReceivedGiftLineItems = exports.markReceivedGiftViewed = exports.listMyReceivedGifts = exports.claimGiftInvite = exports.peekGiftInvite = exports.listMyGiftInvites = exports.trackMetaEvent = exports.finalizePilotGiftPayment = exports.purchasePilotGift = exports.shipStationWebhook = exports.writeOrderTracking = exports.acceptPartnerInvite = exports.listPartnerInvites = exports.createPartnerInvite = exports.stripeWebhook = exports.chargePilotBoxOrder = exports.cancelPilotBoxOrder = exports.updatePilotBoxOrder = exports.commitPilotBox = exports.createPilotSetupIntent = exports.createMarketplaceCheckout = exports.createPilotCheckout = exports.getAdminBoxesDashboard = exports.unaffiliatedVisit = exports.retentionLead = exports.redeemLoginLink = exports.requestLoginLink = exports.revealBoxWithEmail = exports.scheduledPurgeGuestSessions = exports.deleteGuestDataByEmail = exports.resumeGuestSession = exports.noteVisitorRegion = exports.markGuestSessionConverted = exports.saveGuestSessionBeacon = exports.saveGuestSession = exports.sendWelcomeOnSignup = exports.scanBeamAgeTriggers = exports.curatePilotBox = exports.askPilotRav = void 0;
exports.requestBoxDiscountCode = exports.scheduledAirtableCatalogSync = exports.syncAirtableCatalog = exports.recomputeCatalogBoxAllocations = void 0;
const logger = require("./logger");
const sentry_1 = require("./sentry");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const stripe_1 = require("./stripe");
const email_1 = require("./email");
const rav_1 = require("./rav");
Object.defineProperty(exports, "askPilotRav", { enumerable: true, get: function () { return rav_1.askPilotRav; } });
Object.defineProperty(exports, "curatePilotBox", { enumerable: true, get: function () { return rav_1.curatePilotBox; } });
const beamAgeTrigger_1 = require("./beamAgeTrigger");
Object.defineProperty(exports, "scanBeamAgeTriggers", { enumerable: true, get: function () { return beamAgeTrigger_1.scanBeamAgeTriggers; } });
const shipstation_1 = require("./shipstation");
const giftPayment_1 = require("./giftPayment");
const debriefReminders_1 = require("./debriefReminders");
const lockReminders_1 = require("./lockReminders");
const setupNudge_1 = require("./setupNudge");
const untraditionalCio_1 = require("./untraditionalCio");
const unaffiliated_1 = require("./unaffiliated");
const airtableCatalogSync_1 = require("./airtableCatalogSync");
const chargePilotBox_1 = require("./chargePilotBox");
const catalogInventory_1 = require("./catalogInventory");
const metaCapi_1 = require("./metaCapi");
const crypto_1 = require("crypto");
const adminDashboard_1 = require("./adminDashboard");
var welcome_1 = require("./welcome");
Object.defineProperty(exports, "sendWelcomeOnSignup", { enumerable: true, get: function () { return welcome_1.sendWelcomeOnSignup; } });
var guestSessions_1 = require("./guestSessions");
Object.defineProperty(exports, "saveGuestSession", { enumerable: true, get: function () { return guestSessions_1.saveGuestSession; } });
Object.defineProperty(exports, "saveGuestSessionBeacon", { enumerable: true, get: function () { return guestSessions_1.saveGuestSessionBeacon; } });
Object.defineProperty(exports, "markGuestSessionConverted", { enumerable: true, get: function () { return guestSessions_1.markGuestSessionConverted; } });
Object.defineProperty(exports, "noteVisitorRegion", { enumerable: true, get: function () { return guestSessions_1.noteVisitorRegion; } });
Object.defineProperty(exports, "resumeGuestSession", { enumerable: true, get: function () { return guestSessions_1.resumeGuestSession; } });
Object.defineProperty(exports, "deleteGuestDataByEmail", { enumerable: true, get: function () { return guestSessions_1.deleteGuestDataByEmail; } });
Object.defineProperty(exports, "scheduledPurgeGuestSessions", { enumerable: true, get: function () { return guestSessions_1.scheduledPurgeGuestSessions; } });
var loginLinks_1 = require("./loginLinks");
Object.defineProperty(exports, "revealBoxWithEmail", { enumerable: true, get: function () { return loginLinks_1.revealBoxWithEmail; } });
Object.defineProperty(exports, "requestLoginLink", { enumerable: true, get: function () { return loginLinks_1.requestLoginLink; } });
Object.defineProperty(exports, "redeemLoginLink", { enumerable: true, get: function () { return loginLinks_1.redeemLoginLink; } });
var retentionLead_1 = require("./retentionLead");
Object.defineProperty(exports, "retentionLead", { enumerable: true, get: function () { return retentionLead_1.retentionLead; } });
var unaffiliated_2 = require("./unaffiliated");
Object.defineProperty(exports, "unaffiliatedVisit", { enumerable: true, get: function () { return unaffiliated_2.unaffiliatedVisit; } });
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
exports.getAdminBoxesDashboard = (0, adminDashboard_1.createAdminBoxesDashboard)(db);
const HOLIDAY_ID = 'hanukkah-2026';
const DEFAULT_BOX_PRICE_CENTS = 8000;
const SHIPPING_FLAT_CENTS = 0;
const EXPEDITED_SHIPPING_CENTS = 1500;
const CHECKOUT_TAX_RATE = 0.075;
const DEFAULT_GIFT_CREDIT_CENTS = 8000;
function isValidEmail(raw) {
    const email = raw.trim();
    if (!email || email.length > 254)
        return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
function chargeableLineTotal(lineItems) {
    return lineItems.reduce((s, li) => { var _a, _b; return s + ((_a = li.unitCents) !== null && _a !== void 0 ? _a : 0) * ((_b = li.quantity) !== null && _b !== void 0 ? _b : 1); }, 0);
}
/** Recipient owes only add-on value above what the giver already prepaid. */
function recipientGiftUpgradeCents(lineItems, prepaidAddOnCents) {
    return Math.max(0, chargeableLineTotal(lineItems) - Math.max(0, prepaidAddOnCents));
}
function orderTotalCents(lineItems, boxPriceCents = DEFAULT_BOX_PRICE_CENTS) {
    const hasIncluded = lineItems.some((li) => li.unitCents === 0 || li.slotId);
    const base = hasIncluded ? boxPriceCents : 0;
    const subtotal = base + chargeableLineTotal(lineItems);
    return subtotal + SHIPPING_FLAT_CENTS;
}
async function assertHouseholdMember(uid, householdId) {
    var _a, _b;
    const snap = await db.doc(`households/${householdId}`).get();
    if (!snap.exists)
        throw new sentry_1.HttpsError('not-found', 'Household not found.');
    const memberIds = (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.memberIds) !== null && _b !== void 0 ? _b : [];
    if (!memberIds.includes(uid)) {
        throw new sentry_1.HttpsError('permission-denied', 'Not a member of this household.');
    }
    return snap;
}
async function getOrCreateStripeCustomer(householdId, uid, email) {
    var _a;
    const hhRef = db.doc(`households/${householdId}`);
    const hhSnap = await hhRef.get();
    const existing = (_a = hhSnap.data()) === null || _a === void 0 ? void 0 : _a.stripeCustomerId;
    if (existing)
        return existing;
    if (!stripe_1.stripe)
        throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured.');
    const customer = await stripe_1.stripe.customers.create({
        email: email || undefined,
        metadata: { householdId, userId: uid },
    });
    await hhRef.update({
        stripeCustomerId: customer.id,
        updatedAt: new Date().toISOString(),
    });
    return customer.id;
}
async function getLockAt(expedited) {
    var _a, _b, _c;
    const snap = await db.doc('config/hanukkah-2026').get();
    const data = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
    if (expedited && data.expeditedLockAt) {
        return (_b = data.expeditedLockAt) !== null && _b !== void 0 ? _b : null;
    }
    return (_c = data.lockAt) !== null && _c !== void 0 ? _c : null;
}
function isLocked(lockAt) {
    if (!lockAt)
        return false;
    return Date.now() >= new Date(lockAt).getTime();
}
function metaUserWithAddress(base, address) {
    var _a, _b, _c, _d;
    if (!address)
        return base;
    return Object.assign(Object.assign({}, base), { name: (_a = address.name) !== null && _a !== void 0 ? _a : null, city: (_b = address.city) !== null && _b !== void 0 ? _b : null, state: (_c = address.stateProvince) !== null && _c !== void 0 ? _c : null, zip: (_d = address.postalCode) !== null && _d !== void 0 ? _d : null, country: address.country === 'US' || address.country === 'CA' ? address.country : null });
}
/** Purchase for a newly committed order (box or marketplace). `purchase_<orderId>` matches the browser. */
async function sendOrderPurchaseToMeta(input) {
    var _a, _b, _c, _d, _e;
    const { orderId, order } = input;
    const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
    const contentIds = lineItems
        .map((li) => (typeof li.itemId === 'string' ? li.itemId : null))
        .filter((id) => !!id)
        .slice(0, 50);
    await (0, metaCapi_1.sendMetaEvent)({
        eventName: 'Purchase',
        eventId: `purchase_${orderId}`,
        context: input.context,
        user: metaUserWithAddress({
            email: (_b = (_a = input.email) !== null && _a !== void 0 ? _a : order.guestEmail) !== null && _b !== void 0 ? _b : null,
            phone: (_c = input.phone) !== null && _c !== void 0 ? _c : null,
            externalId: (_d = order.userId) !== null && _d !== void 0 ? _d : null,
        }, order.shippingAddress),
        customData: Object.assign(Object.assign({ value: Math.max(0, Number((_e = order.totalCents) !== null && _e !== void 0 ? _e : 0)) / 100, currency: 'USD', order_id: orderId, content_name: order.orderType === 'marketplace' ? 'Marketplace order' : 'Hanukkah box', content_type: 'product' }, (contentIds.length ? { content_ids: contentIds } : {})), { num_items: lineItems.length }),
        stripeBacked: true,
        playthrough: order.playthrough === true,
    });
}
async function emailForMeta(uid, fallback) {
    var _a, _b;
    if (fallback)
        return fallback;
    if (!uid)
        return null;
    const snap = await db.doc(`users/${uid}`).get();
    return (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : null;
}
function guestHouseholdId(email) {
    return `guest_${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`.slice(0, 140);
}
function lockHasPassed(lockAt) {
    if (!lockAt)
        return false;
    return Date.now() >= new Date(lockAt).getTime();
}
/** Firestore rejects undefined field values — strip them before writes. */
function sanitizeShippingAddress(raw) {
    var _a, _b, _c, _d, _e, _f;
    const country = raw.country === 'CA' || raw.country === 'OTHER' ? raw.country : 'US';
    const cleaned = {
        name: String((_a = raw.name) !== null && _a !== void 0 ? _a : '').trim(),
        line1: String((_b = raw.line1) !== null && _b !== void 0 ? _b : '').trim(),
        city: String((_c = raw.city) !== null && _c !== void 0 ? _c : '').trim(),
        stateProvince: String((_d = raw.stateProvince) !== null && _d !== void 0 ? _d : '').trim(),
        postalCode: String((_e = raw.postalCode) !== null && _e !== void 0 ? _e : '').trim(),
        country,
    };
    const line2 = String((_f = raw.line2) !== null && _f !== void 0 ? _f : '').trim();
    if (line2)
        cleaned.line2 = line2;
    return cleaned;
}
function catalogCents(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return Math.max(0, Math.round(value));
    if (typeof value === 'string' && value.trim()) {
        const n = Number(value);
        if (Number.isFinite(n))
            return Math.max(0, Math.round(n));
    }
    return 0;
}
async function resolveMarketplaceLineItems(raw) {
    var _a, _b, _c, _d;
    if (!raw.length) {
        throw new sentry_1.HttpsError('invalid-argument', 'Cart is empty.');
    }
    const normalized = [];
    for (const li of raw) {
        const itemId = String((_a = li.itemId) !== null && _a !== void 0 ? _a : '').trim();
        if (!itemId) {
            throw new sentry_1.HttpsError('invalid-argument', 'Each line item needs an itemId.');
        }
        const snap = await db.doc(`catalog/hanukkah/items/${itemId}`).get();
        if (!snap.exists) {
            throw new sentry_1.HttpsError('invalid-argument', `Unknown product: ${itemId}`);
        }
        const cat = (_b = snap.data()) !== null && _b !== void 0 ? _b : {};
        const unitCents = catalogCents(cat.nonMemberPriceCents) ||
            catalogCents(cat.dollarCostCents) ||
            catalogCents(cat.memberPriceCents);
        if (unitCents <= 0) {
            throw new sentry_1.HttpsError('invalid-argument', `Product is not available à la carte: ${itemId}`);
        }
        normalized.push({
            slotId: String((_c = cat.slotId) !== null && _c !== void 0 ? _c : 'addon'),
            itemId,
            quantity: Math.max(1, Math.floor(Number(li.quantity) || 1)),
            unitCents,
            label: String((_d = cat.name) !== null && _d !== void 0 ? _d : itemId),
        });
    }
    return normalized;
}
/** Stock totals are a best-effort refresh; never fail the caller's write over them. */
async function recomputeBoxAllocationsLogged(context, extra = {}) {
    try {
        const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
        logger.info(`${context} box allocations`, Object.assign(Object.assign({}, extra), alloc));
    }
    catch (allocErr) {
        logger.error(`${context} recomputeBoxAllocations failed`, Object.assign(Object.assign({}, extra), { allocErr }));
    }
}
async function fulfillMarketplaceOrder(householdId, orderId, order, skipShipStation) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const freshSnap = await orderRef.get();
    const fresh = (_a = freshSnap.data()) !== null && _a !== void 0 ? _a : order;
    if (fresh.marketplaceFulfilledAt)
        return;
    const userId = typeof fresh.userId === 'string' ? fresh.userId : '';
    let email = typeof fresh.guestEmail === 'string' ? fresh.guestEmail : '';
    if (userId) {
        const userSnap = await db.doc(`users/${userId}`).get();
        email = ((_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.email) || email;
    }
    if (email.includes('@') && !fresh.marketplaceEmailSentAt) {
        const lineItems = (_c = order.lineItems) !== null && _c !== void 0 ? _c : [];
        const itemSummary = fresh.giftSurprise
            ? 'A surprise Hanukkah gift box'
            : lineItems
                .map((li) => {
                var _a, _b;
                const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
                const name = String((_b = (_a = li.label) !== null && _a !== void 0 ? _a : li.itemId) !== null && _b !== void 0 ? _b : 'Item');
                return qty > 1 ? `${qty}× ${name}` : name;
            })
                .filter(Boolean)
                .join(', ');
        try {
            // Prefer dedicated marketplace template; fall back to box template only if unset
            // (still pass orderType so Liquid can branch once CIO is updated).
            const marketplaceTemplateId = parseInt((_d = process.env.CUSTOMERIO_TEMPLATE_MARKETPLACE_ORDER_CONFIRMED) !== null && _d !== void 0 ? _d : '0', 10);
            await (0, email_1.sendEmail)({
                to: email,
                template: marketplaceTemplateId > 0 ? 'marketplace-order-confirmed' : 'order-confirmed',
                data: {
                    orderId,
                    orderType: 'marketplace',
                    totalCents: order.totalCents,
                    estimatedDelivery: order.estimatedDelivery,
                    itemSummary,
                    itemCount: lineItems.reduce((sum, li) => sum + Math.max(1, Math.floor(Number(li.quantity) || 1)), 0),
                },
            });
            await orderRef.update({ marketplaceEmailSentAt: new Date().toISOString() });
        }
        catch (emailErr) {
            logger.error('Marketplace order confirmation email failed', emailErr);
        }
    }
    if (skipShipStation === true || fresh.playthrough === true) {
        logger.info('ShipStation export skipped (visitor playthrough)', { orderId });
        await orderRef.update({ marketplaceFulfilledAt: new Date().toISOString() });
        return;
    }
    // Gift boxes ship with the Hanukkah boxes: runExportHeldGiftOrders sends them once lock passes.
    if (fresh.orderType === 'received_gift') {
        const lockAt = (_e = fresh.lockAt) !== null && _e !== void 0 ? _e : (await getLockAt());
        if (!lockHasPassed(lockAt))
            return;
    }
    if (fresh.shipStationExportedAt) {
        await orderRef.update({ marketplaceFulfilledAt: new Date().toISOString() });
        return;
    }
    try {
        await (0, shipstation_1.exportOrderToShipStation)({
            orderId,
            householdId,
            shippingAddress: (_f = fresh.shippingAddress) !== null && _f !== void 0 ? _f : {},
            lineItems: (_g = fresh.lineItems) !== null && _g !== void 0 ? _g : [],
            totalCents: (_h = fresh.totalCents) !== null && _h !== void 0 ? _h : 0,
            customerEmail: email.includes('@') ? email : undefined,
        });
        await orderRef.update({ marketplaceFulfilledAt: new Date().toISOString() });
    }
    catch (shipErr) {
        logger.error('Marketplace ShipStation export failed', shipErr);
    }
}
/** Charge one committed à la carte order once lock has passed. Card was saved at checkout. */
async function chargeSingleMarketplaceOrder(householdId, orderId, order) {
    var _a, _b;
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    if (!lockHasPassed(order.lockAt))
        return;
    if (order.status !== 'committed')
        return;
    const totalCents = typeof order.totalCents === 'number' ? order.totalCents : 0;
    if (totalCents === 0) {
        await confirmMarketplaceCharge(householdId, orderId, orderRef, order, null);
        return;
    }
    const hhSnap = await db.doc(`households/${householdId}`).get();
    const hh = (_a = hhSnap.data()) !== null && _a !== void 0 ? _a : {};
    const customerId = typeof hh.stripeCustomerId === 'string' ? hh.stripeCustomerId : '';
    const paymentMethodId = typeof hh.stripeDefaultPaymentMethodId === 'string' ? hh.stripeDefaultPaymentMethodId : '';
    const priorAttempts = typeof order.chargeAttemptCount === 'number' ? Math.max(0, Math.floor(order.chargeAttemptCount)) : 0;
    const chargeAttempt = priorAttempts + 1;
    await orderRef.update({
        chargeAttemptedAt: new Date().toISOString(),
        chargeAttemptCount: chargeAttempt,
    });
    if (!stripe_1.stripe || !customerId || !paymentMethodId) {
        await orderRef.update({
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: !stripe_1.stripe ? 'Stripe is not configured' : 'No saved payment method on file',
        });
        return;
    }
    try {
        const paymentIntent = await stripe_1.stripe.paymentIntents.create({
            amount: totalCents,
            currency: 'usd',
            customer: customerId,
            payment_method: paymentMethodId,
            confirm: true,
            off_session: true,
            metadata: {
                householdId,
                orderId,
                userId: String((_b = order.userId) !== null && _b !== void 0 ? _b : ''),
                type: 'marketplace',
                chargeAttempt: String(chargeAttempt),
            },
        }, { idempotencyKey: `charge-marketplace-${orderId}-attempt-${chargeAttempt}` });
        if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
            await confirmMarketplaceCharge(householdId, orderId, orderRef, order, paymentIntent.id);
            return;
        }
        await orderRef.update({
            stripePaymentIntentId: paymentIntent.id,
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: `PaymentIntent status: ${paymentIntent.status}`,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Charge failed';
        logger.error('Marketplace lock charge failed', { householdId, orderId, err });
        await orderRef.update({
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: message,
        });
    }
}
async function confirmMarketplaceCharge(householdId, orderId, orderRef, order, paymentIntentId) {
    var _a;
    const claimed = await db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(orderRef);
        const data = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
        if (data.status === 'confirmed' || data.status === 'shipped' || data.status === 'delivered') {
            return false;
        }
        tx.update(orderRef, Object.assign(Object.assign(Object.assign({ status: 'confirmed', confirmedAt: firestore_1.FieldValue.serverTimestamp() }, (paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {})), { chargeFailedAt: firestore_1.FieldValue.delete(), chargeFailureMessage: firestore_1.FieldValue.delete() }), (data.inventoryReserved === true && !data.inventoryCommittedAt
            ? { inventoryReserved: false, inventoryCommittedAt: new Date().toISOString() }
            : {})));
        return data.inventoryReserved === true && !data.inventoryCommittedAt;
    });
    if (claimed) {
        try {
            await (0, catalogInventory_1.commitMarketplaceReservations)(db, (0, catalogInventory_1.reservedLinesFromOrder)(order));
        }
        catch (invErr) {
            logger.error('Marketplace inventory commit failed', { orderId, invErr });
        }
    }
    const fresh = (_a = (await orderRef.get()).data()) !== null && _a !== void 0 ? _a : order;
    if (fresh.status === 'confirmed' || fresh.status === 'shipped') {
        await fulfillMarketplaceOrder(householdId, orderId, fresh, fresh.playthrough === true);
    }
}
async function runChargeEligibleMarketplaceOrders() {
    var _a;
    const snap = await db
        .collectionGroup('orders')
        .where('status', '==', 'committed')
        .where('holidayId', '==', HOLIDAY_ID)
        .get();
    for (const doc of snap.docs) {
        const order = doc.data();
        if (order.orderType !== 'marketplace')
            continue;
        const householdId = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (!householdId)
            continue;
        try {
            await chargeSingleMarketplaceOrder(householdId, doc.id, order);
        }
        catch (err) {
            logger.error('Marketplace lock charge skipped', { orderId: doc.id, err });
        }
    }
}
function isCompleteShippingAddress(address) {
    const a = address;
    return Boolean((a === null || a === void 0 ? void 0 : a.name) && a.line1 && a.city && a.stateProvince && a.postalCode);
}
/**
 * Sealed $0 order for a gift box nobody confirmed by lock, shipped to the giver's address.
 * The order id is derived from the invite so a retried run can't create a second one.
 */
async function createAutoShipGiftOrder(params) {
    var _a, _b;
    const orderRef = db.doc(`households/${params.householdId}/orders/autoship-${params.giftInviteId}`);
    const configData = (_a = (await db.doc('config/hanukkah-2026').get()).data()) !== null && _a !== void 0 ? _a : {};
    const payload = Object.assign(Object.assign({ status: 'confirmed', orderType: 'received_gift', giftInviteId: params.giftInviteId, lineItems: normalizeGiftLineItems(params.lineItems), subtotalCents: 0, shippingCents: 0, taxCents: 0, totalCents: 0, creditAppliedCents: 0, giftCreditAppliedCents: 0, platformCreditAppliedCents: 0, shippingAddress: params.shippingAddress, holidayId: HOLIDAY_ID, userId: params.userId, estimatedDelivery: (_b = configData.estimatedDeliveryBy) !== null && _b !== void 0 ? _b : '2026-11-24', lockAt: params.lockAt, giftSurprise: true, autoShipped: true }, (params.autoShipForGiver ? { autoShipForGiver: true } : {})), { createdAt: firestore_1.FieldValue.serverTimestamp(), confirmedAt: firestore_1.FieldValue.serverTimestamp() });
    try {
        await orderRef.create(payload);
    }
    catch (err) {
        if (err.code === 6)
            return orderRef.id;
        throw err;
    }
    return orderRef.id;
}
/**
 * At lock: claimed gift boxes nobody confirmed ship to the giver's address if they gave one,
 * otherwise become gift credit. Unclaimed boxes with a giver address ship too; unclaimed ones
 * without an address become credit when claimed (see claimGiftInvite).
 */
async function runSettleUnconfirmedGiftBoxes() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const lockAt = await getLockAt();
    if (!isLocked(lockAt))
        return;
    const now = new Date().toISOString();
    // Filtered in memory: a collection-group equality query would need a collection-group index.
    const received = await db.collectionGroup('receivedGifts').get();
    for (const doc of received.docs) {
        const gift = doc.data();
        if (gift.kind !== 'box')
            continue;
        const unconfirmed = gift.status === 'available' || (gift.status === 'accepted' && !gift.checkoutOrderId);
        if (!unconfirmed)
            continue;
        const householdId = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (!householdId)
            continue;
        const giftInviteId = String((_b = gift.giftInviteId) !== null && _b !== void 0 ? _b : doc.id);
        try {
            if (isCompleteShippingAddress(gift.giverShippingAddress)) {
                const inviteSnap = await db.doc(`giftInvites/${giftInviteId}`).get();
                const hhSnap = await db.doc(`households/${householdId}`).get();
                const userId = (_f = (_d = (_c = inviteSnap.data()) === null || _c === void 0 ? void 0 : _c.claimedByUid) !== null && _d !== void 0 ? _d : (_e = hhSnap.data()) === null || _e === void 0 ? void 0 : _e.ownerId) !== null && _f !== void 0 ? _f : '';
                const orderId = await createAutoShipGiftOrder({
                    householdId,
                    giftInviteId,
                    userId,
                    lineItems: (_g = gift.lineItems) !== null && _g !== void 0 ? _g : [],
                    shippingAddress: gift.giverShippingAddress,
                    lockAt,
                });
                await doc.ref.update({
                    status: 'accepted',
                    acceptedAt: (_h = gift.acceptedAt) !== null && _h !== void 0 ? _h : now,
                    checkoutOrderId: orderId,
                    surprise: true,
                    autoShippedAt: now,
                    updatedAt: now,
                });
            }
            else {
                const creditCents = typeof gift.creditCents === 'number' ? gift.creditCents : DEFAULT_GIFT_CREDIT_CENTS;
                const hhRef = db.doc(`households/${householdId}`);
                await db.runTransaction(async (tx) => {
                    var _a, _b;
                    const fresh = await tx.get(doc.ref);
                    const f = (_a = fresh.data()) !== null && _a !== void 0 ? _a : {};
                    const stillOpen = f.status === 'available' || (f.status === 'accepted' && !f.checkoutOrderId);
                    if (!stillOpen)
                        return;
                    const hh = await tx.get(hhRef);
                    const current = typeof ((_b = hh.data()) === null || _b === void 0 ? void 0 : _b.giftCreditCents) === 'number' ? hh.data().giftCreditCents : 0;
                    tx.update(doc.ref, {
                        status: 'converted_to_credit',
                        convertedAt: now,
                        autoConvertedAt: now,
                        updatedAt: now,
                    });
                    tx.update(hhRef, { giftCreditCents: current + creditCents, updatedAt: now });
                });
            }
        }
        catch (err) {
            logger.error('Settling unconfirmed gift box failed', { giftInviteId, err });
        }
    }
    const invites = await db.collection('giftInvites').get();
    for (const doc of invites.docs) {
        const invite = doc.data();
        if ((0, giftPayment_1.resolveGiftInviteKind)(invite) !== 'box')
            continue;
        const paid = invite.paymentStatus === 'paid' || Boolean(invite.claimEmailSentAt);
        if (!paid || invite.status === 'claimed' || invite.autoShipOrderId)
            continue;
        if (!isCompleteShippingAddress(invite.shippingAddress))
            continue;
        try {
            const giverHouseholdId = (_j = (await db.doc(`users/${invite.giverUid}`).get()).data()) === null || _j === void 0 ? void 0 : _j.householdId;
            if (!giverHouseholdId) {
                logger.warn('Unclaimed gift box has no giver household; ship it manually', { giftInviteId: doc.id });
                continue;
            }
            const orderId = await createAutoShipGiftOrder({
                householdId: giverHouseholdId,
                giftInviteId: doc.id,
                userId: invite.giverUid,
                lineItems: (_k = invite.lineItems) !== null && _k !== void 0 ? _k : [],
                shippingAddress: invite.shippingAddress,
                lockAt,
                autoShipForGiver: true,
            });
            await doc.ref.update({ autoShipOrderId: orderId, autoShipHouseholdId: giverHouseholdId });
        }
        catch (err) {
            logger.error('Auto-shipping unclaimed gift box failed', { giftInviteId: doc.id, err });
        }
    }
}
const GIFT_REMINDER_UTM = 'utm_source=lifecycle&utm_medium=email&utm_campaign=gift_confirm_reminder';
/** 7 = the week-out reminder, 1 = deadline day. Null outside both windows. */
function giftReminderStage(lockAt) {
    const daysLeft = Math.ceil((new Date(lockAt).getTime() - Date.now()) / 86400000);
    if (daysLeft < 1)
        return null;
    if (daysLeft <= 1)
        return 1;
    if (daysLeft <= 7)
        return 7;
    return null;
}
function alreadyReminded(sentStage, stage) {
    return typeof sentStage === 'number' && sentStage <= stage;
}
function within24h(iso) {
    return typeof iso === 'string' && Date.now() - new Date(iso).getTime() < 86400000;
}
/**
 * Before lock: remind recipients whose gift box has no confirmed address — claimed boxes go to
 * the claimer (My Gifts), unclaimed paid boxes go to the invite's recipient (claim link).
 * Each doc records the last stage sent so a retried or repeated run doesn't double-send.
 */
async function runGiftConfirmReminders() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const lockAt = await getLockAt();
    if (!lockAt || isLocked(lockAt))
        return { sent: 0, skipped: 0 };
    const stage = giftReminderStage(lockAt);
    if (!stage)
        return { sent: 0, skipped: 0 };
    const configData = (_a = (await db.doc('config/hanukkah-2026').get()).data()) !== null && _a !== void 0 ? _a : {};
    const arrivesByLabel = (0, setupNudge_1.deliveryDateLabel)((_b = configData.estimatedDeliveryBy) !== null && _b !== void 0 ? _b : '2026-11-21');
    const shared = { finalNotice: stage === 1, deadlineLabel: (0, setupNudge_1.lockDateLabel)(lockAt), arrivesByLabel };
    const appBase = (_c = process.env.PILOT_APP_BASE_URL) !== null && _c !== void 0 ? _c : 'https://app.grapejuice.co';
    const now = new Date().toISOString();
    let sent = 0;
    let skipped = 0;
    const received = await db.collectionGroup('receivedGifts').get();
    for (const doc of received.docs) {
        const gift = doc.data();
        if (gift.kind !== 'box')
            continue;
        const unconfirmed = gift.status === 'available' || (gift.status === 'accepted' && !gift.checkoutOrderId);
        if (!unconfirmed || alreadyReminded(gift.confirmReminderStage, stage) || within24h(gift.claimedAt)) {
            skipped += 1;
            continue;
        }
        try {
            const giftInviteId = String((_d = gift.giftInviteId) !== null && _d !== void 0 ? _d : doc.id);
            const householdId = (_e = doc.ref.parent.parent) === null || _e === void 0 ? void 0 : _e.id;
            const uid = (_g = (_f = (await db.doc(`giftInvites/${giftInviteId}`).get()).data()) === null || _f === void 0 ? void 0 : _f.claimedByUid) !== null && _g !== void 0 ? _g : (householdId
                ? (_h = (await db.doc(`households/${householdId}`).get()).data()) === null || _h === void 0 ? void 0 : _h.ownerId
                : undefined);
            const email = uid ? (_j = (await db.doc(`users/${uid}`).get()).data()) === null || _j === void 0 ? void 0 : _j.email : undefined;
            if (!(email === null || email === void 0 ? void 0 : email.includes('@'))) {
                skipped += 1;
                continue;
            }
            const delivered = await (0, email_1.sendGiftConfirmReminderEmail)(Object.assign({ to: email.trim(), giverName: String((_k = gift.giverName) !== null && _k !== void 0 ? _k : 'Someone'), ctaUrl: `${appBase}/my-gifts?${GIFT_REMINDER_UTM}`, claimed: true, hasGiverAddress: isCompleteShippingAddress(gift.giverShippingAddress) }, shared));
            if (!delivered) {
                skipped += 1;
                continue;
            }
            await doc.ref.update({ confirmReminderStage: stage, confirmReminderSentAt: now });
            sent += 1;
        }
        catch (err) {
            logger.error('Gift confirm reminder failed', { receivedGiftId: doc.id, err });
            skipped += 1;
        }
    }
    const invites = await db.collection('giftInvites').get();
    for (const doc of invites.docs) {
        const invite = doc.data();
        if ((0, giftPayment_1.resolveGiftInviteKind)(invite) !== 'box')
            continue;
        const paid = invite.paymentStatus === 'paid' || Boolean(invite.claimEmailSentAt);
        if (!paid || invite.status === 'claimed' || invite.autoShipOrderId)
            continue;
        if (alreadyReminded(invite.confirmReminderStage, stage) || within24h(invite.claimEmailSentAt)) {
            skipped += 1;
            continue;
        }
        if (!((_l = invite.recipientEmail) === null || _l === void 0 ? void 0 : _l.includes('@')) || !invite.claimToken) {
            skipped += 1;
            continue;
        }
        try {
            const delivered = await (0, email_1.sendGiftConfirmReminderEmail)(Object.assign({ to: invite.recipientEmail.trim(), giverName: invite.giverName || 'Someone', ctaUrl: `${appBase}/gift/claim?token=${invite.claimToken}&${GIFT_REMINDER_UTM}`, claimed: false, hasGiverAddress: isCompleteShippingAddress(invite.shippingAddress) }, shared));
            if (!delivered) {
                skipped += 1;
                continue;
            }
            await doc.ref.update({ confirmReminderStage: stage, confirmReminderSentAt: now });
            sent += 1;
        }
        catch (err) {
            logger.error('Gift confirm reminder failed', { giftInviteId: doc.id, err });
            skipped += 1;
        }
    }
    logger.info('Gift confirm reminder batch complete', { sent, skipped, stage });
    return { sent, skipped };
}
async function runExportHeldGiftOrders() {
    var _a;
    if (!isLocked(await getLockAt()))
        return;
    const snap = await db
        .collectionGroup('orders')
        .where('status', '==', 'confirmed')
        .where('holidayId', '==', HOLIDAY_ID)
        .get();
    for (const doc of snap.docs) {
        const order = doc.data();
        if (order.orderType !== 'received_gift' || order.marketplaceFulfilledAt)
            continue;
        const householdId = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (!householdId)
            continue;
        try {
            await fulfillMarketplaceOrder(householdId, doc.id, order, order.playthrough === true);
        }
        catch (err) {
            logger.error('Held gift order export failed', { orderId: doc.id, err });
        }
    }
}
async function retryFailedMarketplaceCharges(householdId) {
    const open = await db.collection(`households/${householdId}/orders`).where('status', '==', 'committed').get();
    for (const doc of open.docs) {
        const data = doc.data();
        if (data.orderType !== 'marketplace' || !data.chargeFailureMessage)
            continue;
        if (!lockHasPassed(data.lockAt))
            continue;
        await chargeSingleMarketplaceOrder(householdId, doc.id, data);
    }
}
exports.createPilotCheckout = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    if (!stripe_1.stripe) {
        throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
    }
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const householdId = data.householdId;
    const shippingAddress = data.shippingAddress;
    if (!householdId || !(shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.line1) || !(shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.city)) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const lockAt = await getLockAt();
    if (isLocked(lockAt)) {
        throw new sentry_1.HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
    }
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    if (!draftSnap.exists) {
        throw new sentry_1.HttpsError('failed-precondition', 'No box draft found. Complete onboarding first.');
    }
    const draft = draftSnap.data();
    const lineItems = (_c = draft.lineItems) !== null && _c !== void 0 ? _c : [];
    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = (_d = configSnap.data()) !== null && _d !== void 0 ? _d : {};
    const { boxPriceCents, kidCount } = await (0, chargePilotBox_1.boxPriceForUser)(db, request.auth.uid, configData);
    const subtotalCents = orderTotalCents(lineItems, boxPriceCents);
    const shippingCents = SHIPPING_FLAT_CENTS;
    const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
    const totalCents = subtotalCents + shippingCents + taxCents;
    if (totalCents < 50) {
        throw new sentry_1.HttpsError('invalid-argument', 'Order total is too small.');
    }
    const estimatedDelivery = (_e = configData.estimatedDeliveryBy) !== null && _e !== void 0 ? _e : '2026-11-24';
    const orderRef = db.collection(`households/${householdId}/orders`).doc();
    await orderRef.set({
        status: 'pending',
        lineItems,
        boxPriceCents,
        kidCount,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        shippingAddress,
        holidayId: HOLIDAY_ID,
        userId: request.auth.uid,
        lockAt,
        estimatedDelivery,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    const paymentIntent = await stripe_1.stripe.paymentIntents.create({
        amount: totalCents,
        currency: 'usd',
        metadata: {
            householdId,
            orderId: orderRef.id,
            userId: request.auth.uid,
            type: 'hanukkah_box',
        },
        automatic_payment_methods: { enabled: true },
    });
    await orderRef.update({ stripePaymentIntentId: paymentIntent.id });
    return {
        clientSecret: paymentIntent.client_secret,
        orderId: orderRef.id,
        totalCents,
    };
});
/** À la carte checkout. Saves a card and charges when Hanukkah boxes lock. Guests need an email; a box still requires an account. */
exports.createMarketplaceCheckout = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    try {
        const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
        const shippingAddress = sanitizeShippingAddress(data.shippingAddress);
        if (!((_b = data.shippingAddress) === null || _b === void 0 ? void 0 : _b.line1) || !((_c = data.shippingAddress) === null || _c === void 0 ? void 0 : _c.city)) {
            throw new sentry_1.HttpsError('invalid-argument', 'shippingAddress is required.');
        }
        if (!shippingAddress.name || !shippingAddress.stateProvince || !shippingAddress.postalCode) {
            throw new sentry_1.HttpsError('invalid-argument', 'Please enter name, street, city, state/province, and postal code.');
        }
        const authedUid = (_d = request.auth) === null || _d === void 0 ? void 0 : _d.uid;
        let householdId = '';
        let guestEmail = '';
        let hhData = {};
        if (authedUid) {
            householdId = String((_e = data.householdId) !== null && _e !== void 0 ? _e : '').trim();
            if (!householdId) {
                throw new sentry_1.HttpsError('invalid-argument', 'householdId is required.');
            }
            const hhSnap = await assertHouseholdMember(authedUid, householdId);
            hhData = (_f = hhSnap.data()) !== null && _f !== void 0 ? _f : {};
        }
        else {
            guestEmail = String((_g = data.email) !== null && _g !== void 0 ? _g : '').trim().toLowerCase();
            if (!guestEmail.includes('@')) {
                throw new sentry_1.HttpsError('invalid-argument', 'Enter an email so we can send your receipt.');
            }
            householdId = guestHouseholdId(guestEmail);
            const hhRef = db.doc(`households/${householdId}`);
            const existing = await hhRef.get();
            hhData = (_h = existing.data()) !== null && _h !== void 0 ? _h : {};
            if (!existing.exists) {
                const now = new Date().toISOString();
                await hhRef.set({
                    guest: true,
                    guestEmail,
                    createdAt: now,
                    updatedAt: now,
                });
            }
        }
        const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
        const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;
        const lineItems = await resolveMarketplaceLineItems((_j = data.lineItems) !== null && _j !== void 0 ? _j : []);
        const subtotalCents = chargeableLineTotal(lineItems);
        if (subtotalCents < 1) {
            throw new sentry_1.HttpsError('invalid-argument', 'Cart total is too small.');
        }
        const shippingCents = SHIPPING_FLAT_CENTS;
        const priced = (0, chargePilotBox_1.checkoutTotalsAfterCredit)(subtotalCents + shippingCents, giftCreditCents, platformCreditCents);
        const { taxCents, totalCents, giftCreditApplied, platformCreditApplied, creditApplied } = priced;
        if (totalCents > 0 && totalCents < 50) {
            throw new sentry_1.HttpsError('invalid-argument', 'Order total is too small.');
        }
        const configSnap = await db.doc('config/hanukkah-2026').get();
        const configData = (_k = configSnap.data()) !== null && _k !== void 0 ? _k : {};
        const estimatedDelivery = (_l = configData.estimatedDeliveryBy) !== null && _l !== void 0 ? _l : '2026-11-24';
        const lockAt = await getLockAt(false);
        const orderRef = db.collection(`households/${householdId}/orders`).doc();
        const skipShipStation = data.skipShipStation === true;
        const metaCtx = (0, metaCapi_1.metaContextFromCallable)(request);
        const attribution = (0, metaCapi_1.sanitizeAttribution)(data.attribution);
        const reservedLines = await db.runTransaction(async (tx) => (0, catalogInventory_1.reserveMarketplaceInventoryInTx)(db, tx, lineItems.map((li) => ({ itemId: li.itemId, quantity: li.quantity })), lockAt));
        const cardOnFile = Boolean(hhData.stripeDefaultPaymentMethodId);
        const needsCard = totalCents > 0 && !cardOnFile;
        const reservedAt = new Date().toISOString();
        const orderPayload = Object.assign(Object.assign(Object.assign(Object.assign({ status: needsCard ? 'pending' : 'committed', orderType: 'marketplace', lineItems,
            subtotalCents,
            shippingCents,
            taxCents,
            totalCents, creditAppliedCents: creditApplied, giftCreditAppliedCents: giftCreditApplied, platformCreditAppliedCents: platformCreditApplied, shippingAddress, holidayId: HOLIDAY_ID, lockAt }, (authedUid ? { userId: authedUid } : {})), (guestEmail ? { guestEmail } : {})), { estimatedDelivery, inventoryReserved: true, inventoryReservedAt: reservedAt, inventoryReservedLines: reservedLines, createdAt: firestore_1.FieldValue.serverTimestamp() }), (attribution ? { attribution } : {}));
        if (skipShipStation)
            orderPayload.playthrough = true;
        let creditsDeducted = false;
        try {
            await orderRef.set(orderPayload);
            if (creditApplied > 0) {
                await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign({}, (giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {})), (platformCreditApplied > 0
                    ? { platformCreditCents: platformCreditCents - platformCreditApplied }
                    : {})), { updatedAt: new Date().toISOString() }));
                creditsDeducted = true;
            }
            if (!skipShipStation) {
                const buyerEmail = guestEmail || (typeof ((_m = request.auth) === null || _m === void 0 ? void 0 : _m.token.email) === 'string' ? request.auth.token.email : '');
                await (0, unaffiliated_1.reportUnaffiliatedShippingGeo)({ attribution, shippingAddress, email: buyerEmail });
            }
            if (!needsCard) {
                await sendOrderPurchaseToMeta({
                    orderId: orderRef.id,
                    order: orderPayload,
                    context: metaCtx,
                    email: guestEmail || (authedUid ? await emailForMeta(authedUid, (_o = request.auth) === null || _o === void 0 ? void 0 : _o.token.email) : null),
                });
                return {
                    orderId: orderRef.id,
                    totalCents,
                    clientSecret: null,
                    intent: null,
                    status: 'committed',
                };
            }
            if (!stripe_1.stripe) {
                throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
            }
            let customerId = typeof hhData.stripeCustomerId === 'string' ? hhData.stripeCustomerId : '';
            if (!customerId) {
                const email = guestEmail ||
                    (authedUid ? String((_q = (_p = (await db.doc(`users/${authedUid}`).get()).data()) === null || _p === void 0 ? void 0 : _p.email) !== null && _q !== void 0 ? _q : '') : '');
                const customer = await stripe_1.stripe.customers.create(Object.assign(Object.assign({}, (email.includes('@') ? { email } : {})), { metadata: Object.assign({ householdId }, (guestEmail ? { guest: 'true' } : {})) }));
                customerId = customer.id;
                await db.doc(`households/${householdId}`).set({ stripeCustomerId: customerId, updatedAt: new Date().toISOString() }, { merge: true });
            }
            const setupIntent = await stripe_1.stripe.setupIntents.create({
                customer: customerId,
                usage: 'off_session',
                automatic_payment_methods: { enabled: true },
                metadata: Object.assign(Object.assign({ householdId, orderId: orderRef.id, type: 'marketplace' }, (authedUid ? { userId: authedUid } : {})), (0, metaCapi_1.metaContextToStripeMetadata)(metaCtx)),
            });
            if (!setupIntent.client_secret) {
                throw new sentry_1.HttpsError('internal', 'SetupIntent missing client secret.');
            }
            return {
                clientSecret: setupIntent.client_secret,
                orderId: orderRef.id,
                totalCents,
                intent: 'setup',
                status: 'pending',
            };
        }
        catch (innerErr) {
            // Release reservation if we fail after reserving (Stripe/config errors).
            try {
                await (0, catalogInventory_1.releaseMarketplaceReservations)(db, reservedLines);
                await orderRef.set({
                    status: 'cancelled',
                    cancelReason: 'checkout_failed_after_reserve',
                    inventoryReserved: false,
                    reservationReleasedAt: new Date().toISOString(),
                }, { merge: true });
            }
            catch (releaseErr) {
                logger.error('Failed to release marketplace reservation after checkout error', releaseErr);
            }
            if (creditsDeducted && (giftCreditApplied > 0 || platformCreditApplied > 0)) {
                try {
                    await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign({}, (giftCreditApplied > 0
                        ? { giftCreditCents: firestore_1.FieldValue.increment(giftCreditApplied) }
                        : {})), (platformCreditApplied > 0
                        ? { platformCreditCents: firestore_1.FieldValue.increment(platformCreditApplied) }
                        : {})), { updatedAt: new Date().toISOString() }));
                }
                catch (creditErr) {
                    logger.error('Failed to restore marketplace credit after checkout error', creditErr);
                }
            }
            throw innerErr;
        }
    }
    catch (err) {
        if (err instanceof sentry_1.HttpsError)
            throw err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('createMarketplaceCheckout failed', { err, message: msg });
        throw new sentry_1.HttpsError('internal', msg || 'Checkout failed. Please try again.');
    }
});
exports.createPilotSetupIntent = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    if (!stripe_1.stripe) {
        throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
    }
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const householdId = data.householdId;
    if (!householdId) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId is required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const email = (_d = (_c = userSnap.data()) === null || _c === void 0 ? void 0 : _c.email) !== null && _d !== void 0 ? _d : '';
    const customerId = await getOrCreateStripeCustomer(householdId, request.auth.uid, email);
    const setupIntent = await stripe_1.stripe.setupIntents.create({
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        metadata: Object.assign({ householdId, userId: request.auth.uid }, (0, metaCapi_1.metaContextToStripeMetadata)((0, metaCapi_1.metaContextFromCallable)(request))),
    });
    if (!setupIntent.client_secret) {
        throw new sentry_1.HttpsError('internal', 'SetupIntent missing client secret.');
    }
    return { clientSecret: setupIntent.client_secret, customerId };
});
/**
 * Save card (SetupIntent, before this call) + commit address/shipping tier.
 * No PaymentIntent here — one off-session charge at lock/ship (see charge-once-at-ship).
 */
exports.commitPilotBox = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const householdId = data.householdId;
    const shippingAddress = data.shippingAddress;
    if (!householdId || !(shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.line1) || !(shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.city)) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
    }
    const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
    const hhData = (_c = hhSnap.data()) !== null && _c !== void 0 ? _c : {};
    const cardOnFile = !!hhData.cardOnFileAt;
    const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
    const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;
    const lockAt = await getLockAt(false);
    if (isLocked(lockAt)) {
        throw new sentry_1.HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
    }
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    if (!draftSnap.exists) {
        throw new sentry_1.HttpsError('failed-precondition', 'No box draft found. Complete onboarding first.');
    }
    const draft = draftSnap.data();
    const lineItems = (_d = draft.lineItems) !== null && _d !== void 0 ? _d : [];
    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = (_e = configSnap.data()) !== null && _e !== void 0 ? _e : {};
    const { boxPriceCents, kidCount } = await (0, chargePilotBox_1.boxPriceForUser)(db, request.auth.uid, configData);
    const subtotalCents = orderTotalCents(lineItems, boxPriceCents);
    const shippingCents = SHIPPING_FLAT_CENTS;
    const priced = (0, chargePilotBox_1.checkoutTotalsAfterCredit)(subtotalCents + shippingCents, giftCreditCents, platformCreditCents);
    const { taxCents, totalCents, giftCreditApplied, platformCreditApplied, creditApplied } = priced;
    const totalAvailableCredit = giftCreditCents + platformCreditCents;
    if (!cardOnFile && totalAvailableCredit < boxPriceCents) {
        throw new sentry_1.HttpsError('failed-precondition', 'Save a payment method before committing your box.');
    }
    if (totalCents > 0 && !cardOnFile) {
        throw new sentry_1.HttpsError('failed-precondition', 'Save a payment method for add-ons and shipping.');
    }
    if (totalCents < 0) {
        throw new sentry_1.HttpsError('invalid-argument', 'Order total is invalid.');
    }
    const isPlaythrough = data.skipShipStation === true;
    if (!isPlaythrough) {
        await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lineItems);
    }
    const estimatedDelivery = (_f = configData.estimatedDeliveryBy) !== null && _f !== void 0 ? _f : '2026-11-24';
    const attribution = (0, metaCapi_1.sanitizeAttribution)(data.attribution);
    const orderRef = db.collection(`households/${householdId}/orders`).doc();
    const orderPayload = Object.assign(Object.assign({ status: 'committed', orderType: 'hanukkah_box', lineItems,
        boxPriceCents,
        kidCount,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents, creditAppliedCents: creditApplied, giftCreditAppliedCents: giftCreditApplied, platformCreditAppliedCents: platformCreditApplied, expeditedShipping: false, shippingAddress, holidayId: HOLIDAY_ID, userId: request.auth.uid, lockAt,
        estimatedDelivery, committedAt: firestore_1.FieldValue.serverTimestamp(), createdAt: firestore_1.FieldValue.serverTimestamp() }, (isPlaythrough ? { playthrough: true } : {})), (attribution ? { attribution } : {}));
    await orderRef.set(orderPayload);
    if (giftCreditApplied > 0 || platformCreditApplied > 0) {
        await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign({}, (giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {})), (platformCreditApplied > 0 ? { platformCreditCents: platformCreditCents - platformCreditApplied } : {})), { updatedAt: new Date().toISOString() }));
    }
    await db.doc(`users/${request.auth.uid}`).set(Object.assign(Object.assign(Object.assign({ debriefReminderEligible: true, debriefReminderAttempts: 0, lockReminderEligible: false }, (((_g = data.contactPhone) === null || _g === void 0 ? void 0 : _g.trim()) ? { phone: data.contactPhone.trim() } : {})), (data.smsOptIn === true ? { smsOptIn: true } : {})), { updatedAt: new Date().toISOString() }), { merge: true });
    // Exit signal for the account setup nudge (Untraditional workspace).
    const commitEmail = typeof request.auth.token.email === 'string' ? request.auth.token.email : '';
    if (commitEmail) {
        await (0, untraditionalCio_1.untraditionalMarkSafe)(commitEmail, {
            grapejuice_setup_complete: true,
            grapejuice_setup_complete_at: new Date().toISOString(),
        });
    }
    if (!isPlaythrough) {
        try {
            const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
            logger.info('commitPilotBox box allocations', Object.assign({ orderId: orderRef.id }, alloc));
        }
        catch (allocErr) {
            logger.error('commitPilotBox recomputeBoxAllocations failed', {
                orderId: orderRef.id,
                allocErr,
            });
        }
    }
    await sendOrderPurchaseToMeta({
        orderId: orderRef.id,
        order: orderPayload,
        context: (0, metaCapi_1.metaContextFromCallable)(request),
        email: await emailForMeta(request.auth.uid, request.auth.token.email),
        phone: ((_h = data.contactPhone) === null || _h === void 0 ? void 0 : _h.trim()) || null,
    });
    if (!isPlaythrough) {
        await (0, unaffiliated_1.reportUnaffiliatedShippingGeo)({ attribution, shippingAddress, email: commitEmail });
    }
    return {
        orderId: orderRef.id,
        totalCents,
        status: 'committed',
    };
});
/**
 * Sync the household box draft onto a pre-ship committed order (swaps / add-ons
 * after commit). Recalculates merchandise + tax; keeps shipping address,
 * expedited flag, and already-applied credits from the order.
 */
exports.updatePilotBoxOrder = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const householdId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId;
    const orderId = (_c = request.data) === null || _c === void 0 ? void 0 : _c.orderId;
    if (!householdId || !orderId) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        throw new sentry_1.HttpsError('not-found', 'Order not found.');
    }
    const order = (_d = orderSnap.data()) !== null && _d !== void 0 ? _d : {};
    const status = order.status;
    if (status !== 'committed' && status !== 'pending') {
        throw new sentry_1.HttpsError('failed-precondition', 'This order can no longer be updated. Contact support if you need changes.');
    }
    const lockAt = (_e = (typeof order.lockAt === 'string' ? order.lockAt : null)) !== null && _e !== void 0 ? _e : (await getLockAt(order.expeditedShipping === true));
    if (isLocked(lockAt)) {
        throw new sentry_1.HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
    }
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    if (!draftSnap.exists) {
        throw new sentry_1.HttpsError('failed-precondition', 'No box draft found.');
    }
    const lineItems = (_g = (_f = draftSnap.data()) === null || _f === void 0 ? void 0 : _f.lineItems) !== null && _g !== void 0 ? _g : [];
    if (!lineItems.length) {
        throw new sentry_1.HttpsError('failed-precondition', 'Your box is empty. Add items before updating the order.');
    }
    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = (_h = configSnap.data()) !== null && _h !== void 0 ? _h : {};
    const { boxPriceCents, kidCount } = await (0, chargePilotBox_1.boxPriceForUser)(db, typeof order.userId === 'string' ? order.userId : request.auth.uid, configData);
    const expeditedShipping = order.expeditedShipping === true;
    const subtotalCents = orderTotalCents(lineItems, boxPriceCents);
    const shippingCents = typeof order.shippingCents === 'number'
        ? order.shippingCents
        : SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
    const giftCreditApplied = typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
    const platformCreditApplied = typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
    const priced = (0, chargePilotBox_1.checkoutTotalsAfterCredit)(subtotalCents + shippingCents, giftCreditApplied, platformCreditApplied);
    const { taxCents, totalCents, creditApplied } = priced;
    const previousTotal = typeof order.totalCents === 'number' ? order.totalCents : 0;
    const priorLines = (_j = order.lineItems) !== null && _j !== void 0 ? _j : [];
    if (order.playthrough !== true) {
        await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lineItems, { creditLines: priorLines });
    }
    await orderRef.update({
        lineItems,
        boxPriceCents,
        kidCount,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        creditAppliedCents: creditApplied,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    if (order.playthrough !== true) {
        try {
            const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
            logger.info('updatePilotBoxOrder box allocations', Object.assign({ orderId }, alloc));
        }
        catch (allocErr) {
            logger.error('updatePilotBoxOrder recomputeBoxAllocations failed', { orderId, allocErr });
        }
    }
    return {
        orderId,
        totalCents,
        previousTotalCents: previousTotal,
        deltaCents: totalCents - previousTotal,
        status: status,
    };
});
/** Void a pre-ship committed/pending order; restore credits; keep card on file. */
exports.cancelPilotBoxOrder = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const householdId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId;
    const orderId = (_c = request.data) === null || _c === void 0 ? void 0 : _c.orderId;
    if (!householdId || !orderId) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        throw new sentry_1.HttpsError('not-found', 'Order not found.');
    }
    const order = (_d = orderSnap.data()) !== null && _d !== void 0 ? _d : {};
    const status = order.status;
    if (status !== 'committed' && status !== 'pending') {
        if (status === 'cancelled') {
            throw new sentry_1.HttpsError('failed-precondition', 'This order is already cancelled.');
        }
        if (status === 'shipped' || status === 'delivered') {
            throw new sentry_1.HttpsError('failed-precondition', 'This box has already shipped. Contact support for help.');
        }
        throw new sentry_1.HttpsError('failed-precondition', 'This order can no longer be cancelled in the app. Contact support.');
    }
    const piId = typeof order.stripePaymentIntentId === 'string' ? order.stripePaymentIntentId : undefined;
    if (piId) {
        // Legacy orders: commit used to create a manual-capture PI before charge-at-ship refactor.
        if (!stripe_1.stripe) {
            throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured.');
        }
        try {
            await stripe_1.stripe.paymentIntents.cancel(piId);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const alreadyCanceled = /already.*(cancel|cancell)/i.test(msg);
            if (!alreadyCanceled) {
                logger.error('Failed to cancel PaymentIntent', { piId, err });
                throw new sentry_1.HttpsError('internal', 'Could not release the payment hold. Try again or contact support.');
            }
        }
    }
    const giftRestore = typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
    const platformRestore = typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
    await db.runTransaction(async (tx) => {
        var _a;
        const fresh = await tx.get(orderRef);
        const freshStatus = (_a = fresh.data()) === null || _a === void 0 ? void 0 : _a.status;
        if (freshStatus !== 'committed' && freshStatus !== 'pending') {
            throw new sentry_1.HttpsError('failed-precondition', 'Order status changed. Refresh and try again.');
        }
        tx.update(orderRef, {
            status: 'cancelled',
            cancelledAt: firestore_1.FieldValue.serverTimestamp(),
            cancelledByUid: request.auth.uid,
        });
        if (giftRestore > 0 || platformRestore > 0) {
            tx.update(db.doc(`households/${householdId}`), Object.assign(Object.assign(Object.assign({}, (giftRestore > 0 ? { giftCreditCents: firestore_1.FieldValue.increment(giftRestore) } : {})), (platformRestore > 0 ? { platformCreditCents: firestore_1.FieldValue.increment(platformRestore) } : {})), { updatedAt: new Date().toISOString() }));
        }
    });
    await db.doc(`users/${request.auth.uid}`).set({
        lockReminderEligible: true,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
    if (order.playthrough !== true) {
        try {
            const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
            logger.info('cancelPilotBoxOrder box allocations', Object.assign({ orderId }, alloc));
        }
        catch (allocErr) {
            logger.error('cancelPilotBoxOrder recomputeBoxAllocations failed', { orderId, allocErr });
        }
    }
    return { orderId, status: 'cancelled' };
});
/**
 * QA / ops: charge one committed Hanukkah box order (normally runs on schedule after lock).
 * Pass force=true to charge before lockAt.
 */
exports.chargePilotBoxOrder = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '').trim();
    const orderId = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.orderId) !== null && _e !== void 0 ? _e : '').trim();
    const force = ((_f = request.data) === null || _f === void 0 ? void 0 : _f.force) === true;
    if (!householdId || !orderId) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    return (0, chargePilotBox_1.chargePilotBoxOrderForUser)(db, stripe_1.stripe, request.auth.uid, householdId, orderId, force);
});
exports.stripeWebhook = (0, sentry_1.onRequest)({ cors: false }, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8;
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    const sig = req.headers['stripe-signature'];
    const rawBody = (_a = req.rawBody) !== null && _a !== void 0 ? _a : Buffer.from(JSON.stringify((_b = req.body) !== null && _b !== void 0 ? _b : {}));
    if (!sig) {
        res.status(400).send('Missing stripe-signature');
        return;
    }
    let event;
    try {
        event = (0, stripe_1.verifyWebhook)(rawBody, sig);
    }
    catch (err) {
        logger.error('Webhook verify failed', err);
        res.status(400).send('Webhook Error');
        return;
    }
    try {
        const eventRef = db.doc(`stripeWebhookEvents/${event.id}`);
        const prior = await eventRef.get();
        if (prior.exists) {
            logger.info('Stripe webhook duplicate skipped', { eventId: event.id, type: event.type });
            res.json({ received: true, duplicate: true });
            return;
        }
        if (event.type === 'setup_intent.succeeded') {
            const si = event.data.object;
            const householdId = (_c = si.metadata) === null || _c === void 0 ? void 0 : _c.householdId;
            const paymentMethodId = typeof si.payment_method === 'string' ? si.payment_method : (_d = si.payment_method) === null || _d === void 0 ? void 0 : _d.id;
            const customerId = typeof si.customer === 'string' ? si.customer : (_e = si.customer) === null || _e === void 0 ? void 0 : _e.id;
            if (householdId && paymentMethodId) {
                await db.doc(`households/${householdId}`).update(Object.assign(Object.assign({ cardOnFileAt: new Date().toISOString(), stripeDefaultPaymentMethodId: paymentMethodId }, (customerId ? { stripeCustomerId: customerId } : {})), { updatedAt: new Date().toISOString() }));
                if (stripe_1.stripe && customerId) {
                    await stripe_1.stripe.customers.update(customerId, {
                        invoice_settings: { default_payment_method: paymentMethodId },
                    });
                }
                const setupOrderId = (_f = si.metadata) === null || _f === void 0 ? void 0 : _f.orderId;
                const metaCtx = (0, metaCapi_1.metaContextFromStripeMetadata)(si.metadata);
                const setupUserId = (_h = (_g = si.metadata) === null || _g === void 0 ? void 0 : _g.userId) !== null && _h !== void 0 ? _h : null;
                let metaEmail = null;
                try {
                    metaEmail = await emailForMeta(setupUserId);
                }
                catch (emailErr) {
                    logger.warn('Meta: could not load email for setup intent', { setupIntentId: si.id, emailErr });
                }
                let committedMarketplaceOrder = null;
                if (((_j = si.metadata) === null || _j === void 0 ? void 0 : _j.type) === 'marketplace' && setupOrderId) {
                    const pendingRef = db.doc(`households/${householdId}/orders/${setupOrderId}`);
                    const pendingSnap = await pendingRef.get();
                    if (pendingSnap.exists && ((_k = pendingSnap.data()) === null || _k === void 0 ? void 0 : _k.status) === 'pending') {
                        await pendingRef.update({
                            status: 'committed',
                            updatedAt: new Date().toISOString(),
                        });
                        committedMarketplaceOrder = (_l = pendingSnap.data()) !== null && _l !== void 0 ? _l : null;
                    }
                }
                await (0, metaCapi_1.sendMetaEvent)({
                    eventName: 'AddPaymentInfo',
                    eventId: `payment_${si.id}`,
                    context: metaCtx,
                    user: { email: metaEmail, externalId: setupUserId },
                    stripeBacked: true,
                    playthrough: (committedMarketplaceOrder === null || committedMarketplaceOrder === void 0 ? void 0 : committedMarketplaceOrder.playthrough) === true,
                });
                if (committedMarketplaceOrder && setupOrderId) {
                    await sendOrderPurchaseToMeta({
                        orderId: setupOrderId,
                        order: committedMarketplaceOrder,
                        context: metaCtx,
                        email: metaEmail,
                    });
                }
                try {
                    await (0, chargePilotBox_1.retryFailedHanukkahBoxCharges)(db, stripe_1.stripe, householdId);
                }
                catch (retryErr) {
                    logger.warn('Could not retry Hanukkah box charge after card update', {
                        householdId,
                        retryErr,
                    });
                }
                try {
                    await retryFailedMarketplaceCharges(householdId);
                }
                catch (retryErr) {
                    logger.warn('Could not retry marketplace charge after card update', { householdId, retryErr });
                }
                if (((_m = si.metadata) === null || _m === void 0 ? void 0 : _m.type) === 'marketplace' && setupOrderId) {
                    const savedRef = db.doc(`households/${householdId}/orders/${setupOrderId}`);
                    const savedSnap = await savedRef.get();
                    const saved = savedSnap.data();
                    if ((saved === null || saved === void 0 ? void 0 : saved.status) === 'committed' && lockHasPassed(saved.lockAt)) {
                        try {
                            await chargeSingleMarketplaceOrder(householdId, setupOrderId, saved);
                        }
                        catch (chargeErr) {
                            logger.warn('Could not charge marketplace order after card save', {
                                householdId,
                                orderId: setupOrderId,
                                chargeErr,
                            });
                        }
                    }
                }
            }
        }
        if (event.type === 'payment_intent.succeeded') {
            const pi = event.data.object;
            const giftType = (_o = pi.metadata) === null || _o === void 0 ? void 0 : _o.type;
            if (giftType === 'pilot_gift') {
                const giftInviteId = (_p = pi.metadata) === null || _p === void 0 ? void 0 : _p.giftInviteId;
                if (giftInviteId) {
                    try {
                        await (0, giftPayment_1.finalizeGiftInvitePayment)(db, giftInviteId);
                    }
                    catch (giftErr) {
                        logger.error('Gift payment finalization failed', { giftInviteId, giftErr });
                    }
                }
            }
            else {
                const householdId = (_q = pi.metadata) === null || _q === void 0 ? void 0 : _q.householdId;
                const orderId = (_r = pi.metadata) === null || _r === void 0 ? void 0 : _r.orderId;
                if (!householdId || !orderId) {
                    logger.warn('payment_intent.succeeded missing metadata', pi.metadata);
                }
                else {
                    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
                    const orderSnap = await orderRef.get();
                    if (orderSnap.exists && ((_s = orderSnap.data()) === null || _s === void 0 ? void 0 : _s.status) !== 'confirmed') {
                        const order = orderSnap.data();
                        const isMarketplaceOrder = order.orderType === 'marketplace' || ((_t = pi.metadata) === null || _t === void 0 ? void 0 : _t.type) === 'marketplace';
                        const isReceivedGift = order.orderType === 'received_gift' || ((_u = pi.metadata) === null || _u === void 0 ? void 0 : _u.type) === 'received_gift';
                        if (isMarketplaceOrder) {
                            try {
                                const shouldCommit = await db.runTransaction(async (tx) => {
                                    var _a;
                                    const snap = await tx.get(orderRef);
                                    const data = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
                                    if (data.inventoryCommittedAt || data.inventoryReserved !== true)
                                        return false;
                                    tx.update(orderRef, {
                                        inventoryReserved: false,
                                        inventoryCommittedAt: new Date().toISOString(),
                                    });
                                    return true;
                                });
                                if (shouldCommit) {
                                    await (0, catalogInventory_1.commitMarketplaceReservations)(db, (0, catalogInventory_1.reservedLinesFromOrder)(order));
                                }
                            }
                            catch (invErr) {
                                logger.error('Marketplace inventory commit failed', { orderId, invErr });
                            }
                        }
                        await orderRef.update({
                            status: 'confirmed',
                            confirmedAt: firestore_1.FieldValue.serverTimestamp(),
                            stripePaymentIntentId: pi.id,
                            chargeFailedAt: firestore_1.FieldValue.delete(),
                            chargeFailureMessage: firestore_1.FieldValue.delete(),
                        });
                        const fresh = (_v = (await orderRef.get()).data()) !== null && _v !== void 0 ? _v : order;
                        if (isMarketplaceOrder || isReceivedGift) {
                            await fulfillMarketplaceOrder(householdId, orderId, Object.assign(Object.assign({}, fresh), { totalCents: fresh.totalCents }), fresh.playthrough === true);
                            const giftInviteId = (typeof fresh.giftInviteId === 'string' && fresh.giftInviteId) ||
                                ((_w = pi.metadata) === null || _w === void 0 ? void 0 : _w.giftInviteId);
                            if (giftInviteId &&
                                (fresh.orderType === 'received_gift' || ((_x = pi.metadata) === null || _x === void 0 ? void 0 : _x.type) === 'received_gift')) {
                                const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
                                const giftSnap = await giftRef.get();
                                if (giftSnap.exists && ((_y = giftSnap.data()) === null || _y === void 0 ? void 0 : _y.status) === 'available') {
                                    await giftRef.update({
                                        status: 'accepted',
                                        acceptedAt: new Date().toISOString(),
                                        updatedAt: new Date().toISOString(),
                                    });
                                }
                                if (fresh.playthrough !== true) {
                                    await recomputeBoxAllocationsLogged('received_gift payment', {
                                        orderId,
                                        giftInviteId,
                                    });
                                }
                            }
                        }
                        else if (giftType === 'hanukkah_box' ||
                            order.orderType === 'hanukkah_box' ||
                            order.holidayId === HOLIDAY_ID) {
                            await (0, chargePilotBox_1.fulfillHanukkahBoxOrder)(db, householdId, orderId, fresh);
                        }
                        else {
                            const userId = order.userId;
                            const userSnap = await db.doc(`users/${userId}`).get();
                            const email = (_0 = (_z = userSnap.data()) === null || _z === void 0 ? void 0 : _z.email) !== null && _0 !== void 0 ? _0 : '';
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
                                }
                                catch (emailErr) {
                                    logger.error('Order confirmation email failed', emailErr);
                                }
                            }
                        }
                    }
                }
            }
        }
        if (event.type === 'payment_intent.payment_failed') {
            const pi = event.data.object;
            if (((_1 = pi.metadata) === null || _1 === void 0 ? void 0 : _1.type) === 'hanukkah_box') {
                const householdId = pi.metadata.householdId;
                const orderId = pi.metadata.orderId;
                if (householdId && orderId) {
                    const message = (_3 = (_2 = pi.last_payment_error) === null || _2 === void 0 ? void 0 : _2.message) !== null && _3 !== void 0 ? _3 : 'Payment failed';
                    const attempt = Number(pi.metadata.chargeAttempt);
                    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
                    const orderSnap = await orderRef.get();
                    const status = (_4 = orderSnap.data()) === null || _4 === void 0 ? void 0 : _4.status;
                    if (status === 'committed' || status === 'pending') {
                        await orderRef.update({
                            chargeFailedAt: new Date().toISOString(),
                            chargeFailureMessage: message,
                        });
                        await (0, chargePilotBox_1.notifyHanukkahBoxChargeFailed)(db, householdId, orderId, Number.isFinite(attempt) ? attempt : 1, message);
                    }
                    logger.warn('Hanukkah box charge failed', { householdId, orderId, message });
                }
            }
            if (((_5 = pi.metadata) === null || _5 === void 0 ? void 0 : _5.type) === 'marketplace') {
                const householdId = pi.metadata.householdId;
                const orderId = pi.metadata.orderId;
                if (householdId && orderId) {
                    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
                    const orderSnap = await orderRef.get();
                    const order = orderSnap.data();
                    const message = (_7 = (_6 = pi.last_payment_error) === null || _6 === void 0 ? void 0 : _6.message) !== null && _7 !== void 0 ? _7 : 'Payment failed';
                    if ((order === null || order === void 0 ? void 0 : order.status) === 'committed') {
                        await orderRef.update({
                            chargeFailedAt: new Date().toISOString(),
                            chargeFailureMessage: message,
                        });
                    }
                    else if ((order === null || order === void 0 ? void 0 : order.inventoryReserved) === true && !order.reservationReleasedAt) {
                        try {
                            await (0, catalogInventory_1.releaseMarketplaceReservations)(db, (0, catalogInventory_1.reservedLinesFromOrder)(order));
                            await orderRef.update({
                                inventoryReserved: false,
                                reservationReleasedAt: new Date().toISOString(),
                                chargeFailedAt: new Date().toISOString(),
                                chargeFailureMessage: message,
                            });
                        }
                        catch (relErr) {
                            logger.error('Marketplace reservation release on payment_failed failed', relErr);
                        }
                    }
                }
            }
        }
        if (event.type === 'payment_intent.canceled') {
            const pi = event.data.object;
            if (((_8 = pi.metadata) === null || _8 === void 0 ? void 0 : _8.type) === 'marketplace') {
                const householdId = pi.metadata.householdId;
                const orderId = pi.metadata.orderId;
                if (householdId && orderId) {
                    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
                    const orderSnap = await orderRef.get();
                    const order = orderSnap.data();
                    if ((order === null || order === void 0 ? void 0 : order.inventoryReserved) === true && !order.reservationReleasedAt) {
                        try {
                            await (0, catalogInventory_1.releaseMarketplaceReservations)(db, (0, catalogInventory_1.reservedLinesFromOrder)(order));
                            await orderRef.update({
                                inventoryReserved: false,
                                reservationReleasedAt: new Date().toISOString(),
                                status: 'cancelled',
                                cancelReason: 'payment_intent_canceled',
                            });
                        }
                        catch (relErr) {
                            logger.error('Marketplace reservation release on canceled failed', relErr);
                        }
                    }
                }
            }
        }
        await eventRef.set({
            type: event.type,
            processedAt: new Date().toISOString(),
        });
        res.json({ received: true });
    }
    catch (err) {
        logger.error('Webhook handler error', err);
        res.status(500).send('Webhook handler failed');
    }
});
exports.createPartnerInvite = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '');
    const email = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '').trim().toLowerCase();
    const invitedByName = String((_g = (_f = request.data) === null || _f === void 0 ? void 0 : _f.invitedByName) !== null && _g !== void 0 ? _g : 'Partner');
    if (!householdId || !email.includes('@')) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and a valid email are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const hhSnap = await db.doc(`households/${householdId}`).get();
    if (!hhSnap.exists)
        throw new sentry_1.HttpsError('not-found', 'Household not found.');
    const householdName = String((_j = (_h = hhSnap.data()) === null || _h === void 0 ? void 0 : _h.name) !== null && _j !== void 0 ? _j : 'Our household');
    const inviteRef = db.collection(`households/${householdId}/partnerInvites`).doc();
    const payload = {
        householdId,
        householdName,
        invitedEmail: email,
        invitedByUid: request.auth.uid,
        invitedByName,
        status: 'pending',
        createdAt: new Date().toISOString(),
    };
    await inviteRef.set(payload);
    await (0, email_1.sendEmail)({
        to: email,
        template: 'partner-invite',
        data: {
            householdName,
            invitedByName,
            inviteId: inviteRef.id,
        },
    }).catch((err) => logger.error('Partner invite email failed', err));
    return Object.assign({ id: inviteRef.id }, payload);
});
exports.listPartnerInvites = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '');
    if (!householdId)
        throw new sentry_1.HttpsError('invalid-argument', 'householdId is required.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const snap = await db.collection(`households/${householdId}/partnerInvites`).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
});
exports.acceptPartnerInvite = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const inviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.inviteId) !== null && _c !== void 0 ? _c : '');
    if (!inviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'inviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const userEmail = String((_e = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '').trim().toLowerCase();
    if (!userEmail)
        throw new sentry_1.HttpsError('failed-precondition', 'Account email is missing.');
    const groups = await db.collectionGroup('partnerInvites').where('invitedEmail', '==', userEmail).where('status', '==', 'pending').get();
    const inviteDoc = groups.docs.find((d) => d.id === inviteId);
    if (!inviteDoc)
        throw new sentry_1.HttpsError('not-found', 'Invite not found.');
    const invite = inviteDoc.data();
    await db.doc(`households/${invite.householdId}`).update({
        memberIds: firestore_1.FieldValue.arrayUnion(request.auth.uid),
        updatedAt: new Date().toISOString(),
    });
    await db.doc(`users/${request.auth.uid}`).set({ householdId: invite.householdId, updatedAt: new Date().toISOString() }, { merge: true });
    await inviteDoc.ref.update({
        status: 'accepted',
        acceptedByUid: request.auth.uid,
    });
    return { ok: true };
});
exports.writeOrderTracking = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '');
    const orderId = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.orderId) !== null && _e !== void 0 ? _e : '');
    const trackingNumber = String((_g = (_f = request.data) === null || _f === void 0 ? void 0 : _f.trackingNumber) !== null && _g !== void 0 ? _g : '').trim();
    const carrier = String((_j = (_h = request.data) === null || _h === void 0 ? void 0 : _h.carrier) !== null && _j !== void 0 ? _j : 'USPS').trim();
    if (!householdId || !orderId || !trackingNumber) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId, orderId, and trackingNumber are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    await (0, shipstation_1.applyShipStationTracking)(db, householdId, orderId, { trackingNumber, carrier });
    return { ok: true };
});
/**
 * ShipStation → Grapejuice tracking writeback.
 * Configure in ShipStation: Settings → Integrations → Webhooks
 * SHIP_NOTIFY (label created) and FULFILLMENT_SHIPPED (Mark as Shipped).
 * URL: https://<region>-<project>.cloudfunctions.net/shipStationWebhook?key=<SHIPSTATION_WEBHOOK_SECRET>
 */
exports.shipStationWebhook = (0, sentry_1.onRequest)({ cors: false }, async (req, res) => {
    var _a;
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    if (!(0, shipstation_1.verifyShipStationWebhookSecret)(req)) {
        res.status(401).send('Unauthorized');
        return;
    }
    try {
        const body = typeof req.body === 'object' && req.body != null
            ? req.body
            : JSON.parse(String((_a = req.rawBody) !== null && _a !== void 0 ? _a : '{}'));
        const result = await (0, shipstation_1.processShipStationShipNotify)(db, body);
        res.status(200).json(Object.assign({ ok: true }, result));
    }
    catch (err) {
        logger.error('ShipStation webhook failed', err);
        res.status(500).send('Webhook Error');
    }
});
exports.purchasePilotGift = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    if (!stripe_1.stripe)
        throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured.');
    const recipientEmail = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.recipientEmail) !== null && _c !== void 0 ? _c : '').trim().toLowerCase();
    const giverName = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.giverName) !== null && _e !== void 0 ? _e : 'Someone who loves you').trim();
    const message = String((_g = (_f = request.data) === null || _f === void 0 ? void 0 : _f.message) !== null && _g !== void 0 ? _g : '').trim();
    const creditCents = typeof ((_h = request.data) === null || _h === void 0 ? void 0 : _h.creditCents) === 'number' ? request.data.creditCents : DEFAULT_GIFT_CREDIT_CENTS;
    const customize = ((_j = request.data) === null || _j === void 0 ? void 0 : _j.customize) === true;
    const giftKind = customize ? 'box' : 'credit';
    const lineItems = Array.isArray((_k = request.data) === null || _k === void 0 ? void 0 : _k.lineItems) ? request.data.lineItems : undefined;
    const childInterests = Array.isArray((_l = request.data) === null || _l === void 0 ? void 0 : _l.childInterests) ? request.data.childInterests : undefined;
    const childAgeGroups = Array.isArray((_m = request.data) === null || _m === void 0 ? void 0 : _m.childAgeGroups) ? request.data.childAgeGroups : undefined;
    if (!isValidEmail(recipientEmail)) {
        throw new sentry_1.HttpsError('invalid-argument', 'A valid recipient email is required.');
    }
    if (giftKind === 'box' && isLocked(await getLockAt())) {
        throw new sentry_1.HttpsError('failed-precondition', 'Gift boxes for this Hanukkah closed when boxes locked. You can still send gift credit.');
    }
    const priceConfig = (_o = (await db.doc('config/hanukkah-2026').get()).data()) !== null && _o !== void 0 ? _o : {};
    const listCents = typeof priceConfig.boxPriceCents === 'number' ? priceConfig.boxPriceCents : DEFAULT_BOX_PRICE_CENTS;
    const perExtraKidCents = (0, chargePilotBox_1.boxPriceCentsForKids)(2, listCents) - listCents;
    if (giftKind === 'box') {
        const addOnCents = (lineItems !== null && lineItems !== void 0 ? lineItems : []).reduce((sum, li) => {
            const unit = Math.max(0, Math.round(Number(li === null || li === void 0 ? void 0 : li.unitCents) || 0));
            return sum + unit * Math.max(1, Math.floor(Number(li === null || li === void 0 ? void 0 : li.quantity) || 1));
        }, 0);
        const minCents = (0, chargePilotBox_1.boxPriceCentsForKids)(Math.max(1, (_p = childAgeGroups === null || childAgeGroups === void 0 ? void 0 : childAgeGroups.length) !== null && _p !== void 0 ? _p : 0), listCents) + addOnCents;
        if (creditCents < minCents) {
            throw new sentry_1.HttpsError('invalid-argument', 'The gift total is out of date. Refresh the page and try again.');
        }
    }
    else {
        // Credit matches a box price: list price plus whole extra kids.
        const extraCents = creditCents - listCents;
        if (extraCents < 0 || extraCents % perExtraKidCents !== 0 || extraCents > 16 * perExtraKidCents) {
            throw new sentry_1.HttpsError('invalid-argument', 'That gift credit amount isn’t available.');
        }
    }
    if (giftKind === 'box' && (lineItems === null || lineItems === void 0 ? void 0 : lineItems.length)) {
        await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lineItems);
    }
    const shippingAddressRaw = (_q = request.data) === null || _q === void 0 ? void 0 : _q.shippingAddress;
    const giverShippingAddress = giftKind === 'box' && (shippingAddressRaw === null || shippingAddressRaw === void 0 ? void 0 : shippingAddressRaw.line1) ? sanitizeShippingAddress(shippingAddressRaw) : null;
    if (giverShippingAddress &&
        (!giverShippingAddress.name ||
            !giverShippingAddress.city ||
            !giverShippingAddress.stateProvince ||
            !giverShippingAddress.postalCode)) {
        throw new sentry_1.HttpsError('invalid-argument', 'Please complete their shipping address, or leave it blank.');
    }
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const giverEmail = String((_s = (_r = userSnap.data()) === null || _r === void 0 ? void 0 : _r.email) !== null && _s !== void 0 ? _s : '').trim().toLowerCase();
    const claimToken = (0, crypto_1.randomBytes)(24).toString('hex');
    const inviteRef = db.collection('giftInvites').doc();
    const metaContext = (0, metaCapi_1.metaContextForDoc)((0, metaCapi_1.metaContextFromCallable)(request));
    const attribution = (0, metaCapi_1.sanitizeAttribution)((_t = request.data) === null || _t === void 0 ? void 0 : _t.attribution);
    const payload = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ giverUid: request.auth.uid, giverName,
        giverEmail,
        recipientEmail,
        creditCents, kind: giftKind, claimToken, status: 'pending', paymentStatus: 'pending' }, (message ? { message } : {})), (giftKind === 'box' && lineItems ? { lineItems } : {})), (giftKind === 'box' && childInterests ? { childInterests } : {})), (giftKind === 'box' && childAgeGroups ? { childAgeGroups } : {})), (giverShippingAddress ? { shippingAddress: giverShippingAddress } : {})), (Object.keys(metaContext).length ? { metaContext } : {})), (attribution ? { attribution } : {})), { createdAt: new Date().toISOString() });
    await inviteRef.set(payload);
    const paymentIntent = await stripe_1.stripe.paymentIntents.create(Object.assign(Object.assign({ amount: creditCents, currency: 'usd', metadata: {
            type: 'pilot_gift',
            giftInviteId: inviteRef.id,
            giverUid: request.auth.uid,
        } }, (giverEmail ? { receipt_email: giverEmail } : {})), { automatic_payment_methods: { enabled: true } }));
    await inviteRef.update({ stripePaymentIntentId: paymentIntent.id });
    const appBase = (_u = process.env.PILOT_APP_BASE_URL) !== null && _u !== void 0 ? _u : 'https://app.grapejuice.co';
    const claimUrl = `${appBase}/gift/claim?token=${claimToken}`;
    return {
        giftInviteId: inviteRef.id,
        clientSecret: paymentIntent.client_secret,
        publishableKey: stripe_1.stripePublishableKey || null,
        claimToken,
        claimUrl,
    };
});
exports.finalizePilotGiftPayment = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const inviteSnap = await db.collection('giftInvites').doc(giftInviteId).get();
    if (!inviteSnap.exists)
        throw new sentry_1.HttpsError('not-found', 'Gift invite not found.');
    const invite = inviteSnap.data();
    if (invite.giverUid !== request.auth.uid) {
        throw new sentry_1.HttpsError('permission-denied', 'Only the giver can finalize this gift.');
    }
    try {
        const result = await (0, giftPayment_1.finalizeGiftInvitePayment)(db, giftInviteId, (0, metaCapi_1.metaContextFromCallable)(request));
        return { ok: true, claimUrl: result.claimUrl, alreadyFinalized: result.alreadyFinalized };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Payment not completed';
        throw new sentry_1.HttpsError('failed-precondition', message);
    }
});
/**
 * Conversions API copy of non-checkout browser events. CompleteRegistration sends once
 * per account (`reg_<uid>`); PreRegister and BoxBuilt reuse the browser's event id for dedupe.
 */
exports.trackMetaEvent = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f;
    const eventName = (_a = request.data) === null || _a === void 0 ? void 0 : _a.eventName;
    if (eventName !== 'CompleteRegistration' && eventName !== 'PreRegister' && eventName !== 'BoxBuilt') {
        throw new sentry_1.HttpsError('invalid-argument', 'Unsupported event.');
    }
    const context = (0, metaCapi_1.metaContextFromCallable)(request);
    if (context.skip)
        return { ok: true };
    const uid = (_c = (_b = request.auth) === null || _b === void 0 ? void 0 : _b.uid) !== null && _c !== void 0 ? _c : null;
    const email = uid ? await emailForMeta(uid, (_d = request.auth) === null || _d === void 0 ? void 0 : _d.token.email) : null;
    if (eventName === 'CompleteRegistration') {
        if (!uid)
            throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
        const userRef = db.doc(`users/${uid}`);
        const firstSend = await db.runTransaction(async (tx) => {
            var _a;
            const snap = await tx.get(userRef);
            // Never create the profile here — SessionContext treats an existing doc as onboarded state.
            if (!snap.exists || ((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.metaRegistrationSentAt))
                return false;
            tx.update(userRef, { metaRegistrationSentAt: new Date().toISOString() });
            return true;
        });
        if (firstSend) {
            await (0, metaCapi_1.sendMetaEvent)({
                eventName,
                eventId: `reg_${uid}`,
                context,
                user: { email, externalId: uid },
            });
        }
        return { ok: true };
    }
    const contentName = typeof ((_e = request.data) === null || _e === void 0 ? void 0 : _e.contentName) === 'string' ? request.data.contentName.trim().slice(0, 100) : '';
    await (0, metaCapi_1.sendMetaEvent)(Object.assign({ eventName, eventId: (_f = context.eventId) !== null && _f !== void 0 ? _f : `${eventName === 'BoxBuilt' ? 'boxbuilt' : 'prereg'}_${(0, crypto_1.randomBytes)(8).toString('hex')}`, context, user: { email, externalId: uid } }, (contentName ? { customData: { content_name: contentName } } : {})));
    return { ok: true };
});
/** Gifts the signed-in user has purchased (giver side). */
exports.listMyGiftInvites = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const uid = request.auth.uid;
    const userSnap = await db.doc(`users/${uid}`).get();
    const giverEmail = String((_d = (_c = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : request.auth.token.email) !== null && _d !== void 0 ? _d : '')
        .trim()
        .toLowerCase();
    const byUidSnap = await db.collection('giftInvites').where('giverUid', '==', uid).get();
    const docMap = new Map();
    for (const doc of byUidSnap.docs) {
        docMap.set(doc.id, doc);
    }
    // Fallback: same email, different uid (account re-created) — rare but avoids “missing orders”.
    if (giverEmail.includes('@')) {
        const byEmailSnap = await db
            .collection('giftInvites')
            .where('giverEmail', '==', giverEmail)
            .get();
        for (const doc of byEmailSnap.docs) {
            docMap.set(doc.id, doc);
        }
    }
    const invites = [...docMap.values()]
        .map((doc) => {
        var _a;
        const data = doc.data();
        return {
            id: doc.id,
            giverUid: data.giverUid,
            giverName: data.giverName,
            giverEmail: data.giverEmail,
            recipientEmail: data.recipientEmail,
            message: data.message,
            creditCents: data.creditCents,
            claimToken: data.claimToken,
            status: data.status,
            paymentStatus: (_a = data.paymentStatus) !== null && _a !== void 0 ? _a : (data.claimEmailSentAt ? 'paid' : 'pending'),
            claimEmailSentAt: data.claimEmailSentAt,
            lineItems: data.lineItems,
            childInterests: data.childInterests,
            createdAt: data.createdAt,
            claimedAt: data.claimedAt,
            claimedByHouseholdId: data.claimedByHouseholdId,
        };
    })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return { invites };
});
/**
 * Public peek — validate a claim link before signup.
 * Returns status only (no PII beyond giver display name).
 */
exports.peekGiftInvite = (0, sentry_1.onCall)(async (request) => {
    var _a, _b;
    const token = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.token) !== null && _b !== void 0 ? _b : '').trim();
    if (!token)
        throw new sentry_1.HttpsError('invalid-argument', 'token is required.');
    const snap = await db.collection('giftInvites').where('claimToken', '==', token).limit(1).get();
    if (snap.empty) {
        return { status: 'not_found' };
    }
    const invite = snap.docs[0].data();
    if (invite.status === 'claimed') {
        return {
            status: 'claimed',
            giverName: invite.giverName || undefined,
            creditCents: invite.creditCents,
            giftKind: (0, giftPayment_1.resolveGiftInviteKind)(invite),
        };
    }
    if (invite.paymentStatus === 'pending') {
        return { status: 'unpaid', giverName: invite.giverName || undefined };
    }
    const purchasedKind = (0, giftPayment_1.resolveGiftInviteKind)(invite);
    const giftKind = purchasedKind === 'box' && !invite.autoShipOrderId && isLocked(await getLockAt())
        ? 'credit'
        : purchasedKind;
    return {
        status: 'claimable',
        giverName: invite.giverName || undefined,
        creditCents: invite.creditCents,
        hasGiverDraft: giftKind === 'box',
        giftKind,
    };
});
exports.claimGiftInvite = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const token = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.token) !== null && _c !== void 0 ? _c : '').trim();
    if (!token)
        throw new sentry_1.HttpsError('invalid-argument', 'token is required.');
    const snap = await db.collection('giftInvites').where('claimToken', '==', token).limit(1).get();
    if (snap.empty)
        throw new sentry_1.HttpsError('not-found', 'Gift invite not found.');
    const inviteDoc = snap.docs[0];
    const invite = inviteDoc.data();
    if (invite.status === 'claimed') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift has already been claimed.');
    }
    if (invite.paymentStatus === 'pending') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift has not been paid for yet.');
    }
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    let householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    const now = new Date().toISOString();
    const purchasedKind = (0, giftPayment_1.resolveGiftInviteKind)(invite);
    // Past lock, a box that didn't already ship to the giver's address arrives as credit.
    const boxBecameCredit = purchasedKind === 'box' && !invite.autoShipOrderId && isLocked(await getLockAt());
    const giftKind = boxBecameCredit ? 'credit' : purchasedKind;
    const autoShipped = giftKind === 'box' && Boolean(invite.autoShipOrderId);
    if (!householdId) {
        const hhRef = db.collection('households').doc();
        await hhRef.set({
            name: 'Our household',
            ownerId: request.auth.uid,
            memberIds: [request.auth.uid],
            childUserIds: [],
            giftCreditCents: giftKind === 'credit' ? invite.creditCents : 0,
            createdAt: now,
            updatedAt: now,
        });
        householdId = hhRef.id;
        await db.doc(`users/${request.auth.uid}`).set({ householdId, updatedAt: now }, { merge: true });
    }
    else if (giftKind === 'credit') {
        const hhRef = db.doc(`households/${householdId}`);
        const hhSnap = await hhRef.get();
        const currentGift = typeof ((_e = hhSnap.data()) === null || _e === void 0 ? void 0 : _e.giftCreditCents) === 'number' ? hhSnap.data().giftCreditCents : 0;
        await hhRef.update({
            giftCreditCents: currentGift + invite.creditCents,
            updatedAt: now,
        });
    }
    // Store on household — never merge into the family's own box draft.
    const boxLines = giftKind === 'box' ? ((_f = invite.lineItems) !== null && _f !== void 0 ? _f : []) : [];
    const prepaidAddOnCents = giftKind === 'box' ? chargeableLineTotal(boxLines) : 0;
    await db.doc(`households/${householdId}/receivedGifts/${inviteDoc.id}`).set(Object.assign(Object.assign(Object.assign({ giftInviteId: inviteDoc.id, giverName: invite.giverName, message: (_g = invite.message) !== null && _g !== void 0 ? _g : null, kind: giftKind, creditCents: invite.creditCents, prepaidAddOnCents, lineItems: giftKind === 'box' ? (_h = invite.lineItems) !== null && _h !== void 0 ? _h : [] : [], childInterests: giftKind === 'box' ? (_j = invite.childInterests) !== null && _j !== void 0 ? _j : [] : [], giverShippingAddress: giftKind === 'box' ? (_k = invite.shippingAddress) !== null && _k !== void 0 ? _k : null : null, status: autoShipped ? 'accepted' : 'available' }, (autoShipped
        ? { acceptedAt: now, checkoutOrderId: invite.autoShipOrderId, surprise: true, autoShippedAt: now }
        : {})), (boxBecameCredit ? { autoConvertedAt: now } : {})), { claimedAt: now, updatedAt: now }));
    await inviteDoc.ref.update(Object.assign(Object.assign({ status: 'claimed', kind: purchasedKind }, (boxBecameCredit ? { claimedAsCredit: true } : {})), { claimedAt: now, claimedByHouseholdId: householdId, claimedByUid: request.auth.uid }));
    // Claiming a gift is not starting a household Hanukkah box. Only force
    // BoxReveal when they already have their own draft in progress.
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    const ownLineItems = Array.isArray((_l = draftSnap.data()) === null || _l === void 0 ? void 0 : _l.lineItems)
        ? draftSnap.data().lineItems
        : [];
    const hasOwnBoxDraft = ownLineItems.length > 0;
    const userUpdates = {
        onboardingComplete: true,
        updatedAt: now,
    };
    if (!hasOwnBoxDraft) {
        userUpdates.boxRevealComplete = true;
        userUpdates.lockReminderEligible = false;
    }
    await db.doc(`users/${request.auth.uid}`).set(userUpdates, { merge: true });
    return {
        householdId,
        giftInviteId: inviteDoc.id,
        giftKind,
        giftCreditCents: giftKind === 'credit' ? invite.creditCents : 0,
        giverName: invite.giverName,
        message: invite.message,
        hasGiverDraft: giftKind === 'box',
        alreadyShipping: autoShipped,
    };
});
function mapReceivedGiftDoc(docId, data) {
    var _a, _b, _c, _d, _e;
    return {
        id: docId,
        giftInviteId: String((_a = data.giftInviteId) !== null && _a !== void 0 ? _a : docId),
        giverName: String((_b = data.giverName) !== null && _b !== void 0 ? _b : ''),
        message: typeof data.message === 'string' ? data.message : undefined,
        kind: data.kind === 'box' ? 'box' : 'credit',
        creditCents: Number((_c = data.creditCents) !== null && _c !== void 0 ? _c : 0),
        prepaidAddOnCents: data.prepaidAddOnCents != null && Number.isFinite(Number(data.prepaidAddOnCents))
            ? Math.max(0, Math.round(Number(data.prepaidAddOnCents)))
            : undefined,
        lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
        giverShippingAddress: data.giverShippingAddress && typeof data.giverShippingAddress === 'object'
            ? data.giverShippingAddress
            : undefined,
        surprise: data.surprise === true ? true : undefined,
        status: String((_d = data.status) !== null && _d !== void 0 ? _d : 'available'),
        claimedAt: String((_e = data.claimedAt) !== null && _e !== void 0 ? _e : ''),
        viewedAt: data.viewedAt ? String(data.viewedAt) : undefined,
        convertedAt: data.convertedAt ? String(data.convertedAt) : undefined,
        acceptedAt: data.acceptedAt ? String(data.acceptedAt) : undefined,
        checkoutOrderId: data.checkoutOrderId ? String(data.checkoutOrderId) : undefined,
    };
}
async function backfillReceivedGiftFromInvite(householdId, inviteId, invite) {
    var _a, _b, _c, _d, _e, _f;
    const now = new Date().toISOString();
    const giftKind = (0, giftPayment_1.resolveGiftInviteKind)(invite);
    const boxLines = giftKind === 'box' ? ((_a = invite.lineItems) !== null && _a !== void 0 ? _a : []) : [];
    const record = {
        giftInviteId: inviteId,
        giverName: invite.giverName,
        message: (_b = invite.message) !== null && _b !== void 0 ? _b : null,
        kind: giftKind,
        creditCents: invite.creditCents,
        prepaidAddOnCents: giftKind === 'box' ? chargeableLineTotal(boxLines) : 0,
        lineItems: giftKind === 'box' ? (_c = invite.lineItems) !== null && _c !== void 0 ? _c : [] : [],
        childInterests: giftKind === 'box' ? (_d = invite.childInterests) !== null && _d !== void 0 ? _d : [] : [],
        giverShippingAddress: giftKind === 'box' ? (_e = invite.shippingAddress) !== null && _e !== void 0 ? _e : null : null,
        status: 'available',
        claimedAt: (_f = invite.claimedAt) !== null && _f !== void 0 ? _f : now,
        updatedAt: now,
    };
    await db.doc(`households/${householdId}/receivedGifts/${inviteId}`).set(record, { merge: true });
    return mapReceivedGiftDoc(inviteId, record);
}
async function loadReceivedGiftsForHousehold(householdId) {
    const snap = await db.collection(`households/${householdId}/receivedGifts`).get();
    const giftsMap = new Map();
    for (const doc of snap.docs) {
        giftsMap.set(doc.id, mapReceivedGiftDoc(doc.id, doc.data()));
    }
    const inviteSnap = await db
        .collection('giftInvites')
        .where('claimedByHouseholdId', '==', householdId)
        .get();
    for (const doc of inviteSnap.docs) {
        const invite = doc.data();
        if (invite.status !== 'claimed')
            continue;
        if (giftsMap.has(doc.id))
            continue;
        giftsMap.set(doc.id, await backfillReceivedGiftFromInvite(householdId, doc.id, invite));
    }
    return [...giftsMap.values()].sort((a, b) => Date.parse(b.claimedAt) - Date.parse(a.claimedAt));
}
async function ensureReceivedGiftDoc(householdId, giftInviteId) {
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await giftRef.get();
    if (giftSnap.exists)
        return giftSnap;
    const inviteSnap = await db.doc(`giftInvites/${giftInviteId}`).get();
    if (!inviteSnap.exists)
        throw new sentry_1.HttpsError('not-found', 'Gift not found.');
    const invite = inviteSnap.data();
    if (invite.claimedByHouseholdId !== householdId || invite.status !== 'claimed') {
        throw new sentry_1.HttpsError('not-found', 'Gift not found.');
    }
    await backfillReceivedGiftFromInvite(householdId, giftInviteId, invite);
    return giftRef.get();
}
/** Gifts this household has claimed (recipient side). */
exports.listMyReceivedGifts = (0, sentry_1.onCall)(async (request) => {
    var _a, _b;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.householdId;
    if (!householdId)
        return { gifts: [] };
    await assertHouseholdMember(request.auth.uid, householdId);
    const gifts = await loadReceivedGiftsForHousehold(householdId);
    return { gifts };
});
/** Mark a received gift box as viewed (does not accept or convert). */
exports.markReceivedGiftViewed = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    await ensureReceivedGiftDoc(householdId, giftInviteId);
    const now = new Date().toISOString();
    await giftRef.set({ viewedAt: now, updatedAt: now }, { merge: true });
    return { ok: true };
});
function normalizeGiftLineItems(raw) {
    if (!Array.isArray(raw) || !raw.length) {
        throw new sentry_1.HttpsError('invalid-argument', 'lineItems are required.');
    }
    return raw.map((li, i) => {
        var _a, _b, _c;
        const itemId = String((_a = li.itemId) !== null && _a !== void 0 ? _a : '').trim();
        if (!itemId)
            throw new sentry_1.HttpsError('invalid-argument', `lineItems[${i}].itemId is required.`);
        return {
            slotId: String((_b = li.slotId) !== null && _b !== void 0 ? _b : 'addon'),
            itemId,
            quantity: Math.max(1, Math.floor(Number(li.quantity) || 1)),
            unitCents: Math.max(0, Math.round(Number(li.unitCents) || 0)),
            label: String((_c = li.label) !== null && _c !== void 0 ? _c : itemId),
        };
    });
}
/** Persist curated / add-on line items on a received gift box (status must stay available). */
exports.updateReceivedGiftLineItems = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = (_e = giftSnap.data()) !== null && _e !== void 0 ? _e : {};
    if (gift.kind !== 'box') {
        throw new sentry_1.HttpsError('failed-precondition', 'Only gift boxes can be edited.');
    }
    if (gift.status !== 'available') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift can no longer be edited.');
    }
    const lineItems = normalizeGiftLineItems((Array.isArray((_f = request.data) === null || _f === void 0 ? void 0 : _f.lineItems) ? request.data.lineItems : []));
    const now = new Date().toISOString();
    const existingLines = (_g = gift.lineItems) !== null && _g !== void 0 ? _g : [];
    await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lineItems, {
        creditLines: await (0, catalogInventory_1.heldReceivedGiftLines)(db, householdId, giftInviteId, existingLines),
    });
    const prepaidAddOnCents = typeof gift.prepaidAddOnCents === 'number' && Number.isFinite(gift.prepaidAddOnCents)
        ? Math.max(0, Math.round(gift.prepaidAddOnCents))
        : chargeableLineTotal(existingLines);
    await giftRef.update({
        lineItems,
        prepaidAddOnCents,
        viewedAt: (_h = gift.viewedAt) !== null && _h !== void 0 ? _h : now,
        updatedAt: now,
    });
    await recomputeBoxAllocationsLogged('updateReceivedGiftLineItems', { giftInviteId });
    return { ok: true, lineItems };
});
/**
 * Checkout paid add-ons on a received gift box (giver already paid the box base).
 * Applies household gift/platform credit; charges remainder via PaymentIntent.
 */
exports.createReceivedGiftCheckout = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    try {
        const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
        const shippingAddressRaw = (_d = request.data) === null || _d === void 0 ? void 0 : _d.shippingAddress;
        if (!giftInviteId || !(shippingAddressRaw === null || shippingAddressRaw === void 0 ? void 0 : shippingAddressRaw.line1) || !(shippingAddressRaw === null || shippingAddressRaw === void 0 ? void 0 : shippingAddressRaw.city)) {
            throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId and shippingAddress are required.');
        }
        const shippingAddress = sanitizeShippingAddress(shippingAddressRaw);
        if (!shippingAddress.name || !shippingAddress.stateProvince || !shippingAddress.postalCode) {
            throw new sentry_1.HttpsError('invalid-argument', 'Please enter name, street, city, state/province, and postal code.');
        }
        const userSnap = await db.doc(`users/${request.auth.uid}`).get();
        const householdId = (_e = userSnap.data()) === null || _e === void 0 ? void 0 : _e.householdId;
        if (!householdId)
            throw new sentry_1.HttpsError('failed-precondition', 'No household.');
        const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
        const hhData = (_f = hhSnap.data()) !== null && _f !== void 0 ? _f : {};
        const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
        const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;
        const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
        const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
        const gift = (_g = giftSnap.data()) !== null && _g !== void 0 ? _g : {};
        if (gift.kind !== 'box') {
            throw new sentry_1.HttpsError('failed-precondition', 'Only gift boxes can be checked out.');
        }
        const lockAt = await getLockAt();
        if (isLocked(lockAt)) {
            throw new sentry_1.HttpsError('failed-precondition', 'The deadline to confirm gift boxes has passed. Email hello@grapejuice.co and we’ll help.');
        }
        // "Keep it a surprise" used to accept without an address; those still need one checkout.
        const acceptedWithoutCheckout = gift.status === 'accepted' && !gift.checkoutOrderId;
        if (gift.status !== 'available' && !acceptedWithoutCheckout) {
            throw new sentry_1.HttpsError('failed-precondition', 'This gift was already used or converted.');
        }
        const lineItems = Array.isArray((_h = request.data) === null || _h === void 0 ? void 0 : _h.lineItems) && request.data.lineItems.length
            ? normalizeGiftLineItems(request.data.lineItems)
            : normalizeGiftLineItems((_j = gift.lineItems) !== null && _j !== void 0 ? _j : []);
        const prepaidAddOnCents = typeof gift.prepaidAddOnCents === 'number' && Number.isFinite(gift.prepaidAddOnCents)
            ? Math.max(0, Math.round(gift.prepaidAddOnCents))
            : chargeableLineTotal((_k = gift.lineItems) !== null && _k !== void 0 ? _k : []);
        // Persist snapshot if missing so later edits don't rewrite the baseline.
        if (gift.prepaidAddOnCents == null) {
            await giftRef.set({ prepaidAddOnCents }, { merge: true });
        }
        // Giver already paid prepaidAddOnCents — recipient only pays upgrades above that.
        const subtotalCents = recipientGiftUpgradeCents(lineItems, prepaidAddOnCents);
        const shippingCents = SHIPPING_FLAT_CENTS;
        const priced = (0, chargePilotBox_1.checkoutTotalsAfterCredit)(subtotalCents + shippingCents, giftCreditCents, platformCreditCents);
        const { taxCents, totalCents, giftCreditApplied, platformCreditApplied, creditApplied } = priced;
        if (totalCents > 0 && totalCents < 50) {
            throw new sentry_1.HttpsError('invalid-argument', 'Order total is too small.');
        }
        const configSnap = await db.doc('config/hanukkah-2026').get();
        const configData = (_l = configSnap.data()) !== null && _l !== void 0 ? _l : {};
        const estimatedDelivery = (_m = configData.estimatedDeliveryBy) !== null && _m !== void 0 ? _m : '2026-11-24';
        const skipShipStation = ((_o = request.data) === null || _o === void 0 ? void 0 : _o.skipShipStation) === true;
        if (!skipShipStation) {
            await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lineItems, {
                creditLines: await (0, catalogInventory_1.heldReceivedGiftLines)(db, householdId, giftInviteId, gift.lineItems),
            });
        }
        const orderRef = db.collection(`households/${householdId}/orders`).doc();
        const now = new Date().toISOString();
        const orderPayload = {
            status: totalCents === 0 ? 'confirmed' : 'pending',
            orderType: 'received_gift',
            giftInviteId,
            lineItems,
            subtotalCents,
            shippingCents,
            taxCents,
            totalCents,
            creditAppliedCents: creditApplied,
            giftCreditAppliedCents: giftCreditApplied,
            platformCreditAppliedCents: platformCreditApplied,
            shippingAddress,
            holidayId: HOLIDAY_ID,
            userId: request.auth.uid,
            estimatedDelivery,
            lockAt,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        };
        if (totalCents === 0)
            orderPayload.confirmedAt = firestore_1.FieldValue.serverTimestamp();
        if (skipShipStation)
            orderPayload.playthrough = true;
        if (((_p = request.data) === null || _p === void 0 ? void 0 : _p.surprise) === true)
            orderPayload.giftSurprise = true;
        await orderRef.set(orderPayload);
        await giftRef.update({
            lineItems,
            viewedAt: (_q = gift.viewedAt) !== null && _q !== void 0 ? _q : now,
            updatedAt: now,
            checkoutOrderId: orderRef.id,
            surprise: ((_r = request.data) === null || _r === void 0 ? void 0 : _r.surprise) === true,
        });
        if (!skipShipStation) {
            await recomputeBoxAllocationsLogged('createReceivedGiftCheckout', {
                orderId: orderRef.id,
                giftInviteId,
            });
        }
        if (creditApplied > 0) {
            await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign({}, (giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {})), (platformCreditApplied > 0
                ? { platformCreditCents: platformCreditCents - platformCreditApplied }
                : {})), { updatedAt: new Date().toISOString() }));
        }
        // Credit-covered orders skip Stripe entirely (same as marketplace $0 path).
        if (totalCents === 0) {
            await giftRef.update({
                status: 'accepted',
                acceptedAt: now,
                updatedAt: now,
            });
            await fulfillMarketplaceOrder(householdId, orderRef.id, orderPayload, skipShipStation);
            return {
                orderId: orderRef.id,
                totalCents: 0,
                clientSecret: null,
                status: 'confirmed',
            };
        }
        if (!stripe_1.stripe) {
            throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
        }
        const paymentIntent = await stripe_1.stripe.paymentIntents.create({
            amount: totalCents,
            currency: 'usd',
            metadata: {
                householdId,
                orderId: orderRef.id,
                userId: request.auth.uid,
                type: 'received_gift',
                giftInviteId,
            },
            automatic_payment_methods: { enabled: true },
        });
        if (!paymentIntent.client_secret) {
            throw new sentry_1.HttpsError('internal', 'PaymentIntent missing client secret.');
        }
        await orderRef.update({ stripePaymentIntentId: paymentIntent.id });
        return {
            clientSecret: paymentIntent.client_secret,
            orderId: orderRef.id,
            totalCents,
            status: 'pending',
        };
    }
    catch (err) {
        if (err instanceof sentry_1.HttpsError)
            throw err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('createReceivedGiftCheckout failed', { err, message: msg });
        throw new sentry_1.HttpsError('internal', msg || 'Checkout failed. Please try again.');
    }
});
/** Convert a received gift box to spendable gift credit after viewing items. */
exports.convertReceivedGiftToCredit = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = giftSnap.data();
    if (gift.kind !== 'box') {
        throw new sentry_1.HttpsError('failed-precondition', 'Only gift boxes can be converted to credit.');
    }
    if (gift.status !== 'available') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift was already used or converted.');
    }
    const creditCents = typeof gift.creditCents === 'number' ? gift.creditCents : DEFAULT_GIFT_CREDIT_CENTS;
    const now = new Date().toISOString();
    const hhRef = db.doc(`households/${householdId}`);
    const hhSnap = await hhRef.get();
    const currentGift = typeof ((_e = hhSnap.data()) === null || _e === void 0 ? void 0 : _e.giftCreditCents) === 'number' ? hhSnap.data().giftCreditCents : 0;
    await db.runTransaction(async (tx) => {
        var _a;
        const fresh = await tx.get(giftRef);
        if (!fresh.exists || ((_a = fresh.data()) === null || _a === void 0 ? void 0 : _a.status) !== 'available') {
            throw new sentry_1.HttpsError('failed-precondition', 'Gift already converted.');
        }
        tx.update(giftRef, { status: 'converted_to_credit', convertedAt: now, updatedAt: now });
        tx.update(hhRef, { giftCreditCents: currentGift + creditCents, updatedAt: now });
    });
    await recomputeBoxAllocationsLogged('convertReceivedGiftToCredit', { giftInviteId });
    return { ok: true, creditCentsAdded: creditCents };
});
/** Mark a received gift box as accepted (recipient is opening the gift box flow). */
exports.acceptReceivedGiftBox = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = giftSnap.data();
    if (gift.kind !== 'box') {
        throw new sentry_1.HttpsError('failed-precondition', 'Not a gift box.');
    }
    if (gift.status !== 'available') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift is no longer available.');
    }
    const now = new Date().toISOString();
    await giftRef.update({ status: 'accepted', acceptedAt: now, updatedAt: now });
    return { ok: true };
});
/**
 * Undo accidental accept (e.g. old “Review” CTA) when no confirmed checkout exists,
 * so the recipient can manage / convert again.
 */
exports.reopenReceivedGiftBox = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = (_e = giftSnap.data()) !== null && _e !== void 0 ? _e : {};
    if (gift.kind !== 'box') {
        throw new sentry_1.HttpsError('failed-precondition', 'Not a gift box.');
    }
    if (gift.status !== 'accepted') {
        throw new sentry_1.HttpsError('failed-precondition', 'Only accepted gifts can be reopened.');
    }
    const checkoutOrderId = typeof gift.checkoutOrderId === 'string' ? gift.checkoutOrderId.trim() : '';
    if (checkoutOrderId) {
        const orderSnap = await db.doc(`households/${householdId}/orders/${checkoutOrderId}`).get();
        const orderStatus = orderSnap.exists ? String((_g = (_f = orderSnap.data()) === null || _f === void 0 ? void 0 : _f.status) !== null && _g !== void 0 ? _g : '') : '';
        if (orderStatus === 'confirmed' || orderStatus === 'shipped' || orderStatus === 'delivered') {
            throw new sentry_1.HttpsError('failed-precondition', 'This gift already has a confirmed order and can’t be reopened.');
        }
    }
    const now = new Date().toISOString();
    await giftRef.update({
        status: 'available',
        acceptedAt: firestore_1.FieldValue.delete(),
        viewedAt: (_h = gift.viewedAt) !== null && _h !== void 0 ? _h : now,
        updatedAt: now,
    });
    return { ok: true };
});
/** Manual trigger for ops — send debrief reminder to one email. */
exports.sendDebriefReminders = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const to = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : '').trim();
    const attempt = ((_d = request.data) === null || _d === void 0 ? void 0 : _d.attempt) === 2 ? 2 : 1;
    if (!to.includes('@'))
        throw new sentry_1.HttpsError('invalid-argument', 'email is required.');
    const claimUrl = `${(_e = process.env.PILOT_APP_BASE_URL) !== null && _e !== void 0 ? _e : 'https://app.grapejuice.co'}/?preview=debrief`;
    await (0, email_1.sendDebriefReminderEmail)({ to, attempt, claimUrl });
    return { ok: true, attempt };
});
/** Daily batch — eligible users who have not completed debrief (only after Hanukkah ends). */
exports.scheduledDebriefReminders = (0, sentry_1.onSchedule)('every day 10:00', async () => {
    await (0, debriefReminders_1.runDebriefReminderBatch)(db);
});
/** Daily batch — lock countdown for users with uncommitted box drafts. */
exports.scheduledLockReminders = (0, sentry_1.onSchedule)('every day 09:00', async () => {
    const lockAt = await getLockAt();
    if (!lockAt || isLocked(lockAt))
        return;
    await (0, lockReminders_1.runLockReminderBatch)(db, lockAt);
});
/** Gift boxes without a confirmed address: a week before lock and on deadline day. Stubs until the template env var is set. */
exports.scheduledGiftConfirmReminders = (0, sentry_1.onSchedule)({ schedule: 'every day 10:00', timeZone: 'America/New_York' }, async () => {
    await runGiftConfirmReminders();
});
/** Daily batch — account holders with a box draft but no shipping/payment yet (Customer.io event). */
exports.scheduledSetupNudges = (0, sentry_1.onSchedule)('every day 08:00', async () => {
    if (process.env.GJ_SETUP_NUDGE_ENABLED !== 'true') {
        logger.info('scheduledSetupNudges skipped — GJ_SETUP_NUDGE_ENABLED is not true');
        return;
    }
    const lockAt = await getLockAt();
    if (!lockAt || isLocked(lockAt))
        return;
    await (0, setupNudge_1.runSetupNudgeBatch)(db, lockAt);
});
/** Charge committed Hanukkah box orders once lockAt has passed (final draft totals). */
exports.scheduledChargePilotBoxes = (0, sentry_1.onSchedule)('every 1 hours', async () => {
    if (!stripe_1.stripe) {
        logger.warn('scheduledChargePilotBoxes skipped — Stripe not configured');
    }
    else {
        await (0, chargePilotBox_1.runChargeEligiblePilotBoxOrders)(db, stripe_1.stripe);
        await runChargeEligibleMarketplaceOrders();
    }
    try {
        await runSettleUnconfirmedGiftBoxes();
        await runExportHeldGiftOrders();
    }
    catch (giftErr) {
        logger.error('runExportHeldGiftOrders failed', giftErr);
    }
    try {
        const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
        logger.info('scheduledChargePilotBoxes box allocations', alloc);
    }
    catch (allocErr) {
        logger.error('recomputeBoxAllocations failed', allocErr);
    }
});
/** Release stale marketplace inventory reservations (pending unpaid checkouts). */
exports.scheduledReleaseStaleMarketplaceReservations = (0, sentry_1.onSchedule)('every 1 hours', async () => {
    const result = await (0, catalogInventory_1.releaseStaleMarketplaceReservations)(db);
    logger.info('scheduledReleaseStaleMarketplaceReservations', result);
});
/** Admin / QA: recompute boxAllocatedQty from active box orders (any time). */
exports.recomputeCatalogBoxAllocations = (0, sentry_1.onCall)(async (request) => {
    var _a, _b;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const email = (_b = request.auth.token.email) !== null && _b !== void 0 ? _b : '';
    if (!/^(brendan|joseph|maya)(\+[^@]*)?@unaffiliated\.co$/i.test(email)) {
        throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
    }
    return (0, catalogInventory_1.recomputeBoxAllocations)(db);
});
/**
 * Replace-sync Grapejuice Airtable catalog → Firestore catalog/hanukkah/items.
 * Auth: Authorization: Bearer $CATALOG_SYNC_SECRET
 * Also requires AIRTABLE_PAT (and optional AIRTABLE_BASE_ID).
 */
exports.syncAirtableCatalog = (0, sentry_1.onRequest)({
    cors: true,
    timeoutSeconds: 300,
    memory: '1GiB',
    // Public URL; auth is Authorization: Bearer $CATALOG_SYNC_SECRET
    invoker: 'public',
}, async (req, res) => {
    var _a;
    try {
        if (req.method !== 'POST' && req.method !== 'GET') {
            res.status(405).send('Method not allowed');
            return;
        }
        (0, airtableCatalogSync_1.assertCatalogSyncSecret)((_a = req.get('Authorization')) !== null && _a !== void 0 ? _a : undefined);
        const result = await (0, airtableCatalogSync_1.runAirtableCatalogReplaceSync)();
        logger.info('Airtable catalog sync complete', result);
        res.status(200).json(Object.assign({ ok: true }, result));
    }
    catch (e) {
        const status = e.status === 401 ? 401 : 500;
        logger.error('Airtable catalog sync failed', e);
        res.status(status).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
/** Near-realtime safety net — full replace sync every 5 minutes when PAT is configured. */
exports.scheduledAirtableCatalogSync = (0, sentry_1.onSchedule)({ schedule: 'every 5 minutes', timeoutSeconds: 300, memory: '1GiB' }, async () => {
    var _a;
    if (!((_a = process.env.AIRTABLE_PAT) === null || _a === void 0 ? void 0 : _a.trim())) {
        logger.warn('Skipping scheduled catalog sync — AIRTABLE_PAT unset');
        return;
    }
    const result = await (0, airtableCatalogSync_1.runAirtableCatalogReplaceSync)();
    logger.info('Scheduled Airtable catalog sync complete', result);
});
/**
 * Attest community eligibility → generate a Hanukkah box discount code and email it.
 * Auth optional (guests can request with email); signed-in users also store code on household.
 */
exports.requestBoxDiscountCode = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const email = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : '')
        .trim()
        .toLowerCase();
    const attestAllTrue = ((_c = request.data) === null || _c === void 0 ? void 0 : _c.attestAllTrue) === true;
    const statements = Array.isArray((_d = request.data) === null || _d === void 0 ? void 0 : _d.statements) ? request.data.statements : [];
    if (!email.includes('@')) {
        throw new sentry_1.HttpsError('invalid-argument', 'A valid email is required.');
    }
    if (!attestAllTrue) {
        throw new sentry_1.HttpsError('failed-precondition', 'Please attest that all statements are true.');
    }
    const allAffirmed = statements.every((s) => s && s.affirmed === true);
    if (!allAffirmed || statements.length < 1) {
        throw new sentry_1.HttpsError('failed-precondition', 'Please confirm each eligibility statement.');
    }
    const code = `GJ70-${(0, crypto_1.randomBytes)(3).toString('hex').toUpperCase()}`;
    const uid = (_f = (_e = request.auth) === null || _e === void 0 ? void 0 : _e.uid) !== null && _f !== void 0 ? _f : null;
    let householdId = null;
    if (uid) {
        const userSnap = await db.doc(`users/${uid}`).get();
        householdId = (_h = (_g = userSnap.data()) === null || _g === void 0 ? void 0 : _g.householdId) !== null && _h !== void 0 ? _h : null;
    }
    await db.collection('discountAttestations').add({
        email,
        uid,
        householdId,
        code,
        statements,
        attestAllTrue,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    if (householdId) {
        await db.doc(`households/${householdId}`).set({
            boxDiscountCode: code,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
    }
    try {
        await (0, email_1.sendEmail)({
            to: email,
            template: 'box-discount',
            data: {
                code,
                boxPrice: '$80',
                boxValue: '$250',
            },
        });
    }
    catch (e) {
        logger.warn('requestBoxDiscountCode email failed', e);
    }
    return { code };
});
//# sourceMappingURL=index.js.map