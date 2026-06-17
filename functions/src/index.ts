import * as logger from 'firebase-functions/logger';
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { stripe, verifyWebhook } from './stripe';
import { sendEmail, sendDebriefReminderEmail } from './email';
import { askPilotRav } from './rav';
import { scanBeamAgeTriggers } from './beamAgeTrigger';
import { exportOrderToShipStation, applyShipStationTracking } from './shipstation';
import { finalizeGiftInvitePayment, type GiftInviteRecord } from './giftPayment';
import { runDebriefReminderBatch } from './debriefReminders';
import { runLockReminderBatch } from './lockReminders';
import { randomBytes } from 'crypto';

export { askPilotRav, scanBeamAgeTriggers };

initializeApp();
const db = getFirestore();

const HOLIDAY_ID = 'hanukkah-2026';
const DEFAULT_BOX_PRICE_CENTS = 5000;
const SHIPPING_FLAT_CENTS = 0;
const EXPEDITED_SHIPPING_CENTS = 1500;
const CHECKOUT_TAX_RATE = 0.075;
const DEFAULT_GIFT_CREDIT_CENTS = 5000;

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
  return subtotal + SHIPPING_FLAT_CENTS;
}

async function assertHouseholdMember(uid: string, householdId: string): Promise<FirebaseFirestore.DocumentSnapshot> {
  const snap = await db.doc(`households/${householdId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Household not found.');
  const memberIds = (snap.data()?.memberIds as string[]) ?? [];
  if (!memberIds.includes(uid)) {
    throw new HttpsError('permission-denied', 'Not a member of this household.');
  }
  return snap;
}

async function getOrCreateStripeCustomer(
  householdId: string,
  uid: string,
  email: string
): Promise<string> {
  const hhRef = db.doc(`households/${householdId}`);
  const hhSnap = await hhRef.get();
  const existing = hhSnap.data()?.stripeCustomerId as string | undefined;
  if (existing) return existing;
  if (!stripe) throw new HttpsError('failed-precondition', 'Stripe is not configured.');
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { householdId, userId: uid },
  });
  await hhRef.update({
    stripeCustomerId: customer.id,
    updatedAt: new Date().toISOString(),
  });
  return customer.id;
}

async function getLockAt(expedited?: boolean): Promise<string | null> {
  const snap = await db.doc('config/hanukkah-2026').get();
  const data = snap.data() ?? {};
  if (expedited && data.expeditedLockAt) {
    return (data.expeditedLockAt as string) ?? null;
  }
  return (data.lockAt as string) ?? null;
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

interface CommitPilotBoxData {
  householdId: string;
  shippingAddress: ShippingAddress;
  expeditedShipping?: boolean;
  contactPhone?: string;
  smsOptIn?: boolean;
}

interface CreatePilotSetupIntentData {
  householdId: string;
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
  const configSnap = await db.doc('config/hanukkah-2026').get();
  const configData = configSnap.data() ?? {};
  const boxPriceCents =
    typeof configData.boxPriceCents === 'number' ? configData.boxPriceCents : DEFAULT_BOX_PRICE_CENTS;
  const subtotalCents = orderTotalCents(
    lineItems as Array<{ unitCents?: number; quantity?: number; slotId?: string }>,
    boxPriceCents
  );
  const shippingCents = SHIPPING_FLAT_CENTS;
  const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
  const totalCents = subtotalCents + shippingCents + taxCents;
  if (totalCents < 50) {
    throw new HttpsError('invalid-argument', 'Order total is too small.');
  }

  const estimatedDelivery = (configData.estimatedDeliveryBy as string) ?? '2026-11-21';

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

export const createPilotSetupIntent = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!stripe) {
    throw new HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
  }

  const data = (request.data ?? {}) as CreatePilotSetupIntentData;
  const householdId = data.householdId;
  if (!householdId) {
    throw new HttpsError('invalid-argument', 'householdId is required.');
  }

  await assertHouseholdMember(request.auth.uid, householdId);

  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  const email = (userSnap.data()?.email as string) ?? '';

  const customerId = await getOrCreateStripeCustomer(householdId, request.auth.uid, email);
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    metadata: {
      householdId,
      userId: request.auth.uid,
    },
  });

  if (!setupIntent.client_secret) {
    throw new HttpsError('internal', 'SetupIntent missing client secret.');
  }

  return { clientSecret: setupIntent.client_secret, customerId };
});

export const commitPilotBox = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!stripe) {
    throw new HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
  }

  const data = (request.data ?? {}) as CommitPilotBoxData;
  const householdId = data.householdId;
  const shippingAddress = data.shippingAddress;
  if (!householdId || !shippingAddress?.line1 || !shippingAddress?.city) {
    throw new HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
  }

  const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
  const hhData = hhSnap.data() ?? {};
  const cardOnFile = !!hhData.cardOnFileAt;
  const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
  const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;

  const lockAt = await getLockAt(data.expeditedShipping === true);
  if (isLocked(lockAt)) {
    throw new HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
  }

  const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
  if (!draftSnap.exists) {
    throw new HttpsError('failed-precondition', 'No box draft found. Complete onboarding first.');
  }
  const draft = draftSnap.data()!;
  const lineItems = (draft.lineItems as Array<Record<string, unknown>>) ?? [];
  const configSnap = await db.doc('config/hanukkah-2026').get();
  const configData = configSnap.data() ?? {};
  const boxPriceCents =
    typeof configData.boxPriceCents === 'number' ? configData.boxPriceCents : DEFAULT_BOX_PRICE_CENTS;
  const expeditedShipping = data.expeditedShipping === true && configData.expeditedShippingEnabled === true;
  const subtotalCents = orderTotalCents(
    lineItems as Array<{ unitCents?: number; quantity?: number; slotId?: string }>,
    boxPriceCents
  );
  const shippingCents = SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
  const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
  let preCreditTotal = subtotalCents + shippingCents + taxCents;
  const giftCreditApplied = Math.min(giftCreditCents, preCreditTotal);
  preCreditTotal -= giftCreditApplied;
  const platformCreditApplied = Math.min(platformCreditCents, preCreditTotal);
  let totalCents = preCreditTotal - platformCreditApplied;
  const creditApplied = giftCreditApplied + platformCreditApplied;

  const totalAvailableCredit = giftCreditCents + platformCreditCents;
  if (!cardOnFile && totalAvailableCredit < boxPriceCents) {
    throw new HttpsError('failed-precondition', 'Save a payment method before committing your box.');
  }
  if (totalCents > 0 && !cardOnFile) {
    throw new HttpsError('failed-precondition', 'Save a payment method for add-ons and shipping.');
  }
  if (totalCents < 0) {
    throw new HttpsError('invalid-argument', 'Order total is invalid.');
  }

  const estimatedDelivery =
    (expeditedShipping ? (configData.expeditedDeliveryBy as string) : (configData.estimatedDeliveryBy as string)) ??
    '2026-11-21';

  const orderRef = db.collection(`households/${householdId}/orders`).doc();
  await orderRef.set({
    status: 'committed',
    lineItems,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents,
    creditAppliedCents: creditApplied,
    giftCreditAppliedCents: giftCreditApplied,
    platformCreditAppliedCents: platformCreditApplied,
    expeditedShipping,
    shippingAddress,
    holidayId: HOLIDAY_ID,
    userId: request.auth.uid,
    lockAt,
    estimatedDelivery,
    committedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });

  if (giftCreditApplied > 0 || platformCreditApplied > 0) {
    await db.doc(`households/${householdId}`).update({
      ...(giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {}),
      ...(platformCreditApplied > 0 ? { platformCreditCents: platformCreditCents - platformCreditApplied } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  if (totalCents > 0 && cardOnFile) {
    const customerId = (hhData.stripeCustomerId as string) ?? '';
    const paymentMethodId = hhData.stripeDefaultPaymentMethodId as string | undefined;
    if (!customerId || !paymentMethodId) {
      throw new HttpsError('failed-precondition', 'Saved card is missing. Re-add your payment method.');
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
      metadata: {
        householdId,
        orderId: orderRef.id,
        userId: request.auth.uid,
        type: 'hanukkah_box',
      },
    });

    await orderRef.update({ stripePaymentIntentId: paymentIntent.id });
  }

  try {
    await exportOrderToShipStation({
      orderId: orderRef.id,
      householdId,
      shippingAddress,
      lineItems,
      totalCents,
      expeditedShipping,
    });
  } catch (shipErr) {
    logger.error('ShipStation export failed', shipErr);
  }

  await db.doc(`users/${request.auth.uid}`).set(
    {
      debriefReminderEligible: true,
      debriefReminderAttempts: 0,
      lockReminderEligible: false,
      ...(data.contactPhone?.trim() ? { phone: data.contactPhone.trim() } : {}),
      ...(data.smsOptIn === true ? { smsOptIn: true } : {}),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return {
    orderId: orderRef.id,
    totalCents,
    status: 'committed' as const,
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
    const eventRef = db.doc(`stripeWebhookEvents/${event.id}`);
    const prior = await eventRef.get();
    if (prior.exists) {
      logger.info('Stripe webhook duplicate skipped', { eventId: event.id, type: event.type });
      res.json({ received: true, duplicate: true });
      return;
    }

    if (event.type === 'setup_intent.succeeded') {
      const si = event.data.object as {
        metadata?: Record<string, string>;
        payment_method?: string | { id?: string };
        customer?: string | { id?: string };
      };
      const householdId = si.metadata?.householdId;
      const paymentMethodId =
        typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id;
      const customerId = typeof si.customer === 'string' ? si.customer : si.customer?.id;
      if (householdId && paymentMethodId) {
        await db.doc(`households/${householdId}`).update({
          cardOnFileAt: new Date().toISOString(),
          stripeDefaultPaymentMethodId: paymentMethodId,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          updatedAt: new Date().toISOString(),
        });
        if (stripe && customerId) {
          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
          });
        }
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as { id: string; metadata?: Record<string, string> };
      const giftType = pi.metadata?.type;

      if (giftType === 'pilot_gift') {
        const giftInviteId = pi.metadata?.giftInviteId;
        if (giftInviteId) {
          try {
            await finalizeGiftInvitePayment(db, giftInviteId);
          } catch (giftErr) {
            logger.error('Gift payment finalization failed', { giftInviteId, giftErr });
          }
        }
      } else {
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
    }
    await eventRef.set({
      type: event.type,
      processedAt: new Date().toISOString(),
    });
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

export const writeOrderTracking = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const householdId = String(request.data?.householdId ?? '');
  const orderId = String(request.data?.orderId ?? '');
  const trackingNumber = String(request.data?.trackingNumber ?? '').trim();
  const carrier = String(request.data?.carrier ?? 'USPS').trim();
  if (!householdId || !orderId || !trackingNumber) {
    throw new HttpsError('invalid-argument', 'householdId, orderId, and trackingNumber are required.');
  }
  await assertHouseholdMember(request.auth.uid, householdId);
  await applyShipStationTracking(db, householdId, orderId, { trackingNumber, carrier });
  return { ok: true };
});

export const purchasePilotGift = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!stripe) throw new HttpsError('failed-precondition', 'Stripe is not configured.');

  const recipientEmail = String(request.data?.recipientEmail ?? '').trim().toLowerCase();
  const giverName = String(request.data?.giverName ?? 'Someone who loves you').trim();
  const message = String(request.data?.message ?? '').trim();
  const creditCents = typeof request.data?.creditCents === 'number' ? request.data.creditCents : DEFAULT_GIFT_CREDIT_CENTS;
  const customize = request.data?.customize === true;
  const lineItems = Array.isArray(request.data?.lineItems) ? request.data.lineItems : undefined;
  const childInterests = Array.isArray(request.data?.childInterests) ? request.data.childInterests : undefined;
  const childAgeGroups = Array.isArray(request.data?.childAgeGroups) ? request.data.childAgeGroups : undefined;

  if (!recipientEmail.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid recipient email is required.');
  }

  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  const giverEmail = String(userSnap.data()?.email ?? '').trim().toLowerCase();
  const claimToken = randomBytes(24).toString('hex');
  const inviteRef = db.collection('giftInvites').doc();
  const payload: GiftInviteRecord = {
    giverUid: request.auth.uid,
    giverName,
    giverEmail,
    recipientEmail,
    message: message || undefined,
    creditCents,
    claimToken,
    status: 'pending',
    paymentStatus: 'pending',
    ...(customize && lineItems ? { lineItems } : {}),
    ...(childInterests ? { childInterests } : {}),
    ...(childAgeGroups ? { childAgeGroups } : {}),
    createdAt: new Date().toISOString(),
  };
  await inviteRef.set(payload);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: creditCents,
    currency: 'usd',
    metadata: {
      type: 'pilot_gift',
      giftInviteId: inviteRef.id,
      giverUid: request.auth.uid,
    },
    receipt_email: giverEmail || undefined,
    automatic_payment_methods: { enabled: true },
  });

  await inviteRef.update({ stripePaymentIntentId: paymentIntent.id });

  const appBase = process.env.PILOT_APP_BASE_URL ?? 'https://app.grapejuice.co';
  const claimUrl = `${appBase}/gift/claim?token=${claimToken}`;

  return {
    giftInviteId: inviteRef.id,
    clientSecret: paymentIntent.client_secret,
    claimToken,
    claimUrl,
  };
});

export const finalizePilotGiftPayment = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const giftInviteId = String(request.data?.giftInviteId ?? '').trim();
  if (!giftInviteId) throw new HttpsError('invalid-argument', 'giftInviteId is required.');

  const inviteSnap = await db.collection('giftInvites').doc(giftInviteId).get();
  if (!inviteSnap.exists) throw new HttpsError('not-found', 'Gift invite not found.');
  const invite = inviteSnap.data() as GiftInviteRecord;
  if (invite.giverUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Only the giver can finalize this gift.');
  }

  try {
    const result = await finalizeGiftInvitePayment(db, giftInviteId);
    return { ok: true, claimUrl: result.claimUrl, alreadyFinalized: result.alreadyFinalized };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment not completed';
    throw new HttpsError('failed-precondition', message);
  }
});

export const claimGiftInvite = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const token = String(request.data?.token ?? '').trim();
  if (!token) throw new HttpsError('invalid-argument', 'token is required.');

  const snap = await db.collection('giftInvites').where('claimToken', '==', token).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', 'Gift invite not found.');
  const inviteDoc = snap.docs[0];
  const invite = inviteDoc.data() as GiftInviteRecord;
  if (invite.status === 'claimed') {
    throw new HttpsError('failed-precondition', 'This gift has already been claimed.');
  }
  if (invite.paymentStatus === 'pending') {
    throw new HttpsError('failed-precondition', 'This gift has not been paid for yet.');
  }

  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  let householdId = userSnap.data()?.householdId as string | undefined;
  if (!householdId) {
    const hhRef = db.collection('households').doc();
    const now = new Date().toISOString();
    await hhRef.set({
      name: 'Our household',
      ownerId: request.auth.uid,
      memberIds: [request.auth.uid],
      childUserIds: [],
      giftCreditCents: invite.creditCents,
      createdAt: now,
      updatedAt: now,
    });
    householdId = hhRef.id;
    await db.doc(`users/${request.auth.uid}`).set({ householdId, updatedAt: now }, { merge: true });
  } else {
    const hhRef = db.doc(`households/${householdId}`);
    const hhSnap = await hhRef.get();
    const currentGift = typeof hhSnap.data()?.giftCreditCents === 'number' ? hhSnap.data()!.giftCreditCents : 0;
    await hhRef.update({
      giftCreditCents: currentGift + invite.creditCents,
      updatedAt: new Date().toISOString(),
    });
  }

  if (invite.lineItems?.length) {
    await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).set(
      {
        holidayId: HOLIDAY_ID,
        lineItems: invite.lineItems,
        childInterests: invite.childInterests ?? [],
        updatedAt: new Date().toISOString(),
        updatedBy: request.auth.uid,
      },
      { merge: true }
    );
  }

  await inviteDoc.ref.update({
    status: 'claimed',
    claimedAt: new Date().toISOString(),
    claimedByHouseholdId: householdId,
    claimedByUid: request.auth.uid,
  });

  await db.doc(`users/${request.auth.uid}`).set(
    {
      onboardingComplete: true,
      boxRevealComplete: false,
      lockReminderEligible: true,
      lockReminderAttempts: 0,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return { householdId, giftCreditCents: invite.creditCents, giverName: invite.giverName, message: invite.message, hasGiverDraft: !!(invite.lineItems?.length) };
});

/** Manual trigger for ops — send debrief reminder to one email. */
export const sendDebriefReminders = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const to = String(request.data?.email ?? '').trim();
  const attempt = request.data?.attempt === 2 ? 2 : 1;
  if (!to.includes('@')) throw new HttpsError('invalid-argument', 'email is required.');
  const claimUrl = `${process.env.PILOT_APP_BASE_URL ?? 'https://app.grapejuice.co'}/?preview=debrief`;
  await sendDebriefReminderEmail({ to, attempt, claimUrl });
  return { ok: true, attempt };
});

/** Daily batch — eligible users who have not completed debrief (up to 2 attempts). */
export const scheduledDebriefReminders = onSchedule('every day 10:00', async () => {
  await runDebriefReminderBatch(db);
});

/** Daily batch — lock countdown for users with uncommitted box drafts. */
export const scheduledLockReminders = onSchedule('every day 09:00', async () => {
  const lockAt = await getLockAt();
  if (!lockAt || isLocked(lockAt)) return;
  await runLockReminderBatch(db, lockAt);
});
