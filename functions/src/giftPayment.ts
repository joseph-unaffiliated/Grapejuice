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

/** Mark gift paid and email recipient — idempotent. */
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

  await inviteRef.update({
    paymentStatus: 'paid',
    updatedAt: new Date().toISOString(),
  });

  if (!invite.claimEmailSentAt) {
    await sendGiftClaimEmail({
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
