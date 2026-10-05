"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGiftInviteKind = resolveGiftInviteKind;
exports.finalizeGiftInvitePayment = finalizeGiftInvitePayment;
const logger = require("./logger");
const stripe_1 = require("./stripe");
const email_1 = require("./email");
const metaCapi_1 = require("./metaCapi");
const catalogInventory_1 = require("./catalogInventory");
/** Prefer stored kind; fall back to lineItems for older invites. */
function resolveGiftInviteKind(invite) {
    if (invite.kind === 'box' || invite.kind === 'credit')
        return invite.kind;
    return Array.isArray(invite.lineItems) && invite.lineItems.length > 0 ? 'box' : 'credit';
}
/**
 * Mark gift paid and email recipient.
 * Idempotent across client finalize + Stripe webhook (transaction claims the send).
 */
async function finalizeGiftInvitePayment(db, giftInviteId, 
/** Finalize callable's browser context — used when the invite predates stored metaContext. */
fallbackMetaContext) {
    var _a, _b, _c, _d;
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
    // Atomically claim the right to send — client finalize and webhook often race.
    const now = new Date().toISOString();
    const shouldSendEmail = await db.runTransaction(async (tx) => {
        const snap = await tx.get(inviteRef);
        if (!snap.exists) {
            throw new Error(`Gift invite ${giftInviteId} not found`);
        }
        const current = snap.data();
        if (current.claimEmailSentAt) {
            if (current.paymentStatus !== 'paid') {
                tx.update(inviteRef, { paymentStatus: 'paid', updatedAt: now });
            }
            return false;
        }
        tx.update(inviteRef, {
            paymentStatus: 'paid',
            claimEmailSentAt: now,
            updatedAt: now,
        });
        return true;
    });
    if (shouldSendEmail) {
        if (resolveGiftInviteKind(invite) === 'box') {
            try {
                const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
                logger.info('Gift box paid — box allocations', Object.assign({ giftInviteId }, alloc));
            }
            catch (allocErr) {
                logger.error('Gift box paid — recomputeBoxAllocations failed', { giftInviteId, allocErr });
            }
        }
        // Same transaction claim as the email, so client finalize + webhook send one Purchase.
        await (0, metaCapi_1.sendMetaEvent)({
            eventName: 'Purchase',
            eventId: `purchase_gift_${giftInviteId}`,
            context: ((_d = (_c = invite.metaContext) !== null && _c !== void 0 ? _c : fallbackMetaContext) !== null && _d !== void 0 ? _d : {}),
            user: { email: invite.giverEmail || null, externalId: invite.giverUid },
            customData: {
                value: (pi.amount_received || pi.amount) / 100,
                currency: (pi.currency || 'usd').toUpperCase(),
                order_id: giftInviteId,
                content_name: resolveGiftInviteKind(invite) === 'box' ? 'Gift box' : 'Gift credit',
                content_type: 'product',
            },
            stripeBacked: true,
        });
        try {
            await (0, email_1.sendGiftClaimEmail)({
                to: invite.recipientEmail,
                giverName: invite.giverName,
                claimUrl,
                message: invite.message,
            });
        }
        catch (emailErr) {
            // claimEmailSentAt already set so we don't double-send on retry; log for ops.
            logger.error('Gift claim email failed after claim reserved', {
                giftInviteId,
                recipientEmail: invite.recipientEmail,
                emailErr,
            });
            throw emailErr;
        }
        logger.info('Gift invite finalized + claim email sent', {
            giftInviteId,
            recipientEmail: invite.recipientEmail,
        });
        return { claimUrl, alreadyFinalized: false };
    }
    logger.info('Gift invite already finalized (skipped duplicate email)', {
        giftInviteId,
        recipientEmail: invite.recipientEmail,
    });
    return { claimUrl, alreadyFinalized: true };
}
//# sourceMappingURL=giftPayment.js.map