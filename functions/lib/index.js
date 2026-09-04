"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestBoxDiscountCode = exports.scheduledAirtableCatalogSync = exports.syncAirtableCatalog = exports.scheduledChargePilotBoxes = exports.scheduledLockReminders = exports.scheduledDebriefReminders = exports.sendDebriefReminders = exports.reopenReceivedGiftBox = exports.acceptReceivedGiftBox = exports.convertReceivedGiftToCredit = exports.createReceivedGiftCheckout = exports.updateReceivedGiftLineItems = exports.markReceivedGiftViewed = exports.listMyReceivedGifts = exports.claimGiftInvite = exports.peekGiftInvite = exports.listMyGiftInvites = exports.finalizePilotGiftPayment = exports.purchasePilotGift = exports.writeOrderTracking = exports.acceptPartnerInvite = exports.listPartnerInvites = exports.createPartnerInvite = exports.stripeWebhook = exports.chargePilotBoxOrder = exports.cancelPilotBoxOrder = exports.updatePilotBoxOrder = exports.commitPilotBox = exports.createPilotSetupIntent = exports.createMarketplaceCheckout = exports.createPilotCheckout = exports.sendWelcomeOnSignup = exports.scanBeamAgeTriggers = exports.askPilotRav = void 0;
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const stripe_1 = require("./stripe");
const email_1 = require("./email");
const rav_1 = require("./rav");
Object.defineProperty(exports, "askPilotRav", { enumerable: true, get: function () { return rav_1.askPilotRav; } });
const beamAgeTrigger_1 = require("./beamAgeTrigger");
Object.defineProperty(exports, "scanBeamAgeTriggers", { enumerable: true, get: function () { return beamAgeTrigger_1.scanBeamAgeTriggers; } });
const shipstation_1 = require("./shipstation");
const giftPayment_1 = require("./giftPayment");
const debriefReminders_1 = require("./debriefReminders");
const lockReminders_1 = require("./lockReminders");
const airtableCatalogSync_1 = require("./airtableCatalogSync");
const chargePilotBox_1 = require("./chargePilotBox");
const crypto_1 = require("crypto");
var welcome_1 = require("./welcome");
Object.defineProperty(exports, "sendWelcomeOnSignup", { enumerable: true, get: function () { return welcome_1.sendWelcomeOnSignup; } });
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
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
        throw new https_1.HttpsError('not-found', 'Household not found.');
    const memberIds = (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.memberIds) !== null && _b !== void 0 ? _b : [];
    if (!memberIds.includes(uid)) {
        throw new https_1.HttpsError('permission-denied', 'Not a member of this household.');
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
        throw new https_1.HttpsError('failed-precondition', 'Stripe is not configured.');
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
        throw new https_1.HttpsError('invalid-argument', 'Cart is empty.');
    }
    const normalized = [];
    for (const li of raw) {
        const itemId = String((_a = li.itemId) !== null && _a !== void 0 ? _a : '').trim();
        if (!itemId) {
            throw new https_1.HttpsError('invalid-argument', 'Each line item needs an itemId.');
        }
        const snap = await db.doc(`catalog/hanukkah/items/${itemId}`).get();
        if (!snap.exists) {
            throw new https_1.HttpsError('invalid-argument', `Unknown product: ${itemId}`);
        }
        const cat = (_b = snap.data()) !== null && _b !== void 0 ? _b : {};
        const unitCents = catalogCents(cat.nonMemberPriceCents) ||
            catalogCents(cat.dollarCostCents) ||
            catalogCents(cat.memberPriceCents);
        if (unitCents <= 0) {
            throw new https_1.HttpsError('invalid-argument', `Product is not available à la carte: ${itemId}`);
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
async function fulfillMarketplaceOrder(householdId, orderId, order, skipShipStation) {
    var _a, _b, _c, _d;
    const userId = order.userId;
    const userSnap = await db.doc(`users/${userId}`).get();
    const email = (_b = (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : '';
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
            logger.error('Marketplace order confirmation email failed', emailErr);
        }
    }
    if (skipShipStation === true) {
        logger.info('ShipStation export skipped (visitor playthrough)', { orderId });
        return;
    }
    try {
        await (0, shipstation_1.exportOrderToShipStation)({
            orderId,
            householdId,
            shippingAddress: order.shippingAddress,
            lineItems: (_c = order.lineItems) !== null && _c !== void 0 ? _c : [],
            totalCents: (_d = order.totalCents) !== null && _d !== void 0 ? _d : 0,
        });
    }
    catch (shipErr) {
        logger.error('Marketplace ShipStation export failed', shipErr);
    }
}
exports.createPilotCheckout = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    if (!stripe_1.stripe) {
        throw new https_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
    }
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const householdId = data.householdId;
    const shippingAddress = data.shippingAddress;
    if (!householdId || !(shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.line1) || !(shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.city)) {
        throw new https_1.HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const lockAt = await getLockAt();
    if (isLocked(lockAt)) {
        throw new https_1.HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
    }
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    if (!draftSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'No box draft found. Complete onboarding first.');
    }
    const draft = draftSnap.data();
    const lineItems = (_c = draft.lineItems) !== null && _c !== void 0 ? _c : [];
    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = (_d = configSnap.data()) !== null && _d !== void 0 ? _d : {};
    const boxPriceCents = typeof configData.boxPriceCents === 'number' ? configData.boxPriceCents : DEFAULT_BOX_PRICE_CENTS;
    const subtotalCents = orderTotalCents(lineItems, boxPriceCents);
    const shippingCents = SHIPPING_FLAT_CENTS;
    const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
    const totalCents = subtotalCents + shippingCents + taxCents;
    if (totalCents < 50) {
        throw new https_1.HttpsError('invalid-argument', 'Order total is too small.');
    }
    const estimatedDelivery = (_e = configData.estimatedDeliveryBy) !== null && _e !== void 0 ? _e : '2026-11-21';
    const orderRef = db.collection(`households/${householdId}/orders`).doc();
    await orderRef.set({
        status: 'pending',
        lineItems,
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
/** Immediate checkout for à la carte marketplace cart — no box base price. */
exports.createMarketplaceCheckout = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    try {
        const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
        const householdId = data.householdId;
        if (!householdId || !((_c = data.shippingAddress) === null || _c === void 0 ? void 0 : _c.line1) || !((_d = data.shippingAddress) === null || _d === void 0 ? void 0 : _d.city)) {
            throw new https_1.HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
        }
        const shippingAddress = sanitizeShippingAddress(data.shippingAddress);
        if (!shippingAddress.name || !shippingAddress.stateProvince || !shippingAddress.postalCode) {
            throw new https_1.HttpsError('invalid-argument', 'Please enter name, street, city, state/province, and postal code.');
        }
        const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
        const hhData = (_e = hhSnap.data()) !== null && _e !== void 0 ? _e : {};
        const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
        const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;
        const lineItems = await resolveMarketplaceLineItems((_f = data.lineItems) !== null && _f !== void 0 ? _f : []);
        const subtotalCents = chargeableLineTotal(lineItems);
        if (subtotalCents < 1) {
            throw new https_1.HttpsError('invalid-argument', 'Cart total is too small.');
        }
        const shippingCents = SHIPPING_FLAT_CENTS;
        const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
        let preCreditTotal = subtotalCents + shippingCents + taxCents;
        const giftCreditApplied = Math.min(giftCreditCents, preCreditTotal);
        preCreditTotal -= giftCreditApplied;
        const platformCreditApplied = Math.min(platformCreditCents, preCreditTotal);
        const totalCents = preCreditTotal - platformCreditApplied;
        const creditApplied = giftCreditApplied + platformCreditApplied;
        if (totalCents > 0 && totalCents < 50) {
            throw new https_1.HttpsError('invalid-argument', 'Order total is too small.');
        }
        const configSnap = await db.doc('config/hanukkah-2026').get();
        const configData = (_g = configSnap.data()) !== null && _g !== void 0 ? _g : {};
        const estimatedDelivery = (_h = configData.estimatedDeliveryBy) !== null && _h !== void 0 ? _h : '2026-11-21';
        const orderRef = db.collection(`households/${householdId}/orders`).doc();
        const skipShipStation = data.skipShipStation === true;
        const orderPayload = {
            status: totalCents === 0 ? 'confirmed' : 'pending',
            orderType: 'marketplace',
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        };
        if (totalCents === 0)
            orderPayload.confirmedAt = firestore_1.FieldValue.serverTimestamp();
        if (skipShipStation)
            orderPayload.playthrough = true;
        await orderRef.set(orderPayload);
        if (creditApplied > 0) {
            await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign({}, (giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {})), (platformCreditApplied > 0
                ? { platformCreditCents: platformCreditCents - platformCreditApplied }
                : {})), { updatedAt: new Date().toISOString() }));
        }
        // Fully credit-covered carts confirm without Stripe.
        if (totalCents === 0) {
            await fulfillMarketplaceOrder(householdId, orderRef.id, orderPayload, skipShipStation);
            return {
                orderId: orderRef.id,
                totalCents: 0,
                clientSecret: null,
                status: 'confirmed',
            };
        }
        if (!stripe_1.stripe) {
            throw new https_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
        }
        const paymentIntent = await stripe_1.stripe.paymentIntents.create({
            amount: totalCents,
            currency: 'usd',
            metadata: {
                householdId,
                orderId: orderRef.id,
                userId: request.auth.uid,
                type: 'marketplace',
            },
            automatic_payment_methods: { enabled: true },
        });
        if (!paymentIntent.client_secret) {
            throw new https_1.HttpsError('internal', 'PaymentIntent missing client secret.');
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
        if (err instanceof https_1.HttpsError)
            throw err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('createMarketplaceCheckout failed', { err, message: msg });
        throw new https_1.HttpsError('internal', msg || 'Checkout failed. Please try again.');
    }
});
exports.createPilotSetupIntent = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    if (!stripe_1.stripe) {
        throw new https_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
    }
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const householdId = data.householdId;
    if (!householdId) {
        throw new https_1.HttpsError('invalid-argument', 'householdId is required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const email = (_d = (_c = userSnap.data()) === null || _c === void 0 ? void 0 : _c.email) !== null && _d !== void 0 ? _d : '';
    const customerId = await getOrCreateStripeCustomer(householdId, request.auth.uid, email);
    const setupIntent = await stripe_1.stripe.setupIntents.create({
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        metadata: {
            householdId,
            userId: request.auth.uid,
        },
    });
    if (!setupIntent.client_secret) {
        throw new https_1.HttpsError('internal', 'SetupIntent missing client secret.');
    }
    return { clientSecret: setupIntent.client_secret, customerId };
});
/**
 * Save card (SetupIntent, before this call) + commit address/shipping tier.
 * No PaymentIntent here — one off-session charge at lock/ship (see charge-once-at-ship).
 */
exports.commitPilotBox = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const householdId = data.householdId;
    const shippingAddress = data.shippingAddress;
    if (!householdId || !(shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.line1) || !(shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.city)) {
        throw new https_1.HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
    }
    const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
    const hhData = (_c = hhSnap.data()) !== null && _c !== void 0 ? _c : {};
    const cardOnFile = !!hhData.cardOnFileAt;
    const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
    const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;
    const lockAt = await getLockAt(data.expeditedShipping === true);
    if (isLocked(lockAt)) {
        throw new https_1.HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
    }
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    if (!draftSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'No box draft found. Complete onboarding first.');
    }
    const draft = draftSnap.data();
    const lineItems = (_d = draft.lineItems) !== null && _d !== void 0 ? _d : [];
    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = (_e = configSnap.data()) !== null && _e !== void 0 ? _e : {};
    const boxPriceCents = typeof configData.boxPriceCents === 'number' ? configData.boxPriceCents : DEFAULT_BOX_PRICE_CENTS;
    const expeditedShipping = data.expeditedShipping === true && configData.expeditedShippingEnabled === true;
    const subtotalCents = orderTotalCents(lineItems, boxPriceCents);
    const shippingCents = SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
    const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
    let preCreditTotal = subtotalCents + shippingCents + taxCents;
    const giftCreditApplied = Math.min(giftCreditCents, preCreditTotal);
    preCreditTotal -= giftCreditApplied;
    const platformCreditApplied = Math.min(platformCreditCents, preCreditTotal);
    let totalCents = preCreditTotal - platformCreditApplied;
    const creditApplied = giftCreditApplied + platformCreditApplied;
    const totalAvailableCredit = giftCreditCents + platformCreditCents;
    if (!cardOnFile && totalAvailableCredit < boxPriceCents) {
        throw new https_1.HttpsError('failed-precondition', 'Save a payment method before committing your box.');
    }
    if (totalCents > 0 && !cardOnFile) {
        throw new https_1.HttpsError('failed-precondition', 'Save a payment method for add-ons and shipping.');
    }
    if (totalCents < 0) {
        throw new https_1.HttpsError('invalid-argument', 'Order total is invalid.');
    }
    const estimatedDelivery = (_f = (expeditedShipping ? configData.expeditedDeliveryBy : configData.estimatedDeliveryBy)) !== null && _f !== void 0 ? _f : '2026-11-21';
    const orderRef = db.collection(`households/${householdId}/orders`).doc();
    await orderRef.set(Object.assign({ status: 'committed', orderType: 'hanukkah_box', lineItems,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents, creditAppliedCents: creditApplied, giftCreditAppliedCents: giftCreditApplied, platformCreditAppliedCents: platformCreditApplied, expeditedShipping,
        shippingAddress, holidayId: HOLIDAY_ID, userId: request.auth.uid, lockAt,
        estimatedDelivery, committedAt: firestore_1.FieldValue.serverTimestamp(), createdAt: firestore_1.FieldValue.serverTimestamp() }, (data.skipShipStation === true ? { playthrough: true } : {})));
    if (giftCreditApplied > 0 || platformCreditApplied > 0) {
        await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign({}, (giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {})), (platformCreditApplied > 0 ? { platformCreditCents: platformCreditCents - platformCreditApplied } : {})), { updatedAt: new Date().toISOString() }));
    }
    await db.doc(`users/${request.auth.uid}`).set(Object.assign(Object.assign(Object.assign({ debriefReminderEligible: true, debriefReminderAttempts: 0, lockReminderEligible: false }, (((_g = data.contactPhone) === null || _g === void 0 ? void 0 : _g.trim()) ? { phone: data.contactPhone.trim() } : {})), (data.smsOptIn === true ? { smsOptIn: true } : {})), { updatedAt: new Date().toISOString() }), { merge: true });
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
exports.updatePilotBoxOrder = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const householdId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId;
    const orderId = (_c = request.data) === null || _c === void 0 ? void 0 : _c.orderId;
    if (!householdId || !orderId) {
        throw new https_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Order not found.');
    }
    const order = (_d = orderSnap.data()) !== null && _d !== void 0 ? _d : {};
    const status = order.status;
    if (status !== 'committed' && status !== 'pending') {
        throw new https_1.HttpsError('failed-precondition', 'This order can no longer be updated. Contact support if you need changes.');
    }
    const lockAt = (_e = (typeof order.lockAt === 'string' ? order.lockAt : null)) !== null && _e !== void 0 ? _e : (await getLockAt(order.expeditedShipping === true));
    if (isLocked(lockAt)) {
        throw new https_1.HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
    }
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    if (!draftSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'No box draft found.');
    }
    const lineItems = (_g = (_f = draftSnap.data()) === null || _f === void 0 ? void 0 : _f.lineItems) !== null && _g !== void 0 ? _g : [];
    if (!lineItems.length) {
        throw new https_1.HttpsError('failed-precondition', 'Your box is empty. Add items before updating the order.');
    }
    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = (_h = configSnap.data()) !== null && _h !== void 0 ? _h : {};
    const boxPriceCents = typeof configData.boxPriceCents === 'number' ? configData.boxPriceCents : DEFAULT_BOX_PRICE_CENTS;
    const expeditedShipping = order.expeditedShipping === true;
    const subtotalCents = orderTotalCents(lineItems, boxPriceCents);
    const shippingCents = typeof order.shippingCents === 'number'
        ? order.shippingCents
        : SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
    const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
    const giftCreditApplied = typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
    const platformCreditApplied = typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
    const creditApplied = giftCreditApplied + platformCreditApplied;
    const totalCents = Math.max(0, subtotalCents + shippingCents + taxCents - creditApplied);
    const previousTotal = typeof order.totalCents === 'number' ? order.totalCents : 0;
    await orderRef.update({
        lineItems,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        creditAppliedCents: creditApplied,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return {
        orderId,
        totalCents,
        previousTotalCents: previousTotal,
        deltaCents: totalCents - previousTotal,
        status: status,
    };
});
/** Void a pre-ship committed/pending order; restore credits; keep card on file. */
exports.cancelPilotBoxOrder = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const householdId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId;
    const orderId = (_c = request.data) === null || _c === void 0 ? void 0 : _c.orderId;
    if (!householdId || !orderId) {
        throw new https_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Order not found.');
    }
    const order = (_d = orderSnap.data()) !== null && _d !== void 0 ? _d : {};
    const status = order.status;
    if (status !== 'committed' && status !== 'pending') {
        if (status === 'cancelled') {
            throw new https_1.HttpsError('failed-precondition', 'This order is already cancelled.');
        }
        if (status === 'shipped' || status === 'delivered') {
            throw new https_1.HttpsError('failed-precondition', 'This box has already shipped. Contact support for help.');
        }
        throw new https_1.HttpsError('failed-precondition', 'This order can no longer be cancelled in the app. Contact support.');
    }
    const piId = typeof order.stripePaymentIntentId === 'string' ? order.stripePaymentIntentId : undefined;
    if (piId) {
        // Legacy orders: commit used to create a manual-capture PI before charge-at-ship refactor.
        if (!stripe_1.stripe) {
            throw new https_1.HttpsError('failed-precondition', 'Stripe is not configured.');
        }
        try {
            await stripe_1.stripe.paymentIntents.cancel(piId);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const alreadyCanceled = /already.*(cancel|cancell)/i.test(msg);
            if (!alreadyCanceled) {
                logger.error('Failed to cancel PaymentIntent', { piId, err });
                throw new https_1.HttpsError('internal', 'Could not release the payment hold. Try again or contact support.');
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
            throw new https_1.HttpsError('failed-precondition', 'Order status changed. Refresh and try again.');
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
    return { orderId, status: 'cancelled' };
});
/**
 * QA / ops: charge one committed Hanukkah box order (normally runs on schedule after lock).
 * Pass force=true to charge before lockAt.
 */
exports.chargePilotBoxOrder = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '').trim();
    const orderId = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.orderId) !== null && _e !== void 0 ? _e : '').trim();
    const force = ((_f = request.data) === null || _f === void 0 ? void 0 : _f.force) === true;
    if (!householdId || !orderId) {
        throw new https_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    return (0, chargePilotBox_1.chargePilotBoxOrderForUser)(db, stripe_1.stripe, request.auth.uid, householdId, orderId, force);
});
exports.stripeWebhook = (0, https_1.onRequest)({ cors: false }, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
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
            }
        }
        if (event.type === 'payment_intent.succeeded') {
            const pi = event.data.object;
            const giftType = (_f = pi.metadata) === null || _f === void 0 ? void 0 : _f.type;
            if (giftType === 'pilot_gift') {
                const giftInviteId = (_g = pi.metadata) === null || _g === void 0 ? void 0 : _g.giftInviteId;
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
                const householdId = (_h = pi.metadata) === null || _h === void 0 ? void 0 : _h.householdId;
                const orderId = (_j = pi.metadata) === null || _j === void 0 ? void 0 : _j.orderId;
                if (!householdId || !orderId) {
                    logger.warn('payment_intent.succeeded missing metadata', pi.metadata);
                }
                else {
                    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
                    const orderSnap = await orderRef.get();
                    if (orderSnap.exists && ((_k = orderSnap.data()) === null || _k === void 0 ? void 0 : _k.status) !== 'confirmed') {
                        const order = orderSnap.data();
                        await orderRef.update({
                            status: 'confirmed',
                            confirmedAt: firestore_1.FieldValue.serverTimestamp(),
                            stripePaymentIntentId: pi.id,
                            chargeFailedAt: firestore_1.FieldValue.delete(),
                            chargeFailureMessage: firestore_1.FieldValue.delete(),
                        });
                        const fresh = (_l = (await orderRef.get()).data()) !== null && _l !== void 0 ? _l : order;
                        if (order.orderType === 'marketplace' ||
                            order.orderType === 'received_gift' ||
                            ((_m = pi.metadata) === null || _m === void 0 ? void 0 : _m.type) === 'marketplace' ||
                            ((_o = pi.metadata) === null || _o === void 0 ? void 0 : _o.type) === 'received_gift') {
                            await fulfillMarketplaceOrder(householdId, orderId, Object.assign(Object.assign({}, fresh), { totalCents: fresh.totalCents }), fresh.playthrough === true);
                            const giftInviteId = (typeof fresh.giftInviteId === 'string' && fresh.giftInviteId) ||
                                ((_p = pi.metadata) === null || _p === void 0 ? void 0 : _p.giftInviteId);
                            if (giftInviteId &&
                                (fresh.orderType === 'received_gift' || ((_q = pi.metadata) === null || _q === void 0 ? void 0 : _q.type) === 'received_gift')) {
                                const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
                                const giftSnap = await giftRef.get();
                                if (giftSnap.exists && ((_r = giftSnap.data()) === null || _r === void 0 ? void 0 : _r.status) === 'available') {
                                    await giftRef.update({
                                        status: 'accepted',
                                        acceptedAt: new Date().toISOString(),
                                        updatedAt: new Date().toISOString(),
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
                            const email = (_t = (_s = userSnap.data()) === null || _s === void 0 ? void 0 : _s.email) !== null && _t !== void 0 ? _t : '';
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
            if (((_u = pi.metadata) === null || _u === void 0 ? void 0 : _u.type) === 'hanukkah_box') {
                const householdId = pi.metadata.householdId;
                const orderId = pi.metadata.orderId;
                if (householdId && orderId) {
                    const message = (_w = (_v = pi.last_payment_error) === null || _v === void 0 ? void 0 : _v.message) !== null && _w !== void 0 ? _w : 'Payment failed';
                    await db.doc(`households/${householdId}/orders/${orderId}`).update({
                        chargeFailedAt: new Date().toISOString(),
                        chargeFailureMessage: message,
                    });
                    logger.warn('Hanukkah box charge failed', { householdId, orderId, message });
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
exports.createPartnerInvite = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '');
    const email = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '').trim().toLowerCase();
    const invitedByName = String((_g = (_f = request.data) === null || _f === void 0 ? void 0 : _f.invitedByName) !== null && _g !== void 0 ? _g : 'Partner');
    if (!householdId || !email.includes('@')) {
        throw new https_1.HttpsError('invalid-argument', 'householdId and a valid email are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const hhSnap = await db.doc(`households/${householdId}`).get();
    if (!hhSnap.exists)
        throw new https_1.HttpsError('not-found', 'Household not found.');
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
exports.listPartnerInvites = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '');
    if (!householdId)
        throw new https_1.HttpsError('invalid-argument', 'householdId is required.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const snap = await db.collection(`households/${householdId}/partnerInvites`).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
});
exports.acceptPartnerInvite = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const inviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.inviteId) !== null && _c !== void 0 ? _c : '');
    if (!inviteId)
        throw new https_1.HttpsError('invalid-argument', 'inviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const userEmail = String((_e = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '').trim().toLowerCase();
    if (!userEmail)
        throw new https_1.HttpsError('failed-precondition', 'Account email is missing.');
    const groups = await db.collectionGroup('partnerInvites').where('invitedEmail', '==', userEmail).where('status', '==', 'pending').get();
    const inviteDoc = groups.docs.find((d) => d.id === inviteId);
    if (!inviteDoc)
        throw new https_1.HttpsError('not-found', 'Invite not found.');
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
exports.writeOrderTracking = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '');
    const orderId = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.orderId) !== null && _e !== void 0 ? _e : '');
    const trackingNumber = String((_g = (_f = request.data) === null || _f === void 0 ? void 0 : _f.trackingNumber) !== null && _g !== void 0 ? _g : '').trim();
    const carrier = String((_j = (_h = request.data) === null || _h === void 0 ? void 0 : _h.carrier) !== null && _j !== void 0 ? _j : 'USPS').trim();
    if (!householdId || !orderId || !trackingNumber) {
        throw new https_1.HttpsError('invalid-argument', 'householdId, orderId, and trackingNumber are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    await (0, shipstation_1.applyShipStationTracking)(db, householdId, orderId, { trackingNumber, carrier });
    return { ok: true };
});
exports.purchasePilotGift = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    if (!stripe_1.stripe)
        throw new https_1.HttpsError('failed-precondition', 'Stripe is not configured.');
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
        throw new https_1.HttpsError('invalid-argument', 'A valid recipient email is required.');
    }
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const giverEmail = String((_p = (_o = userSnap.data()) === null || _o === void 0 ? void 0 : _o.email) !== null && _p !== void 0 ? _p : '').trim().toLowerCase();
    const claimToken = (0, crypto_1.randomBytes)(24).toString('hex');
    const inviteRef = db.collection('giftInvites').doc();
    const payload = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ giverUid: request.auth.uid, giverName,
        giverEmail,
        recipientEmail,
        creditCents, kind: giftKind, claimToken, status: 'pending', paymentStatus: 'pending' }, (message ? { message } : {})), (giftKind === 'box' && lineItems ? { lineItems } : {})), (giftKind === 'box' && childInterests ? { childInterests } : {})), (giftKind === 'box' && childAgeGroups ? { childAgeGroups } : {})), { createdAt: new Date().toISOString() });
    await inviteRef.set(payload);
    const paymentIntent = await stripe_1.stripe.paymentIntents.create(Object.assign(Object.assign({ amount: creditCents, currency: 'usd', metadata: {
            type: 'pilot_gift',
            giftInviteId: inviteRef.id,
            giverUid: request.auth.uid,
        } }, (giverEmail ? { receipt_email: giverEmail } : {})), { automatic_payment_methods: { enabled: true } }));
    await inviteRef.update({ stripePaymentIntentId: paymentIntent.id });
    const appBase = (_q = process.env.PILOT_APP_BASE_URL) !== null && _q !== void 0 ? _q : 'https://app.grapejuice.co';
    const claimUrl = `${appBase}/gift/claim?token=${claimToken}`;
    return {
        giftInviteId: inviteRef.id,
        clientSecret: paymentIntent.client_secret,
        claimToken,
        claimUrl,
    };
});
exports.finalizePilotGiftPayment = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new https_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const inviteSnap = await db.collection('giftInvites').doc(giftInviteId).get();
    if (!inviteSnap.exists)
        throw new https_1.HttpsError('not-found', 'Gift invite not found.');
    const invite = inviteSnap.data();
    if (invite.giverUid !== request.auth.uid) {
        throw new https_1.HttpsError('permission-denied', 'Only the giver can finalize this gift.');
    }
    try {
        const result = await (0, giftPayment_1.finalizeGiftInvitePayment)(db, giftInviteId);
        return { ok: true, claimUrl: result.claimUrl, alreadyFinalized: result.alreadyFinalized };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Payment not completed';
        throw new https_1.HttpsError('failed-precondition', message);
    }
});
/** Gifts the signed-in user has purchased (giver side). */
exports.listMyGiftInvites = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
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
exports.peekGiftInvite = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    const token = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.token) !== null && _b !== void 0 ? _b : '').trim();
    if (!token)
        throw new https_1.HttpsError('invalid-argument', 'token is required.');
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
    const giftKind = (0, giftPayment_1.resolveGiftInviteKind)(invite);
    return {
        status: 'claimable',
        giverName: invite.giverName || undefined,
        creditCents: invite.creditCents,
        hasGiverDraft: giftKind === 'box',
        giftKind,
    };
});
exports.claimGiftInvite = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const token = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.token) !== null && _c !== void 0 ? _c : '').trim();
    if (!token)
        throw new https_1.HttpsError('invalid-argument', 'token is required.');
    const snap = await db.collection('giftInvites').where('claimToken', '==', token).limit(1).get();
    if (snap.empty)
        throw new https_1.HttpsError('not-found', 'Gift invite not found.');
    const inviteDoc = snap.docs[0];
    const invite = inviteDoc.data();
    if (invite.status === 'claimed') {
        throw new https_1.HttpsError('failed-precondition', 'This gift has already been claimed.');
    }
    if (invite.paymentStatus === 'pending') {
        throw new https_1.HttpsError('failed-precondition', 'This gift has not been paid for yet.');
    }
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    let householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    const now = new Date().toISOString();
    const giftKind = (0, giftPayment_1.resolveGiftInviteKind)(invite);
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
    await db.doc(`households/${householdId}/receivedGifts/${inviteDoc.id}`).set({
        giftInviteId: inviteDoc.id,
        giverName: invite.giverName,
        message: (_g = invite.message) !== null && _g !== void 0 ? _g : null,
        kind: giftKind,
        creditCents: invite.creditCents,
        prepaidAddOnCents,
        lineItems: giftKind === 'box' ? (_h = invite.lineItems) !== null && _h !== void 0 ? _h : [] : [],
        childInterests: giftKind === 'box' ? (_j = invite.childInterests) !== null && _j !== void 0 ? _j : [] : [],
        status: 'available',
        claimedAt: now,
        updatedAt: now,
    });
    await inviteDoc.ref.update({
        status: 'claimed',
        kind: giftKind,
        claimedAt: now,
        claimedByHouseholdId: householdId,
        claimedByUid: request.auth.uid,
    });
    // Claiming a gift is not starting a household Hanukkah box. Only force
    // BoxReveal when they already have their own draft in progress.
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    const ownLineItems = Array.isArray((_k = draftSnap.data()) === null || _k === void 0 ? void 0 : _k.lineItems)
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
        status: String((_d = data.status) !== null && _d !== void 0 ? _d : 'available'),
        claimedAt: String((_e = data.claimedAt) !== null && _e !== void 0 ? _e : ''),
        viewedAt: data.viewedAt ? String(data.viewedAt) : undefined,
        convertedAt: data.convertedAt ? String(data.convertedAt) : undefined,
        acceptedAt: data.acceptedAt ? String(data.acceptedAt) : undefined,
        checkoutOrderId: data.checkoutOrderId ? String(data.checkoutOrderId) : undefined,
    };
}
async function backfillReceivedGiftFromInvite(householdId, inviteId, invite) {
    var _a, _b, _c, _d, _e;
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
        status: 'available',
        claimedAt: (_e = invite.claimedAt) !== null && _e !== void 0 ? _e : now,
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
        throw new https_1.HttpsError('not-found', 'Gift not found.');
    const invite = inviteSnap.data();
    if (invite.claimedByHouseholdId !== householdId || invite.status !== 'claimed') {
        throw new https_1.HttpsError('not-found', 'Gift not found.');
    }
    await backfillReceivedGiftFromInvite(householdId, giftInviteId, invite);
    return giftRef.get();
}
/** Gifts this household has claimed (recipient side). */
exports.listMyReceivedGifts = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.householdId;
    if (!householdId)
        return { gifts: [] };
    await assertHouseholdMember(request.auth.uid, householdId);
    const gifts = await loadReceivedGiftsForHousehold(householdId);
    return { gifts };
});
/** Mark a received gift box as viewed (does not accept or convert). */
exports.markReceivedGiftViewed = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new https_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new https_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    await ensureReceivedGiftDoc(householdId, giftInviteId);
    const now = new Date().toISOString();
    await giftRef.set({ viewedAt: now, updatedAt: now }, { merge: true });
    return { ok: true };
});
function normalizeGiftLineItems(raw) {
    if (!Array.isArray(raw) || !raw.length) {
        throw new https_1.HttpsError('invalid-argument', 'lineItems are required.');
    }
    return raw.map((li, i) => {
        var _a, _b, _c;
        const itemId = String((_a = li.itemId) !== null && _a !== void 0 ? _a : '').trim();
        if (!itemId)
            throw new https_1.HttpsError('invalid-argument', `lineItems[${i}].itemId is required.`);
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
exports.updateReceivedGiftLineItems = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new https_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new https_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = (_e = giftSnap.data()) !== null && _e !== void 0 ? _e : {};
    if (gift.kind !== 'box') {
        throw new https_1.HttpsError('failed-precondition', 'Only gift boxes can be edited.');
    }
    if (gift.status !== 'available') {
        throw new https_1.HttpsError('failed-precondition', 'This gift can no longer be edited.');
    }
    const lineItems = normalizeGiftLineItems((Array.isArray((_f = request.data) === null || _f === void 0 ? void 0 : _f.lineItems) ? request.data.lineItems : []));
    const now = new Date().toISOString();
    const existingLines = (_g = gift.lineItems) !== null && _g !== void 0 ? _g : [];
    const prepaidAddOnCents = typeof gift.prepaidAddOnCents === 'number' && Number.isFinite(gift.prepaidAddOnCents)
        ? Math.max(0, Math.round(gift.prepaidAddOnCents))
        : chargeableLineTotal(existingLines);
    await giftRef.update({
        lineItems,
        prepaidAddOnCents,
        viewedAt: (_h = gift.viewedAt) !== null && _h !== void 0 ? _h : now,
        updatedAt: now,
    });
    return { ok: true, lineItems };
});
/**
 * Checkout paid add-ons on a received gift box (giver already paid the box base).
 * Applies household gift/platform credit; charges remainder via PaymentIntent.
 */
exports.createReceivedGiftCheckout = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    try {
        const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
        const shippingAddressRaw = (_d = request.data) === null || _d === void 0 ? void 0 : _d.shippingAddress;
        if (!giftInviteId || !(shippingAddressRaw === null || shippingAddressRaw === void 0 ? void 0 : shippingAddressRaw.line1) || !(shippingAddressRaw === null || shippingAddressRaw === void 0 ? void 0 : shippingAddressRaw.city)) {
            throw new https_1.HttpsError('invalid-argument', 'giftInviteId and shippingAddress are required.');
        }
        const shippingAddress = sanitizeShippingAddress(shippingAddressRaw);
        if (!shippingAddress.name || !shippingAddress.stateProvince || !shippingAddress.postalCode) {
            throw new https_1.HttpsError('invalid-argument', 'Please enter name, street, city, state/province, and postal code.');
        }
        const userSnap = await db.doc(`users/${request.auth.uid}`).get();
        const householdId = (_e = userSnap.data()) === null || _e === void 0 ? void 0 : _e.householdId;
        if (!householdId)
            throw new https_1.HttpsError('failed-precondition', 'No household.');
        const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
        const hhData = (_f = hhSnap.data()) !== null && _f !== void 0 ? _f : {};
        const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
        const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;
        const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
        const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
        const gift = (_g = giftSnap.data()) !== null && _g !== void 0 ? _g : {};
        if (gift.kind !== 'box') {
            throw new https_1.HttpsError('failed-precondition', 'Only gift boxes can be checked out.');
        }
        if (gift.status !== 'available') {
            throw new https_1.HttpsError('failed-precondition', 'This gift was already used or converted.');
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
        const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
        let preCreditTotal = subtotalCents + shippingCents + taxCents;
        const giftCreditApplied = Math.min(giftCreditCents, preCreditTotal);
        preCreditTotal -= giftCreditApplied;
        const platformCreditApplied = Math.min(platformCreditCents, preCreditTotal);
        const totalCents = preCreditTotal - platformCreditApplied;
        const creditApplied = giftCreditApplied + platformCreditApplied;
        if (totalCents > 0 && totalCents < 50) {
            throw new https_1.HttpsError('invalid-argument', 'Order total is too small.');
        }
        const configSnap = await db.doc('config/hanukkah-2026').get();
        const configData = (_l = configSnap.data()) !== null && _l !== void 0 ? _l : {};
        const estimatedDelivery = (_m = configData.estimatedDeliveryBy) !== null && _m !== void 0 ? _m : '2026-11-21';
        const skipShipStation = ((_o = request.data) === null || _o === void 0 ? void 0 : _o.skipShipStation) === true;
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        };
        if (totalCents === 0)
            orderPayload.confirmedAt = firestore_1.FieldValue.serverTimestamp();
        if (skipShipStation)
            orderPayload.playthrough = true;
        await orderRef.set(orderPayload);
        await giftRef.update({
            lineItems,
            viewedAt: (_p = gift.viewedAt) !== null && _p !== void 0 ? _p : now,
            updatedAt: now,
            checkoutOrderId: orderRef.id,
        });
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
            throw new https_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
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
            throw new https_1.HttpsError('internal', 'PaymentIntent missing client secret.');
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
        if (err instanceof https_1.HttpsError)
            throw err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('createReceivedGiftCheckout failed', { err, message: msg });
        throw new https_1.HttpsError('internal', msg || 'Checkout failed. Please try again.');
    }
});
/** Convert a received gift box to spendable gift credit after viewing items. */
exports.convertReceivedGiftToCredit = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new https_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new https_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = giftSnap.data();
    if (gift.kind !== 'box') {
        throw new https_1.HttpsError('failed-precondition', 'Only gift boxes can be converted to credit.');
    }
    if (gift.status !== 'available') {
        throw new https_1.HttpsError('failed-precondition', 'This gift was already used or converted.');
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
            throw new https_1.HttpsError('failed-precondition', 'Gift already converted.');
        }
        tx.update(giftRef, { status: 'converted_to_credit', convertedAt: now, updatedAt: now });
        tx.update(hhRef, { giftCreditCents: currentGift + creditCents, updatedAt: now });
    });
    return { ok: true, creditCentsAdded: creditCents };
});
/** Mark a received gift box as accepted (recipient is opening the gift box flow). */
exports.acceptReceivedGiftBox = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new https_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new https_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = giftSnap.data();
    if (gift.kind !== 'box') {
        throw new https_1.HttpsError('failed-precondition', 'Not a gift box.');
    }
    if (gift.status !== 'available') {
        throw new https_1.HttpsError('failed-precondition', 'This gift is no longer available.');
    }
    const now = new Date().toISOString();
    await giftRef.update({ status: 'accepted', acceptedAt: now, updatedAt: now });
    return { ok: true };
});
/**
 * Undo accidental accept (e.g. old “Review” CTA) when no confirmed checkout exists,
 * so the recipient can manage / convert again.
 */
exports.reopenReceivedGiftBox = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new https_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new https_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = (_e = giftSnap.data()) !== null && _e !== void 0 ? _e : {};
    if (gift.kind !== 'box') {
        throw new https_1.HttpsError('failed-precondition', 'Not a gift box.');
    }
    if (gift.status !== 'accepted') {
        throw new https_1.HttpsError('failed-precondition', 'Only accepted gifts can be reopened.');
    }
    const checkoutOrderId = typeof gift.checkoutOrderId === 'string' ? gift.checkoutOrderId.trim() : '';
    if (checkoutOrderId) {
        const orderSnap = await db.doc(`households/${householdId}/orders/${checkoutOrderId}`).get();
        const orderStatus = orderSnap.exists ? String((_g = (_f = orderSnap.data()) === null || _f === void 0 ? void 0 : _f.status) !== null && _g !== void 0 ? _g : '') : '';
        if (orderStatus === 'confirmed' || orderStatus === 'shipped' || orderStatus === 'delivered') {
            throw new https_1.HttpsError('failed-precondition', 'This gift already has a confirmed order and can’t be reopened.');
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
exports.sendDebriefReminders = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const to = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : '').trim();
    const attempt = ((_d = request.data) === null || _d === void 0 ? void 0 : _d.attempt) === 2 ? 2 : 1;
    if (!to.includes('@'))
        throw new https_1.HttpsError('invalid-argument', 'email is required.');
    const claimUrl = `${(_e = process.env.PILOT_APP_BASE_URL) !== null && _e !== void 0 ? _e : 'https://app.grapejuice.co'}/?preview=debrief`;
    await (0, email_1.sendDebriefReminderEmail)({ to, attempt, claimUrl });
    return { ok: true, attempt };
});
/** Daily batch — eligible users who have not completed debrief (up to 2 attempts). */
exports.scheduledDebriefReminders = (0, scheduler_1.onSchedule)('every day 10:00', async () => {
    await (0, debriefReminders_1.runDebriefReminderBatch)(db);
});
/** Daily batch — lock countdown for users with uncommitted box drafts. */
exports.scheduledLockReminders = (0, scheduler_1.onSchedule)('every day 09:00', async () => {
    const lockAt = await getLockAt();
    if (!lockAt || isLocked(lockAt))
        return;
    await (0, lockReminders_1.runLockReminderBatch)(db, lockAt);
});
/** Charge committed Hanukkah box orders once lockAt has passed (final draft totals). */
exports.scheduledChargePilotBoxes = (0, scheduler_1.onSchedule)('every 1 hours', async () => {
    if (!stripe_1.stripe) {
        logger.warn('scheduledChargePilotBoxes skipped — Stripe not configured');
        return;
    }
    await (0, chargePilotBox_1.runChargeEligiblePilotBoxOrders)(db, stripe_1.stripe);
});
/**
 * Replace-sync Grapejuice Airtable catalog → Firestore catalog/hanukkah/items.
 * Auth: Authorization: Bearer $CATALOG_SYNC_SECRET
 * Also requires AIRTABLE_PAT (and optional AIRTABLE_BASE_ID).
 */
exports.syncAirtableCatalog = (0, https_1.onRequest)({
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
exports.scheduledAirtableCatalogSync = (0, scheduler_1.onSchedule)({ schedule: 'every 5 minutes', timeoutSeconds: 300, memory: '1GiB' }, async () => {
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
exports.requestBoxDiscountCode = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const email = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : '')
        .trim()
        .toLowerCase();
    const attestAllTrue = ((_c = request.data) === null || _c === void 0 ? void 0 : _c.attestAllTrue) === true;
    const statements = Array.isArray((_d = request.data) === null || _d === void 0 ? void 0 : _d.statements) ? request.data.statements : [];
    if (!email.includes('@')) {
        throw new https_1.HttpsError('invalid-argument', 'A valid email is required.');
    }
    if (!attestAllTrue) {
        throw new https_1.HttpsError('failed-precondition', 'Please attest that all statements are true.');
    }
    const allAffirmed = statements.every((s) => s && s.affirmed === true);
    if (!allAffirmed || statements.length < 1) {
        throw new https_1.HttpsError('failed-precondition', 'Please confirm each eligibility statement.');
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