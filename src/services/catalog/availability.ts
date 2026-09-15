import type {
  CatalogAvailability,
  CatalogInventoryCounters,
  CatalogItem,
} from '../../types/pilot';

/** Same book detection as storefrontCategories — kept local to avoid circular imports. */
export function isCatalogBookItem(item: Pick<CatalogItem, 'id' | 'name' | 'category' | 'categories'>): boolean {
  if (item.id.startsWith('book-')) return true;
  const cats = item.categories?.length
    ? item.categories
    : item.category
      ? [item.category]
      : [];
  if (cats.some((c) => c.trim().toLowerCase() === 'book')) return true;
  if (/book|novel/i.test(item.name)) return true;
  return false;
}

export function emptyInventoryCounters(itemId = ''): CatalogInventoryCounters {
  return {
    itemId,
    directReservedQty: 0,
    directSoldQty: 0,
    boxAllocatedQty: 0,
    boxAllocatedAt: null,
    updatedAt: null,
  };
}

function nonNeg(n: number | null | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function isLocked(lockAt: string | null | undefined, now: Date): boolean {
  if (!lockAt) return false;
  return now.getTime() >= new Date(lockAt).getTime();
}

/**
 * Resolve whether a catalog item can be bought à la carte right now.
 * Books are always box-only. Hold inventory is ignored — carve-out + FBA only.
 */
export function resolveAvailability(
  item: CatalogItem,
  counters: CatalogInventoryCounters | null | undefined,
  lockAt: string | null | undefined,
  now: Date = new Date()
): CatalogAvailability {
  if (isCatalogBookItem(item)) {
    return { status: 'box_only', reason: 'book' };
  }

  const reserved = nonNeg(counters?.directReservedQty);
  const sold = nonNeg(counters?.directSoldQty);
  const committed = reserved + sold;

  if (!isLocked(lockAt, now)) {
    const cap = item.directSaleCapBeforeLock;
    if (cap == null || !Number.isFinite(cap) || cap <= 0) {
      return { status: 'box_only', reason: 'no_cap' };
    }
    const remaining = Math.max(0, Math.floor(cap) - committed);
    if (remaining <= 0) {
      return { status: 'box_only', reason: 'cap_exhausted' };
    }
    // Treat remaining > 10 as "direct" (open), else "limited" for urgency UI.
    if (remaining > 10) {
      return { status: 'direct', remaining };
    }
    return { status: 'limited', remaining };
  }

  const fba = item.sellAfterLock;
  if (fba === 'flag') {
    return { status: 'box_only', reason: 'post_lock_flag' };
  }
  if (fba !== 'yes') {
    return { status: 'box_only', reason: 'post_lock_no_release' };
  }

  const inventory = nonNeg(item.inventory);
  const boxAllocated = nonNeg(counters?.boxAllocatedQty);
  const remaining = Math.max(0, inventory - boxAllocated - committed);
  if (remaining <= 0) {
    return { status: 'sold_out' };
  }
  if (remaining > 10) {
    return { status: 'direct', remaining };
  }
  return { status: 'limited', remaining };
}

export function availabilityAllowsDirectPurchase(a: CatalogAvailability): boolean {
  return a.status === 'direct' || a.status === 'limited';
}

export function availabilityRemaining(a: CatalogAvailability): number | null {
  if (a.status === 'direct') return a.remaining;
  if (a.status === 'limited') return a.remaining;
  return null;
}
