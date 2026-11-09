/**
 * One-off changes to a Hanukkah box that has already been charged: new lines, new totals, and a
 * second charge on the saved card for the difference.
 *
 * Ops request one by writing `boxAdjustments/{id}` (server-only; see scripts/box-adjustment.mjs):
 *   { householdId, orderId, lineItems, reason, mode: 'quote' | 'charge', expectedDifferenceCents?, oversellItemIds? }
 * `quote` only prices and checks stock. `charge` re-quotes and refuses unless the difference still
 * equals `expectedDifferenceCents`, so a customer is never billed for anything but the quote they
 * agreed to. Items in `oversellItemIds` may go past stock (ops has promised them anyway); the quote
 * lists them under `oversold` instead of blocking. On success the order, the draft, ShipStation and stock holds all move to the new lines.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from './logger';
import { withSentry } from './sentry';
import { stripe } from './stripe';
import { exportOrderToShipStation } from './shipstation';
import { assertBoxLinesWithinInventory, HOLIDAY_ID, recomputeBoxAllocations } from './catalogInventory';
import { computeCommittedBoxTotals, isHanukkahBoxOrder } from './chargePilotBox';
import type { PromoTerms } from './promoPricing';

export type AdjustmentLine = {
  slotId: string;
  itemId: string;
  quantity: number;
  unitCents: number;
  label?: string;
  childId?: string;
  includedQty?: number;
};

export type AdjustmentQuote = {
  lineItems: AdjustmentLine[];
  previousTotalCents: number;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  differenceCents: number;
  problems: string[];
  oversold: string[];
};

const cents = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/** Why an order can't take an adjustment, or null. Only paid boxes that haven't shipped qualify. */
export function adjustmentBlocker(order: FirebaseFirestore.DocumentData | undefined): string | null {
  if (!order) return 'Order not found';
  if (!isHanukkahBoxOrder(order)) return 'Not a Hanukkah box order';
  if (order.status !== 'confirmed') return `Order is ${order.status ?? 'unknown'}, not confirmed`;
  if (order.shippedAt || order.trackingNumber) return 'Order has already shipped';
  if (typeof order.boxPriceCents !== 'number') return 'Order has no box price';
  return null;
}

/**
 * Totals for the new lines at the order's own box price, credit and promo, so the only change is
 * what the lines add. `differenceCents` is what's left to charge (negative means a refund is owed).
 */
export function boxAdjustmentTotals(
  order: FirebaseFirestore.DocumentData,
  lineItems: AdjustmentLine[]
): Omit<AdjustmentQuote, 'problems' | 'oversold'> {
  const totals = computeCommittedBoxTotals(
    lineItems,
    cents(order.boxPriceCents),
    order.expeditedShipping === true,
    cents(order.giftCreditAppliedCents),
    cents(order.platformCreditAppliedCents),
    (order.promo as Partial<PromoTerms> | null | undefined) ?? null
  );
  const previousTotalCents = cents(order.totalCents);
  return {
    lineItems,
    previousTotalCents,
    subtotalCents: totals.subtotalCents,
    shippingCents: totals.shippingCents,
    discountCents: totals.discountCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    differenceCents: totals.totalCents - previousTotalCents,
  };
}

function normalizeLines(raw: unknown): AdjustmentLine[] {
  if (!Array.isArray(raw) || !raw.length) throw new Error('lineItems must be a non-empty array');
  return raw.map((r, i) => {
    const li = (r ?? {}) as Record<string, unknown>;
    const slotId = String(li.slotId ?? '').trim();
    const itemId = String(li.itemId ?? '').trim();
    const quantity = Math.floor(Number(li.quantity ?? 1));
    const unitCents = Math.round(Number(li.unitCents ?? 0));
    if (!slotId || !itemId) throw new Error(`Line ${i + 1} needs slotId and itemId`);
    if (!(quantity > 0) || !(unitCents >= 0)) throw new Error(`Line ${i + 1} has a bad quantity or price`);
    return {
      slotId,
      itemId,
      quantity,
      unitCents,
      ...(typeof li.label === 'string' && li.label ? { label: li.label } : {}),
      ...(typeof li.childId === 'string' && li.childId ? { childId: li.childId } : {}),
      ...(typeof li.includedQty === 'number' ? { includedQty: li.includedQty } : {}),
    };
  });
}

/** Labels from the catalog, plus a stock problem for each item the new lines can't have. */
async function checkLines(
  db: Firestore,
  lines: AdjustmentLine[],
  orderLines: Array<{ itemId?: string; quantity?: number }>,
  oversellIds: Set<string>
): Promise<{ lines: AdjustmentLine[]; problems: string[]; oversold: string[] }> {
  const problems: string[] = [];
  const oversold: string[] = [];
  const ids = [...new Set(lines.map((l) => l.itemId))];
  const names = new Map<string, string>();
  for (const id of ids) {
    const snap = await db.doc(`catalog/hanukkah/items/${id}`).get();
    if (!snap.exists) {
      problems.push(`Unknown product: ${id}`);
      continue;
    }
    names.set(id, String(snap.data()?.name ?? id));
    try {
      await assertBoxLinesWithinInventory(
        db,
        lines.filter((l) => l.itemId === id),
        { creditLines: orderLines.filter((l) => l.itemId === id) }
      );
    } catch (err) {
      const message = err instanceof HttpsError ? err.message : String(err);
      (oversellIds.has(id) ? oversold : problems).push(message);
    }
  }
  return {
    lines: lines.map((l) => ({ ...l, label: l.label ?? names.get(l.itemId) ?? l.itemId })),
    problems,
    oversold,
  };
}

export async function quoteBoxAdjustment(
  db: Firestore,
  householdId: string,
  orderId: string,
  rawLines: unknown,
  oversellItemIds: unknown = []
): Promise<AdjustmentQuote> {
  const order = (await db.doc(`households/${householdId}/orders/${orderId}`).get()).data();
  const blocker = adjustmentBlocker(order);
  if (blocker) throw new Error(blocker);
  const orderLines = (order!.lineItems as Array<{ itemId?: string; quantity?: number }>) ?? [];
  const oversellIds = new Set(Array.isArray(oversellItemIds) ? oversellItemIds.map(String) : []);
  const { lines, problems, oversold } = await checkLines(db, normalizeLines(rawLines), orderLines, oversellIds);
  const totals = boxAdjustmentTotals(order!, lines);
  if (totals.differenceCents < 0) problems.push('The new box costs less than what was charged; refunds are not handled here');
  return { ...totals, problems, oversold };
}

type Outcome = Record<string, unknown> & { status: string };

async function chargeBoxAdjustment(
  db: Firestore,
  adjustmentId: string,
  req: FirebaseFirestore.DocumentData
): Promise<Outcome> {
  const householdId = String(req.householdId);
  const orderId = String(req.orderId);
  const quote = await quoteBoxAdjustment(db, householdId, orderId, req.lineItems, req.oversellItemIds);
  if (quote.problems.length) return { status: 'rejected', reason: 'Quote has problems', quote };
  if (quote.differenceCents <= 0) return { status: 'rejected', reason: 'Nothing to charge', quote };
  if (quote.differenceCents !== Math.round(Number(req.expectedDifferenceCents))) {
    return { status: 'rejected', reason: 'Difference no longer matches the agreed quote', quote };
  }
  if (!stripe) return { status: 'failed', reason: 'Stripe is not configured', quote };

  const hh = (await db.doc(`households/${householdId}`).get()).data() ?? {};
  const customer = typeof hh.stripeCustomerId === 'string' ? hh.stripeCustomerId : '';
  const paymentMethod = typeof hh.stripeDefaultPaymentMethodId === 'string' ? hh.stripeDefaultPaymentMethodId : '';
  if (!customer || !paymentMethod) return { status: 'failed', reason: 'No saved payment method on file', quote };

  let paymentIntentId = '';
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: quote.differenceCents,
        currency: 'usd',
        customer,
        payment_method: paymentMethod,
        confirm: true,
        off_session: true,
        description: 'Hanukkah box: items added after lock',
        // No `orderId` key: the webhook's box handling must not treat this as the box charge.
        metadata: { type: 'hanukkah_box_adjustment', householdId, adjustedOrderId: orderId, adjustmentId },
      },
      { idempotencyKey: `box-adjustment-${adjustmentId}` }
    );
    paymentIntentId = pi.id;
    if (pi.status !== 'succeeded') {
      return { status: 'failed', reason: `PaymentIntent status: ${pi.status}`, paymentIntentId, quote };
    }
  } catch (err) {
    return { status: 'failed', reason: err instanceof Error ? err.message : 'Charge failed', quote };
  }

  const now = new Date().toISOString();
  const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
  await orderRef.update({
    lineItems: quote.lineItems,
    subtotalCents: quote.subtotalCents,
    shippingCents: quote.shippingCents,
    discountCents: quote.discountCents,
    taxCents: quote.taxCents,
    totalCents: quote.totalCents,
    updatedAt: now,
    adjustments: FieldValue.arrayUnion({
      id: adjustmentId,
      at: now,
      reason: String(req.reason ?? ''),
      paymentIntentId,
      amountCents: quote.differenceCents,
      previousTotalCents: quote.previousTotalCents,
      newTotalCents: quote.totalCents,
    }),
  });
  await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).set(
    { lineItems: quote.lineItems, updatedAt: now, lastChangeSource: 'admin-adjustment' },
    { merge: true }
  );

  const after: Outcome = { status: 'charged', paymentIntentId, quote, chargedAt: now };
  try {
    const order = (await orderRef.get()).data() ?? {};
    const exported = await exportOrderToShipStation({
      orderId,
      householdId,
      shippingAddress: (order.shippingAddress as Record<string, unknown>) ?? {},
      lineItems: quote.lineItems,
      totalCents: quote.totalCents,
      expeditedShipping: order.expeditedShipping === true,
    });
    await orderRef.update({
      shipStationExportedAt: new Date().toISOString(),
      ...(exported.externalId ? { shipStationOrderId: exported.externalId } : {}),
    });
    after.shipStation = exported.exported ? 'updated' : 'skipped';
  } catch (err) {
    logger.error('boxAdjustment: ShipStation update failed', { adjustmentId, orderId, err });
    after.shipStation = `failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  try {
    await recomputeBoxAllocations(db);
  } catch (err) {
    logger.error('boxAdjustment: recomputeBoxAllocations failed', { adjustmentId, err });
  }
  return after;
}

export const processBoxAdjustment = onDocumentCreated(
  { document: 'boxAdjustments/{adjustmentId}', memory: '256MiB', timeoutSeconds: 120 },
  withSentry(async (event) => {
    const snap = event.data;
    if (!snap) return;
    const db = getFirestore();
    const ref = snap.ref;
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (fresh.data()?.status !== 'requested') return null;
      tx.update(ref, { status: 'processing', startedAt: new Date().toISOString() });
      return fresh.data()!;
    });
    if (!claimed) return;

    let outcome: Outcome;
    try {
      if (claimed.mode === 'quote') {
        outcome = {
          status: 'quoted',
          quote: await quoteBoxAdjustment(
            db,
            String(claimed.householdId),
            String(claimed.orderId),
            claimed.lineItems,
            claimed.oversellItemIds
          ),
        };
      } else if (claimed.mode === 'charge') {
        outcome = await chargeBoxAdjustment(db, event.params.adjustmentId, claimed);
      } else {
        outcome = { status: 'rejected', reason: `Unknown mode: ${String(claimed.mode)}` };
      }
    } catch (err) {
      outcome = { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
    }
    logger.info('processBoxAdjustment', { adjustmentId: event.params.adjustmentId, status: outcome.status });
    await ref.update({ ...outcome, processedAt: new Date().toISOString() });
  })
);
