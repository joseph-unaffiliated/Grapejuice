import * as logger from './logger';
import type { Firestore } from 'firebase-admin/firestore';
import { stripe } from './stripe';
import { sendGiftClaimEmail } from './email';
import { sendMetaEvent, type MetaClientContext } from './metaCapi';
import { recomputeBoxAllocations } from './catalogInventory';
import { deliveryDateLabel, lockDateLabel } from './setupNudge';
import type { OrderPromo } from './promoPricing';

export type GiftInviteRecord = {
  giverUid: string;
  giverName: string;
  giverEmail: string;
  recipientEmail: string;
  message?: string;
  creditCents: number;
  /** Discount-code / influencer savings; the recipient still gets the full creditCents. */
  discountCents?: number;
  /** What the giver pays: creditCents − discountCents. */
  amountDueCents?: number;
  promo?: OrderPromo;
  claimToken: string;
  status: 'pending' | 'claimed';
  paymentStatus?: 'pending' | 'paid';
  stripePaymentIntentId?: string;
  claimEmailSentAt?: string;
  /** Explicit path: credit-only (“let them choose”) vs curated box. */
  kind?: 'credit' | 'box';
  /** Giver customization snapshot — only for kind=box. */
  lineItems?: unknown[];
  /** Optional ship-to the giver entered (kind=box) so the recipient can keep it a surprise. */
  shippingAddress?: Record<string, string>;
  childInterests?: string[];
  childAgeGroups?: string[];
  /** Optional household label from the giver ("The Golds"). */
  familyName?: string;
  /** Curated box: age band, planner age, and an optional name per kid. */
  giftChildren?: { name?: string; ageGroup: string; plannerAge: number }[];
  /** Giver's browser Meta ids at purchase (Conversions API match keys). */
  metaContext?: Record<string, string | boolean>;
  /** Giver's first / last-touch UTMs. */
  attribution?: Record<string, unknown>;
  createdAt: string;
  claimedAt?: string;
  claimedByHouseholdId?: string;
  /** Set at lock when an unclaimed box shipped to the giver's address (order lives in the giver's household). */
  autoShipOrderId?: string;
  autoShipHouseholdId?: string;
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
    const metaEvent = {
      context: (invite.metaContext ?? fallbackMetaContext ?? {}) as MetaClientContext,
      user: { email: invite.giverEmail || null, externalId: invite.giverUid },
      customData: {
        value: (pi.amount_received || pi.amount) / 100,
        currency: (pi.currency || 'usd').toUpperCase(),
        order_id: giftInviteId,
        content_name: resolveGiftInviteKind(invite) === 'box' ? 'Gift box' : 'Gift credit',
        content_type: 'product' as const,
      },
      stripeBacked: true,
    };
    await Promise.all([
      sendMetaEvent({ ...metaEvent, eventName: 'Purchase', eventId: `purchase_gift_${giftInviteId}` }),
      sendMetaEvent({ ...metaEvent, eventName: 'GiftSent', eventId: `giftsent_${giftInviteId}` }),
    ]);
    try {
      const config = (await db.doc('config/hanukkah-2026').get()).data() ?? {};
      await sendGiftClaimEmail({
        to: invite.recipientEmail,
        giverName: invite.giverName,
        claimUrl,
        message: invite.message,
        kind: resolveGiftInviteKind(invite),
        deadlineLabel: lockDateLabel((config.lockAt as string) ?? '2026-11-08T04:59:59Z'),
        arrivesByLabel: deliveryDateLabel((config.estimatedDeliveryBy as string) ?? '2026-11-21'),
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

const GIFT_AGE_GROUPS = new Set(['0-2', '3-5', '6-8', '9-12']);

function cleanGiftLabel(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || undefined;
}

/** Household label the giver typed. Empty and junk become undefined. */
export function sanitizeGiftFamilyName(raw: unknown): string | undefined {
  return cleanGiftLabel(raw, 60);
}

export type GiftChildRecord = { name?: string; ageGroup: string; plannerAge: number };

/** Ages the box was planned for, plus an optional name. Drops rows that aren't objects. */
export function sanitizeGiftChildren(raw: unknown): GiftChildRecord[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: GiftChildRecord[] = [];
  for (const row of raw.slice(0, 8)) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const ageGroup = typeof r.ageGroup === 'string' && GIFT_AGE_GROUPS.has(r.ageGroup) ? r.ageGroup : '6-8';
    const plannerAge =
      typeof r.plannerAge === 'number' && Number.isFinite(r.plannerAge)
        ? Math.max(0, Math.min(17, Math.floor(r.plannerAge)))
        : 6;
    const name = cleanGiftLabel(r.name, 40);
    out.push({ ageGroup, plannerAge, ...(name ? { name } : {}) });
  }
  return out.length ? out : undefined;
}
