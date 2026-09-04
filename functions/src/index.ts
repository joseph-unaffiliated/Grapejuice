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
import { finalizeGiftInvitePayment, resolveGiftInviteKind, type GiftInviteRecord } from './giftPayment';
import { runDebriefReminderBatch } from './debriefReminders';
import { runLockReminderBatch } from './lockReminders';
import {
  assertCatalogSyncSecret,
  runAirtableCatalogReplaceSync,
} from './airtableCatalogSync';
import {
  chargePilotBoxOrderForUser,
  fulfillHanukkahBoxOrder,
  runChargeEligiblePilotBoxOrders,
} from './chargePilotBox';
import { randomBytes } from 'crypto';

export { askPilotRav, scanBeamAgeTriggers };
export { sendWelcomeOnSignup } from './welcome';

initializeApp();
const db = getFirestore();

const HOLIDAY_ID = 'hanukkah-2026';
const DEFAULT_BOX_PRICE_CENTS = 8000;
const SHIPPING_FLAT_CENTS = 0;
const EXPEDITED_SHIPPING_CENTS = 1500;
const CHECKOUT_TAX_RATE = 0.075;
const DEFAULT_GIFT_CREDIT_CENTS = 8000;

function isValidEmail(raw: string): boolean {
  const email = raw.trim();
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function chargeableLineTotal(lineItems: Array<{ unitCents?: number; quantity?: number }>): number {
  return lineItems.reduce((s, li) => s + (li.unitCents ?? 0) * (li.quantity ?? 1), 0);
}

/** Recipient owes only add-on value above what the giver already prepaid. */
function recipientGiftUpgradeCents(
  lineItems: Array<{ unitCents?: number; quantity?: number }>,
  prepaidAddOnCents: number
): number {
  return Math.max(0, chargeableLineTotal(lineItems) - Math.max(0, prepaidAddOnCents));
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
  /** Visitor playthrough: marks order as playthrough (no warehouse export at charge time). */
  skipShipStation?: boolean;
}

interface CreatePilotSetupIntentData {
  householdId: string;
}

interface CreateMarketplaceCheckoutData {
  householdId: string;
  shippingAddress: ShippingAddress;
  lineItems: Array<{ itemId: string; quantity?: number }>;
  skipShipStation?: boolean;
}

type MarketplaceLineItem = {
  slotId: string;
  itemId: string;
  quantity: number;
  unitCents: number;
  label: string;
};

/** Firestore rejects undefined field values — strip them before writes. */
function sanitizeShippingAddress(raw: ShippingAddress): ShippingAddress {
  const country = raw.country === 'CA' || raw.country === 'OTHER' ? raw.country : 'US';
  const cleaned: ShippingAddress = {
    name: String(raw.name ?? '').trim(),
    line1: String(raw.line1 ?? '').trim(),
    city: String(raw.city ?? '').trim(),
    stateProvince: String(raw.stateProvince ?? '').trim(),
    postalCode: String(raw.postalCode ?? '').trim(),
    country,
  };
  const line2 = String(raw.line2 ?? '').trim();
  if (line2) cleaned.line2 = line2;
  return cleaned;
}

function catalogCents(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return 0;
}

async function resolveMarketplaceLineItems(
  raw: Array<{ itemId: string; quantity?: number }>
): Promise<MarketplaceLineItem[]> {
  if (!raw.length) {
    throw new HttpsError('invalid-argument', 'Cart is empty.');
  }
  const normalized: MarketplaceLineItem[] = [];
  for (const li of raw) {
    const itemId = String(li.itemId ?? '').trim();
    if (!itemId) {
      throw new HttpsError('invalid-argument', 'Each line item needs an itemId.');
    }
    const snap = await db.doc(`catalog/hanukkah/items/${itemId}`).get();
    if (!snap.exists) {
      throw new HttpsError('invalid-argument', `Unknown product: ${itemId}`);
    }
    const cat = snap.data() ?? {};
    const unitCents =
      catalogCents(cat.nonMemberPriceCents) ||
      catalogCents(cat.dollarCostCents) ||
      catalogCents(cat.memberPriceCents);
    if (unitCents <= 0) {
      throw new HttpsError('invalid-argument', `Product is not available à la carte: ${itemId}`);
    }
    normalized.push({
      slotId: String(cat.slotId ?? 'addon'),
      itemId,
      quantity: Math.max(1, Math.floor(Number(li.quantity) || 1)),
      unitCents,
      label: String(cat.name ?? itemId),
    });
  }
  return normalized;
}

async function fulfillMarketplaceOrder(
  householdId: string,
  orderId: string,
  order: Record<string, unknown>,
  skipShipStation?: boolean
): Promise<void> {
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
      logger.error('Marketplace order confirmation email failed', emailErr);
    }
  }
  if (skipShipStation === true) {
    logger.info('ShipStation export skipped (visitor playthrough)', { orderId });
    return;
  }
  try {
    await exportOrderToShipStation({
      orderId,
      householdId,
      shippingAddress: order.shippingAddress as Record<string, unknown>,
      lineItems: (order.lineItems as MarketplaceLineItem[]) ?? [],
      totalCents: (order.totalCents as number) ?? 0,
    });
  } catch (shipErr) {
    logger.error('Marketplace ShipStation export failed', shipErr);
  }
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

/** Immediate checkout for à la carte marketplace cart — no box base price. */
export const createMarketplaceCheckout = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  try {
    const data = (request.data ?? {}) as CreateMarketplaceCheckoutData;
    const householdId = data.householdId;
    if (!householdId || !data.shippingAddress?.line1 || !data.shippingAddress?.city) {
      throw new HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
    }
    const shippingAddress = sanitizeShippingAddress(data.shippingAddress);
    if (!shippingAddress.name || !shippingAddress.stateProvince || !shippingAddress.postalCode) {
      throw new HttpsError(
        'invalid-argument',
        'Please enter name, street, city, state/province, and postal code.'
      );
    }

    const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
    const hhData = hhSnap.data() ?? {};
    const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
    const platformCreditCents =
      typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;

    const lineItems = await resolveMarketplaceLineItems(data.lineItems ?? []);
    const subtotalCents = chargeableLineTotal(lineItems);
    if (subtotalCents < 1) {
      throw new HttpsError('invalid-argument', 'Cart total is too small.');
    }

    const shippingCents = SHIPPING_FLAT_CENTS;
    const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
    let preCreditTotal = subtotalCents + shippingCents + taxCents;
    const giftCreditApplied = Math.min(giftCreditCents, preCreditTotal);
    preCreditTotal -= giftCreditApplied;
    const platformCreditApplied = Math.min(platformCreditCents, preCreditTotal);
    const totalCents = preCreditTotal - platformCreditApplied;
    const creditApplied = giftCreditApplied + platformCreditApplied;

    if (totalCents > 0 && totalCents < 50) {
      throw new HttpsError('invalid-argument', 'Order total is too small.');
    }

    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = configSnap.data() ?? {};
    const estimatedDelivery = (configData.estimatedDeliveryBy as string) ?? '2026-11-21';

    const orderRef = db.collection(`households/${householdId}/orders`).doc();
    const skipShipStation = data.skipShipStation === true;
    const orderPayload: Record<string, unknown> = {
      status: totalCents === 0 ? 'confirmed' : 'pending',
      orderType: 'marketplace',
      lineItems,
      subtotalCents,
      shippingCents,
      taxCents,
      totalCents,
      creditAppliedCents: creditApplied,
      giftCreditAppliedCents: giftCreditApplied,
      platformCreditAppliedCents: platformCreditApplied,
      shippingAddress,
      holidayId: HOLIDAY_ID,
      userId: request.auth.uid,
      estimatedDelivery,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (totalCents === 0) orderPayload.confirmedAt = FieldValue.serverTimestamp();
    if (skipShipStation) orderPayload.playthrough = true;

    await orderRef.set(orderPayload);

    if (creditApplied > 0) {
      await db.doc(`households/${householdId}`).update({
        ...(giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {}),
        ...(platformCreditApplied > 0
          ? { platformCreditCents: platformCreditCents - platformCreditApplied }
          : {}),
        updatedAt: new Date().toISOString(),
      });
    }

    // Fully credit-covered carts confirm without Stripe.
    if (totalCents === 0) {
      await fulfillMarketplaceOrder(householdId, orderRef.id, orderPayload, skipShipStation);
      return {
        orderId: orderRef.id,
        totalCents: 0,
        clientSecret: null as string | null,
        status: 'confirmed' as const,
      };
    }

    if (!stripe) {
      throw new HttpsError(
        'failed-precondition',
        'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.'
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      metadata: {
        householdId,
        orderId: orderRef.id,
        userId: request.auth.uid,
        type: 'marketplace',
      },
      automatic_payment_methods: { enabled: true },
    });

    if (!paymentIntent.client_secret) {
      throw new HttpsError('internal', 'PaymentIntent missing client secret.');
    }

    await orderRef.update({ stripePaymentIntentId: paymentIntent.id });

    return {
      clientSecret: paymentIntent.client_secret,
      orderId: orderRef.id,
      totalCents,
      status: 'pending' as const,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('createMarketplaceCheckout failed', { err, message: msg });
    throw new HttpsError('internal', msg || 'Checkout failed. Please try again.');
  }
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

/**
 * Save card (SetupIntent, before this call) + commit address/shipping tier.
 * No PaymentIntent here — one off-session charge at lock/ship (see charge-once-at-ship).
 */
export const commitPilotBox = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
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
    orderType: 'hanukkah_box',
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
    ...(data.skipShipStation === true ? { playthrough: true } : {}),
  });

  if (giftCreditApplied > 0 || platformCreditApplied > 0) {
    await db.doc(`households/${householdId}`).update({
      ...(giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {}),
      ...(platformCreditApplied > 0 ? { platformCreditCents: platformCreditCents - platformCreditApplied } : {}),
      updatedAt: new Date().toISOString(),
    });
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

/**
 * Sync the household box draft onto a pre-ship committed order (swaps / add-ons
 * after commit). Recalculates merchandise + tax; keeps shipping address,
 * expedited flag, and already-applied credits from the order.
 */
export const updatePilotBoxOrder = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const householdId = request.data?.householdId as string | undefined;
  const orderId = request.data?.orderId as string | undefined;
  if (!householdId || !orderId) {
    throw new HttpsError('invalid-argument', 'householdId and orderId are required.');
  }

  await assertHouseholdMember(request.auth.uid, householdId);
  const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError('not-found', 'Order not found.');
  }

  const order = orderSnap.data() ?? {};
  const status = order.status as string;
  if (status !== 'committed' && status !== 'pending') {
    throw new HttpsError(
      'failed-precondition',
      'This order can no longer be updated. Contact support if you need changes.'
    );
  }

  const lockAt =
    (typeof order.lockAt === 'string' ? order.lockAt : null) ??
    (await getLockAt(order.expeditedShipping === true));
  if (isLocked(lockAt)) {
    throw new HttpsError(
      'failed-precondition',
      'The box lock date has passed. Contact support to change your order.'
    );
  }

  const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
  if (!draftSnap.exists) {
    throw new HttpsError('failed-precondition', 'No box draft found.');
  }
  const lineItems = (draftSnap.data()?.lineItems as Array<Record<string, unknown>>) ?? [];
  if (!lineItems.length) {
    throw new HttpsError('failed-precondition', 'Your box is empty. Add items before updating the order.');
  }

  const configSnap = await db.doc('config/hanukkah-2026').get();
  const configData = configSnap.data() ?? {};
  const boxPriceCents =
    typeof configData.boxPriceCents === 'number' ? configData.boxPriceCents : DEFAULT_BOX_PRICE_CENTS;
  const expeditedShipping = order.expeditedShipping === true;
  const subtotalCents = orderTotalCents(
    lineItems as Array<{ unitCents?: number; quantity?: number; slotId?: string }>,
    boxPriceCents
  );
  const shippingCents =
    typeof order.shippingCents === 'number'
      ? order.shippingCents
      : SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
  const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
  const giftCreditApplied =
    typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
  const platformCreditApplied =
    typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
  const creditApplied = giftCreditApplied + platformCreditApplied;
  const totalCents = Math.max(0, subtotalCents + shippingCents + taxCents - creditApplied);

  const previousTotal =
    typeof order.totalCents === 'number' ? order.totalCents : 0;

  await orderRef.update({
    lineItems,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents,
    creditAppliedCents: creditApplied,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    orderId,
    totalCents,
    previousTotalCents: previousTotal,
    deltaCents: totalCents - previousTotal,
    status: status as 'committed' | 'pending',
  };
});

/** Void a pre-ship committed/pending order; restore credits; keep card on file. */
export const cancelPilotBoxOrder = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const householdId = request.data?.householdId as string | undefined;
  const orderId = request.data?.orderId as string | undefined;
  if (!householdId || !orderId) {
    throw new HttpsError('invalid-argument', 'householdId and orderId are required.');
  }

  await assertHouseholdMember(request.auth.uid, householdId);
  const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError('not-found', 'Order not found.');
  }

  const order = orderSnap.data() ?? {};
  const status = order.status as string;
  if (status !== 'committed' && status !== 'pending') {
    if (status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'This order is already cancelled.');
    }
    if (status === 'shipped' || status === 'delivered') {
      throw new HttpsError('failed-precondition', 'This box has already shipped. Contact support for help.');
    }
    throw new HttpsError(
      'failed-precondition',
      'This order can no longer be cancelled in the app. Contact support.'
    );
  }

  const piId = typeof order.stripePaymentIntentId === 'string' ? order.stripePaymentIntentId : undefined;
  if (piId) {
    // Legacy orders: commit used to create a manual-capture PI before charge-at-ship refactor.
    if (!stripe) {
      throw new HttpsError('failed-precondition', 'Stripe is not configured.');
    }
    try {
      await stripe.paymentIntents.cancel(piId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const alreadyCanceled = /already.*(cancel|cancell)/i.test(msg);
      if (!alreadyCanceled) {
        logger.error('Failed to cancel PaymentIntent', { piId, err });
        throw new HttpsError(
          'internal',
          'Could not release the payment hold. Try again or contact support.'
        );
      }
    }
  }

  const giftRestore =
    typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
  const platformRestore =
    typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(orderRef);
    const freshStatus = fresh.data()?.status as string | undefined;
    if (freshStatus !== 'committed' && freshStatus !== 'pending') {
      throw new HttpsError('failed-precondition', 'Order status changed. Refresh and try again.');
    }
    tx.update(orderRef, {
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledByUid: request.auth!.uid,
    });
    if (giftRestore > 0 || platformRestore > 0) {
      tx.update(db.doc(`households/${householdId}`), {
        ...(giftRestore > 0 ? { giftCreditCents: FieldValue.increment(giftRestore) } : {}),
        ...(platformRestore > 0 ? { platformCreditCents: FieldValue.increment(platformRestore) } : {}),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  await db.doc(`users/${request.auth.uid}`).set(
    {
      lockReminderEligible: true,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return { orderId, status: 'cancelled' as const };
});

/**
 * QA / ops: charge one committed Hanukkah box order (normally runs on schedule after lock).
 * Pass force=true to charge before lockAt.
 */
export const chargePilotBoxOrder = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const householdId = String(request.data?.householdId ?? '').trim();
  const orderId = String(request.data?.orderId ?? '').trim();
  const force = request.data?.force === true;
  if (!householdId || !orderId) {
    throw new HttpsError('invalid-argument', 'householdId and orderId are required.');
  }
  return chargePilotBoxOrderForUser(db, stripe, request.auth.uid, householdId, orderId, force);
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
            const order = orderSnap.data()!;
            await orderRef.update({
              status: 'confirmed',
              confirmedAt: FieldValue.serverTimestamp(),
              stripePaymentIntentId: pi.id,
              chargeFailedAt: FieldValue.delete(),
              chargeFailureMessage: FieldValue.delete(),
            });
            const fresh = (await orderRef.get()).data() ?? order;
            if (
              order.orderType === 'marketplace' ||
              order.orderType === 'received_gift' ||
              pi.metadata?.type === 'marketplace' ||
              pi.metadata?.type === 'received_gift'
            ) {
              await fulfillMarketplaceOrder(
                householdId,
                orderId,
                { ...fresh, totalCents: fresh.totalCents },
                fresh.playthrough === true
              );
              const giftInviteId =
                (typeof fresh.giftInviteId === 'string' && fresh.giftInviteId) ||
                pi.metadata?.giftInviteId;
              if (
                giftInviteId &&
                (fresh.orderType === 'received_gift' || pi.metadata?.type === 'received_gift')
              ) {
                const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
                const giftSnap = await giftRef.get();
                if (giftSnap.exists && giftSnap.data()?.status === 'available') {
                  await giftRef.update({
                    status: 'accepted',
                    acceptedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  });
                }
              }
            } else if (
              giftType === 'hanukkah_box' ||
              order.orderType === 'hanukkah_box' ||
              order.holidayId === HOLIDAY_ID
            ) {
              await fulfillHanukkahBoxOrder(db, householdId, orderId, fresh);
            } else {
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
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as {
        id: string;
        metadata?: Record<string, string>;
        last_payment_error?: { message?: string };
      };
      if (pi.metadata?.type === 'hanukkah_box') {
        const householdId = pi.metadata.householdId;
        const orderId = pi.metadata.orderId;
        if (householdId && orderId) {
          const message = pi.last_payment_error?.message ?? 'Payment failed';
          await db.doc(`households/${householdId}/orders/${orderId}`).update({
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: message,
          });
          logger.warn('Hanukkah box charge failed', { householdId, orderId, message });
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
  const giftKind = customize ? ('box' as const) : ('credit' as const);
  const lineItems = Array.isArray(request.data?.lineItems) ? request.data.lineItems : undefined;
  const childInterests = Array.isArray(request.data?.childInterests) ? request.data.childInterests : undefined;
  const childAgeGroups = Array.isArray(request.data?.childAgeGroups) ? request.data.childAgeGroups : undefined;

  if (!isValidEmail(recipientEmail)) {
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
    creditCents,
    kind: giftKind,
    claimToken,
    status: 'pending',
    paymentStatus: 'pending',
    ...(message ? { message } : {}),
    ...(giftKind === 'box' && lineItems ? { lineItems } : {}),
    ...(giftKind === 'box' && childInterests ? { childInterests } : {}),
    ...(giftKind === 'box' && childAgeGroups ? { childAgeGroups } : {}),
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
    ...(giverEmail ? { receipt_email: giverEmail } : {}),
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

/** Gifts the signed-in user has purchased (giver side). */
export const listMyGiftInvites = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const userSnap = await db.doc(`users/${uid}`).get();
  const giverEmail = String(userSnap.data()?.email ?? request.auth.token.email ?? '')
    .trim()
    .toLowerCase();

  const byUidSnap = await db.collection('giftInvites').where('giverUid', '==', uid).get();
  const docMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of byUidSnap.docs) {
    docMap.set(doc.id, doc);
  }

  // Fallback: same email, different uid (account re-created) — rare but avoids “missing orders”.
  if (giverEmail.includes('@')) {
    const byEmailSnap = await db
      .collection('giftInvites')
      .where('giverEmail', '==', giverEmail)
      .get();
    for (const doc of byEmailSnap.docs) {
      docMap.set(doc.id, doc);
    }
  }

  const invites = [...docMap.values()]
    .map((doc) => {
      const data = doc.data() as GiftInviteRecord;
      return {
        id: doc.id,
        giverUid: data.giverUid,
        giverName: data.giverName,
        giverEmail: data.giverEmail,
        recipientEmail: data.recipientEmail,
        message: data.message,
        creditCents: data.creditCents,
        claimToken: data.claimToken,
        status: data.status,
        paymentStatus: data.paymentStatus ?? (data.claimEmailSentAt ? 'paid' : 'pending'),
        claimEmailSentAt: data.claimEmailSentAt,
        lineItems: data.lineItems,
        childInterests: data.childInterests,
        createdAt: data.createdAt,
        claimedAt: data.claimedAt,
        claimedByHouseholdId: data.claimedByHouseholdId,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return { invites };
});

/**
 * Public peek — validate a claim link before signup.
 * Returns status only (no PII beyond giver display name).
 */
export const peekGiftInvite = onCall(async (request) => {
  const token = String(request.data?.token ?? '').trim();
  if (!token) throw new HttpsError('invalid-argument', 'token is required.');

  const snap = await db.collection('giftInvites').where('claimToken', '==', token).limit(1).get();
  if (snap.empty) {
    return { status: 'not_found' as const };
  }
  const invite = snap.docs[0].data() as GiftInviteRecord;
  if (invite.status === 'claimed') {
    return {
      status: 'claimed' as const,
      giverName: invite.giverName || undefined,
      creditCents: invite.creditCents,
      giftKind: resolveGiftInviteKind(invite),
    };
  }
  if (invite.paymentStatus === 'pending') {
    return { status: 'unpaid' as const, giverName: invite.giverName || undefined };
  }
  const giftKind = resolveGiftInviteKind(invite);
  return {
    status: 'claimable' as const,
    giverName: invite.giverName || undefined,
    creditCents: invite.creditCents,
    hasGiverDraft: giftKind === 'box',
    giftKind,
  };
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
  const now = new Date().toISOString();
  const giftKind = resolveGiftInviteKind(invite);

  if (!householdId) {
    const hhRef = db.collection('households').doc();
    await hhRef.set({
      name: 'Our household',
      ownerId: request.auth.uid,
      memberIds: [request.auth.uid],
      childUserIds: [],
      giftCreditCents: giftKind === 'credit' ? invite.creditCents : 0,
      createdAt: now,
      updatedAt: now,
    });
    householdId = hhRef.id;
    await db.doc(`users/${request.auth.uid}`).set({ householdId, updatedAt: now }, { merge: true });
  } else if (giftKind === 'credit') {
    const hhRef = db.doc(`households/${householdId}`);
    const hhSnap = await hhRef.get();
    const currentGift =
      typeof hhSnap.data()?.giftCreditCents === 'number' ? hhSnap.data()!.giftCreditCents : 0;
    await hhRef.update({
      giftCreditCents: currentGift + invite.creditCents,
      updatedAt: now,
    });
  }

  // Store on household — never merge into the family's own box draft.
  const boxLines = giftKind === 'box' ? ((invite.lineItems as GiftLineItemInput[]) ?? []) : [];
  const prepaidAddOnCents = giftKind === 'box' ? chargeableLineTotal(boxLines) : 0;
  await db.doc(`households/${householdId}/receivedGifts/${inviteDoc.id}`).set({
    giftInviteId: inviteDoc.id,
    giverName: invite.giverName,
    message: invite.message ?? null,
    kind: giftKind,
    creditCents: invite.creditCents,
    prepaidAddOnCents,
    lineItems: giftKind === 'box' ? invite.lineItems ?? [] : [],
    childInterests: giftKind === 'box' ? invite.childInterests ?? [] : [],
    status: 'available',
    claimedAt: now,
    updatedAt: now,
  });

  await inviteDoc.ref.update({
    status: 'claimed',
    kind: giftKind,
    claimedAt: now,
    claimedByHouseholdId: householdId,
    claimedByUid: request.auth.uid,
  });

  // Claiming a gift is not starting a household Hanukkah box. Only force
  // BoxReveal when they already have their own draft in progress.
  const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
  const ownLineItems = Array.isArray(draftSnap.data()?.lineItems)
    ? (draftSnap.data()!.lineItems as unknown[])
    : [];
  const hasOwnBoxDraft = ownLineItems.length > 0;
  const userUpdates: Record<string, unknown> = {
    onboardingComplete: true,
    updatedAt: now,
  };
  if (!hasOwnBoxDraft) {
    userUpdates.boxRevealComplete = true;
    userUpdates.lockReminderEligible = false;
  }
  await db.doc(`users/${request.auth.uid}`).set(userUpdates, { merge: true });

  return {
    householdId,
    giftInviteId: inviteDoc.id,
    giftKind,
    giftCreditCents: giftKind === 'credit' ? invite.creditCents : 0,
    giverName: invite.giverName,
    message: invite.message,
    hasGiverDraft: giftKind === 'box',
  };
});

type ReceivedGiftRow = {
  id: string;
  giftInviteId: string;
  giverName: string;
  message?: string;
  kind: 'credit' | 'box';
  creditCents: number;
  prepaidAddOnCents?: number;
  lineItems: unknown[];
  status: string;
  claimedAt: string;
  viewedAt?: string;
  convertedAt?: string;
  acceptedAt?: string;
  checkoutOrderId?: string;
};

function mapReceivedGiftDoc(docId: string, data: FirebaseFirestore.DocumentData): ReceivedGiftRow {
  return {
    id: docId,
    giftInviteId: String(data.giftInviteId ?? docId),
    giverName: String(data.giverName ?? ''),
    message: typeof data.message === 'string' ? data.message : undefined,
    kind: data.kind === 'box' ? 'box' : 'credit',
    creditCents: Number(data.creditCents ?? 0),
    prepaidAddOnCents:
      data.prepaidAddOnCents != null && Number.isFinite(Number(data.prepaidAddOnCents))
        ? Math.max(0, Math.round(Number(data.prepaidAddOnCents)))
        : undefined,
    lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
    status: String(data.status ?? 'available'),
    claimedAt: String(data.claimedAt ?? ''),
    viewedAt: data.viewedAt ? String(data.viewedAt) : undefined,
    convertedAt: data.convertedAt ? String(data.convertedAt) : undefined,
    acceptedAt: data.acceptedAt ? String(data.acceptedAt) : undefined,
    checkoutOrderId: data.checkoutOrderId ? String(data.checkoutOrderId) : undefined,
  };
}

async function backfillReceivedGiftFromInvite(
  householdId: string,
  inviteId: string,
  invite: GiftInviteRecord
): Promise<ReceivedGiftRow> {
  const now = new Date().toISOString();
  const giftKind = resolveGiftInviteKind(invite);
  const boxLines = giftKind === 'box' ? ((invite.lineItems as GiftLineItemInput[]) ?? []) : [];
  const record = {
    giftInviteId: inviteId,
    giverName: invite.giverName,
    message: invite.message ?? null,
    kind: giftKind,
    creditCents: invite.creditCents,
    prepaidAddOnCents: giftKind === 'box' ? chargeableLineTotal(boxLines) : 0,
    lineItems: giftKind === 'box' ? invite.lineItems ?? [] : [],
    childInterests: giftKind === 'box' ? invite.childInterests ?? [] : [],
    status: 'available',
    claimedAt: invite.claimedAt ?? now,
    updatedAt: now,
  };
  await db.doc(`households/${householdId}/receivedGifts/${inviteId}`).set(record, { merge: true });
  return mapReceivedGiftDoc(inviteId, record);
}

async function loadReceivedGiftsForHousehold(householdId: string): Promise<ReceivedGiftRow[]> {
  const snap = await db.collection(`households/${householdId}/receivedGifts`).get();
  const giftsMap = new Map<string, ReceivedGiftRow>();
  for (const doc of snap.docs) {
    giftsMap.set(doc.id, mapReceivedGiftDoc(doc.id, doc.data()));
  }

  const inviteSnap = await db
    .collection('giftInvites')
    .where('claimedByHouseholdId', '==', householdId)
    .get();
  for (const doc of inviteSnap.docs) {
    const invite = doc.data() as GiftInviteRecord;
    if (invite.status !== 'claimed') continue;
    if (giftsMap.has(doc.id)) continue;
    giftsMap.set(doc.id, await backfillReceivedGiftFromInvite(householdId, doc.id, invite));
  }

  return [...giftsMap.values()].sort((a, b) => Date.parse(b.claimedAt) - Date.parse(a.claimedAt));
}

async function ensureReceivedGiftDoc(
  householdId: string,
  giftInviteId: string
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
  const giftSnap = await giftRef.get();
  if (giftSnap.exists) return giftSnap;

  const inviteSnap = await db.doc(`giftInvites/${giftInviteId}`).get();
  if (!inviteSnap.exists) throw new HttpsError('not-found', 'Gift not found.');
  const invite = inviteSnap.data() as GiftInviteRecord;
  if (invite.claimedByHouseholdId !== householdId || invite.status !== 'claimed') {
    throw new HttpsError('not-found', 'Gift not found.');
  }
  await backfillReceivedGiftFromInvite(householdId, giftInviteId, invite);
  return giftRef.get();
}

/** Gifts this household has claimed (recipient side). */
export const listMyReceivedGifts = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  const householdId = userSnap.data()?.householdId as string | undefined;
  if (!householdId) return { gifts: [] as unknown[] };
  await assertHouseholdMember(request.auth.uid, householdId);
  const gifts = await loadReceivedGiftsForHousehold(householdId);
  return { gifts };
});

/** Mark a received gift box as viewed (does not accept or convert). */
export const markReceivedGiftViewed = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const giftInviteId = String(request.data?.giftInviteId ?? '').trim();
  if (!giftInviteId) throw new HttpsError('invalid-argument', 'giftInviteId is required.');

  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  const householdId = userSnap.data()?.householdId as string | undefined;
  if (!householdId) throw new HttpsError('failed-precondition', 'No household.');
  await assertHouseholdMember(request.auth.uid, householdId);

  const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
  await ensureReceivedGiftDoc(householdId, giftInviteId);
  const now = new Date().toISOString();
  await giftRef.set({ viewedAt: now, updatedAt: now }, { merge: true });
  return { ok: true };
});

type GiftLineItemInput = {
  slotId?: string;
  itemId?: string;
  quantity?: number;
  unitCents?: number;
  label?: string;
};

function normalizeGiftLineItems(raw: GiftLineItemInput[]): MarketplaceLineItem[] {
  if (!Array.isArray(raw) || !raw.length) {
    throw new HttpsError('invalid-argument', 'lineItems are required.');
  }
  return raw.map((li, i) => {
    const itemId = String(li.itemId ?? '').trim();
    if (!itemId) throw new HttpsError('invalid-argument', `lineItems[${i}].itemId is required.`);
    return {
      slotId: String(li.slotId ?? 'addon'),
      itemId,
      quantity: Math.max(1, Math.floor(Number(li.quantity) || 1)),
      unitCents: Math.max(0, Math.round(Number(li.unitCents) || 0)),
      label: String(li.label ?? itemId),
    };
  });
}

/** Persist curated / add-on line items on a received gift box (status must stay available). */
export const updateReceivedGiftLineItems = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const giftInviteId = String(request.data?.giftInviteId ?? '').trim();
  if (!giftInviteId) throw new HttpsError('invalid-argument', 'giftInviteId is required.');

  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  const householdId = userSnap.data()?.householdId as string | undefined;
  if (!householdId) throw new HttpsError('failed-precondition', 'No household.');
  await assertHouseholdMember(request.auth.uid, householdId);

  const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
  const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
  const gift = giftSnap.data() ?? {};
  if (gift.kind !== 'box') {
    throw new HttpsError('failed-precondition', 'Only gift boxes can be edited.');
  }
  if (gift.status !== 'available') {
    throw new HttpsError('failed-precondition', 'This gift can no longer be edited.');
  }

  const lineItems = normalizeGiftLineItems(
    (Array.isArray(request.data?.lineItems) ? request.data.lineItems : []) as GiftLineItemInput[]
  );
  const now = new Date().toISOString();
  const existingLines = (gift.lineItems as GiftLineItemInput[]) ?? [];
  const prepaidAddOnCents =
    typeof gift.prepaidAddOnCents === 'number' && Number.isFinite(gift.prepaidAddOnCents)
      ? Math.max(0, Math.round(gift.prepaidAddOnCents))
      : chargeableLineTotal(existingLines);
  await giftRef.update({
    lineItems,
    prepaidAddOnCents,
    viewedAt: gift.viewedAt ?? now,
    updatedAt: now,
  });
  return { ok: true, lineItems };
});

/**
 * Checkout paid add-ons on a received gift box (giver already paid the box base).
 * Applies household gift/platform credit; charges remainder via PaymentIntent.
 */
export const createReceivedGiftCheckout = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  try {
    const giftInviteId = String(request.data?.giftInviteId ?? '').trim();
    const shippingAddressRaw = request.data?.shippingAddress as ShippingAddress | undefined;
    if (!giftInviteId || !shippingAddressRaw?.line1 || !shippingAddressRaw?.city) {
      throw new HttpsError('invalid-argument', 'giftInviteId and shippingAddress are required.');
    }
    const shippingAddress = sanitizeShippingAddress(shippingAddressRaw);
    if (!shippingAddress.name || !shippingAddress.stateProvince || !shippingAddress.postalCode) {
      throw new HttpsError(
        'invalid-argument',
        'Please enter name, street, city, state/province, and postal code.'
      );
    }

    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = userSnap.data()?.householdId as string | undefined;
    if (!householdId) throw new HttpsError('failed-precondition', 'No household.');
    const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
    const hhData = hhSnap.data() ?? {};
    const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
    const platformCreditCents =
      typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;

    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = giftSnap.data() ?? {};
    if (gift.kind !== 'box') {
      throw new HttpsError('failed-precondition', 'Only gift boxes can be checked out.');
    }
    if (gift.status !== 'available') {
      throw new HttpsError('failed-precondition', 'This gift was already used or converted.');
    }

    const lineItems =
      Array.isArray(request.data?.lineItems) && request.data.lineItems.length
        ? normalizeGiftLineItems(request.data.lineItems as GiftLineItemInput[])
        : normalizeGiftLineItems((gift.lineItems as GiftLineItemInput[]) ?? []);

    const prepaidAddOnCents =
      typeof gift.prepaidAddOnCents === 'number' && Number.isFinite(gift.prepaidAddOnCents)
        ? Math.max(0, Math.round(gift.prepaidAddOnCents))
        : chargeableLineTotal((gift.lineItems as GiftLineItemInput[]) ?? []);
    // Persist snapshot if missing so later edits don't rewrite the baseline.
    if (gift.prepaidAddOnCents == null) {
      await giftRef.set({ prepaidAddOnCents }, { merge: true });
    }
    // Giver already paid prepaidAddOnCents — recipient only pays upgrades above that.
    const subtotalCents = recipientGiftUpgradeCents(lineItems, prepaidAddOnCents);
    const shippingCents = SHIPPING_FLAT_CENTS;
    const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
    let preCreditTotal = subtotalCents + shippingCents + taxCents;
    const giftCreditApplied = Math.min(giftCreditCents, preCreditTotal);
    preCreditTotal -= giftCreditApplied;
    const platformCreditApplied = Math.min(platformCreditCents, preCreditTotal);
    const totalCents = preCreditTotal - platformCreditApplied;
    const creditApplied = giftCreditApplied + platformCreditApplied;

    if (totalCents > 0 && totalCents < 50) {
      throw new HttpsError('invalid-argument', 'Order total is too small.');
    }

    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = configSnap.data() ?? {};
    const estimatedDelivery = (configData.estimatedDeliveryBy as string) ?? '2026-11-21';
    const skipShipStation = request.data?.skipShipStation === true;

    const orderRef = db.collection(`households/${householdId}/orders`).doc();
    const now = new Date().toISOString();
    const orderPayload: Record<string, unknown> = {
      status: totalCents === 0 ? 'confirmed' : 'pending',
      orderType: 'received_gift',
      giftInviteId,
      lineItems,
      subtotalCents,
      shippingCents,
      taxCents,
      totalCents,
      creditAppliedCents: creditApplied,
      giftCreditAppliedCents: giftCreditApplied,
      platformCreditAppliedCents: platformCreditApplied,
      shippingAddress,
      holidayId: HOLIDAY_ID,
      userId: request.auth.uid,
      estimatedDelivery,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (totalCents === 0) orderPayload.confirmedAt = FieldValue.serverTimestamp();
    if (skipShipStation) orderPayload.playthrough = true;
    await orderRef.set(orderPayload);

    await giftRef.update({
      lineItems,
      viewedAt: gift.viewedAt ?? now,
      updatedAt: now,
      checkoutOrderId: orderRef.id,
    });

    if (creditApplied > 0) {
      await db.doc(`households/${householdId}`).update({
        ...(giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {}),
        ...(platformCreditApplied > 0
          ? { platformCreditCents: platformCreditCents - platformCreditApplied }
          : {}),
        updatedAt: new Date().toISOString(),
      });
    }

    // Credit-covered orders skip Stripe entirely (same as marketplace $0 path).
    if (totalCents === 0) {
      await giftRef.update({
        status: 'accepted',
        acceptedAt: now,
        updatedAt: now,
      });
      await fulfillMarketplaceOrder(householdId, orderRef.id, orderPayload, skipShipStation);
      return {
        orderId: orderRef.id,
        totalCents: 0,
        clientSecret: null as string | null,
        status: 'confirmed' as const,
      };
    }

    if (!stripe) {
      throw new HttpsError(
        'failed-precondition',
        'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.'
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      metadata: {
        householdId,
        orderId: orderRef.id,
        userId: request.auth.uid,
        type: 'received_gift',
        giftInviteId,
      },
      automatic_payment_methods: { enabled: true },
    });

    if (!paymentIntent.client_secret) {
      throw new HttpsError('internal', 'PaymentIntent missing client secret.');
    }

    await orderRef.update({ stripePaymentIntentId: paymentIntent.id });

    return {
      clientSecret: paymentIntent.client_secret,
      orderId: orderRef.id,
      totalCents,
      status: 'pending' as const,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('createReceivedGiftCheckout failed', { err, message: msg });
    throw new HttpsError('internal', msg || 'Checkout failed. Please try again.');
  }
});

/** Convert a received gift box to spendable gift credit after viewing items. */
export const convertReceivedGiftToCredit = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const giftInviteId = String(request.data?.giftInviteId ?? '').trim();
  if (!giftInviteId) throw new HttpsError('invalid-argument', 'giftInviteId is required.');

  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  const householdId = userSnap.data()?.householdId as string | undefined;
  if (!householdId) throw new HttpsError('failed-precondition', 'No household.');
  await assertHouseholdMember(request.auth.uid, householdId);

  const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
  const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
  const gift = giftSnap.data() as {
    kind?: string;
    status?: string;
    creditCents?: number;
  };
  if (gift.kind !== 'box') {
    throw new HttpsError('failed-precondition', 'Only gift boxes can be converted to credit.');
  }
  if (gift.status !== 'available') {
    throw new HttpsError('failed-precondition', 'This gift was already used or converted.');
  }

  const creditCents = typeof gift.creditCents === 'number' ? gift.creditCents : DEFAULT_GIFT_CREDIT_CENTS;
  const now = new Date().toISOString();
  const hhRef = db.doc(`households/${householdId}`);
  const hhSnap = await hhRef.get();
  const currentGift =
    typeof hhSnap.data()?.giftCreditCents === 'number' ? hhSnap.data()!.giftCreditCents : 0;

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(giftRef);
    if (!fresh.exists || fresh.data()?.status !== 'available') {
      throw new HttpsError('failed-precondition', 'Gift already converted.');
    }
    tx.update(giftRef, { status: 'converted_to_credit', convertedAt: now, updatedAt: now });
    tx.update(hhRef, { giftCreditCents: currentGift + creditCents, updatedAt: now });
  });

  return { ok: true, creditCentsAdded: creditCents };
});

/** Mark a received gift box as accepted (recipient is opening the gift box flow). */
export const acceptReceivedGiftBox = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const giftInviteId = String(request.data?.giftInviteId ?? '').trim();
  if (!giftInviteId) throw new HttpsError('invalid-argument', 'giftInviteId is required.');

  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  const householdId = userSnap.data()?.householdId as string | undefined;
  if (!householdId) throw new HttpsError('failed-precondition', 'No household.');
  await assertHouseholdMember(request.auth.uid, householdId);

  const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
  const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
  const gift = giftSnap.data() as { kind?: string; status?: string };
  if (gift.kind !== 'box') {
    throw new HttpsError('failed-precondition', 'Not a gift box.');
  }
  if (gift.status !== 'available') {
    throw new HttpsError('failed-precondition', 'This gift is no longer available.');
  }

  const now = new Date().toISOString();
  await giftRef.update({ status: 'accepted', acceptedAt: now, updatedAt: now });
  return { ok: true };
});

/**
 * Undo accidental accept (e.g. old “Review” CTA) when no confirmed checkout exists,
 * so the recipient can manage / convert again.
 */
export const reopenReceivedGiftBox = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const giftInviteId = String(request.data?.giftInviteId ?? '').trim();
  if (!giftInviteId) throw new HttpsError('invalid-argument', 'giftInviteId is required.');

  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  const householdId = userSnap.data()?.householdId as string | undefined;
  if (!householdId) throw new HttpsError('failed-precondition', 'No household.');
  await assertHouseholdMember(request.auth.uid, householdId);

  const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
  const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
  const gift = giftSnap.data() ?? {};
  if (gift.kind !== 'box') {
    throw new HttpsError('failed-precondition', 'Not a gift box.');
  }
  if (gift.status !== 'accepted') {
    throw new HttpsError('failed-precondition', 'Only accepted gifts can be reopened.');
  }

  const checkoutOrderId =
    typeof gift.checkoutOrderId === 'string' ? gift.checkoutOrderId.trim() : '';
  if (checkoutOrderId) {
    const orderSnap = await db.doc(`households/${householdId}/orders/${checkoutOrderId}`).get();
    const orderStatus = orderSnap.exists ? String(orderSnap.data()?.status ?? '') : '';
    if (orderStatus === 'confirmed' || orderStatus === 'shipped' || orderStatus === 'delivered') {
      throw new HttpsError(
        'failed-precondition',
        'This gift already has a confirmed order and can’t be reopened.'
      );
    }
  }

  const now = new Date().toISOString();
  await giftRef.update({
    status: 'available',
    acceptedAt: FieldValue.delete(),
    viewedAt: gift.viewedAt ?? now,
    updatedAt: now,
  });
  return { ok: true };
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

/** Charge committed Hanukkah box orders once lockAt has passed (final draft totals). */
export const scheduledChargePilotBoxes = onSchedule('every 1 hours', async () => {
  if (!stripe) {
    logger.warn('scheduledChargePilotBoxes skipped — Stripe not configured');
    return;
  }
  await runChargeEligiblePilotBoxOrders(db, stripe);
});

/**
 * Replace-sync Grapejuice Airtable catalog → Firestore catalog/hanukkah/items.
 * Auth: Authorization: Bearer $CATALOG_SYNC_SECRET
 * Also requires AIRTABLE_PAT (and optional AIRTABLE_BASE_ID).
 */
export const syncAirtableCatalog = onRequest(
  {
    cors: true,
    timeoutSeconds: 300,
    memory: '1GiB',
    // Public URL; auth is Authorization: Bearer $CATALOG_SYNC_SECRET
    invoker: 'public',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).send('Method not allowed');
        return;
      }
      assertCatalogSyncSecret(req.get('Authorization') ?? undefined);
      const result = await runAirtableCatalogReplaceSync();
      logger.info('Airtable catalog sync complete', result);
      res.status(200).json({ ok: true, ...result });
    } catch (e) {
      const status = (e as { status?: number }).status === 401 ? 401 : 500;
      logger.error('Airtable catalog sync failed', e);
      res.status(status).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
);

/** Near-realtime safety net — full replace sync every 5 minutes when PAT is configured. */
export const scheduledAirtableCatalogSync = onSchedule(
  { schedule: 'every 5 minutes', timeoutSeconds: 300, memory: '1GiB' },
  async () => {
    if (!process.env.AIRTABLE_PAT?.trim()) {
      logger.warn('Skipping scheduled catalog sync — AIRTABLE_PAT unset');
      return;
    }
    const result = await runAirtableCatalogReplaceSync();
    logger.info('Scheduled Airtable catalog sync complete', result);
  }
);

/**
 * Attest community eligibility → generate a Hanukkah box discount code and email it.
 * Auth optional (guests can request with email); signed-in users also store code on household.
 */
export const requestBoxDiscountCode = onCall(async (request) => {
  const email = String(request.data?.email ?? '')
    .trim()
    .toLowerCase();
  const attestAllTrue = request.data?.attestAllTrue === true;
  const statements = Array.isArray(request.data?.statements) ? request.data.statements : [];
  if (!email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }
  if (!attestAllTrue) {
    throw new HttpsError('failed-precondition', 'Please attest that all statements are true.');
  }
  const allAffirmed = statements.every(
    (s: { affirmed?: boolean }) => s && s.affirmed === true
  );
  if (!allAffirmed || statements.length < 1) {
    throw new HttpsError('failed-precondition', 'Please confirm each eligibility statement.');
  }

  const code = `GJ70-${randomBytes(3).toString('hex').toUpperCase()}`;
  const uid = request.auth?.uid ?? null;
  let householdId: string | null = null;
  if (uid) {
    const userSnap = await db.doc(`users/${uid}`).get();
    householdId = (userSnap.data()?.householdId as string | undefined) ?? null;
  }

  await db.collection('discountAttestations').add({
    email,
    uid,
    householdId,
    code,
    statements,
    attestAllTrue,
    createdAt: FieldValue.serverTimestamp(),
  });

  if (householdId) {
    await db.doc(`households/${householdId}`).set(
      {
        boxDiscountCode: code,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  try {
    await sendEmail({
      to: email,
      template: 'box-discount',
      data: {
        code,
        boxPrice: '$80',
        boxValue: '$250',
      },
    });
  } catch (e) {
    logger.warn('requestBoxDiscountCode email failed', e);
  }

  return { code };
});
