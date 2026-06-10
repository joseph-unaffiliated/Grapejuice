import * as logger from 'firebase-functions/logger';
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { stripe, verifyWebhook } from './stripe';
import { sendEmail } from './email';
import { askPilotRav } from './rav';
import { scanBeamAgeTriggers } from './beamAgeTrigger';

export { askPilotRav, scanBeamAgeTriggers };

initializeApp();
const db = getFirestore();

const HOLIDAY_ID = 'hanukkah-2026';
const DEFAULT_BOX_PRICE_CENTS = 9900;
const SHIPPING_FLAT_CENTS = 1299;
const CHECKOUT_TAX_RATE = 0.075;

function chargeableLineTotal(lineItems: Array<{ unitCents?: number; quantity?: number }>): number {
  return lineItems.reduce((s, li) => s + (li.unitCents ?? 0) * (li.quantity ?? 1), 0);
}

function orderTotalCents(
  lineItems: Array<{ unitCents?: number; quantity?: number; slotId?: string }>,
  boxPriceCents = DEFAULT_BOX_PRICE_CENTS
): number {
  const hasIncluded = lineItems.some((li) => li.unitCents === 0 || li.slotId);
  const base = hasIncluded ? boxPriceCents : 0;
  const subtotal = base + chargeableLineTotal(lineItems as Array<{ unitCents?: number; quantity?: number }>);
  return subtotal + 1299; // SHIPPING_FLAT_CENTS
}

async function assertHouseholdMember(uid: string, householdId: string): Promise<void> {
  const snap = await db.doc(`households/${householdId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Household not found.');
  const memberIds = (snap.data()?.memberIds as string[]) ?? [];
  if (!memberIds.includes(uid)) {
    throw new HttpsError('permission-denied', 'Not a member of this household.');
  }
}

async function getLockAt(): Promise<string | null> {
  const snap = await db.doc('config/hanukkah-2026').get();
  return (snap.data()?.lockAt as string) ?? null;
}

function isLocked(lockAt: string | null): boolean {
  if (!lockAt) return false;
  return Date.now() >= new Date(lockAt).getTime();
}

type ShippingAddress = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: 'US' | 'CA' | 'OTHER';
};

interface CreatePilotCheckoutData {
  householdId: string;
  shippingAddress: ShippingAddress;
}

type PartnerInviteRecord = {
  householdId: string;
  householdName: string;
  invitedEmail: string;
  invitedByUid: string;
  invitedByName: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
  acceptedByUid?: string;
};

export const createPilotCheckout = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!stripe) {
    throw new HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
  }

  const data = (request.data ?? {}) as CreatePilotCheckoutData;
  const householdId = data.householdId;
  const shippingAddress = data.shippingAddress;
  if (!householdId || !shippingAddress?.line1 || !shippingAddress?.city) {
    throw new HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
  }

  await assertHouseholdMember(request.auth.uid, householdId);

  const lockAt = await getLockAt();
  if (isLocked(lockAt)) {
    throw new HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
  }

  const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
  if (!draftSnap.exists) {
    throw new HttpsError('failed-precondition', 'No box draft found. Complete onboarding first.');
  }
  const draft = draftSnap.data()!;
  const lineItems = (draft.lineItems as Array<Record<string, unknown>>) ?? [];
  const subtotalCents = orderTotalCents(lineItems as Array<{ unitCents?: number; quantity?: number; slotId?: string }>);
  const shippingCents = SHIPPING_FLAT_CENTS;
  const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
  const totalCents = subtotalCents + shippingCents + taxCents;
  if (totalCents < 50) {
    throw new HttpsError('invalid-argument', 'Order total is too small.');
  }

  const configSnap = await db.doc('config/hanukkah-2026').get();
  const estimatedDelivery = (configSnap.data()?.estimatedDeliveryBy as string) ?? '2026-12-07';

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
    createdAt: FieldValue.serverTimestamp(),
  });

  const paymentIntent = await stripe.paymentIntents.create({
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

export const stripeWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  const sig = req.headers['stripe-signature'] as string | undefined;
  const rawBody = (req as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  if (!sig) {
    res.status(400).send('Missing stripe-signature');
    return;
  }

  let event;
  try {
    event = verifyWebhook(rawBody, sig);
  } catch (err) {
    logger.error('Webhook verify failed', err);
    res.status(400).send('Webhook Error');
    return;
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as { id: string; metadata?: Record<string, string> };
      const householdId = pi.metadata?.householdId;
      const orderId = pi.metadata?.orderId;
      if (!householdId || !orderId) {
        logger.warn('payment_intent.succeeded missing metadata', pi.metadata);
      } else {
        const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
        const orderSnap = await orderRef.get();
        if (orderSnap.exists && orderSnap.data()?.status !== 'confirmed') {
          await orderRef.update({
            status: 'confirmed',
            confirmedAt: FieldValue.serverTimestamp(),
          });
          const order = orderSnap.data()!;
          const userId = order.userId as string;
          const userSnap = await db.doc(`users/${userId}`).get();
          const email = (userSnap.data()?.email as string) ?? '';
          if (email) {
            try {
              await sendEmail({
                to: email,
                template: 'order-confirmed',
                data: {
                  orderId,
                  totalCents: order.totalCents,
                  estimatedDelivery: order.estimatedDelivery,
                },
              });
            } catch (emailErr) {
              logger.error('Order confirmation email failed', emailErr);
            }
          }
        }
      }
    }
    res.json({ received: true });
  } catch (err) {
    logger.error('Webhook handler error', err);
    res.status(500).send('Webhook handler failed');
  }
});

export const createPartnerInvite = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const householdId = String(request.data?.householdId ?? '');
  const email = String(request.data?.email ?? '').trim().toLowerCase();
  const invitedByName = String(request.data?.invitedByName ?? 'Partner');
  if (!householdId || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'householdId and a valid email are required.');
  }

  await assertHouseholdMember(request.auth.uid, householdId);
  const hhSnap = await db.doc(`households/${householdId}`).get();
  if (!hhSnap.exists) throw new HttpsError('not-found', 'Household not found.');
  const householdName = String(hhSnap.data()?.name ?? 'Our household');

  const inviteRef = db.collection(`households/${householdId}/partnerInvites`).doc();
  const payload: PartnerInviteRecord = {
    householdId,
    householdName,
    invitedEmail: email,
    invitedByUid: request.auth.uid,
    invitedByName,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await inviteRef.set(payload);

  await sendEmail({
    to: email,
    template: 'partner-invite',
    data: {
      householdName,
      invitedByName,
      inviteId: inviteRef.id,
    },
  }).catch((err) => logger.error('Partner invite email failed', err));

  return { id: inviteRef.id, ...payload };
});

export const listPartnerInvites = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const householdId = String(request.data?.householdId ?? '');
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId is required.');
  await assertHouseholdMember(request.auth.uid, householdId);

  const snap = await db.collection(`households/${householdId}/partnerInvites`).orderBy('createdAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as PartnerInviteRecord) }));
});

export const acceptPartnerInvite = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const inviteId = String(request.data?.inviteId ?? '');
  if (!inviteId) throw new HttpsError('invalid-argument', 'inviteId is required.');

  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  const userEmail = String(userSnap.data()?.email ?? '').trim().toLowerCase();
  if (!userEmail) throw new HttpsError('failed-precondition', 'Account email is missing.');

  const groups = await db.collectionGroup('partnerInvites').where('invitedEmail', '==', userEmail).where('status', '==', 'pending').get();
  const inviteDoc = groups.docs.find((d) => d.id === inviteId);
  if (!inviteDoc) throw new HttpsError('not-found', 'Invite not found.');
  const invite = inviteDoc.data() as PartnerInviteRecord;

  await db.doc(`households/${invite.householdId}`).update({
    memberIds: FieldValue.arrayUnion(request.auth.uid),
    updatedAt: new Date().toISOString(),
  });
  await db.doc(`users/${request.auth.uid}`).set(
    { householdId: invite.householdId, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  await inviteDoc.ref.update({
    status: 'accepted',
    acceptedByUid: request.auth.uid,
  });
  return { ok: true };
});
