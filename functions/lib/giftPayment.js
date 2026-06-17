"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeGiftInvitePayment = finalizeGiftInvitePayment;
const logger = require("firebase-functions/logger");
const stripe_1 = require("./stripe");
const email_1 = require("./email");
/** Mark gift paid and email recipient — idempotent. */
async function finalizeGiftInvitePayment(db, giftInviteId) {
    var _a, _b;
    const inviteRef = db.collection('giftInvites').doc(giftInviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
        throw new Error(`Gift invite ${giftInviteId} not found`);
    }
    const invite = inviteSnap.data();
    const appBase = (_a = process.env.PILOT_APP_BASE_URL) !== null && _a !== void 0 ? _a : 'https://app.grapejuice.co';
    const claimUrl = `${appBase}/gift/claim?token=${invite.claimToken}`;
    if (invite.paymentStatus === 'paid' && invite.claimEmailSentAt) {
        return { claimUrl, alreadyFinalized: true };
    }
    const paymentIntentId = invite.stripePaymentIntentId;
    if (!paymentIntentId) {
        throw new Error('Gift invite missing payment intent');
    }
    if (!stripe_1.stripe) {
        throw new Error('Stripe is not configured');
    }
    const pi = await stripe_1.stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
        throw new Error(`Payment not completed (status: ${pi.status})`);
    }
    if (((_b = pi.metadata) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== giftInviteId) {
        throw new Error('Payment intent metadata mismatch');
    }
    await inviteRef.update({
        paymentStatus: 'paid',
        updatedAt: new Date().toISOString(),
    });
    if (!invite.claimEmailSentAt) {
        await (0, email_1.sendGiftClaimEmail)({
            to: invite.recipientEmail,
            giverName: invite.giverName,
            claimUrl,
            message: invite.message,
        });
        await inviteRef.update({ claimEmailSentAt: new Date().toISOString() });
    }
    logger.info('Gift invite finalized', { giftInviteId, recipientEmail: invite.recipientEmail });
    return { claimUrl, alreadyFinalized: false };
}
//# sourceMappingURL=giftPayment.js.map