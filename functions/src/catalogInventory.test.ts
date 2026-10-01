import assert from 'node:assert/strict';
import {
  MARKETPLACE_RESERVATION_TTL_MS,
  createdAtMs,
  receivedGiftOrderHoldsStock,
} from './catalogInventory';

const now = Date.parse('2026-10-10T12:00:00Z');
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const ts = (msAgo: number) => ({ toMillis: () => now - msAgo });

assert.equal(createdAtMs({ createdAt: ts(1000) }), now - 1000);
assert.equal(createdAtMs({ createdAt: iso(1000) }), now - 1000);
assert.equal(createdAtMs({}), null);

// Confirmed recipient checkouts always hold stock.
assert.equal(
  receivedGiftOrderHoldsStock({ status: 'confirmed', createdAt: ts(10 * MARKETPLACE_RESERVATION_TTL_MS) }, now),
  true
);
// Fresh unpaid checkout holds; abandoned one releases back to the gift's own hold.
assert.equal(receivedGiftOrderHoldsStock({ status: 'pending', createdAt: ts(60_000) }, now), true);
assert.equal(
  receivedGiftOrderHoldsStock({ status: 'pending', createdAt: ts(MARKETPLACE_RESERVATION_TTL_MS + 1) }, now),
  false
);
assert.equal(receivedGiftOrderHoldsStock({ status: 'pending' }, now), true);

console.log('catalogInventory tests passed');
