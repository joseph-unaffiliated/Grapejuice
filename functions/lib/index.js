"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptPartnerInvite = exports.listPartnerInvites = exports.createPartnerInvite = exports.stripeWebhook = exports.createPilotCheckout = exports.scanBeamAgeTriggers = exports.askPilotRav = void 0;
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const stripe_1 = require("./stripe");
const email_1 = require("./email");
const rav_1 = require("./rav");
Object.defineProperty(exports, "askPilotRav", { enumerable: true, get: function () { return rav_1.askPilotRav; } });
const beamAgeTrigger_1 = require("./beamAgeTrigger");
Object.defineProperty(exports, "scanBeamAgeTriggers", { enumerable: true, get: function () { return beamAgeTrigger_1.scanBeamAgeTriggers; } });
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const HOLIDAY_ID = 'hanukkah-2026';
const DEFAULT_BOX_PRICE_CENTS = 5000;
const SHIPPING_FLAT_CENTS = 0;
const CHECKOUT_TAX_RATE = 0.075;
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
}
async function getLockAt() {
    var _a, _b;
    const snap = await db.doc('config/hanukkah-2026').get();
    return (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.lockAt) !== null && _b !== void 0 ? _b : null;
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
    const estimatedDelivery = (_e = configData.estimatedDeliveryBy) !== null && _e !== void 0 ? _e : '2026-12-07';
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
exports.stripeWebhook = (0, https_1.onRequest)({ cors: false }, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g;
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
        if (event.type === 'payment_intent.succeeded') {
            const pi = event.data.object;
            const householdId = (_c = pi.metadata) === null || _c === void 0 ? void 0 : _c.householdId;
            const orderId = (_d = pi.metadata) === null || _d === void 0 ? void 0 : _d.orderId;
            if (!householdId || !orderId) {
                logger.warn('payment_intent.succeeded missing metadata', pi.metadata);
            }
            else {
                const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
                const orderSnap = await orderRef.get();
                if (orderSnap.exists && ((_e = orderSnap.data()) === null || _e === void 0 ? void 0 : _e.status) !== 'confirmed') {
                    await orderRef.update({
                        status: 'confirmed',
                        confirmedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                    const order = orderSnap.data();
                    const userId = order.userId;
                    const userSnap = await db.doc(`users/${userId}`).get();
                    const email = (_g = (_f = userSnap.data()) === null || _f === void 0 ? void 0 : _f.email) !== null && _g !== void 0 ? _g : '';
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
//# sourceMappingURL=index.js.map