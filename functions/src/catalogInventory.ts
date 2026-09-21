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
  const reserved: ReservedLine[] = [];
  // Deterministic order avoids transaction deadlocks.
  const sorted = [...lines].sort((a, b) => a.itemId.localeCompare(b.itemId));

  for (const line of sorted) {
    const itemId = String(line.itemId ?? '').trim();
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    if (!itemId) {
      throw new HttpsError('invalid-argument', 'Each line item needs an itemId.');
    }

    const itemRef = db.doc(`catalog/${CATALOG_HOLIDAY}/items/${itemId}`);
    const invRef = inventoryDocRef(db, itemId);
    const [itemSnap, invSnap] = await Promise.all([tx.get(itemRef), tx.get(invRef)]);
    if (!itemSnap.exists) {
      throw new HttpsError('invalid-argument', `Unknown product: ${itemId}`);
    }
    const item = itemFromSnap(itemId, itemSnap.data() ?? {});
    const counters = parseCounters(invSnap.data());
    const avail = resolveAvailability(item, counters, lockAt, now);

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

    tx.set(
      invRef,
      {
        directReservedQty: FieldValue.increment(quantity),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    reserved.push({ itemId, quantity });
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

/**
 * Recompute boxAllocatedQty from pending/committed/confirmed/shipped/delivered
 * Hanukkah box orders. Idempotent full replace. Visitor playthrough orders excluded.
 * Runs before and after lock so unpaid committed boxes reserve stock immediately.
 */
export async function recomputeBoxAllocations(
  db: Firestore,
  _options?: { force?: boolean }
): Promise<{ itemsUpdated: number; locked: boolean }> {
  const configSnap = await db.doc(`config/${HOLIDAY_ID}`).get();
  const lockAt = (configSnap.data()?.lockAt as string | null | undefined) ?? null;
  const locked = Boolean(lockAt) && Date.now() >= new Date(lockAt!).getTime();

  const statuses = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'] as const;
  const totals = new Map<string, number>();

  for (const status of statuses) {
    const snap = await db
      .collectionGroup('orders')
      .where('holidayId', '==', HOLIDAY_ID)
      .where('status', '==', status)
      .get();
    for (const doc of snap.docs) {
      const order = doc.data();
      if (order.orderType === 'marketplace' || order.orderType === 'received_gift') continue;
      if (order.playthrough === true) continue;
      const lines = (order.lineItems as Array<{ itemId?: string; quantity?: number }>) ?? [];
      for (const li of lines) {
        const id = String(li.itemId ?? '').trim();
        if (!id) continue;
        const q = Math.max(1, Math.floor(Number(li.quantity) || 1));
        totals.set(id, (totals.get(id) ?? 0) + q);
      }
    }
  }

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

  return { itemsUpdated: updated, locked };
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
    released += 1;
  }
  return { released };
}
