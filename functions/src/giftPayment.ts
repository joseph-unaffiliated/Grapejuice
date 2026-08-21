import * as logger from 'firebase-functions/logger';
import type { Firestore } from 'firebase-admin/firestore';
import { stripe } from './stripe';
import { sendGiftClaimEmail } from './email';

export type GiftInviteRecord = {
  giverUid: string;
  giverName: string;
  giverEmail: string;
  recipientEmail: string;
  message?: string;
  creditCents: number;
  claimToken: string;
  status: 'pending' | 'claimed';
  paymentStatus?: 'pending' | 'paid';
  stripePaymentIntentId?: string;
  claimEmailSentAt?: string;
  /** Giver customization snapshot — merged into household boxDraft on claim. */
  lineItems?: unknown[];
  childInterests?: string[];
  childAgeGroups?: string[];
  createdAt: string;
  claimedAt?: string;
  claimedByHouseholdId?: string;
};

/**
 * Mark gift paid and email recipient.
 * Idempotent across client finalize + Stripe webhook (transaction claims the send).
 */
export async function finalizeGiftInvitePayment(
  db: Firestore,
  giftInviteId: string
): Promise<{ claimUrl: string; alreadyFinalized: boolean }> {
  const inviteRef = db.collection('giftInvites').doc(giftInviteId);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    throw new Error(`Gift invite ${giftInviteId} not found`);
  }

  const invite = inviteSnap.data() as GiftInviteRecord;
  const appBase = process.env.PILOT_APP_BASE_URL ?? 'https://app.grapejuice.co';
  const claimUrl = `${appBase}/gift/claim?token=${invite.claimToken}`;

  if (invite.paymentStatus === 'paid' && invite.claimEmailSentAt) {
    return { claimUrl, alreadyFinalized: true };
  }

  const paymentIntentId = invite.stripePaymentIntentId;
  if (!paymentIntentId) {
    throw new Error('Gift invite missing payment intent');
  }
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== 'succeeded') {
    throw new Error(`Payment not completed (status: ${pi.status})`);
  }
  if (pi.metadata?.giftInviteId !== giftInviteId) {
    throw new Error('Payment intent metadata mismatch');
  }

  // Atomically claim the right to send — client finalize and webhook often race.
  const now = new Date().toISOString();
  const shouldSendEmail = await db.runTransaction(async (tx) => {
    const snap = await tx.get(inviteRef);
    if (!snap.exists) {
      throw new Error(`Gift invite ${giftInviteId} not found`);
    }
    const current = snap.data() as GiftInviteRecord;
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
    try {
      await sendGiftClaimEmail({
        to: invite.recipientEmail,
        giverName: invite.giverName,
        claimUrl,
        message: invite.message,
      });
    } catch (emailErr) {
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
