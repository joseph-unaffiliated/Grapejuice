import assert from 'node:assert/strict';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  MARKETPLACE_RESERVATION_TTL_MS,
  createdAtMs,
  receivedGiftOrderHoldsStock,
  reserveBoxLinesInTx,
  reserveMarketplaceInventoryInTx,
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

// Multi-item carts: Firestore rejects a read after a write in the same transaction.
async function reserveTests() {
  const docs: Record<string, Record<string, unknown>> = {
    'catalog/hanukkah/items/a': { name: 'A', directSaleCapBeforeLock: 5, inventory: 20 },
    'catalog/hanukkah/items/b': { name: 'B', directSaleCapBeforeLock: 5, inventory: 20 },
    'catalog/hanukkah/inventory/b': { directReservedQty: 4 },
  };
  const fakeDb = { doc: (path: string) => ({ path }) } as unknown as Firestore;
  const makeTx = () => {
    const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
    const tx = {
      get: async (ref: { path: string }) => {
        if (writes.length) {
          throw new Error('Firestore transactions require all reads to be executed before all writes.');
        }
        const data = docs[ref.path];
        return { exists: data != null, data: () => data };
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        writes.push({ path: ref.path, data });
      },
    } as unknown as Transaction;
    return { tx, writes };
  };
  const lockAt = '2026-11-07T23:59:59-05:00';
  const at = new Date('2026-10-09T12:00:00Z');

  const ok = makeTx();
  const reserved = await reserveMarketplaceInventoryInTx(
    fakeDb,
    ok.tx,
    [
      { itemId: 'b', quantity: 1 },
      { itemId: 'a', quantity: 2 },
      { itemId: 'a', quantity: 1 },
    ],
    lockAt,
    at
  );
  assert.deepEqual(reserved, [
    { itemId: 'a', quantity: 3 },
    { itemId: 'b', quantity: 1 },
  ]);
  assert.deepEqual(
    ok.writes.map((w) => w.path),
    ['catalog/hanukkah/inventory/a', 'catalog/hanukkah/inventory/b']
  );

  // Duplicate lines count together against what's left (B has 1 left).
  const over = makeTx();
  await assert.rejects(
    reserveMarketplaceInventoryInTx(
      fakeDb,
      over.tx,
      [
        { itemId: 'b', quantity: 1 },
        { itemId: 'b', quantity: 1 },
      ],
      lockAt,
      at
    ),
    /Only 1 of B left/
  );
  assert.equal(over.writes.length, 0);

  // Box restore: validate every line first, queue boxAllocatedQty only when asked.
  docs['catalog/hanukkah/items/c'] = { name: 'C', inventory: 3 };
  docs['catalog/hanukkah/inventory/c'] = { boxAllocatedQty: 2 };
  docs['catalog/hanukkah/items/book-x'] = { name: 'Book X', inventory: 0 };
  docs['catalog/hanukkah/items/d'] = { name: 'D' };
  const box = makeTx();
  const queue = await reserveBoxLinesInTx(fakeDb, box.tx, [
    { itemId: 'c', quantity: 1 },
    { itemId: 'book-x', quantity: 1 },
    { itemId: 'd', quantity: 1 },
  ]);
  assert.equal(box.writes.length, 0);
  queue();
  assert.deepEqual(
    box.writes.map((w) => w.path),
    ['catalog/hanukkah/inventory/c']
  );

  const soldOut = makeTx();
  await assert.rejects(
    reserveBoxLinesInTx(fakeDb, soldOut.tx, [{ itemId: 'c', quantity: 2 }]),
    /Only 1 of C left for boxes/
  );
  assert.equal(soldOut.writes.length, 0);
}

reserveTests()
  .then(() => console.log('catalogInventory tests passed'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
