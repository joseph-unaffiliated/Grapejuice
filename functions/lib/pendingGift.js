"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelPilotGift = exports.resumePilotGiftPayment = void 0;
/**
 * Gifts the giver started but never paid for (giftInvites with paymentStatus 'pending').
 * Unpaid gifts hold no box stock and don't count toward discount codes, so cancelling one only
 * voids its PaymentIntent. A cancelled gift keeps paymentStatus 'pending' so claimGiftInvite and
 * peekGiftInvite keep refusing it.
 */
const logger = require("./logger");
const sentry_1 = require("./sentry");
const firestore_1 = require("firebase-admin/firestore");
const stripe_1 = require("./stripe");
const catalogInventory_1 = require("./catalogInventory");
const giftPayment_1 = require("./giftPayment");
function isPaidGift(invite) {
    return invite.paymentStatus === 'paid' || Boolean(invite.claimEmailSentAt) || invite.status === 'claimed';
}
async function loadGiversInvite(uid, tokenEmail, giftInviteId) {
    var _a, _b, _c, _d, _e;
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection('giftInvites').doc(giftInviteId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new sentry_1.HttpsError('not-found', 'Gift not found.');
    const invite = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
    if (invite.giverUid !== uid) {
        // Same email-fallback listMyGiftInvites uses (account re-created under a new uid).
        const email = String((_d = (_c = (_b = (await db.doc(`users/${uid}`).get()).data()) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : tokenEmail) !== null && _d !== void 0 ? _d : '')
            .trim()
            .toLowerCase();
        const giverEmail = String((_e = invite.giverEmail) !== null && _e !== void 0 ? _e : '').trim().toLowerCase();
        if (!email.includes('@') || email !== giverEmail) {
            throw new sentry_1.HttpsError('permission-denied', 'Only the giver can change this gift.');
        }
    }
    return { db, ref, invite };
}
function amountDueCents(invite) {
    if (typeof invite.amountDueCents === 'number')
        return Math.max(0, invite.amountDueCents);
    const credit = typeof invite.creditCents === 'number' ? invite.creditCents : 0;
    const discount = typeof invite.discountCents === 'number' ? invite.discountCents : 0;
    return Math.max(0, credit - discount);
}
/** Payment details for an unpaid gift so the giver can finish paying from Orders. */
exports.resumePilotGiftPayment = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    const { db, ref, invite } = await loadGiversInvite(request.auth.uid, request.auth.token.email, giftInviteId);
    if (invite.status === 'cancelled') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift was cancelled.');
    }
    if (isPaidGift(invite)) {
        return { alreadyPaid: true, giftInviteId };
    }
    if (!stripe_1.stripe)
        throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured.');
    const customize = (0, giftPayment_1.resolveGiftInviteKind)(invite) === 'box';
    if (customize) {
        const lockAt = (_e = (_d = (await db.doc(`config/${catalogInventory_1.HOLIDAY_ID}`).get()).data()) === null || _d === void 0 ? void 0 : _d.lockAt) !== null && _e !== void 0 ? _e : null;
        if (lockAt && Date.now() >= new Date(lockAt).getTime()) {
            throw new sentry_1.HttpsError('failed-precondition', 'Gift boxes for this Hanukkah closed when boxes locked. Cancel this gift and send gift credit instead.');
        }
        if (Array.isArray(invite.lineItems) && invite.lineItems.length) {
            await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, invite.lineItems);
        }
    }
    const piId = typeof invite.stripePaymentIntentId === 'string' ? invite.stripePaymentIntentId : '';
    let clientSecret = null;
    if (piId) {
        const pi = await stripe_1.stripe.paymentIntents.retrieve(piId);
        if (pi.status === 'succeeded') {
            // Paid but never finalized (closed tab before finalize, webhook missed).
            const result = await (0, giftPayment_1.finalizeGiftInvitePayment)(db, giftInviteId);
            return { alreadyPaid: true, giftInviteId, claimUrl: result.claimUrl };
        }
        if (pi.status === 'processing') {
            throw new sentry_1.HttpsError('failed-precondition', 'Your payment for this gift is still processing. Check back in a few minutes.');
        }
        if (pi.status !== 'canceled')
            clientSecret = pi.client_secret;
    }
    if (!clientSecret) {
        const pi = await stripe_1.stripe.paymentIntents.create(Object.assign(Object.assign({ amount: amountDueCents(invite), currency: 'usd', metadata: {
                type: 'pilot_gift',
                giftInviteId,
                giverUid: String((_f = invite.giverUid) !== null && _f !== void 0 ? _f : ''),
            } }, (invite.giverEmail ? { receipt_email: String(invite.giverEmail) } : {})), { automatic_payment_methods: { enabled: true } }));
        await ref.update({ stripePaymentIntentId: pi.id, updatedAt: new Date().toISOString() });
        clientSecret = pi.client_secret;
    }
    if (!clientSecret)
        throw new sentry_1.HttpsError('internal', 'Payment could not be started.');
    return {
        alreadyPaid: false,
        giftInviteId,
        clientSecret,
        publishableKey: stripe_1.stripePublishableKey || null,
        claimToken: String((_g = invite.claimToken) !== null && _g !== void 0 ? _g : ''),
        recipientEmail: String((_h = invite.recipientEmail) !== null && _h !== void 0 ? _h : ''),
        giverName: String((_j = invite.giverName) !== null && _j !== void 0 ? _j : ''),
        creditCents: typeof invite.creditCents === 'number' ? invite.creditCents : 0,
        discountCents: typeof invite.discountCents === 'number' ? invite.discountCents : 0,
        amountDueCents: amountDueCents(invite),
        customize,
    };
});
/** Cancel an unpaid gift: void its PaymentIntent and mark it cancelled. */
exports.cancelPilotGift = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const uid = request.auth.uid;
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    const { db, ref, invite } = await loadGiversInvite(uid, request.auth.token.email, giftInviteId);
    if (invite.status === 'cancelled')
        return { giftInviteId, status: 'cancelled' };
    if (isPaidGift(invite)) {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift is already paid for, so it can’t be cancelled here. Contact support for help.');
    }
    const piId = typeof invite.stripePaymentIntentId === 'string' ? invite.stripePaymentIntentId : '';
    if (piId) {
        if (!stripe_1.stripe)
            throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured.');
        const pi = await stripe_1.stripe.paymentIntents.retrieve(piId);
        if (pi.status === 'succeeded' || pi.status === 'processing') {
            throw new sentry_1.HttpsError('failed-precondition', 'A payment for this gift just went through, so it can’t be cancelled here. Refresh the page.');
        }
        if (pi.status !== 'canceled') {
            try {
                await stripe_1.stripe.paymentIntents.cancel(piId);
            }
            catch (err) {
                logger.error('cancelPilotGift PaymentIntent cancel failed', { giftInviteId, err });
                throw new sentry_1.HttpsError('internal', 'Could not cancel this gift. Try again or contact support.');
            }
        }
    }
    await db.runTransaction(async (tx) => {
        var _a;
        const fresh = (_a = (await tx.get(ref)).data()) !== null && _a !== void 0 ? _a : {};
        if (isPaidGift(fresh)) {
            throw new sentry_1.HttpsError('failed-precondition', 'This gift was just paid for. Refresh the page.');
        }
        const now = new Date().toISOString();
        tx.update(ref, { status: 'cancelled', cancelledAt: now, cancelledByUid: uid, updatedAt: now });
    });
    return { giftInviteId, status: 'cancelled' };
});
//# sourceMappingURL=pendingGift.js.map