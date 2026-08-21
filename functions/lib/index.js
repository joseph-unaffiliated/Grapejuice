"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestBoxDiscountCode = exports.scheduledAirtableCatalogSync = exports.syncAirtableCatalog = exports.scheduledLockReminders = exports.scheduledDebriefReminders = exports.sendDebriefReminders = exports.claimGiftInvite = exports.finalizePilotGiftPayment = exports.purchasePilotGift = exports.writeOrderTracking = exports.acceptPartnerInvite = exports.listPartnerInvites = exports.createPartnerInvite = exports.stripeWebhook = exports.commitPilotBox = exports.createPilotSetupIntent = exports.createPilotCheckout = exports.sendWelcomeOnSignup = exports.scanBeamAgeTriggers = exports.askPilotRav = void 0;
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
const crypto_1 = require("crypto");
var welcome_1 = require("./welcome");
Object.defineProperty(exports, "sendWelcomeOnSignup", { enumerable: true, get: function () { return welcome_1.sendWelcomeOnSignup; } });
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const HOLIDAY_ID = 'hanukkah-2026';
const DEFAULT_BOX_PRICE_CENTS = 5000;
const SHIPPING_FLAT_CENTS = 0;
const EXPEDITED_SHIPPING_CENTS = 1500;
const CHECKOUT_TAX_RATE = 0.075;
const DEFAULT_GIFT_CREDIT_CENTS = 5000;
function chargeableLineTotal(lineItems) {
    return lineItems.reduce((s, li) => { var _a, _b; return s + ((_a = li.unitCents) !== null && _a !== void 0 ? _a : 0) * ((_b = li.quantity) !== null && _b !== void 0 ? _b : 1); }, 0);
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
exports.commitPilotBox = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
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
    await orderRef.set(Object.assign({ status: 'committed', lineItems,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents, creditAppliedCents: creditApplied, giftCreditAppliedCents: giftCreditApplied, platformCreditAppliedCents: platformCreditApplied, expeditedShipping,
        shippingAddress, holidayId: HOLIDAY_ID, userId: request.auth.uid, lockAt,
        estimatedDelivery, committedAt: firestore_1.FieldValue.serverTimestamp(), createdAt: firestore_1.FieldValue.serverTimestamp() }, (data.skipShipStation === true ? { playthrough: true } : {})));
    if (giftCreditApplied > 0 || platformCreditApplied > 0) {
        await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign({}, (giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {})), (platformCreditApplied > 0 ? { platformCreditCents: platformCreditCents - platformCreditApplied } : {})), { updatedAt: new Date().toISOString() }));
    }
    if (totalCents > 0 && cardOnFile) {
        const customerId = (_g = hhData.stripeCustomerId) !== null && _g !== void 0 ? _g : '';
        const paymentMethodId = hhData.stripeDefaultPaymentMethodId;
        if (!customerId || !paymentMethodId) {
            throw new https_1.HttpsError('failed-precondition', 'Saved card is missing. Re-add your payment method.');
        }
        const paymentIntent = await stripe_1.stripe.paymentIntents.create({
            amount: totalCents,
            currency: 'usd',
            customer: customerId,
            payment_method: paymentMethodId,
            capture_method: 'manual',
            confirm: true,
            off_session: true,
            metadata: {
                householdId,
                orderId: orderRef.id,
                userId: request.auth.uid,
                type: 'hanukkah_box',
            },
        });
        await orderRef.update({ stripePaymentIntentId: paymentIntent.id });
    }
    try {
        if (data.skipShipStation === true) {
            logger.info('ShipStation export skipped (visitor playthrough)', { orderId: orderRef.id });
        }
        else {
            await (0, shipstation_1.exportOrderToShipStation)({
                orderId: orderRef.id,
                householdId,
                shippingAddress,
                lineItems,
                totalCents,
                expeditedShipping,
            });
        }
    }
    catch (shipErr) {
        logger.error('ShipStation export failed', shipErr);
    }
    await db.doc(`users/${request.auth.uid}`).set(Object.assign(Object.assign(Object.assign({ debriefReminderEligible: true, debriefReminderAttempts: 0, lockReminderEligible: false }, (((_h = data.contactPhone) === null || _h === void 0 ? void 0 : _h.trim()) ? { phone: data.contactPhone.trim() } : {})), (data.smsOptIn === true ? { smsOptIn: true } : {})), { updatedAt: new Date().toISOString() }), { merge: true });
    return {
        orderId: orderRef.id,
        totalCents,
        status: 'committed',
    };
});
exports.stripeWebhook = (0, https_1.onRequest)({ cors: false }, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
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
                        await orderRef.update({
                            status: 'confirmed',
                            confirmedAt: firestore_1.FieldValue.serverTimestamp(),
                        });
                        const order = orderSnap.data();
                        const userId = order.userId;
                        const userSnap = await db.doc(`users/${userId}`).get();
                        const email = (_m = (_l = userSnap.data()) === null || _l === void 0 ? void 0 : _l.email) !== null && _m !== void 0 ? _m : '';
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
    const lineItems = Array.isArray((_k = request.data) === null || _k === void 0 ? void 0 : _k.lineItems) ? request.data.lineItems : undefined;
    const childInterests = Array.isArray((_l = request.data) === null || _l === void 0 ? void 0 : _l.childInterests) ? request.data.childInterests : undefined;
    const childAgeGroups = Array.isArray((_m = request.data) === null || _m === void 0 ? void 0 : _m.childAgeGroups) ? request.data.childAgeGroups : undefined;
    if (!recipientEmail.includes('@')) {
        throw new https_1.HttpsError('invalid-argument', 'A valid recipient email is required.');
    }
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const giverEmail = String((_p = (_o = userSnap.data()) === null || _o === void 0 ? void 0 : _o.email) !== null && _p !== void 0 ? _p : '').trim().toLowerCase();
    const claimToken = (0, crypto_1.randomBytes)(24).toString('hex');
    const inviteRef = db.collection('giftInvites').doc();
    const payload = Object.assign(Object.assign(Object.assign(Object.assign({ giverUid: request.auth.uid, giverName,
        giverEmail,
        recipientEmail, message: message || undefined, creditCents,
        claimToken, status: 'pending', paymentStatus: 'pending' }, (customize && lineItems ? { lineItems } : {})), (childInterests ? { childInterests } : {})), (childAgeGroups ? { childAgeGroups } : {})), { createdAt: new Date().toISOString() });
    await inviteRef.set(payload);
    const paymentIntent = await stripe_1.stripe.paymentIntents.create({
        amount: creditCents,
        currency: 'usd',
        metadata: {
            type: 'pilot_gift',
            giftInviteId: inviteRef.id,
            giverUid: request.auth.uid,
        },
        receipt_email: giverEmail || undefined,
        automatic_payment_methods: { enabled: true },
    });
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
exports.claimGiftInvite = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
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
    if (!householdId) {
        const hhRef = db.collection('households').doc();
        const now = new Date().toISOString();
        await hhRef.set({
            name: 'Our household',
            ownerId: request.auth.uid,
            memberIds: [request.auth.uid],
            childUserIds: [],
            giftCreditCents: invite.creditCents,
            createdAt: now,
            updatedAt: now,
        });
        householdId = hhRef.id;
        await db.doc(`users/${request.auth.uid}`).set({ householdId, updatedAt: now }, { merge: true });
    }
    else {
        const hhRef = db.doc(`households/${householdId}`);
        const hhSnap = await hhRef.get();
        const currentGift = typeof ((_e = hhSnap.data()) === null || _e === void 0 ? void 0 : _e.giftCreditCents) === 'number' ? hhSnap.data().giftCreditCents : 0;
        await hhRef.update({
            giftCreditCents: currentGift + invite.creditCents,
            updatedAt: new Date().toISOString(),
        });
    }
    if ((_f = invite.lineItems) === null || _f === void 0 ? void 0 : _f.length) {
        await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).set({
            holidayId: HOLIDAY_ID,
            lineItems: invite.lineItems,
            childInterests: (_g = invite.childInterests) !== null && _g !== void 0 ? _g : [],
            updatedAt: new Date().toISOString(),
            updatedBy: request.auth.uid,
        }, { merge: true });
    }
    await inviteDoc.ref.update({
        status: 'claimed',
        claimedAt: new Date().toISOString(),
        claimedByHouseholdId: householdId,
        claimedByUid: request.auth.uid,
    });
    await db.doc(`users/${request.auth.uid}`).set({
        onboardingComplete: true,
        boxRevealComplete: false,
        lockReminderEligible: true,
        lockReminderAttempts: 0,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
    return { householdId, giftCreditCents: invite.creditCents, giverName: invite.giverName, message: invite.message, hasGiverDraft: !!((_h = invite.lineItems) === null || _h === void 0 ? void 0 : _h.length) };
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