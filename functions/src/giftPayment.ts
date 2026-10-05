import * as logger from './logger';
import type { Firestore } from 'firebase-admin/firestore';
import { stripe } from './stripe';
import { sendGiftClaimEmail } from './email';
import { sendMetaEvent, type MetaClientContext } from './metaCapi';
import { recomputeBoxAllocations } from './catalogInventory';

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
  /** Explicit path: credit-only (“let them choose”) vs curated box. */
  kind?: 'credit' | 'box';
  /** Giver customization snapshot — only for kind=box. */
  lineItems?: unknown[];
  childInterests?: string[];
  childAgeGroups?: string[];
  /** Giver's browser Meta ids at purchase (Conversions API match keys). */
  metaContext?: Record<string, string | boolean>;
  /** Giver's first / last-touch UTMs. */
  attribution?: Record<string, unknown>;
  createdAt: string;
  claimedAt?: string;
  claimedByHouseholdId?: string;
};

/** Prefer stored kind; fall back to lineItems for older invites. */
export function resolveGiftInviteKind(invite: {
  kind?: string;
  lineItems?: unknown[];
}): 'credit' | 'box' {
  if (invite.kind === 'box' || invite.kind === 'credit') return invite.kind;
  return Array.isArray(invite.lineItems) && invite.lineItems.length > 0 ? 'box' : 'credit';
}

/**
 * Mark gift paid and email recipient.
 * Idempotent across client finalize + Stripe webhook (transaction claims the send).
 */
export async function finalizeGiftInvitePayment(
  db: Firestore,
  giftInviteId: string,
  /** Finalize callable's browser context — used when the invite predates stored metaContext. */
  fallbackMetaContext?: MetaClientContext
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
    if (resolveGiftInviteKind(invite) === 'box') {
      try {
        const alloc = await recomputeBoxAllocations(db);
        logger.info('Gift box paid — box allocations', { giftInviteId, ...alloc });
      } catch (allocErr) {
        logger.error('Gift box paid — recomputeBoxAllocations failed', { giftInviteId, allocErr });
      }
    }
    // Same transaction claim as the email, so client finalize + webhook send one Purchase.
    await sendMetaEvent({
      eventName: 'Purchase',
      eventId: `purchase_gift_${giftInviteId}`,
      context: (invite.metaContext ?? fallbackMetaContext ?? {}) as MetaClientContext,
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
