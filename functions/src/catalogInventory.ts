/**
 * Live marketplace inventory counters under catalog/hanukkah/inventory/{itemId}.
 * Not overwritten by Airtable replace-sync.
 */
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  availabilityAllowsDirectPurchase,
  availabilityRejectMessage,
  availabilityRemaining,
  isCatalogBookItem,
  resolveAvailability,
  type CatalogAvailabilityItem,
  type CatalogInventoryCounters,
} from './catalogAvailability';

export const CATALOG_HOLIDAY = 'hanukkah';
export const HOLIDAY_ID = 'hanukkah-2026';
/** Pending marketplace reservations older than this are released. */
export const MARKETPLACE_RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;

export function inventoryDocRef(db: Firestore, itemId: string) {
  return db.doc(`catalog/${CATALOG_HOLIDAY}/inventory/${itemId}`);
}

export function parseCounters(data: FirebaseFirestore.DocumentData | undefined): CatalogInventoryCounters {
  const n = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  return {
    directReservedQty: n(data?.directReservedQty),
    directSoldQty: n(data?.directSoldQty),
    boxAllocatedQty: n(data?.boxAllocatedQty),
  };
}

export type ReservedLine = { itemId: string; quantity: number };

function itemFromSnap(
  itemId: string,
  data: FirebaseFirestore.DocumentData
): CatalogAvailabilityItem {
  return {
    id: itemId,
    name: typeof data.name === 'string' ? data.name : itemId,
    category: typeof data.category === 'string' ? data.category : null,
    categories: Array.isArray(data.categories)
      ? data.categories.filter((c: unknown): c is string => typeof c === 'string')
      : undefined,
    inventory: typeof data.inventory === 'number' ? data.inventory : null,
    directSaleCapBeforeLock:
      typeof data.directSaleCapBeforeLock === 'number' ? data.directSaleCapBeforeLock : null,
    sellAfterLock:
      data.sellAfterLock === 'yes' || data.sellAfterLock === 'flag' || data.sellAfterLock === 'no'
        ? data.sellAfterLock
        : null,
  };
}

/**
 * Validate marketplace lines against availability and increment directReservedQty
 * inside an existing Firestore transaction.
 */
export async function reserveMarketplaceInventoryInTx(
  db: Firestore,
  tx: Transaction,
  lines: Array<{ itemId: string; quantity: number }>,
  lockAt: string | null,
  now: Date = new Date()
): Promise<ReservedLine[]> {
  const qtyById = new Map<string, number>();
  for (const line of lines) {
    const itemId = String(line.itemId ?? '').trim();
    if (!itemId) {
      throw new HttpsError('invalid-argument', 'Each line item needs an itemId.');
    }
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    qtyById.set(itemId, (qtyById.get(itemId) ?? 0) + quantity);
  }
  // Deterministic order avoids transaction deadlocks.
  const reserved: ReservedLine[] = [...qtyById.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemId, quantity]) => ({ itemId, quantity }));

  // Firestore transactions reject any read after a write, so read every item first.
  const snaps = await Promise.all(
    reserved.map(({ itemId }) =>
      Promise.all([
        tx.get(db.doc(`catalog/${CATALOG_HOLIDAY}/items/${itemId}`)),
        tx.get(inventoryDocRef(db, itemId)),
      ])
    )
  );

  reserved.forEach(({ itemId, quantity }, i) => {
    const [itemSnap, invSnap] = snaps[i];
    if (!itemSnap.exists) {
      throw new HttpsError('invalid-argument', `Unknown product: ${itemId}`);
    }
    const item = itemFromSnap(itemId, itemSnap.data() ?? {});
    const avail = resolveAvailability(item, parseCounters(invSnap.data()), lockAt, now);
    if (!availabilityAllowsDirectPurchase(avail)) {
      throw new HttpsError(
        'failed-precondition',
        availabilityRejectMessage(item.name ?? itemId, avail)
      );
    }
    const remaining = availabilityRemaining(avail);
    if (remaining != null && quantity > remaining) {
      throw new HttpsError(
        'failed-precondition',
        `Only ${remaining} of ${item.name ?? itemId} left for direct purchase.`
      );
    }
  });

  for (const { itemId, quantity } of reserved) {
    tx.set(
      inventoryDocRef(db, itemId),
      {
        directReservedQty: FieldValue.increment(quantity),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  return reserved;
}

/** Move reserved qty into sold (payment succeeded / $0 confirm). */
export async function commitMarketplaceReservations(
  db: Firestore,
  lines: ReservedLine[]
): Promise<void> {
  if (!lines.length) return;
  const batch = db.batch();
  for (const line of lines) {
    const ref = inventoryDocRef(db, line.itemId);
    batch.set(
      ref,
      {
        directReservedQty: FieldValue.increment(-line.quantity),
        directSoldQty: FieldValue.increment(line.quantity),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

/** Release reserved qty (payment failed / canceled / stale). */
export async function releaseMarketplaceReservations(
  db: Firestore,
  lines: ReservedLine[]
): Promise<void> {
  if (!lines.length) return;
  const batch = db.batch();
  for (const line of lines) {
    const ref = inventoryDocRef(db, line.itemId);
    batch.set(
      ref,
      {
        directReservedQty: FieldValue.increment(-line.quantity),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

export function reservedLinesFromOrder(
  order: FirebaseFirestore.DocumentData | undefined
): ReservedLine[] {
  const raw = order?.inventoryReservedLines;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((li) => ({
      itemId: String((li as { itemId?: string })?.itemId ?? '').trim(),
      quantity: Math.max(1, Math.floor(Number((li as { quantity?: number })?.quantity) || 1)),
    }))
    .filter((li) => li.itemId);
}

/** Aggregate quantities by itemId (skips empty ids). */
export function aggregateLineQuantities(
  lines: Array<{ itemId?: string; quantity?: number } | null | undefined>
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const li of lines) {
    if (!li) continue;
    const id = String(li.itemId ?? '').trim();
    if (!id) continue;
    const q = Math.max(1, Math.floor(Number(li.quantity) || 1));
    totals.set(id, (totals.get(id) ?? 0) + q);
  }
  return totals;
}

/**
 * Reject when proposed box lines would exceed Airtable inventory ceiling.
 * Items with null inventory (e.g. books) are skipped. `creditLines` are quantities
 * already counted in boxAllocatedQty for this order (pass prior lines on update).
 */
export async function assertBoxLinesWithinInventory(
  db: Firestore,
  proposedLines: Array<{ itemId?: string; quantity?: number }>,
  options?: {
    creditLines?: Array<{ itemId?: string; quantity?: number }>;
  }
): Promise<void> {
  const proposed = aggregateLineQuantities(proposedLines);
  const credit = aggregateLineQuantities(options?.creditLines ?? []);
  const itemIds = [...proposed.keys()].sort();
  if (!itemIds.length) return;

  for (const itemId of itemIds) {
    const itemRef = db.doc(`catalog/${CATALOG_HOLIDAY}/items/${itemId}`);
    const invRef = inventoryDocRef(db, itemId);
    const [itemSnap, invSnap] = await Promise.all([itemRef.get(), invRef.get()]);
    if (!itemSnap.exists) {
      throw new HttpsError('invalid-argument', `Unknown product: ${itemId}`);
    }
    const item = itemFromSnap(itemId, itemSnap.data() ?? {});
    if (isCatalogBookItem(item)) continue;
    if (item.inventory == null || !Number.isFinite(item.inventory)) continue;

    const inventory = Math.max(0, Math.floor(item.inventory));
    const counters = parseCounters(invSnap.data());
    const direct =
      (counters.directReservedQty ?? 0) + (counters.directSoldQty ?? 0);
    const boxAllocated = counters.boxAllocatedQty ?? 0;
    const credited = credit.get(itemId) ?? 0;
    const want = proposed.get(itemId) ?? 0;
    const available = inventory - boxAllocated - direct + credited;
    if (want > available) {
      const name = item.name ?? itemId;
      const left = Math.max(0, available);
      throw new HttpsError(
        'failed-precondition',
        left <= 0
          ? `${name} is out of stock for boxes.`
          : `Only ${left} of ${name} left for boxes.`
      );
    }
  }
}

type LineLike = { itemId?: string; quantity?: number };

const BOX_ALLOCATION_STATUSES = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];

function addLines(totals: Map<string, number>, lines: unknown): void {
  if (!Array.isArray(lines)) return;
  for (const [id, q] of aggregateLineQuantities(lines as LineLike[])) {
    totals.set(id, (totals.get(id) ?? 0) + q);
  }
}

export function createdAtMs(data: FirebaseFirestore.DocumentData | undefined): number | null {
  const ts = data?.createdAt as { toMillis?: () => number } | string | undefined;
  if (ts && typeof ts === 'object' && typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Unpaid recipient gift checkouts stop holding stock after the marketplace TTL; the
 * gift box itself keeps its reservation until checkout or conversion to credit.
 */
export function receivedGiftOrderHoldsStock(
  order: FirebaseFirestore.DocumentData,
  nowMs: number = Date.now()
): boolean {
  if (order.status !== 'pending') return true;
  const created = createdAtMs(order);
  return created == null || nowMs - created < MARKETPLACE_RESERVATION_TTL_MS;
}

export function receivedGiftKey(householdId: string, giftInviteId: string): string {
  return `${householdId}/${giftInviteId}`;
}

/**
 * Lines one received gift currently holds in boxAllocatedQty: its latest live checkout
 * order, else the gift box itself. Pass as creditLines when re-checking that gift.
 */
export async function heldReceivedGiftLines(
  db: Firestore,
  householdId: string,
  giftInviteId: string,
  giftLines: unknown
): Promise<LineLike[]> {
  const snap = await db
    .collection(`households/${householdId}/orders`)
    .where('giftInviteId', '==', giftInviteId)
    .get();
  const nowMs = Date.now();
  let latest: { createdMs: number; lines: unknown } | null = null;
  for (const doc of snap.docs) {
    const order = doc.data();
    if (order.orderType !== 'received_gift' || order.playthrough === true) continue;
    if (!BOX_ALLOCATION_STATUSES.includes(String(order.status))) continue;
    if (!receivedGiftOrderHoldsStock(order, nowMs)) continue;
    const createdMs = createdAtMs(order) ?? nowMs;
    if (!latest || createdMs > latest.createdMs) latest = { createdMs, lines: order.lineItems };
  }
  const lines = latest ? latest.lines : giftLines;
  return Array.isArray(lines) ? (lines as LineLike[]) : [];
}

function isBoxGiftInvite(invite: FirebaseFirestore.DocumentData): boolean {
  if (invite.kind === 'box' || invite.kind === 'credit') return invite.kind === 'box';
  return Array.isArray(invite.lineItems) && invite.lineItems.length > 0;
}

function isPaidGiftInvite(invite: FirebaseFirestore.DocumentData): boolean {
  if (invite.paymentStatus === 'paid') return true;
  return invite.paymentStatus == null && Boolean(invite.claimEmailSentAt);
}

/**
 * Paid gift boxes hold their lines from purchase until the recipient checks out
 * (then the received_gift order holds them) or converts the gift to credit.
 */
async function addOutstandingGiftBoxes(
  db: Firestore,
  totals: Map<string, number>,
  checkedOut: Set<string>
): Promise<number> {
  const snap = await db.collection('giftInvites').get();
  const claimed: Array<{ ref: FirebaseFirestore.DocumentReference; inviteLines: unknown }> = [];
  let held = 0;
  for (const doc of snap.docs) {
    const invite = doc.data();
    if (invite.playthrough === true) continue;
    if (!isBoxGiftInvite(invite) || !isPaidGiftInvite(invite)) continue;
    const householdId =
      typeof invite.claimedByHouseholdId === 'string' ? invite.claimedByHouseholdId : '';
    if (invite.status !== 'pending' && invite.status !== 'claimed') continue;
    if (invite.status === 'pending' || !householdId) {
      addLines(totals, invite.lineItems);
      held += 1;
      continue;
    }
    if (checkedOut.has(receivedGiftKey(householdId, doc.id))) continue;
    claimed.push({
      ref: db.doc(`households/${householdId}/receivedGifts/${doc.id}`),
      inviteLines: invite.lineItems,
    });
  }

  for (let i = 0; i < claimed.length; i += 200) {
    const chunk = claimed.slice(i, i + 200);
    const snaps = await db.getAll(...chunk.map((c) => c.ref));
    snaps.forEach((giftSnap, j) => {
      const gift = giftSnap.data();
      if (gift?.status === 'converted_to_credit') return;
      addLines(totals, Array.isArray(gift?.lineItems) ? gift!.lineItems : chunk[j].inviteLines);
      held += 1;
    });
  }
  return held;
}

/**
 * Recompute boxAllocatedQty from pending/committed/confirmed/shipped/delivered
 * Hanukkah box orders, recipient gift-box checkouts, and paid gift boxes not yet
 * checked out. Idempotent full replace. Visitor playthrough orders excluded.
 * Runs before and after lock so unpaid committed boxes reserve stock immediately.
 */
export async function recomputeBoxAllocations(
  db: Firestore,
  _options?: { force?: boolean }
): Promise<{ itemsUpdated: number; locked: boolean; giftBoxesHeld: number }> {
  const configSnap = await db.doc(`config/${HOLIDAY_ID}`).get();
  const lockAt = (configSnap.data()?.lockAt as string | null | undefined) ?? null;
  const locked = Boolean(lockAt) && Date.now() >= new Date(lockAt!).getTime();

  const totals = new Map<string, number>();
  const nowMs = Date.now();
  // A recipient can retry checkout; only the latest live order per gift counts.
  const giftOrders = new Map<string, { createdMs: number; lines: unknown }>();

  for (const status of BOX_ALLOCATION_STATUSES) {
    const snap = await db
      .collectionGroup('orders')
      .where('holidayId', '==', HOLIDAY_ID)
      .where('status', '==', status)
      .get();
    for (const doc of snap.docs) {
      const order = doc.data();
      if (order.orderType === 'marketplace') continue;
      if (order.playthrough === true) continue;
      if (order.orderType === 'received_gift') {
        if (!receivedGiftOrderHoldsStock(order, nowMs)) continue;
        const householdId = doc.ref.parent.parent?.id ?? '';
        const key = receivedGiftKey(householdId, String(order.giftInviteId ?? doc.id));
        const createdMs = createdAtMs(order) ?? nowMs;
        const prev = giftOrders.get(key);
        if (!prev || createdMs > prev.createdMs) {
          giftOrders.set(key, { createdMs, lines: order.lineItems });
        }
        continue;
      }
      addLines(totals, order.lineItems);
    }
  }

  for (const { lines } of giftOrders.values()) addLines(totals, lines);
  const giftBoxesHeld = await addOutstandingGiftBoxes(db, totals, new Set(giftOrders.keys()));

  // Also zero prior allocations for items no longer in any box (read existing inventory docs).
  const invSnap = await db.collection(`catalog/${CATALOG_HOLIDAY}/inventory`).get();
  const nowIso = new Date().toISOString();
  let updated = 0;
  const allIds = new Set([...totals.keys(), ...invSnap.docs.map((d) => d.id)]);

  const ids = [...allIds];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const batch = db.batch();
    for (const id of chunk) {
      const qty = totals.get(id) ?? 0;
      batch.set(
        inventoryDocRef(db, id),
        {
          boxAllocatedQty: qty,
          boxAllocatedAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );
      updated += 1;
    }
    await batch.commit();
  }

  return { itemsUpdated: updated, locked, giftBoxesHeld };
}

/**
 * Release reservations on pending marketplace orders older than TTL.
 */
export async function releaseStaleMarketplaceReservations(
  db: Firestore
): Promise<{ released: number }> {
  const cutoff = new Date(Date.now() - MARKETPLACE_RESERVATION_TTL_MS).toISOString();
  const snap = await db
    .collectionGroup('orders')
    .where('orderType', '==', 'marketplace')
    .where('status', '==', 'pending')
    .where('inventoryReserved', '==', true)
    .get();

  let released = 0;
  for (const doc of snap.docs) {
    const order = doc.data();
    if (order.reservationReleasedAt) continue;
    const created =
      typeof order.inventoryReservedAt === 'string'
        ? order.inventoryReservedAt
        : typeof order.createdAt === 'string'
          ? order.createdAt
          : null;
    // Prefer inventoryReservedAt; fall back to createdAt ISO if present.
    // Firestore Timestamp: use toDate when available.
    let createdIso = created;
    const ts = order.createdAt as { toDate?: () => Date } | undefined;
    if (!createdIso && ts && typeof ts.toDate === 'function') {
      createdIso = ts.toDate().toISOString();
    }
    if (!createdIso || createdIso > cutoff) continue;

    const lines = reservedLinesFromOrder(order);
    await releaseMarketplaceReservations(db, lines);
    await doc.ref.update({
      inventoryReserved: false,
      reservationReleasedAt: new Date().toISOString(),
      status: 'cancelled',
      cancelReason: 'stale_inventory_reservation',
    });
    const giftRestore =
      typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
    const platformRestore =
      typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
    const householdId = doc.ref.parent.parent?.id;
    if (householdId && (giftRestore > 0 || platformRestore > 0)) {
      await db.doc(`households/${householdId}`).update({
        ...(giftRestore > 0 ? { giftCreditCents: FieldValue.increment(giftRestore) } : {}),
        ...(platformRestore > 0
          ? { platformCreditCents: FieldValue.increment(platformRestore) }
          : {}),
        updatedAt: new Date().toISOString(),
      });
    }
    released += 1;
  }
  return { released };
}
