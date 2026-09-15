/**
 * Marketplace availability — keep in sync with src/services/catalog/availability.ts
 */

export type CatalogAvailability =
  | { status: 'direct'; remaining: number | null }
  | { status: 'limited'; remaining: number }
  | {
      status: 'box_only';
      reason: 'book' | 'no_cap' | 'cap_exhausted' | 'post_lock_no_release' | 'post_lock_flag';
    }
  | { status: 'sold_out' };

export type CatalogInventoryCounters = {
  directReservedQty?: number;
  directSoldQty?: number;
  boxAllocatedQty?: number;
};

export type CatalogAvailabilityItem = {
  id: string;
  name?: string;
  category?: string | null;
  categories?: string[];
  inventory?: number | null;
  directSaleCapBeforeLock?: number | null;
  sellAfterLock?: 'yes' | 'flag' | 'no' | null;
};

export function isCatalogBookItem(item: CatalogAvailabilityItem): boolean {
  if (item.id.startsWith('book-')) return true;
  const cats = item.categories?.length
    ? item.categories
    : item.category
      ? [item.category]
      : [];
  if (cats.some((c) => c.trim().toLowerCase() === 'book')) return true;
  if (item.name && /book|novel/i.test(item.name)) return true;
  return false;
}

function nonNeg(n: number | null | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function isLocked(lockAt: string | null | undefined, now: Date): boolean {
  if (!lockAt) return false;
  return now.getTime() >= new Date(lockAt).getTime();
}

export function resolveAvailability(
  item: CatalogAvailabilityItem,
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

export function availabilityRejectMessage(itemName: string, a: CatalogAvailability): string {
  switch (a.status) {
    case 'box_only':
      if (a.reason === 'book') {
        return `${itemName} is only available as part of a Hanukkah box.`;
      }
      if (a.reason === 'cap_exhausted') {
        return `${itemName} is sold out for direct purchase until boxes lock.`;
      }
      if (a.reason === 'post_lock_flag' || a.reason === 'post_lock_no_release') {
        return `${itemName} is only available as part of a Hanukkah box.`;
      }
      return `${itemName} is only available as part of a Hanukkah box.`;
    case 'sold_out':
      return `${itemName} is sold out.`;
    default:
      return `${itemName} is not available for purchase.`;
  }
}
