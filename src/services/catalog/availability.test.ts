/**
 * Run: npx tsx src/services/catalog/availability.test.ts
 */
import assert from 'node:assert/strict';
import {
  resolveAvailability,
  emptyInventoryCounters,
  availabilityAllowsDirectPurchase,
} from './availability';
import type { CatalogItem } from '../../types/pilot';

function item(partial: Partial<CatalogItem> & { id: string; name: string }): CatalogItem {
  return {
    description: '',
    slot: 'addon',
    slotId: 'decor',
    ageGroups: [],
    defaultFor: [],
    swapOptions: [],
    dollarCostCents: 1000,
    holiday: 'hanukkah',
    ...partial,
  };
}

const preLock = '2099-01-01T00:00:00.000Z';
const postLock = '2000-01-01T00:00:00.000Z';
const now = new Date('2026-10-01T12:00:00.000Z');

// Books always box-only
{
  const book = item({ id: 'book-latkes', name: 'Meet the Latkes', category: 'Book' });
  const a = resolveAvailability(book, null, preLock, now);
  assert.deepEqual(a, { status: 'box_only', reason: 'book' });
  assert.equal(availabilityAllowsDirectPurchase(a), false);
}

// No cap → box_only
{
  const menorah = item({
    id: 'beeswax-candles',
    name: 'Beeswax Candles',
    directSaleCapBeforeLock: 0,
    inventory: 100,
  });
  assert.deepEqual(resolveAvailability(menorah, null, preLock, now), {
    status: 'box_only',
    reason: 'no_cap',
  });
}

// Cap with remaining → limited or direct
{
  const menorah = item({
    id: 'branches-menorah',
    name: 'Branches Menorah',
    directSaleCapBeforeLock: 6,
    inventory: 12,
    sellAfterLock: 'yes',
  });
  const a = resolveAvailability(menorah, emptyInventoryCounters(menorah.id), preLock, now);
  assert.equal(a.status, 'limited');
  if (a.status === 'limited') assert.equal(a.remaining, 6);
}

{
  const dreidel = item({
    id: 'airdry-clay-dreidel',
    name: 'Airdry Clay Dreidel',
    directSaleCapBeforeLock: 500,
    inventory: 600,
  });
  const a = resolveAvailability(dreidel, null, preLock, now);
  assert.equal(a.status, 'direct');
  if (a.status === 'direct') assert.equal(a.remaining, 500);
}

// Cap exhausted
{
  const menorah = item({
    id: 'branches-menorah',
    name: 'Branches Menorah',
    directSaleCapBeforeLock: 6,
    inventory: 12,
  });
  const counters = { ...emptyInventoryCounters(menorah.id), directSoldQty: 4, directReservedQty: 2 };
  assert.deepEqual(resolveAvailability(menorah, counters, preLock, now), {
    status: 'box_only',
    reason: 'cap_exhausted',
  });
}

// Pre-lock: committed boxes shrink remaining via inventory ceiling
{
  const menorah = item({
    id: 'branches-menorah',
    name: 'Branches Menorah',
    directSaleCapBeforeLock: 20,
    inventory: 12,
  });
  const counters = { ...emptyInventoryCounters(menorah.id), boxAllocatedQty: 10 };
  const a = resolveAvailability(menorah, counters, preLock, now);
  assert.equal(a.status, 'limited');
  if (a.status === 'limited') assert.equal(a.remaining, 2); // min(20, 12-10)
}

// Pre-lock: boxes exhaust inventory ceiling → cap_exhausted
{
  const menorah = item({
    id: 'branches-menorah',
    name: 'Branches Menorah',
    directSaleCapBeforeLock: 20,
    inventory: 12,
  });
  const counters = { ...emptyInventoryCounters(menorah.id), boxAllocatedQty: 12 };
  assert.deepEqual(resolveAvailability(menorah, counters, preLock, now), {
    status: 'box_only',
    reason: 'cap_exhausted',
  });
}

// Pre-lock: null inventory → ignore boxAllocated for ceiling (cap only)
{
  const menorah = item({
    id: 'branches-menorah',
    name: 'Branches Menorah',
    directSaleCapBeforeLock: 6,
    inventory: null,
  });
  const counters = { ...emptyInventoryCounters(menorah.id), boxAllocatedQty: 100 };
  const a = resolveAvailability(menorah, counters, preLock, now);
  assert.equal(a.status, 'limited');
  if (a.status === 'limited') assert.equal(a.remaining, 6);
}

// Post-lock FBA yes → leftover
{
  const menorah = item({
    id: 'branches-menorah',
    name: 'Branches Menorah',
    directSaleCapBeforeLock: 6,
    inventory: 12,
    sellAfterLock: 'yes',
  });
  const counters = {
    ...emptyInventoryCounters(menorah.id),
    boxAllocatedQty: 8,
    directSoldQty: 2,
  };
  const a = resolveAvailability(menorah, counters, postLock, now);
  assert.equal(a.status, 'limited');
  if (a.status === 'limited') assert.equal(a.remaining, 2); // 12 - 8 - 2
}

// Post-lock FBA no
{
  const kit = item({
    id: 'latke-kit',
    name: 'Latke Kit',
    directSaleCapBeforeLock: 0,
    inventory: 100,
    sellAfterLock: 'no',
  });
  assert.deepEqual(resolveAvailability(kit, null, postLock, now), {
    status: 'box_only',
    reason: 'post_lock_no_release',
  });
}

// Post-lock FBA flag
{
  const stuffie = item({
    id: 'gimmel-stuffie',
    name: 'Gimmel Stuffie',
    directSaleCapBeforeLock: 50,
    inventory: 100,
    sellAfterLock: 'flag',
  });
  assert.deepEqual(resolveAvailability(stuffie, null, postLock, now), {
    status: 'box_only',
    reason: 'post_lock_flag',
  });
}

// Sold out after lock
{
  const menorah = item({
    id: 'branches-menorah',
    name: 'Branches Menorah',
    inventory: 12,
    sellAfterLock: 'yes',
  });
  const counters = { ...emptyInventoryCounters(menorah.id), boxAllocatedQty: 12 };
  assert.deepEqual(resolveAvailability(menorah, counters, postLock, now), { status: 'sold_out' });
}

console.log('availability.test.ts: all passed');
