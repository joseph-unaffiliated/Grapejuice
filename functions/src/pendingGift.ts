/**
 * Gifts the giver started but never paid for (giftInvites with paymentStatus 'pending').
 * Unpaid gifts hold no box stock and don't count toward discount codes, so cancelling one only
 * voids its PaymentIntent. A cancelled gift keeps paymentStatus 'pending' so claimGiftInvite and
 * peekGiftInvite keep refusing it.
 */
import * as logger from './logger';
import { onCall, HttpsError } from './sentry';
import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { stripe, stripePublishableKey } from './stripe';
import { HOLIDAY_ID, assertBoxLinesWithinInventory } from './catalogInventory';
import { finalizeGiftInvitePayment, resolveGiftInviteKind } from './giftPayment';

function isPaidGift(invite: DocumentData): boolean {
  return invite.paymentStatus === 'paid' || Boolean(invite.claimEmailSentAt) || invite.status === 'claimed';
}

async function loadGiversInvite(uid: string, tokenEmail: unknown, giftInviteId: string) {
  if (!giftInviteId) throw new HttpsError('invalid-argument', 'giftInviteId is required.');
  const db = getFirestore();
  const ref = db.collection('giftInvites').doc(giftInviteId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Gift not found.');
  const invite = snap.data() ?? {};
  if (invite.giverUid !== uid) {
    // Same email-fallback listMyGiftInvites uses (account re-created under a new uid).
    const email = String((await db.doc(`users/${uid}`).get()).data()?.email ?? tokenEmail ?? '')
      .trim()
      .toLowerCase();
    const giverEmail = String(invite.giverEmail ?? '').trim().toLowerCase();
    if (!email.includes('@') || email !== giverEmail) {
      throw new HttpsError('permission-denied', 'Only the giver can change this gift.');
    }
  }
  return { db, ref, invite };
}

function amountDueCents(invite: DocumentData): number {
  if (typeof invite.amountDueCents === 'number') return Math.max(0, invite.amountDueCents);
  const credit = typeof invite.creditCents === 'number' ? invite.creditCents : 0;
  const discount = typeof invite.discountCents === 'number' ? invite.discountCents : 0;
  return Math.max(0, credit - discount);
}

/** Payment details for an unpaid gift so the giver can finish paying from Orders. */
export const resumePilotGiftPayment = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const giftInviteId = String(request.data?.giftInviteId ?? '').trim();
  const { db, ref, invite } = await loadGiversInvite(request.auth.uid, request.auth.token.email, giftInviteId);

  if (invite.status === 'cancelled') {
    throw new HttpsError('failed-precondition', 'This gift was cancelled.');
  }
  if (isPaidGift(invite)) {
    return { alreadyPaid: true as const, giftInviteId };
  }
  if (!stripe) throw new HttpsError('failed-precondition', 'Stripe is not configured.');

  const customize = resolveGiftInviteKind(invite) === 'box';
  if (customize) {
    const lockAt = ((await db.doc(`config/${HOLIDAY_ID}`).get()).data()?.lockAt as string | undefined) ?? null;
    if (lockAt && Date.now() >= new Date(lockAt).getTime()) {
      throw new HttpsError(
        'failed-precondition',
        'Gift boxes for this Hanukkah closed when boxes locked. Cancel this gift and send gift credit instead.'
      );
    }
    if (Array.isArray(invite.lineItems) && invite.lineItems.length) {
      await assertBoxLinesWithinInventory(db, invite.lineItems);
    }
  }

  const piId = typeof invite.stripePaymentIntentId === 'string' ? invite.stripePaymentIntentId : '';
  let clientSecret: string | null = null;
  if (piId) {
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status === 'succeeded') {
      // Paid but never finalized (closed tab before finalize, webhook missed).
      const result = await finalizeGiftInvitePayment(db, giftInviteId);
      return { alreadyPaid: true as const, giftInviteId, claimUrl: result.claimUrl };
    }
    if (pi.status === 'processing') {
      throw new HttpsError(
        'failed-precondition',
        'Your payment for this gift is still processing. Check back in a few minutes.'
      );
    }
    if (pi.status !== 'canceled') clientSecret = pi.client_secret;
  }
  if (!clientSecret) {
    const pi = await stripe.paymentIntents.create({
      amount: amountDueCents(invite),
      currency: 'usd',
      metadata: {
        type: 'pilot_gift',
        giftInviteId,
        giverUid: String(invite.giverUid ?? ''),
      },
      ...(invite.giverEmail ? { receipt_email: String(invite.giverEmail) } : {}),
      automatic_payment_methods: { enabled: true },
    });
    await ref.update({ stripePaymentIntentId: pi.id, updatedAt: new Date().toISOString() });
    clientSecret = pi.client_secret;
  }
  if (!clientSecret) throw new HttpsError('internal', 'Payment could not be started.');

  return {
    alreadyPaid: false as const,
    giftInviteId,
    clientSecret,
    publishableKey: stripePublishableKey || null,
    claimToken: String(invite.claimToken ?? ''),
    recipientEmail: String(invite.recipientEmail ?? ''),
    giverName: String(invite.giverName ?? ''),
    creditCents: typeof invite.creditCents === 'number' ? invite.creditCents : 0,
    discountCents: typeof invite.discountCents === 'number' ? invite.discountCents : 0,
    amountDueCents: amountDueCents(invite),
    customize,
  };
});

/** Cancel an unpaid gift: void its PaymentIntent and mark it cancelled. */
export const cancelPilotGift = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const giftInviteId = String(request.data?.giftInviteId ?? '').trim();
  const { db, ref, invite } = await loadGiversInvite(uid, request.auth.token.email, giftInviteId);

  if (invite.status === 'cancelled') return { giftInviteId, status: 'cancelled' as const };
  if (isPaidGift(invite)) {
    throw new HttpsError(
      'failed-precondition',
      'This gift is already paid for, so it can’t be cancelled here. Contact support for help.'
    );
  }

  const piId = typeof invite.stripePaymentIntentId === 'string' ? invite.stripePaymentIntentId : '';
  if (piId) {
    if (!stripe) throw new HttpsError('failed-precondition', 'Stripe is not configured.');
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status === 'succeeded' || pi.status === 'processing') {
      throw new HttpsError(
        'failed-precondition',
        'A payment for this gift just went through, so it can’t be cancelled here. Refresh the page.'
      );
    }
    if (pi.status !== 'canceled') {
      try {
        await stripe.paymentIntents.cancel(piId);
      } catch (err) {
        logger.error('cancelPilotGift PaymentIntent cancel failed', { giftInviteId, err });
        throw new HttpsError('internal', 'Could not cancel this gift. Try again or contact support.');
      }
    }
  }

  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() ?? {};
    if (isPaidGift(fresh)) {
      throw new HttpsError('failed-precondition', 'This gift was just paid for. Refresh the page.');
    }
    const now = new Date().toISOString();
    tx.update(ref, { status: 'cancelled', cancelledAt: now, cancelledByUid: uid, updatedAt: now });
  });

  return { giftInviteId, status: 'cancelled' as const };
});
