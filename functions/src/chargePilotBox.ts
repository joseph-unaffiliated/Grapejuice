import * as logger from 'firebase-functions/logger';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { exportOrderToShipStation } from './shipstation';
import { sendEmail } from './email';

export const HOLIDAY_ID = 'hanukkah-2026';
export const DEFAULT_BOX_PRICE_CENTS = 8000;
const SHIPPING_FLAT_CENTS = 0;
const EXPEDITED_SHIPPING_CENTS = 1500;
const CHECKOUT_TAX_RATE = 0.075;

/** Credit covers merchandise first. Tax applies only to the unpaid remainder. */
export function checkoutTotalsAfterCredit(
  merchandiseCents: number,
  giftCreditCents: number,
  platformCreditCents: number
): {
  giftCreditApplied: number;
  platformCreditApplied: number;
  creditApplied: number;
  taxCents: number;
  totalCents: number;
} {
  const merchandise = Math.max(0, merchandiseCents);
  const giftCreditApplied = Math.min(Math.max(0, giftCreditCents), merchandise);
  const platformCreditApplied = Math.min(
    Math.max(0, platformCreditCents),
    merchandise - giftCreditApplied
  );
  const taxableCents = merchandise - giftCreditApplied - platformCreditApplied;
  const taxCents = Math.round(taxableCents * CHECKOUT_TAX_RATE);
  return {
    giftCreditApplied,
    platformCreditApplied,
    creditApplied: giftCreditApplied + platformCreditApplied,
    taxCents,
    totalCents: taxableCents + taxCents,
  };
}

type BoxLineItem = {
  unitCents?: number;
  quantity?: number;
  slotId?: string;
  itemId?: string;
  label?: string;
};

export type ChargePilotBoxResult =
  | { outcome: 'charged'; orderId: string; totalCents: number; paymentIntentId?: string }
  | { outcome: 'confirmed_zero'; orderId: string }
  | { outcome: 'skipped'; orderId: string; reason: string }
  | { outcome: 'failed'; orderId: string; message: string };

function chargeableLineTotal(lineItems: BoxLineItem[]): number {
  return lineItems.reduce((s, li) => s + (li.unitCents ?? 0) * (li.quantity ?? 1), 0);
}

function orderSubtotalCents(lineItems: BoxLineItem[], boxPriceCents: number): number {
  const hasIncluded = lineItems.some((li) => li.unitCents === 0 || li.slotId);
  const base = hasIncluded ? boxPriceCents : 0;
  return base + chargeableLineTotal(lineItems);
}

/** Final totals from current draft + credits frozen on the order at commit. */
export function computeCommittedBoxTotals(
  lineItems: BoxLineItem[],
  boxPriceCents: number,
  expeditedShipping: boolean,
  giftCreditApplied: number,
  platformCreditApplied: number
): {
  lineItems: BoxLineItem[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  creditAppliedCents: number;
  giftCreditAppliedCents: number;
  platformCreditAppliedCents: number;
} {
  const subtotalCents = orderSubtotalCents(lineItems, boxPriceCents);
  const shippingCents = SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
  const priced = checkoutTotalsAfterCredit(
    subtotalCents + shippingCents,
    giftCreditApplied,
    platformCreditApplied
  );
  return {
    lineItems,
    subtotalCents,
    shippingCents,
    taxCents: priced.taxCents,
    totalCents: priced.totalCents,
    creditAppliedCents: priced.creditApplied,
    giftCreditAppliedCents: priced.giftCreditApplied,
    platformCreditAppliedCents: priced.platformCreditApplied,
  };
}

function isLockPassed(lockAt: string | null | undefined): boolean {
  if (!lockAt) return false;
  return Date.now() >= new Date(lockAt).getTime();
}

function isHanukkahBoxOrder(order: FirebaseFirestore.DocumentData): boolean {
  if (order.orderType === 'marketplace' || order.orderType === 'received_gift') return false;
  if (order.orderType === 'hanukkah_box') return true;
  return order.holidayId === HOLIDAY_ID || !order.orderType;
}

const ORDERS_URL = 'https://grapejuice-pilot.web.app/orders';

function customerFacingChargeFailure(message: string): boolean {
  return !/stripe is not configured/i.test(message);
}

/** One decline email per charge attempt. Webhook and the charge function can both call this. */
export async function notifyHanukkahBoxChargeFailed(
  db: Firestore,
  householdId: string,
  orderId: string,
  attempt: number,
  message: string
): Promise<void> {
  if (!customerFacingChargeFailure(message)) return;
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 1;
  const ref = db.doc(`households/${householdId}/orders/${orderId}`);

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const sentFor = snap.data()?.chargeFailureEmailForAttempt;
    if (typeof sentFor === 'number' && sentFor >= safeAttempt) return false;
    tx.update(ref, { chargeFailureEmailForAttempt: safeAttempt });
    return true;
  });
  if (!claimed) return;

  const snap = await ref.get();
  const order = snap.data() ?? {};
  const userId = typeof order.userId === 'string' ? order.userId : '';
  let to = '';
  if (userId) {
    const userSnap = await db.doc(`users/${userId}`).get();
    to = String(userSnap.data()?.email ?? '').trim();
  }
  if (!to.includes('@')) {
    const address = order.shippingAddress as { email?: string } | undefined;
    to = String(address?.email ?? '').trim();
  }
  if (!to.includes('@')) {
    await ref.update({ chargeFailureEmailForAttempt: FieldValue.delete() });
    return;
  }

  try {
    const result = await sendEmail({
      to,
      template: 'box-charge-failed',
      data: { ordersUrl: ORDERS_URL, message },
    });
    if (result === 'skipped') {
      await ref.update({ chargeFailureEmailForAttempt: FieldValue.delete() });
    }
  } catch (err) {
    logger.error('Hanukkah box charge-failure email failed', { orderId, err });
    await ref.update({ chargeFailureEmailForAttempt: FieldValue.delete() });
  }
}

/**
 * After a new card is saved: charge any box whose lock has passed and whose last charge failed.
 * Before lock, drop the stale failure so Orders stops asking them to update the card.
 */
export async function retryFailedHanukkahBoxCharges(
  db: Firestore,
  stripe: Stripe | null,
  householdId: string
): Promise<void> {
  const open = await db.collection(`households/${householdId}/orders`).where('status', '==', 'committed').get();
  for (const doc of open.docs) {
    const data = doc.data();
    if (data.holidayId && data.holidayId !== HOLIDAY_ID) continue;
    if (!data.chargeFailureMessage) continue;
    if (!isHanukkahBoxOrder(data) || !isLockPassed(data.lockAt as string | null | undefined)) {
      await doc.ref.update({
        chargeFailureMessage: FieldValue.delete(),
        updatedAt: new Date().toISOString(),
      });
      continue;
    }
    try {
      await chargeSinglePilotBoxOrder(db, stripe, householdId, doc.id);
    } catch (err) {
      logger.error('Retry after card update failed', { householdId, orderId: doc.id, err });
    }
  }
}

/** Email + ShipStation after a Hanukkah box order is paid (or $0 confirmed). Idempotent. */
export async function fulfillHanukkahBoxOrder(
  db: Firestore,
  householdId: string,
  orderId: string,
  orderInput?: FirebaseFirestore.DocumentData
): Promise<void> {
  const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
  const orderSnap = await orderRef.get();
  const order = orderInput ?? orderSnap.data() ?? {};

  const userId = order.userId as string | undefined;
  if (!order.orderConfirmedEmailSentAt && userId) {
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
        await orderRef.update({ orderConfirmedEmailSentAt: new Date().toISOString() });
      } catch (emailErr) {
        logger.error('Hanukkah box order confirmation email failed', { orderId, emailErr });
      }
    }
  }

  if (order.playthrough === true) {
    logger.info('ShipStation export skipped (visitor playthrough)', { orderId });
    return;
  }

  if (order.shipStationExportedAt) {
    return;
  }

  try {
    const exported = await exportOrderToShipStation({
      orderId,
      householdId,
      shippingAddress: (order.shippingAddress as Record<string, unknown>) ?? {},
      lineItems: (order.lineItems as BoxLineItem[]) ?? [],
      totalCents: (order.totalCents as number) ?? 0,
      expeditedShipping: order.expeditedShipping === true,
    });
    await orderRef.update({
      shipStationExportedAt: new Date().toISOString(),
      ...(exported.externalId ? { shipStationOrderId: exported.externalId } : {}),
    });
  } catch (shipErr) {
    logger.error('Hanukkah box ShipStation export failed', { orderId, shipErr });
  }
}

async function markHanukkahBoxConfirmed(
  db: Firestore,
  householdId: string,
  orderId: string,
  orderRef: FirebaseFirestore.DocumentReference,
  totals: ReturnType<typeof computeCommittedBoxTotals>,
  extra?: { stripePaymentIntentId?: string }
): Promise<void> {
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) return;
  const prior = orderSnap.data() ?? {};
  if (prior.status === 'confirmed' || prior.status === 'shipped' || prior.status === 'delivered') {
    await fulfillHanukkahBoxOrder(db, householdId, orderId, prior);
    return;
  }

  await orderRef.update({
    status: 'confirmed',
    confirmedAt: FieldValue.serverTimestamp(),
    lineItems: totals.lineItems,
    subtotalCents: totals.subtotalCents,
    shippingCents: totals.shippingCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    creditAppliedCents: totals.creditAppliedCents,
    giftCreditAppliedCents: totals.giftCreditAppliedCents,
    platformCreditAppliedCents: totals.platformCreditAppliedCents,
    ...(extra?.stripePaymentIntentId ? { stripePaymentIntentId: extra.stripePaymentIntentId } : {}),
    chargeFailedAt: FieldValue.delete(),
    chargeFailureMessage: FieldValue.delete(),
  });

  const merged = { ...prior, ...totals, status: 'confirmed' };
  await fulfillHanukkahBoxOrder(db, householdId, orderId, merged);
}

async function cancelLegacyPaymentIntent(stripe: Stripe, paymentIntentId: string): Promise<void> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status === 'succeeded') return;
    if (pi.status === 'canceled') return;
    await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/already.*(cancel|cancell)/i.test(msg)) {
      logger.warn('Could not cancel legacy PaymentIntent before recharge', { paymentIntentId, err });
    }
  }
}

/**
 * Charge one committed Hanukkah box order (final draft totals).
 * @param force — QA only: charge even if lockAt is still in the future.
 */
export async function chargeSinglePilotBoxOrder(
  db: Firestore,
  stripe: Stripe | null,
  householdId: string,
  orderId: string,
  options?: { force?: boolean }
): Promise<ChargePilotBoxResult> {
  const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    return { outcome: 'skipped', orderId, reason: 'Order not found' };
  }

  const order = orderSnap.data() ?? {};
  if (!isHanukkahBoxOrder(order)) {
    return { outcome: 'skipped', orderId, reason: 'Not a Hanukkah box order' };
  }

  const status = order.status as string;
  if (status === 'confirmed' || status === 'shipped' || status === 'delivered') {
    return { outcome: 'skipped', orderId, reason: 'Already confirmed' };
  }
  if (status === 'cancelled') {
    return { outcome: 'skipped', orderId, reason: 'Order cancelled' };
  }
  if (status !== 'committed' && status !== 'pending') {
    return { outcome: 'skipped', orderId, reason: `Unexpected status: ${status}` };
  }

  const lockAt = (order.lockAt as string | null | undefined) ?? null;
  if (!options?.force && !isLockPassed(lockAt)) {
    return { outcome: 'skipped', orderId, reason: 'Lock date not reached' };
  }

  const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
  const draftLineItems = (draftSnap.data()?.lineItems as BoxLineItem[]) ?? (order.lineItems as BoxLineItem[]) ?? [];

  const configSnap = await db.doc('config/hanukkah-2026').get();
  const configData = configSnap.data() ?? {};
  const boxPriceCents =
    typeof configData.boxPriceCents === 'number' ? configData.boxPriceCents : DEFAULT_BOX_PRICE_CENTS;

  const giftCreditApplied =
    typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
  const platformCreditApplied =
    typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
  const expeditedShipping = order.expeditedShipping === true;

  const totals = computeCommittedBoxTotals(
    draftLineItems,
    boxPriceCents,
    expeditedShipping,
    giftCreditApplied,
    platformCreditApplied
  );

  const legacyPiId =
    typeof order.stripePaymentIntentId === 'string' ? order.stripePaymentIntentId.trim() : '';

  if (legacyPiId && stripe) {
    const legacyPi = await stripe.paymentIntents.retrieve(legacyPiId);
    if (legacyPi.status === 'succeeded') {
      await markHanukkahBoxConfirmed(db, householdId, orderId, orderRef, totals, {
        stripePaymentIntentId: legacyPiId,
      });
      return { outcome: 'charged', orderId, totalCents: totals.totalCents, paymentIntentId: legacyPiId };
    }
    await cancelLegacyPaymentIntent(stripe, legacyPiId);
  }

  const priorAttempts =
    typeof order.chargeAttemptCount === 'number' && Number.isFinite(order.chargeAttemptCount)
      ? Math.max(0, Math.floor(order.chargeAttemptCount))
      : 0;
  const chargeAttempt = priorAttempts + 1;

  await orderRef.update({
    lineItems: totals.lineItems,
    subtotalCents: totals.subtotalCents,
    shippingCents: totals.shippingCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    creditAppliedCents: totals.creditAppliedCents,
    chargeAttemptedAt: new Date().toISOString(),
    // Bump so each intentional retry (new card, Dev charge, schedule) gets a fresh
    // Stripe idempotency key. A fixed `charge-pilot-box-${orderId}` key blocked
    // retries after a decline when payment_method / amount differed.
    chargeAttemptCount: chargeAttempt,
  });

  if (totals.totalCents === 0) {
    await markHanukkahBoxConfirmed(db, householdId, orderId, orderRef, totals);
    return { outcome: 'confirmed_zero', orderId };
  }

  const hhSnap = await db.doc(`households/${householdId}`).get();
  const hhData = hhSnap.data() ?? {};
  const customerId = (hhData.stripeCustomerId as string) ?? '';
  const paymentMethodId = hhData.stripeDefaultPaymentMethodId as string | undefined;

  if (!stripe) {
    return recordChargeFailure(db, orderRef, householdId, orderId, chargeAttempt, 'Stripe is not configured');
  }

  if (!customerId || !paymentMethodId) {
    return recordChargeFailure(
      db,
      orderRef,
      householdId,
      orderId,
      chargeAttempt,
      'No saved payment method on file'
    );
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totals.totalCents,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          householdId,
          orderId,
          userId: String(order.userId ?? ''),
          type: 'hanukkah_box',
          chargeAttempt: String(chargeAttempt),
        },
      },
      { idempotencyKey: `charge-pilot-box-${orderId}-attempt-${chargeAttempt}` }
    );

    await orderRef.update({ stripePaymentIntentId: paymentIntent.id });

    if (paymentIntent.status === 'succeeded') {
      await markHanukkahBoxConfirmed(db, householdId, orderId, orderRef, totals, {
        stripePaymentIntentId: paymentIntent.id,
      });
      return {
        outcome: 'charged',
        orderId,
        totalCents: totals.totalCents,
        paymentIntentId: paymentIntent.id,
      };
    }

    if (paymentIntent.status === 'processing') {
      return {
        outcome: 'charged',
        orderId,
        totalCents: totals.totalCents,
        paymentIntentId: paymentIntent.id,
      };
    }

    const message = `PaymentIntent status: ${paymentIntent.status}`;
    return recordChargeFailure(db, orderRef, householdId, orderId, chargeAttempt, message);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Charge failed';
    logger.error('chargeSinglePilotBoxOrder failed', { householdId, orderId, err });
    return recordChargeFailure(db, orderRef, householdId, orderId, chargeAttempt, message);
  }
}

async function recordChargeFailure(
  db: Firestore,
  orderRef: FirebaseFirestore.DocumentReference,
  householdId: string,
  orderId: string,
  attempt: number,
  message: string
): Promise<Extract<ChargePilotBoxResult, { outcome: 'failed' }>> {
  await orderRef.update({
    chargeFailedAt: new Date().toISOString(),
    chargeFailureMessage: message,
  });
  await notifyHanukkahBoxChargeFailed(db, householdId, orderId, attempt, message);
  return { outcome: 'failed', orderId, message };
}

/** Charge all committed Hanukkah box orders past lock (or force-eligible in batch). */
export async function runChargeEligiblePilotBoxOrders(
  db: Firestore,
  stripe: Stripe | null,
  options?: { force?: boolean }
): Promise<{ charged: number; confirmedZero: number; failed: number; skipped: number }> {
  const snap = await db
    .collectionGroup('orders')
    .where('status', '==', 'committed')
    .where('holidayId', '==', HOLIDAY_ID)
    .get();

  let charged = 0;
  let confirmedZero = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const order = doc.data();
    const householdId = doc.ref.parent.parent?.id;
    if (!householdId || !isHanukkahBoxOrder(order)) {
      skipped += 1;
      continue;
    }

    const result = await chargeSinglePilotBoxOrder(db, stripe, householdId, doc.id, options);
    switch (result.outcome) {
      case 'charged':
        charged += 1;
        break;
      case 'confirmed_zero':
        confirmedZero += 1;
        break;
      case 'failed':
        failed += 1;
        break;
      case 'skipped':
        skipped += 1;
        break;
      default:
        skipped += 1;
    }
  }

  logger.info('runChargeEligiblePilotBoxOrders complete', {
    charged,
    confirmedZero,
    failed,
    skipped,
    force: options?.force === true,
  });

  return { charged, confirmedZero, failed, skipped };
}

/** Callable wrapper — household member can charge their own order (QA: force=true). */
export async function chargePilotBoxOrderForUser(
  db: Firestore,
  stripe: Stripe | null,
  uid: string,
  householdId: string,
  orderId: string,
  force?: boolean
): Promise<ChargePilotBoxResult> {
  const hhSnap = await db.doc(`households/${householdId}`).get();
  if (!hhSnap.exists) throw new HttpsError('not-found', 'Household not found.');
  const memberIds = (hhSnap.data()?.memberIds as string[]) ?? [];
  if (!memberIds.includes(uid)) {
    throw new HttpsError('permission-denied', 'Not a member of this household.');
  }
  return chargeSinglePilotBoxOrder(db, stripe, householdId, orderId, { force });
}
