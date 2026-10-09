import * as logger from './logger';
import { onRequest, onCall, HttpsError, onSchedule } from './sentry';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createCardSetupIntent, stripe, stripePublishableKey, verifyWebhook } from './stripe';
import { sendEmail, sendDebriefReminderEmail, sendGiftConfirmReminderEmail } from './email';
import { askPilotRav, curatePilotBox } from './rav';
import { scanBeamAgeTriggers } from './beamAgeTrigger';
import {
  exportOrderToShipStation,
  applyShipStationTracking,
  processShipStationShipNotify,
  verifyShipStationWebhookSecret,
} from './shipstation';
import { finalizeGiftInvitePayment, resolveGiftInviteKind, type GiftInviteRecord } from './giftPayment';
import { runDebriefReminderBatch } from './debriefReminders';
import { runLockReminderBatch } from './lockReminders';
import { deliveryDateLabel, lockDateLabel, runSetupNudgeBatch } from './setupNudge';
import { untraditionalMarkSafe } from './untraditionalCio';
import { reportUnaffiliatedShippingGeo } from './unaffiliated';
import {
  assertCatalogSyncSecret,
  runAirtableCatalogReplaceSync,
} from './airtableCatalogSync';
import {
  boxPriceCentsForKids,
  boxPriceForUser,
  chargePilotBoxOrderForUser,
  checkoutTotalsAfterCredit,
  fulfillHanukkahBoxOrder,
  isHanukkahBoxOrder,
  notifyHanukkahBoxChargeFailed,
  retryFailedHanukkahBoxCharges,
  runChargeEligiblePilotBoxOrders,
} from './chargePilotBox';
import {
  assertBoxLinesWithinInventory,
  commitMarketplaceReservations,
  heldReceivedGiftLines,
  recomputeBoxAllocations,
  releaseMarketplaceReservations,
  releaseStaleMarketplaceReservations,
  reserveMarketplaceInventoryInTx,
  reservedLinesFromOrder,
} from './catalogInventory';
import {
  metaContextForDoc,
  metaContextFromCallable,
  metaContextFromStripeMetadata,
  metaContextToStripeMetadata,
  sanitizeAttribution,
  sendMetaEvent,
  type MetaClientContext,
  type MetaUserInput,
} from './metaCapi';
import { randomBytes } from 'crypto';
import { createAdminBoxesDashboard } from './adminDashboard';
import { checkUsAddressFormat } from './usAddress';

export { askPilotRav, curatePilotBox, scanBeamAgeTriggers };
export { sendWelcomeOnSignup } from './welcome';
export {
  saveGuestSession,
  saveGuestSessionBeacon,
  markGuestSessionConverted,
  noteVisitorRegion,
  resumeGuestSession,
  deleteGuestDataByEmail,
  scheduledPurgeGuestSessions,
} from './guestSessions';
export { recordGiftStep } from './giftFunnel';
export { revealBoxWithEmail, signInGiftGiver, requestLoginLink, redeemLoginLink } from './loginLinks';
import { enforceRateLimits, giverUidForEmail, mintInviteAcceptUrl, normalizeEmail } from './loginLinks';
import { isAdminToken } from './guestSessions';
export { validateShippingAddress } from './addressValidation';
export { retentionLead } from './retentionLead';
export { unaffiliatedVisit } from './unaffiliated';

initializeApp();
const db = getFirestore();

export const getAdminBoxesDashboard = createAdminBoxesDashboard(db);

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
  /** Browser Meta ids (see metaCapi.sanitizeMetaContext). */
  meta?: unknown;
  /** First / last-touch UTMs (see metaCapi.sanitizeAttribution). */
  attribution?: unknown;
}

interface CreatePilotSetupIntentData {
  householdId: string;
  meta?: unknown;
}

interface CreateMarketplaceCheckoutData {
  householdId?: string;
  email?: string;
  shippingAddress: ShippingAddress;
  lineItems: Array<{ itemId: string; quantity?: number }>;
  skipShipStation?: boolean;
  meta?: unknown;
  attribution?: unknown;
}

function metaUserWithAddress(
  base: MetaUserInput,
  address: Partial<ShippingAddress> | null | undefined
): MetaUserInput {
  if (!address) return base;
  return {
    ...base,
    name: address.name ?? null,
    city: address.city ?? null,
    state: address.stateProvince ?? null,
    zip: address.postalCode ?? null,
    country: address.country === 'US' || address.country === 'CA' ? address.country : null,
  };
}

/** Purchase for a newly committed order (box or marketplace). `purchase_<orderId>` matches the browser. */
async function sendOrderPurchaseToMeta(input: {
  orderId: string;
  order: FirebaseFirestore.DocumentData;
  context: MetaClientContext;
  email?: string | null;
  phone?: string | null;
}): Promise<void> {
  const { orderId, order } = input;
  const lineItems = Array.isArray(order.lineItems) ? (order.lineItems as Array<Record<string, unknown>>) : [];
  const contentIds = lineItems
    .map((li) => (typeof li.itemId === 'string' ? li.itemId : null))
    .filter((id): id is string => !!id)
    .slice(0, 50);
  await sendMetaEvent({
    eventName: 'Purchase',
    eventId: `purchase_${orderId}`,
    context: input.context,
    user: metaUserWithAddress(
      {
        email: input.email ?? (order.guestEmail as string | undefined) ?? null,
        phone: input.phone ?? null,
        externalId: (order.userId as string | undefined) ?? null,
      },
      order.shippingAddress as Partial<ShippingAddress> | undefined
    ),
    customData: {
      value: Math.max(0, Number(order.totalCents ?? 0)) / 100,
      currency: 'USD',
      order_id: orderId,
      content_name: order.orderType === 'marketplace' ? 'Marketplace order' : 'Hanukkah box',
      content_type: 'product',
      ...(contentIds.length ? { content_ids: contentIds } : {}),
      num_items: lineItems.length,
    },
    stripeBacked: true,
    playthrough: order.playthrough === true,
  });
}

async function emailForMeta(uid: string | null | undefined, fallback?: string | null): Promise<string | null> {
  if (fallback) return fallback;
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  return (snap.data()?.email as string | undefined) ?? null;
}

function guestHouseholdId(email: string): string {
  return `guest_${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`.slice(0, 140);
}

const BOX_HELD_STATUSES = new Set(['committed', 'confirmed', 'shipped', 'delivered']);

/** À la carte orders from a household with a box charge at lock; everyone else pays at checkout. */
async function householdHasHanukkahBox(householdId: string): Promise<boolean> {
  const snap = await db.collection(`households/${householdId}/orders`).get();
  return snap.docs.some((d) => {
    const order = d.data();
    return isHanukkahBoxOrder(order) && BOX_HELD_STATUSES.has(String(order.status ?? ''));
  });
}

function lockHasPassed(lockAt: string | null | undefined): boolean {
  if (!lockAt) return false;
  return Date.now() >= new Date(lockAt).getTime();
}

type MarketplaceLineItem = {
  slotId: string;
  itemId: string;
  quantity: number;
  unitCents: number;
  label: string;
};

/** Firestore rejects undefined field values — strip them before writes. */
/**
 * Trim + U.S.-only enforcement. A complete address outside the 50 states / DC (or with a
 * non-U.S. postal code) is rejected; callers still report missing fields themselves.
 */
function sanitizeShippingAddress(raw: ShippingAddress | undefined): ShippingAddress {
  const src = (raw ?? {}) as Partial<ShippingAddress>;
  const cleaned: ShippingAddress = {
    name: String(src.name ?? '').trim(),
    line1: String(src.line1 ?? '').trim(),
    city: String(src.city ?? '').trim(),
    stateProvince: String(src.stateProvince ?? '').trim(),
    postalCode: String(src.postalCode ?? '').trim(),
    country: 'US',
  };
  const line2 = String(src.line2 ?? '').trim();
  if (line2) cleaned.line2 = line2;
  if (cleaned.line1 && cleaned.city && cleaned.stateProvince && cleaned.postalCode) {
    const format = checkUsAddressFormat({ ...cleaned, country: src.country ?? 'US' });
    if (!format.ok) throw new HttpsError('invalid-argument', format.message);
    cleaned.stateProvince = format.stateCode;
    cleaned.postalCode = format.zip;
  }
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

/** Stock totals are a best-effort refresh; never fail the caller's write over them. */
async function recomputeBoxAllocationsLogged(
  context: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  try {
    const alloc = await recomputeBoxAllocations(db);
    logger.info(`${context} box allocations`, { ...extra, ...alloc });
  } catch (allocErr) {
    logger.error(`${context} recomputeBoxAllocations failed`, { ...extra, allocErr });
  }
}

async function fulfillMarketplaceOrder(
  householdId: string,
  orderId: string,
  order: Record<string, unknown>,
  skipShipStation?: boolean
): Promise<void> {
  const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
  const freshSnap = await orderRef.get();
  const fresh = freshSnap.data() ?? order;
  if (fresh.marketplaceFulfilledAt) return;

  const userId = typeof fresh.userId === 'string' ? fresh.userId : '';
  let email = typeof fresh.guestEmail === 'string' ? fresh.guestEmail : '';
  if (userId) {
    const userSnap = await db.doc(`users/${userId}`).get();
    email = (userSnap.data()?.email as string) || email;
  }
  if (email.includes('@') && !fresh.marketplaceEmailSentAt) {
    const lineItems = (order.lineItems as MarketplaceLineItem[]) ?? [];
    const itemSummary = fresh.giftSurprise
      ? 'A surprise Hanukkah gift box'
      : lineItems
          .map((li) => {
            const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
            const name = String(li.label ?? li.itemId ?? 'Item');
            return qty > 1 ? `${qty}× ${name}` : name;
          })
          .filter(Boolean)
          .join(', ');
    try {
      // Prefer dedicated marketplace template; fall back to box template only if unset
      // (still pass orderType so Liquid can branch once CIO is updated).
      const marketplaceTemplateId = parseInt(
        process.env.CUSTOMERIO_TEMPLATE_MARKETPLACE_ORDER_CONFIRMED ?? '0',
        10
      );
      await sendEmail({
        to: email,
        template: marketplaceTemplateId > 0 ? 'marketplace-order-confirmed' : 'order-confirmed',
        data: {
          orderId,
          orderType: 'marketplace',
          totalCents: order.totalCents,
          estimatedDelivery: order.estimatedDelivery,
          itemSummary,
          itemCount: lineItems.reduce(
            (sum, li) => sum + Math.max(1, Math.floor(Number(li.quantity) || 1)),
            0
          ),
        },
      });
      await orderRef.update({ marketplaceEmailSentAt: new Date().toISOString() });
    } catch (emailErr) {
      logger.error('Marketplace order confirmation email failed', emailErr);
    }
  }
  if (skipShipStation === true || fresh.playthrough === true) {
    logger.info('ShipStation export skipped (visitor playthrough)', { orderId });
    await orderRef.update({ marketplaceFulfilledAt: new Date().toISOString() });
    return;
  }
  // Gift boxes and à la carte orders ship with the Hanukkah boxes: runExportHeldOrders sends them once lock passes.
  if (fresh.orderType === 'received_gift' || fresh.orderType === 'marketplace') {
    const lockAt = (fresh.lockAt as string | null | undefined) ?? (await getLockAt());
    if (!lockHasPassed(lockAt)) return;
  }
  if (fresh.shipStationExportedAt) {
    await orderRef.update({ marketplaceFulfilledAt: new Date().toISOString() });
    return;
  }
  try {
    await exportOrderToShipStation({
      orderId,
      householdId,
      shippingAddress: (fresh.shippingAddress as Record<string, unknown>) ?? {},
      lineItems: (fresh.lineItems as MarketplaceLineItem[]) ?? [],
      totalCents: (fresh.totalCents as number) ?? 0,
      customerEmail: email.includes('@') ? email : undefined,
    });
    await orderRef.update({ marketplaceFulfilledAt: new Date().toISOString() });
  } catch (shipErr) {
    logger.error('Marketplace ShipStation export failed', shipErr);
  }
}

/** Charge one committed à la carte order once lock has passed. Card was saved at checkout. */
async function chargeSingleMarketplaceOrder(
  householdId: string,
  orderId: string,
  order: FirebaseFirestore.DocumentData
): Promise<void> {
  const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
  if (!lockHasPassed(order.lockAt as string | null | undefined)) return;
  if (order.status !== 'committed') return;

  const totalCents = typeof order.totalCents === 'number' ? order.totalCents : 0;
  if (totalCents === 0) {
    await confirmMarketplaceCharge(householdId, orderId, orderRef, order, null);
    return;
  }

  const hhSnap = await db.doc(`households/${householdId}`).get();
  const hh = hhSnap.data() ?? {};
  const customerId = typeof hh.stripeCustomerId === 'string' ? hh.stripeCustomerId : '';
  const paymentMethodId =
    typeof hh.stripeDefaultPaymentMethodId === 'string' ? hh.stripeDefaultPaymentMethodId : '';
  const priorAttempts =
    typeof order.chargeAttemptCount === 'number' ? Math.max(0, Math.floor(order.chargeAttemptCount)) : 0;
  const chargeAttempt = priorAttempts + 1;
  await orderRef.update({
    chargeAttemptedAt: new Date().toISOString(),
    chargeAttemptCount: chargeAttempt,
  });

  if (!stripe || !customerId || !paymentMethodId) {
    await orderRef.update({
      chargeFailedAt: new Date().toISOString(),
      chargeFailureMessage: !stripe ? 'Stripe is not configured' : 'No saved payment method on file',
    });
    return;
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          householdId,
          orderId,
          userId: String(order.userId ?? ''),
          type: 'marketplace',
          chargeAttempt: String(chargeAttempt),
        },
      },
      { idempotencyKey: `charge-marketplace-${orderId}-attempt-${chargeAttempt}` }
    );
    if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
      await confirmMarketplaceCharge(householdId, orderId, orderRef, order, paymentIntent.id);
      return;
    }
    await orderRef.update({
      stripePaymentIntentId: paymentIntent.id,
      chargeFailedAt: new Date().toISOString(),
      chargeFailureMessage: `PaymentIntent status: ${paymentIntent.status}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Charge failed';
    logger.error('Marketplace lock charge failed', { householdId, orderId, err });
    await orderRef.update({
      chargeFailedAt: new Date().toISOString(),
      chargeFailureMessage: message,
    });
  }
}

async function confirmMarketplaceCharge(
  householdId: string,
  orderId: string,
  orderRef: FirebaseFirestore.DocumentReference,
  order: FirebaseFirestore.DocumentData,
  paymentIntentId: string | null
): Promise<void> {
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    const data = snap.data() ?? {};
    if (data.status === 'confirmed' || data.status === 'shipped' || data.status === 'delivered') {
      return false;
    }
    tx.update(orderRef, {
      status: 'confirmed',
      confirmedAt: FieldValue.serverTimestamp(),
      ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
      chargeFailedAt: FieldValue.delete(),
      chargeFailureMessage: FieldValue.delete(),
      ...(data.inventoryReserved === true && !data.inventoryCommittedAt
        ? { inventoryReserved: false, inventoryCommittedAt: new Date().toISOString() }
        : {}),
    });
    return data.inventoryReserved === true && !data.inventoryCommittedAt;
  });
  if (claimed) {
    try {
      await commitMarketplaceReservations(db, reservedLinesFromOrder(order));
    } catch (invErr) {
      logger.error('Marketplace inventory commit failed', { orderId, invErr });
    }
  }
  const fresh = (await orderRef.get()).data() ?? order;
  if (fresh.status === 'confirmed' || fresh.status === 'shipped') {
    await fulfillMarketplaceOrder(householdId, orderId, fresh, fresh.playthrough === true);
  }
}

async function runChargeEligibleMarketplaceOrders(): Promise<void> {
  const snap = await db
    .collectionGroup('orders')
    .where('status', '==', 'committed')
    .where('holidayId', '==', HOLIDAY_ID)
    .get();
  for (const doc of snap.docs) {
    const order = doc.data();
    if (order.orderType !== 'marketplace') continue;
    const householdId = doc.ref.parent.parent?.id;
    if (!householdId) continue;
    try {
      await chargeSingleMarketplaceOrder(householdId, doc.id, order);
    } catch (err) {
      logger.error('Marketplace lock charge skipped', { orderId: doc.id, err });
    }
  }
}

function isCompleteShippingAddress(address: unknown): address is ShippingAddress {
  const a = address as Partial<ShippingAddress> | null | undefined;
  return Boolean(a?.name && a.line1 && a.city && a.stateProvince && a.postalCode);
}

/**
 * Sealed $0 order for a gift box nobody confirmed by lock, shipped to the giver's address.
 * The order id is derived from the invite so a retried run can't create a second one.
 */
async function createAutoShipGiftOrder(params: {
  householdId: string;
  giftInviteId: string;
  userId: string;
  lineItems: GiftLineItemInput[];
  shippingAddress: ShippingAddress;
  lockAt: string | null;
  autoShipForGiver?: boolean;
}): Promise<string | null> {
  const orderRef = db.doc(`households/${params.householdId}/orders/autoship-${params.giftInviteId}`);
  const configData = (await db.doc('config/hanukkah-2026').get()).data() ?? {};
  const payload: Record<string, unknown> = {
    status: 'confirmed',
    orderType: 'received_gift',
    giftInviteId: params.giftInviteId,
    lineItems: normalizeGiftLineItems(params.lineItems),
    subtotalCents: 0,
    shippingCents: 0,
    taxCents: 0,
    totalCents: 0,
    creditAppliedCents: 0,
    giftCreditAppliedCents: 0,
    platformCreditAppliedCents: 0,
    shippingAddress: params.shippingAddress,
    holidayId: HOLIDAY_ID,
    userId: params.userId,
    estimatedDelivery: (configData.estimatedDeliveryBy as string) ?? '2026-11-24',
    lockAt: params.lockAt,
    giftSurprise: true,
    autoShipped: true,
    ...(params.autoShipForGiver ? { autoShipForGiver: true } : {}),
    createdAt: FieldValue.serverTimestamp(),
    confirmedAt: FieldValue.serverTimestamp(),
  };
  try {
    await orderRef.create(payload);
  } catch (err) {
    if ((err as { code?: number }).code === 6) return orderRef.id;
    throw err;
  }
  return orderRef.id;
}

/**
 * At lock: claimed gift boxes nobody confirmed ship to the giver's address if they gave one,
 * otherwise become gift credit. Unclaimed boxes with a giver address ship too; unclaimed ones
 * without an address become credit when claimed (see claimGiftInvite).
 */
async function runSettleUnconfirmedGiftBoxes(): Promise<void> {
  const lockAt = await getLockAt();
  if (!isLocked(lockAt)) return;
  const now = new Date().toISOString();

  // Filtered in memory: a collection-group equality query would need a collection-group index.
  const received = await db.collectionGroup('receivedGifts').get();
  for (const doc of received.docs) {
    const gift = doc.data();
    if (gift.kind !== 'box') continue;
    const unconfirmed =
      gift.status === 'available' || (gift.status === 'accepted' && !gift.checkoutOrderId);
    if (!unconfirmed) continue;
    const householdId = doc.ref.parent.parent?.id;
    if (!householdId) continue;
    const giftInviteId = String(gift.giftInviteId ?? doc.id);
    try {
      if (isCompleteShippingAddress(gift.giverShippingAddress)) {
        const inviteSnap = await db.doc(`giftInvites/${giftInviteId}`).get();
        const hhSnap = await db.doc(`households/${householdId}`).get();
        const userId =
          (inviteSnap.data()?.claimedByUid as string | undefined) ??
          (hhSnap.data()?.ownerId as string | undefined) ??
          '';
        const orderId = await createAutoShipGiftOrder({
          householdId,
          giftInviteId,
          userId,
          lineItems: (gift.lineItems as GiftLineItemInput[]) ?? [],
          shippingAddress: gift.giverShippingAddress,
          lockAt,
        });
        await doc.ref.update({
          status: 'accepted',
          acceptedAt: gift.acceptedAt ?? now,
          checkoutOrderId: orderId,
          surprise: true,
          autoShippedAt: now,
          updatedAt: now,
        });
      } else {
        const creditCents =
          typeof gift.creditCents === 'number' ? gift.creditCents : DEFAULT_GIFT_CREDIT_CENTS;
        const hhRef = db.doc(`households/${householdId}`);
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          const f = fresh.data() ?? {};
          const stillOpen =
            f.status === 'available' || (f.status === 'accepted' && !f.checkoutOrderId);
          if (!stillOpen) return;
          const hh = await tx.get(hhRef);
          const current =
            typeof hh.data()?.giftCreditCents === 'number' ? hh.data()!.giftCreditCents : 0;
          tx.update(doc.ref, {
            status: 'converted_to_credit',
            convertedAt: now,
            autoConvertedAt: now,
            updatedAt: now,
          });
          tx.update(hhRef, { giftCreditCents: current + creditCents, updatedAt: now });
        });
      }
    } catch (err) {
      logger.error('Settling unconfirmed gift box failed', { giftInviteId, err });
    }
  }

  const invites = await db.collection('giftInvites').get();
  for (const doc of invites.docs) {
    const invite = doc.data() as GiftInviteRecord;
    if (resolveGiftInviteKind(invite) !== 'box') continue;
    const paid = invite.paymentStatus === 'paid' || Boolean(invite.claimEmailSentAt);
    if (!paid || invite.status === 'claimed' || invite.autoShipOrderId) continue;
    if (!isCompleteShippingAddress(invite.shippingAddress)) continue;
    try {
      const giverHouseholdId = (await db.doc(`users/${invite.giverUid}`).get()).data()?.householdId as
        | string
        | undefined;
      if (!giverHouseholdId) {
        logger.warn('Unclaimed gift box has no giver household; ship it manually', { giftInviteId: doc.id });
        continue;
      }
      const orderId = await createAutoShipGiftOrder({
        householdId: giverHouseholdId,
        giftInviteId: doc.id,
        userId: invite.giverUid,
        lineItems: (invite.lineItems as GiftLineItemInput[]) ?? [],
        shippingAddress: invite.shippingAddress as ShippingAddress,
        lockAt,
        autoShipForGiver: true,
      });
      await doc.ref.update({ autoShipOrderId: orderId, autoShipHouseholdId: giverHouseholdId });
    } catch (err) {
      logger.error('Auto-shipping unclaimed gift box failed', { giftInviteId: doc.id, err });
    }
  }
}

const GIFT_REMINDER_UTM = 'utm_source=lifecycle&utm_medium=email&utm_campaign=gift_confirm_reminder';

/** 7 = the week-out reminder, 1 = deadline day. Null outside both windows. */
function giftReminderStage(lockAt: string): 7 | 1 | null {
  const daysLeft = Math.ceil((new Date(lockAt).getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 1) return null;
  if (daysLeft <= 1) return 1;
  if (daysLeft <= 7) return 7;
  return null;
}

function alreadyReminded(sentStage: unknown, stage: 7 | 1): boolean {
  return typeof sentStage === 'number' && sentStage <= stage;
}

function within24h(iso: unknown): boolean {
  return typeof iso === 'string' && Date.now() - new Date(iso).getTime() < 86_400_000;
}

/**
 * Before lock: remind recipients whose gift box has no confirmed address — claimed boxes go to
 * the claimer (My Gifts), unclaimed paid boxes go to the invite's recipient (claim link).
 * Each doc records the last stage sent so a retried or repeated run doesn't double-send.
 */
async function runGiftConfirmReminders(): Promise<{ sent: number; skipped: number }> {
  const lockAt = await getLockAt();
  if (!lockAt || isLocked(lockAt)) return { sent: 0, skipped: 0 };
  const stage = giftReminderStage(lockAt);
  if (!stage) return { sent: 0, skipped: 0 };

  const configData = (await db.doc('config/hanukkah-2026').get()).data() ?? {};
  const arrivesByLabel = deliveryDateLabel((configData.estimatedDeliveryBy as string) ?? '2026-11-21');
  const shared = { finalNotice: stage === 1, deadlineLabel: lockDateLabel(lockAt), arrivesByLabel };
  const appBase = process.env.PILOT_APP_BASE_URL ?? 'https://app.grapejuice.co';
  const now = new Date().toISOString();
  let sent = 0;
  let skipped = 0;

  const received = await db.collectionGroup('receivedGifts').get();
  for (const doc of received.docs) {
    const gift = doc.data();
    if (gift.kind !== 'box') continue;
    const unconfirmed =
      gift.status === 'available' || (gift.status === 'accepted' && !gift.checkoutOrderId);
    if (!unconfirmed || alreadyReminded(gift.confirmReminderStage, stage) || within24h(gift.claimedAt)) {
      skipped += 1;
      continue;
    }
    try {
      const giftInviteId = String(gift.giftInviteId ?? doc.id);
      const householdId = doc.ref.parent.parent?.id;
      const uid =
        ((await db.doc(`giftInvites/${giftInviteId}`).get()).data()?.claimedByUid as string | undefined) ??
        (householdId
          ? ((await db.doc(`households/${householdId}`).get()).data()?.ownerId as string | undefined)
          : undefined);
      const email = uid ? ((await db.doc(`users/${uid}`).get()).data()?.email as string | undefined) : undefined;
      if (!email?.includes('@')) {
        skipped += 1;
        continue;
      }
      const delivered = await sendGiftConfirmReminderEmail({
        to: email.trim(),
        giverName: String(gift.giverName ?? 'Someone'),
        ctaUrl: `${appBase}/my-gifts?${GIFT_REMINDER_UTM}`,
        claimed: true,
        hasGiverAddress: isCompleteShippingAddress(gift.giverShippingAddress),
        ...shared,
      });
      if (!delivered) {
        skipped += 1;
        continue;
      }
      await doc.ref.update({ confirmReminderStage: stage, confirmReminderSentAt: now });
      sent += 1;
    } catch (err) {
      logger.error('Gift confirm reminder failed', { receivedGiftId: doc.id, err });
      skipped += 1;
    }
  }

  const invites = await db.collection('giftInvites').get();
  for (const doc of invites.docs) {
    const invite = doc.data() as GiftInviteRecord & { confirmReminderStage?: number };
    if (resolveGiftInviteKind(invite) !== 'box') continue;
    const paid = invite.paymentStatus === 'paid' || Boolean(invite.claimEmailSentAt);
    if (!paid || invite.status === 'claimed' || invite.autoShipOrderId) continue;
    if (alreadyReminded(invite.confirmReminderStage, stage) || within24h(invite.claimEmailSentAt)) {
      skipped += 1;
      continue;
    }
    if (!invite.recipientEmail?.includes('@') || !invite.claimToken) {
      skipped += 1;
      continue;
    }
    try {
      const delivered = await sendGiftConfirmReminderEmail({
        to: invite.recipientEmail.trim(),
        giverName: invite.giverName || 'Someone',
        ctaUrl: `${appBase}/gift/claim?token=${invite.claimToken}&${GIFT_REMINDER_UTM}`,
        claimed: false,
        hasGiverAddress: isCompleteShippingAddress(invite.shippingAddress),
        ...shared,
      });
      if (!delivered) {
        skipped += 1;
        continue;
      }
      await doc.ref.update({ confirmReminderStage: stage, confirmReminderSentAt: now });
      sent += 1;
    } catch (err) {
      logger.error('Gift confirm reminder failed', { giftInviteId: doc.id, err });
      skipped += 1;
    }
  }

  logger.info('Gift confirm reminder batch complete', { sent, skipped, stage });
  return { sent, skipped };
}

async function runExportHeldOrders(): Promise<void> {
  if (!isLocked(await getLockAt())) return;
  const snap = await db
    .collectionGroup('orders')
    .where('status', '==', 'confirmed')
    .where('holidayId', '==', HOLIDAY_ID)
    .get();
  for (const doc of snap.docs) {
    const order = doc.data();
    if (order.orderType !== 'received_gift' && order.orderType !== 'marketplace') continue;
    if (order.marketplaceFulfilledAt) continue;
    const householdId = doc.ref.parent.parent?.id;
    if (!householdId) continue;
    try {
      await fulfillMarketplaceOrder(householdId, doc.id, order, order.playthrough === true);
    } catch (err) {
      logger.error('Held order export failed', { orderId: doc.id, err });
    }
  }
}

async function retryFailedMarketplaceCharges(householdId: string): Promise<void> {
  const open = await db.collection(`households/${householdId}/orders`).where('status', '==', 'committed').get();
  for (const doc of open.docs) {
    const data = doc.data();
    if (data.orderType !== 'marketplace' || !data.chargeFailureMessage) continue;
    if (!lockHasPassed(data.lockAt as string | null | undefined)) continue;
    await chargeSingleMarketplaceOrder(householdId, doc.id, data);
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
  if (!householdId || !data.shippingAddress?.line1 || !data.shippingAddress?.city) {
    throw new HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
  }
  const shippingAddress = sanitizeShippingAddress(data.shippingAddress);
  if (!shippingAddress.stateProvince || !shippingAddress.postalCode) {
    throw new HttpsError('invalid-argument', 'Please enter a state and ZIP code.');
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
  const { boxPriceCents, kidCount } = await boxPriceForUser(db, request.auth.uid, configData);
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

  const estimatedDelivery = (configData.estimatedDeliveryBy as string) ?? '2026-11-24';

  const orderRef = db.collection(`households/${householdId}/orders`).doc();
  await orderRef.set({
    status: 'pending',
    lineItems,
    boxPriceCents,
    kidCount,
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

/**
 * À la carte checkout. Charged now, unless the household has a box: then the card is saved
 * and charged when boxes lock. Guests need an email.
 */
export const createMarketplaceCheckout = onCall(async (request) => {
  try {
    const data = (request.data ?? {}) as CreateMarketplaceCheckoutData;
    const shippingAddress = sanitizeShippingAddress(data.shippingAddress);
    if (!data.shippingAddress?.line1 || !data.shippingAddress?.city) {
      throw new HttpsError('invalid-argument', 'shippingAddress is required.');
    }
    if (!shippingAddress.name || !shippingAddress.stateProvince || !shippingAddress.postalCode) {
      throw new HttpsError(
        'invalid-argument',
        'Please enter name, street, city, state/province, and postal code.'
      );
    }

    const authedUid = request.auth?.uid;
    let householdId = '';
    let guestEmail = '';
    let hhData: FirebaseFirestore.DocumentData = {};
    if (authedUid) {
      householdId = String(data.householdId ?? '').trim();
      if (!householdId) {
        throw new HttpsError('invalid-argument', 'householdId is required.');
      }
      const hhSnap = await assertHouseholdMember(authedUid, householdId);
      hhData = hhSnap.data() ?? {};
    } else {
      guestEmail = String(data.email ?? '').trim().toLowerCase();
      if (!guestEmail.includes('@')) {
        throw new HttpsError('invalid-argument', 'Enter an email so we can send your receipt.');
      }
      householdId = guestHouseholdId(guestEmail);
      const hhRef = db.doc(`households/${householdId}`);
      const existing = await hhRef.get();
      hhData = existing.data() ?? {};
      if (!existing.exists) {
        const now = new Date().toISOString();
        await hhRef.set({
          guest: true,
          guestEmail,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
    const platformCreditCents =
      typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;

    const lineItems = await resolveMarketplaceLineItems(data.lineItems ?? []);
    const subtotalCents = chargeableLineTotal(lineItems);
    if (subtotalCents < 1) {
      throw new HttpsError('invalid-argument', 'Cart total is too small.');
    }

    const shippingCents = SHIPPING_FLAT_CENTS;
    const priced = checkoutTotalsAfterCredit(
      subtotalCents + shippingCents,
      giftCreditCents,
      platformCreditCents
    );
    const { taxCents, totalCents, giftCreditApplied, platformCreditApplied, creditApplied } = priced;

    if (totalCents > 0 && totalCents < 50) {
      throw new HttpsError('invalid-argument', 'Order total is too small.');
    }

    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = configSnap.data() ?? {};
    const estimatedDelivery = (configData.estimatedDeliveryBy as string) ?? '2026-11-24';
    const lockAt = await getLockAt(false);

    const orderRef = db.collection(`households/${householdId}/orders`).doc();
    const skipShipStation = data.skipShipStation === true;
    const metaCtx = metaContextFromCallable(request);
    const attribution = sanitizeAttribution(data.attribution);

    const reservedLines = await db.runTransaction(async (tx) =>
      reserveMarketplaceInventoryInTx(
        db,
        tx,
        lineItems.map((li) => ({ itemId: li.itemId, quantity: li.quantity })),
        lockAt
      )
    );

    const chargeNow = !authedUid || !(await householdHasHanukkahBox(householdId));
    const savedPaymentMethodId =
      typeof hhData.stripeDefaultPaymentMethodId === 'string' ? hhData.stripeDefaultPaymentMethodId : '';
    const needsCard = totalCents > 0 && !savedPaymentMethodId;
    const reservedAt = new Date().toISOString();
    const orderPayload: Record<string, unknown> = {
      status: (chargeNow ? totalCents > 0 : needsCard) ? 'pending' : 'committed',
      chargeTiming: chargeNow ? 'checkout' : 'lock',
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
      lockAt,
      ...(authedUid ? { userId: authedUid } : {}),
      ...(guestEmail ? { guestEmail } : {}),
      estimatedDelivery,
      inventoryReserved: true,
      inventoryReservedAt: reservedAt,
      inventoryReservedLines: reservedLines,
      createdAt: FieldValue.serverTimestamp(),
      ...(attribution ? { attribution } : {}),
    };
    if (skipShipStation) orderPayload.playthrough = true;

    let creditsDeducted = false;
    try {
      await orderRef.set(orderPayload);

      if (creditApplied > 0) {
        await db.doc(`households/${householdId}`).update({
          ...(giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {}),
          ...(platformCreditApplied > 0
            ? { platformCreditCents: platformCreditCents - platformCreditApplied }
            : {}),
          updatedAt: new Date().toISOString(),
        });
        creditsDeducted = true;
      }

      if (!skipShipStation) {
        const buyerEmail =
          guestEmail || (typeof request.auth?.token.email === 'string' ? request.auth.token.email : '');
        await reportUnaffiliatedShippingGeo({ attribution, shippingAddress, email: buyerEmail });
      }

      const purchaseToMeta = async () =>
        sendOrderPurchaseToMeta({
          orderId: orderRef.id,
          order: orderPayload,
          context: metaCtx,
          email: guestEmail || (authedUid ? await emailForMeta(authedUid, request.auth?.token.email) : null),
        });
      // Once money has moved, a failure here must not fall into the release/cancel path below.
      const confirmedNow = async (paymentIntentId: string | null) => {
        try {
          await confirmMarketplaceCharge(householdId, orderRef.id, orderRef, orderPayload, paymentIntentId);
          await purchaseToMeta();
        } catch (postErr) {
          logger.error('Marketplace order paid; follow-up steps failed', { orderId: orderRef.id, postErr });
        }
        return {
          orderId: orderRef.id,
          totalCents,
          clientSecret: null as string | null,
          intent: null as 'setup' | 'payment' | null,
          status: 'confirmed' as const,
        };
      };

      if (chargeNow && totalCents === 0) {
        return await confirmedNow(null);
      }

      if (!chargeNow && !needsCard) {
        await purchaseToMeta();
        return {
          orderId: orderRef.id,
          totalCents,
          clientSecret: null as string | null,
          intent: null as 'setup' | 'payment' | null,
          status: 'committed' as const,
        };
      }

      if (!stripe) {
        throw new HttpsError(
          'failed-precondition',
          'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.'
        );
      }

      let customerId = typeof hhData.stripeCustomerId === 'string' ? hhData.stripeCustomerId : '';
      if (!customerId) {
        const email =
          guestEmail ||
          (authedUid ? String((await db.doc(`users/${authedUid}`).get()).data()?.email ?? '') : '');
        const customer = await stripe.customers.create({
          ...(email.includes('@') ? { email } : {}),
          metadata: { householdId, ...(guestEmail ? { guest: 'true' } : {}) },
        });
        customerId = customer.id;
        await db.doc(`households/${householdId}`).set(
          { stripeCustomerId: customerId, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      }

      if (chargeNow) {
        const metadata: Record<string, string> = {
          householdId,
          orderId: orderRef.id,
          type: 'marketplace',
          chargeTiming: 'checkout',
          ...(authedUid ? { userId: authedUid } : {}),
          ...metaContextToStripeMetadata(metaCtx),
        };
        if (savedPaymentMethodId) {
          try {
            const saved = await stripe.paymentIntents.create(
              {
                amount: totalCents,
                currency: 'usd',
                customer: customerId,
                payment_method: savedPaymentMethodId,
                confirm: true,
                off_session: true,
                metadata: { ...metadata, savedCard: 'true' },
              },
              { idempotencyKey: `marketplace-checkout-${orderRef.id}-saved` }
            );
            if (saved.status === 'succeeded' || saved.status === 'processing') {
              return await confirmedNow(saved.id);
            }
          } catch (savedErr) {
            logger.warn('Saved card declined at checkout; asking for a card', {
              orderId: orderRef.id,
              savedErr,
            });
          }
        }
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: totalCents,
            currency: 'usd',
            customer: customerId,
            automatic_payment_methods: { enabled: true },
            metadata,
          },
          { idempotencyKey: `marketplace-checkout-${orderRef.id}` }
        );
        if (!paymentIntent.client_secret) {
          throw new HttpsError('internal', 'PaymentIntent missing client secret.');
        }
        await orderRef.update({ stripePaymentIntentId: paymentIntent.id });
        return {
          clientSecret: paymentIntent.client_secret,
          orderId: orderRef.id,
          totalCents,
          intent: 'payment' as const,
          status: 'pending' as const,
        };
      }

      const setupIntent = await createCardSetupIntent({
        customer: customerId,
        usage: 'off_session',
        metadata: {
          householdId,
          orderId: orderRef.id,
          type: 'marketplace',
          ...(authedUid ? { userId: authedUid } : {}),
          ...metaContextToStripeMetadata(metaCtx),
        },
      });
      if (!setupIntent.client_secret) {
        throw new HttpsError('internal', 'SetupIntent missing client secret.');
      }

      return {
        clientSecret: setupIntent.client_secret,
        orderId: orderRef.id,
        totalCents,
        intent: 'setup' as const,
        status: 'pending' as const,
      };
    } catch (innerErr) {
      // Release reservation if we fail after reserving (Stripe/config errors).
      try {
        await releaseMarketplaceReservations(db, reservedLines);
        await orderRef.set(
          {
            status: 'cancelled',
            cancelReason: 'checkout_failed_after_reserve',
            inventoryReserved: false,
            reservationReleasedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (releaseErr) {
        logger.error('Failed to release marketplace reservation after checkout error', releaseErr);
      }
      if (creditsDeducted && (giftCreditApplied > 0 || platformCreditApplied > 0)) {
        try {
          await db.doc(`households/${householdId}`).update({
            ...(giftCreditApplied > 0
              ? { giftCreditCents: FieldValue.increment(giftCreditApplied) }
              : {}),
            ...(platformCreditApplied > 0
              ? { platformCreditCents: FieldValue.increment(platformCreditApplied) }
              : {}),
            updatedAt: new Date().toISOString(),
          });
        } catch (creditErr) {
          logger.error('Failed to restore marketplace credit after checkout error', creditErr);
        }
      }
      throw innerErr;
    }
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
  const setupIntent = await createCardSetupIntent({
    customer: customerId,
    metadata: {
      householdId,
      userId: request.auth.uid,
      ...metaContextToStripeMetadata(metaContextFromCallable(request)),
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
  if (!householdId || !data.shippingAddress?.line1 || !data.shippingAddress?.city) {
    throw new HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
  }
  const shippingAddress = sanitizeShippingAddress(data.shippingAddress);
  if (!shippingAddress.stateProvince || !shippingAddress.postalCode) {
    throw new HttpsError('invalid-argument', 'Please enter a state and ZIP code.');
  }

  const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
  const hhData = hhSnap.data() ?? {};
  const cardOnFile = !!hhData.cardOnFileAt;
  const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
  const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;

  const lockAt = await getLockAt(false);
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
  const { boxPriceCents, kidCount } = await boxPriceForUser(db, request.auth.uid, configData);
  const subtotalCents = orderTotalCents(
    lineItems as Array<{ unitCents?: number; quantity?: number; slotId?: string }>,
    boxPriceCents
  );
  const shippingCents = SHIPPING_FLAT_CENTS;
  const priced = checkoutTotalsAfterCredit(
    subtotalCents + shippingCents,
    giftCreditCents,
    platformCreditCents
  );
  const { taxCents, totalCents, giftCreditApplied, platformCreditApplied, creditApplied } = priced;

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

  const isPlaythrough = data.skipShipStation === true;
  if (!isPlaythrough) {
    await assertBoxLinesWithinInventory(db, lineItems);
  }

  const estimatedDelivery = (configData.estimatedDeliveryBy as string) ?? '2026-11-24';
  const attribution = sanitizeAttribution(data.attribution);

  const orderRef = db.collection(`households/${householdId}/orders`).doc();
  const orderPayload: Record<string, unknown> = {
    status: 'committed',
    orderType: 'hanukkah_box',
    lineItems,
    boxPriceCents,
    kidCount,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents,
    creditAppliedCents: creditApplied,
    giftCreditAppliedCents: giftCreditApplied,
    platformCreditAppliedCents: platformCreditApplied,
    expeditedShipping: false,
    shippingAddress,
    holidayId: HOLIDAY_ID,
    userId: request.auth.uid,
    lockAt,
    estimatedDelivery,
    committedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    ...(isPlaythrough ? { playthrough: true } : {}),
    ...(attribution ? { attribution } : {}),
  };
  await orderRef.set(orderPayload);

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

  // Exit signal for the account setup nudge (Untraditional workspace).
  const commitEmail = typeof request.auth.token.email === 'string' ? request.auth.token.email : '';
  if (commitEmail) {
    await untraditionalMarkSafe(commitEmail, {
      grapejuice_setup_complete: true,
      grapejuice_setup_complete_at: new Date().toISOString(),
    });
  }

  if (!isPlaythrough) {
    try {
      const alloc = await recomputeBoxAllocations(db);
      logger.info('commitPilotBox box allocations', { orderId: orderRef.id, ...alloc });
    } catch (allocErr) {
      logger.error('commitPilotBox recomputeBoxAllocations failed', {
        orderId: orderRef.id,
        allocErr,
      });
    }
  }

  await sendOrderPurchaseToMeta({
    orderId: orderRef.id,
    order: orderPayload,
    context: metaContextFromCallable(request),
    email: await emailForMeta(request.auth.uid, request.auth.token.email),
    phone: data.contactPhone?.trim() || null,
  });

  if (!isPlaythrough) {
    await reportUnaffiliatedShippingGeo({ attribution, shippingAddress, email: commitEmail });
  }

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
  const { boxPriceCents, kidCount } = await boxPriceForUser(
    db,
    typeof order.userId === 'string' ? order.userId : request.auth.uid,
    configData
  );
  const expeditedShipping = order.expeditedShipping === true;
  const subtotalCents = orderTotalCents(
    lineItems as Array<{ unitCents?: number; quantity?: number; slotId?: string }>,
    boxPriceCents
  );
  const shippingCents =
    typeof order.shippingCents === 'number'
      ? order.shippingCents
      : SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
  const giftCreditApplied =
    typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
  const platformCreditApplied =
    typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
  const priced = checkoutTotalsAfterCredit(
    subtotalCents + shippingCents,
    giftCreditApplied,
    platformCreditApplied
  );
  const { taxCents, totalCents, creditApplied } = priced;

  const previousTotal =
    typeof order.totalCents === 'number' ? order.totalCents : 0;

  const priorLines = (order.lineItems as Array<{ itemId?: string; quantity?: number }>) ?? [];
  if (order.playthrough !== true) {
    await assertBoxLinesWithinInventory(db, lineItems, { creditLines: priorLines });
  }

  await orderRef.update({
    lineItems,
    boxPriceCents,
    kidCount,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents,
    creditAppliedCents: creditApplied,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (order.playthrough !== true) {
    try {
      const alloc = await recomputeBoxAllocations(db);
      logger.info('updatePilotBoxOrder box allocations', { orderId, ...alloc });
    } catch (allocErr) {
      logger.error('updatePilotBoxOrder recomputeBoxAllocations failed', { orderId, allocErr });
    }
  }

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

  if (order.playthrough !== true) {
    try {
      const alloc = await recomputeBoxAllocations(db);
      logger.info('cancelPilotBoxOrder box allocations', { orderId, ...alloc });
    } catch (allocErr) {
      logger.error('cancelPilotBoxOrder recomputeBoxAllocations failed', { orderId, allocErr });
    }
  }

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
        id: string;
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
        const setupOrderId = si.metadata?.orderId;
        const metaCtx = metaContextFromStripeMetadata(si.metadata);
        const setupUserId = si.metadata?.userId ?? null;
        let metaEmail: string | null = null;
        try {
          metaEmail = await emailForMeta(setupUserId);
        } catch (emailErr) {
          logger.warn('Meta: could not load email for setup intent', { setupIntentId: si.id, emailErr });
        }
        let committedMarketplaceOrder: FirebaseFirestore.DocumentData | null = null;
        if (si.metadata?.type === 'marketplace' && setupOrderId) {
          const pendingRef = db.doc(`households/${householdId}/orders/${setupOrderId}`);
          const pendingSnap = await pendingRef.get();
          if (pendingSnap.exists && pendingSnap.data()?.status === 'pending') {
            await pendingRef.update({
              status: 'committed',
              updatedAt: new Date().toISOString(),
            });
            committedMarketplaceOrder = pendingSnap.data() ?? null;
          }
        }
        await sendMetaEvent({
          eventName: 'AddPaymentInfo',
          eventId: `payment_${si.id}`,
          context: metaCtx,
          user: { email: metaEmail, externalId: setupUserId },
          stripeBacked: true,
          playthrough: committedMarketplaceOrder?.playthrough === true,
        });
        if (committedMarketplaceOrder && setupOrderId) {
          await sendOrderPurchaseToMeta({
            orderId: setupOrderId,
            order: committedMarketplaceOrder,
            context: metaCtx,
            email: metaEmail,
          });
        }
        try {
          await retryFailedHanukkahBoxCharges(db, stripe, householdId);
        } catch (retryErr) {
          logger.warn('Could not retry Hanukkah box charge after card update', {
            householdId,
            retryErr,
          });
        }
        try {
          await retryFailedMarketplaceCharges(householdId);
        } catch (retryErr) {
          logger.warn('Could not retry marketplace charge after card update', { householdId, retryErr });
        }
        if (si.metadata?.type === 'marketplace' && setupOrderId) {
          const savedRef = db.doc(`households/${householdId}/orders/${setupOrderId}`);
          const savedSnap = await savedRef.get();
          const saved = savedSnap.data();
          if (saved?.status === 'committed' && lockHasPassed(saved.lockAt as string | null | undefined)) {
            try {
              await chargeSingleMarketplaceOrder(householdId, setupOrderId, saved);
            } catch (chargeErr) {
              logger.warn('Could not charge marketplace order after card save', {
                householdId,
                orderId: setupOrderId,
                chargeErr,
              });
            }
          }
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
            const isMarketplaceOrder =
              order.orderType === 'marketplace' || pi.metadata?.type === 'marketplace';
            const isReceivedGift =
              order.orderType === 'received_gift' || pi.metadata?.type === 'received_gift';

            if (isMarketplaceOrder) {
              try {
                const shouldCommit = await db.runTransaction(async (tx) => {
                  const snap = await tx.get(orderRef);
                  const data = snap.data() ?? {};
                  if (data.inventoryCommittedAt || data.inventoryReserved !== true) return false;
                  tx.update(orderRef, {
                    inventoryReserved: false,
                    inventoryCommittedAt: new Date().toISOString(),
                  });
                  return true;
                });
                if (shouldCommit) {
                  await commitMarketplaceReservations(db, reservedLinesFromOrder(order));
                }
              } catch (invErr) {
                logger.error('Marketplace inventory commit failed', { orderId, invErr });
              }
            }

            await orderRef.update({
              status: 'confirmed',
              confirmedAt: FieldValue.serverTimestamp(),
              stripePaymentIntentId: pi.id,
              chargeFailedAt: FieldValue.delete(),
              chargeFailureMessage: FieldValue.delete(),
            });
            const fresh = (await orderRef.get()).data() ?? order;
            if (isMarketplaceOrder && pi.metadata?.chargeTiming === 'checkout') {
              try {
                await sendOrderPurchaseToMeta({
                  orderId,
                  order: fresh,
                  context: metaContextFromStripeMetadata(pi.metadata),
                  email: await emailForMeta(pi.metadata.userId, fresh.guestEmail as string | undefined),
                });
              } catch (metaErr) {
                logger.warn('Meta purchase for marketplace checkout failed', { orderId, metaErr });
              }
            }
            if (isMarketplaceOrder || isReceivedGift) {
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
                if (fresh.playthrough !== true) {
                  await recomputeBoxAllocationsLogged('received_gift payment', {
                    orderId,
                    giftInviteId,
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
          const attempt = Number(pi.metadata.chargeAttempt);
          const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
          const orderSnap = await orderRef.get();
          const status = orderSnap.data()?.status;
          if (status === 'committed' || status === 'pending') {
            await orderRef.update({
              chargeFailedAt: new Date().toISOString(),
              chargeFailureMessage: message,
            });
            await notifyHanukkahBoxChargeFailed(
              db,
              householdId,
              orderId,
              Number.isFinite(attempt) ? attempt : 1,
              message
            );
          }
          logger.warn('Hanukkah box charge failed', { householdId, orderId, message });
        }
      }
      if (pi.metadata?.type === 'marketplace') {
        const householdId = pi.metadata.householdId;
        const orderId = pi.metadata.orderId;
        if (householdId && orderId) {
          const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
          const orderSnap = await orderRef.get();
          const order = orderSnap.data();
          const message = pi.last_payment_error?.message ?? 'Payment failed';
          if (order?.status === 'committed') {
            await orderRef.update({
              chargeFailedAt: new Date().toISOString(),
              chargeFailureMessage: message,
            });
          } else if (pi.metadata.chargeTiming === 'checkout') {
            // Shopper can retry on the same payment; the stale-reservation sweep frees abandoned holds.
            logger.info('Marketplace checkout payment declined', { householdId, orderId, message });
          } else if (order?.inventoryReserved === true && !order.reservationReleasedAt) {
            try {
              await releaseMarketplaceReservations(db, reservedLinesFromOrder(order));
              await orderRef.update({
                inventoryReserved: false,
                reservationReleasedAt: new Date().toISOString(),
                chargeFailedAt: new Date().toISOString(),
                chargeFailureMessage: message,
              });
            } catch (relErr) {
              logger.error('Marketplace reservation release on payment_failed failed', relErr);
            }
          }
        }
      }
    }
    if (event.type === 'payment_intent.canceled') {
      const pi = event.data.object as { id: string; metadata?: Record<string, string> };
      if (pi.metadata?.type === 'marketplace') {
        const householdId = pi.metadata.householdId;
        const orderId = pi.metadata.orderId;
        if (householdId && orderId) {
          const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
          const orderSnap = await orderRef.get();
          const order = orderSnap.data();
          if (order?.inventoryReserved === true && !order.reservationReleasedAt) {
            try {
              await releaseMarketplaceReservations(db, reservedLinesFromOrder(order));
              await orderRef.update({
                inventoryReserved: false,
                reservationReleasedAt: new Date().toISOString(),
                status: 'cancelled',
                cancelReason: 'payment_intent_canceled',
              });
            } catch (relErr) {
              logger.error('Marketplace reservation release on canceled failed', relErr);
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

  const inviterEmail = String(request.auth.token.email ?? '');
  const inviterLabel =
    invitedByName.trim() && invitedByName !== 'Partner' ? invitedByName.trim() : inviterEmail;
  try {
    const acceptUrl = await mintInviteAcceptUrl(db, { householdId, inviteId: inviteRef.id, email });
    await sendEmail({
      to: email,
      template: 'partner-invite',
      data: {
        householdName,
        invitedByName: inviterLabel,
        inviteId: inviteRef.id,
        accept_url: acceptUrl,
      },
    });
  } catch (err) {
    logger.error('Partner invite email failed', err);
  }

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

/**
 * ShipStation → Grapejuice tracking writeback.
 * Configure in ShipStation: Settings → Integrations → Webhooks
 * SHIP_NOTIFY (label created) and FULFILLMENT_SHIPPED (Mark as Shipped).
 * URL: https://<region>-<project>.cloudfunctions.net/shipStationWebhook?key=<SHIPSTATION_WEBHOOK_SECRET>
 */
export const shipStationWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  if (!verifyShipStationWebhookSecret(req)) {
    res.status(401).send('Unauthorized');
    return;
  }

  try {
    const body =
      typeof req.body === 'object' && req.body != null
        ? (req.body as Record<string, unknown>)
        : (JSON.parse(String((req as { rawBody?: Buffer }).rawBody ?? '{}')) as Record<
            string,
            unknown
          >);
    const result = await processShipStationShipNotify(db, body);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logger.error('ShipStation webhook failed', err);
    res.status(500).send('Webhook Error');
  }
});

/** Signed-out givers pass `giverEmail`; the gift is filed under that email's account (see giverUidForEmail). */
export const purchasePilotGift = onCall(async (request) => {
  if (!stripe) throw new HttpsError('failed-precondition', 'Stripe is not configured.');
  const guestGiverEmail = request.auth?.uid ? null : normalizeEmail(request.data?.giverEmail);

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
  if (giftKind === 'box' && isLocked(await getLockAt())) {
    throw new HttpsError(
      'failed-precondition',
      'Gift boxes for this Hanukkah closed when boxes locked. You can still send gift credit.'
    );
  }
  const priceConfig = (await db.doc('config/hanukkah-2026').get()).data() ?? {};
  const listCents =
    typeof priceConfig.boxPriceCents === 'number' ? priceConfig.boxPriceCents : DEFAULT_BOX_PRICE_CENTS;
  const perExtraKidCents = boxPriceCentsForKids(2, listCents) - listCents;
  if (giftKind === 'box') {
    const addOnCents = (lineItems ?? []).reduce((sum: number, li: { unitCents?: unknown; quantity?: unknown }) => {
      const unit = Math.max(0, Math.round(Number(li?.unitCents) || 0));
      return sum + unit * Math.max(1, Math.floor(Number(li?.quantity) || 1));
    }, 0);
    const minCents = boxPriceCentsForKids(Math.max(1, childAgeGroups?.length ?? 0), listCents) + addOnCents;
    if (creditCents < minCents) {
      throw new HttpsError('invalid-argument', 'The gift total is out of date. Refresh the page and try again.');
    }
  } else {
    // Credit matches a box price: list price plus whole extra kids.
    const extraCents = creditCents - listCents;
    if (extraCents < 0 || extraCents % perExtraKidCents !== 0 || extraCents > 16 * perExtraKidCents) {
      throw new HttpsError('invalid-argument', 'That gift credit amount isn’t available.');
    }
  }
  if (giftKind === 'box' && lineItems?.length) {
    await assertBoxLinesWithinInventory(db, lineItems);
  }
  const shippingAddressRaw = request.data?.shippingAddress as ShippingAddress | undefined;
  const giverShippingAddress =
    giftKind === 'box' && shippingAddressRaw?.line1 ? sanitizeShippingAddress(shippingAddressRaw) : null;
  if (
    giverShippingAddress &&
    (!giverShippingAddress.name ||
      !giverShippingAddress.city ||
      !giverShippingAddress.stateProvince ||
      !giverShippingAddress.postalCode)
  ) {
    throw new HttpsError('invalid-argument', 'Please complete their shipping address, or leave it blank.');
  }

  let giverUid: string;
  let giverEmail: string;
  if (guestGiverEmail) {
    await enforceRateLimits(db, guestGiverEmail, request.rawRequest, 'gift:');
    giverEmail = guestGiverEmail;
    giverUid = await giverUidForEmail(guestGiverEmail, String(request.data?.giverName ?? '').trim() || null);
  } else {
    giverUid = request.auth!.uid;
    const userSnap = await db.doc(`users/${giverUid}`).get();
    giverEmail = String(userSnap.data()?.email ?? request.auth!.token.email ?? '').trim().toLowerCase();
  }
  const claimToken = randomBytes(24).toString('hex');
  const inviteRef = db.collection('giftInvites').doc();
  const metaContext = metaContextForDoc(metaContextFromCallable(request));
  const attribution = sanitizeAttribution(request.data?.attribution);
  const payload: GiftInviteRecord = {
    giverUid,
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
    ...(giverShippingAddress ? { shippingAddress: giverShippingAddress } : {}),
    ...(Object.keys(metaContext).length ? { metaContext } : {}),
    ...(attribution ? { attribution } : {}),
    createdAt: new Date().toISOString(),
  };
  await inviteRef.set(payload);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: creditCents,
    currency: 'usd',
    metadata: {
      type: 'pilot_gift',
      giftInviteId: inviteRef.id,
      giverUid,
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
    publishableKey: stripePublishableKey || null,
    claimToken,
    claimUrl,
  };
});

/** Signed-out givers prove the gift is theirs with the claimToken purchasePilotGift returned. */
export const finalizePilotGiftPayment = onCall(async (request) => {
  const giftInviteId = String(request.data?.giftInviteId ?? '').trim();
  if (!giftInviteId) throw new HttpsError('invalid-argument', 'giftInviteId is required.');
  const claimToken = typeof request.data?.claimToken === 'string' ? request.data.claimToken : '';

  const inviteSnap = await db.collection('giftInvites').doc(giftInviteId).get();
  if (!inviteSnap.exists) throw new HttpsError('not-found', 'Gift invite not found.');
  const invite = inviteSnap.data() as GiftInviteRecord;
  const isGiver = Boolean(request.auth?.uid) && invite.giverUid === request.auth?.uid;
  const hasToken = Boolean(claimToken) && claimToken === invite.claimToken;
  if (!isGiver && !hasToken) {
    throw new HttpsError('permission-denied', 'Only the giver can finalize this gift.');
  }

  try {
    const result = await finalizeGiftInvitePayment(db, giftInviteId, metaContextFromCallable(request));
    return { ok: true, claimUrl: result.claimUrl, alreadyFinalized: result.alreadyFinalized };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment not completed';
    throw new HttpsError('failed-precondition', message);
  }
});

/**
 * Box builders below this "How often do you do Jewish stuff?" score also get a server-only
 * BoxFollowUp event for the Meta follow-up audience. Meta receives membership, never the score
 * or the cutoff: religious practice is sensitive data under Meta's Business Tools Terms.
 */
const FOLLOW_UP_MAX_PRACTICE_FREQUENCY = 40;

/**
 * Conversions API copy of non-checkout browser events. CompleteRegistration sends once
 * per account (`reg_<uid>`); PreRegister and BoxBuilt reuse the browser's event id for dedupe.
 */
export const trackMetaEvent = onCall(async (request) => {
  const eventName = request.data?.eventName;
  if (eventName !== 'CompleteRegistration' && eventName !== 'PreRegister' && eventName !== 'BoxBuilt') {
    throw new HttpsError('invalid-argument', 'Unsupported event.');
  }
  const context = metaContextFromCallable(request);
  if (context.skip) return { ok: true };
  const uid = request.auth?.uid ?? null;
  const email = uid ? await emailForMeta(uid, request.auth?.token.email) : null;

  if (eventName === 'CompleteRegistration') {
    if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
    const userRef = db.doc(`users/${uid}`);
    const firstSend = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      // Never create the profile here — SessionContext treats an existing doc as onboarded state.
      if (!snap.exists || snap.data()?.metaRegistrationSentAt) return false;
      tx.update(userRef, { metaRegistrationSentAt: new Date().toISOString() });
      return true;
    });
    if (firstSend) {
      await sendMetaEvent({
        eventName,
        eventId: `reg_${uid}`,
        context,
        user: { email, externalId: uid },
      });
    }
    return { ok: true };
  }

  const contentName =
    typeof request.data?.contentName === 'string' ? request.data.contentName.trim().slice(0, 100) : '';
  await sendMetaEvent({
    eventName,
    eventId:
      context.eventId ??
      `${eventName === 'BoxBuilt' ? 'boxbuilt' : 'prereg'}_${randomBytes(8).toString('hex')}`,
    context,
    user: { email, externalId: uid },
    ...(contentName ? { customData: { content_name: contentName } } : {}),
  });

  const frequency = Number(request.data?.practiceFrequencyScore);
  if (eventName === 'BoxBuilt' && Number.isFinite(frequency) && frequency < FOLLOW_UP_MAX_PRACTICE_FREQUENCY) {
    await sendMetaEvent({
      eventName: 'BoxFollowUp',
      eventId: `followup_${randomBytes(8).toString('hex')}`,
      context,
      user: { email, externalId: uid },
    });
  }
  return { ok: true };
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
  const purchasedKind = resolveGiftInviteKind(invite);
  const giftKind =
    purchasedKind === 'box' && !invite.autoShipOrderId && isLocked(await getLockAt())
      ? ('credit' as const)
      : purchasedKind;
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
  const purchasedKind = resolveGiftInviteKind(invite);
  // Past lock, a box that didn't already ship to the giver's address arrives as credit.
  const boxBecameCredit =
    purchasedKind === 'box' && !invite.autoShipOrderId && isLocked(await getLockAt());
  const giftKind = boxBecameCredit ? ('credit' as const) : purchasedKind;
  const autoShipped = giftKind === 'box' && Boolean(invite.autoShipOrderId);

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
    giverShippingAddress: giftKind === 'box' ? invite.shippingAddress ?? null : null,
    status: autoShipped ? 'accepted' : 'available',
    ...(autoShipped
      ? { acceptedAt: now, checkoutOrderId: invite.autoShipOrderId, surprise: true, autoShippedAt: now }
      : {}),
    ...(boxBecameCredit ? { autoConvertedAt: now } : {}),
    claimedAt: now,
    updatedAt: now,
  });

  await inviteDoc.ref.update({
    status: 'claimed',
    kind: purchasedKind,
    ...(boxBecameCredit ? { claimedAsCredit: true } : {}),
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
    alreadyShipping: autoShipped,
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
  giverShippingAddress?: ShippingAddress;
  surprise?: boolean;
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
    giverShippingAddress:
      data.giverShippingAddress && typeof data.giverShippingAddress === 'object'
        ? (data.giverShippingAddress as ShippingAddress)
        : undefined,
    surprise: data.surprise === true ? true : undefined,
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
    giverShippingAddress: giftKind === 'box' ? invite.shippingAddress ?? null : null,
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
  await assertBoxLinesWithinInventory(db, lineItems, {
    creditLines: await heldReceivedGiftLines(db, householdId, giftInviteId, existingLines),
  });
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
  await recomputeBoxAllocationsLogged('updateReceivedGiftLineItems', { giftInviteId });
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
    const lockAt = await getLockAt();
    if (isLocked(lockAt)) {
      throw new HttpsError(
        'failed-precondition',
        'The deadline to confirm gift boxes has passed. Email hello@grapejuice.co and we’ll help.'
      );
    }
    // "Keep it a surprise" used to accept without an address; those still need one checkout.
    const acceptedWithoutCheckout = gift.status === 'accepted' && !gift.checkoutOrderId;
    if (gift.status !== 'available' && !acceptedWithoutCheckout) {
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
    const priced = checkoutTotalsAfterCredit(
      subtotalCents + shippingCents,
      giftCreditCents,
      platformCreditCents
    );
    const { taxCents, totalCents, giftCreditApplied, platformCreditApplied, creditApplied } = priced;

    if (totalCents > 0 && totalCents < 50) {
      throw new HttpsError('invalid-argument', 'Order total is too small.');
    }

    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = configSnap.data() ?? {};
    const estimatedDelivery = (configData.estimatedDeliveryBy as string) ?? '2026-11-24';
    const skipShipStation = request.data?.skipShipStation === true;
    if (!skipShipStation) {
      await assertBoxLinesWithinInventory(db, lineItems, {
        creditLines: await heldReceivedGiftLines(db, householdId, giftInviteId, gift.lineItems),
      });
    }

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
      lockAt,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (totalCents === 0) orderPayload.confirmedAt = FieldValue.serverTimestamp();
    if (skipShipStation) orderPayload.playthrough = true;
    if (request.data?.surprise === true) orderPayload.giftSurprise = true;
    await orderRef.set(orderPayload);

    await giftRef.update({
      lineItems,
      viewedAt: gift.viewedAt ?? now,
      updatedAt: now,
      checkoutOrderId: orderRef.id,
      surprise: request.data?.surprise === true,
    });
    if (!skipShipStation) {
      await recomputeBoxAllocationsLogged('createReceivedGiftCheckout', {
        orderId: orderRef.id,
        giftInviteId,
      });
    }

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
  await recomputeBoxAllocationsLogged('convertReceivedGiftToCredit', { giftInviteId });

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

/** Daily batch — eligible users who have not completed debrief (only after Hanukkah ends). */
export const scheduledDebriefReminders = onSchedule('every day 10:00', async () => {
  await runDebriefReminderBatch(db);
});

/** Daily batch — lock countdown for users with uncommitted box drafts. */
export const scheduledLockReminders = onSchedule('every day 09:00', async () => {
  const lockAt = await getLockAt();
  if (!lockAt || isLocked(lockAt)) return;
  await runLockReminderBatch(db, lockAt);
});

/** Gift boxes without a confirmed address: a week before lock and on deadline day. Stubs until the template env var is set. */
export const scheduledGiftConfirmReminders = onSchedule(
  { schedule: 'every day 10:00', timeZone: 'America/New_York' },
  async () => {
    await runGiftConfirmReminders();
  }
);

/** Daily batch — account holders with a box draft but no shipping/payment yet (Customer.io event). */
export const scheduledSetupNudges = onSchedule('every day 08:00', async () => {
  if (process.env.GJ_SETUP_NUDGE_ENABLED !== 'true') {
    logger.info('scheduledSetupNudges skipped — GJ_SETUP_NUDGE_ENABLED is not true');
    return;
  }
  const lockAt = await getLockAt();
  if (!lockAt || isLocked(lockAt)) return;
  await runSetupNudgeBatch(db, lockAt);
});

/** Charge committed Hanukkah box orders once lockAt has passed (final draft totals). */
export const scheduledChargePilotBoxes = onSchedule('every 1 hours', async () => {
  if (!stripe) {
    logger.warn('scheduledChargePilotBoxes skipped — Stripe not configured');
  } else {
    await runChargeEligiblePilotBoxOrders(db, stripe);
    await runChargeEligibleMarketplaceOrders();
  }
  try {
    await runSettleUnconfirmedGiftBoxes();
    await runExportHeldOrders();
  } catch (giftErr) {
    logger.error('runExportHeldOrders failed', giftErr);
  }
  try {
    const alloc = await recomputeBoxAllocations(db);
    logger.info('scheduledChargePilotBoxes box allocations', alloc);
  } catch (allocErr) {
    logger.error('recomputeBoxAllocations failed', allocErr);
  }
});

/** Release stale marketplace inventory reservations (pending unpaid checkouts). */
export const scheduledReleaseStaleMarketplaceReservations = onSchedule(
  'every 1 hours',
  async () => {
    const result = await releaseStaleMarketplaceReservations(db);
    logger.info('scheduledReleaseStaleMarketplaceReservations', result);
  }
);

/** Admin / QA: recompute boxAllocatedQty from active box orders (any time). */
export const recomputeCatalogBoxAllocations = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!isAdminToken(request.auth.token)) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
  return recomputeBoxAllocations(db);
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
