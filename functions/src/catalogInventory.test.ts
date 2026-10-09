import assert from 'node:assert/strict';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  MARKETPLACE_RESERVATION_TTL_MS,
  applyPaidMarketplaceInventory,
  createdAtMs,
  lateCreditReapply,
  paidMarketplaceInventoryAction,
  reapplyLateCreditInTx,
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

// Paying a storefront order: a live hold becomes sold; a hold the stale sweep released is
// sold from stock; an already-counted order moves nothing.
const lines = [{ itemId: 'stuffie', quantity: 2 }];
assert.equal(paidMarketplaceInventoryAction({ inventoryReserved: true, inventoryReservedLines: lines }), 'commit');
assert.equal(
  paidMarketplaceInventoryAction({
    status: 'cancelled',
    inventoryReserved: false,
    reservationReleasedAt: iso(0),
    inventoryReservedLines: lines,
  }),
  'sell'
);
assert.equal(
  paidMarketplaceInventoryAction({ inventoryReserved: false, inventoryCommittedAt: iso(0), inventoryReservedLines: lines }),
  null
);
assert.equal(paidMarketplaceInventoryAction({ inventoryReserved: false, reservationReleasedAt: iso(0) }), null);
assert.equal(paidMarketplaceInventoryAction(undefined), null);

// Late payment after the stale sweep returned the order's credit: take it back, up to the balance.
const swept = {
  status: 'cancelled',
  cancelReason: 'stale_inventory_reservation',
  reservationReleasedAt: iso(0),
  giftCreditAppliedCents: 1500,
  platformCreditAppliedCents: 500,
};
assert.deepEqual(lateCreditReapply(swept, { giftCreditCents: 4000, platformCreditCents: 800 }), {
  giftCents: 1500,
  platformCents: 500,
  shortfallCents: 0,
});
assert.deepEqual(lateCreditReapply(swept, { giftCreditCents: 1000 }), {
  giftCents: 1000,
  platformCents: 0,
  shortfallCents: 1000,
});
assert.equal(lateCreditReapply({ ...swept, creditReappliedAt: iso(0) }, { giftCreditCents: 4000 }), null);
// Other cancellations never returned credit through the sweep.
assert.equal(lateCreditReapply({ ...swept, cancelReason: 'payment_intent_canceled' }, { giftCreditCents: 4000 }), null);
assert.equal(lateCreditReapply({ ...swept, giftCreditAppliedCents: 0, platformCreditAppliedCents: 0 }, {}), null);
assert.equal(lateCreditReapply({ status: 'pending', giftCreditAppliedCents: 1500 }, { giftCreditCents: 4000 }), null);

async function lateCreditTxTests() {
  const householdRef = { path: 'households/h1' };
  const makeTx = (household: Record<string, unknown> | undefined) => {
    const reads: string[] = [];
    const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
    const tx = {
      get: async (ref: { path: string }) => {
        reads.push(ref.path);
        return { exists: household != null, data: () => household };
      },
      update: (ref: { path: string }, data: Record<string, unknown>) => updates.push({ path: ref.path, data }),
    } as unknown as Transaction;
    return { tx, reads, updates };
  };
  const ref = householdRef as unknown as FirebaseFirestore.DocumentReference;
  const incrementOf = (v: unknown) => (v as { operand?: number } | undefined)?.operand;

  const full = makeTx({ giftCreditCents: 4000, platformCreditCents: 800 });
  const res = await reapplyLateCreditInTx(full.tx, ref, swept);
  assert.equal(incrementOf(full.updates[0].data.giftCreditCents), -1500);
  assert.equal(incrementOf(full.updates[0].data.platformCreditCents), -500);
  assert.equal(res?.orderFields.creditReappliedCents, 2000);
  assert.equal('creditShortfallCents' in (res?.orderFields ?? {}), false);
  assert.equal(typeof res?.orderFields.creditReappliedAt, 'string');

  const short = makeTx({ giftCreditCents: 0, platformCreditCents: 0 });
  const shortRes = await reapplyLateCreditInTx(short.tx, ref, swept);
  assert.equal(short.updates.length, 0);
  assert.equal(shortRes?.orderFields.creditShortfallCents, 2000);
  assert.equal(shortRes?.orderFields.creditReappliedCents, 0);
  assert.equal(shortRes?.reapply.shortfallCents, 2000);

  // Nothing owed: no household read, so callers keep their reads-before-writes order.
  const none = makeTx({ giftCreditCents: 4000 });
  assert.equal(await reapplyLateCreditInTx(none.tx, ref, { status: 'pending' }), null);
  assert.equal(none.reads.length, 0);
}

async function paidInventoryTests() {
  const sets: Array<{ path: string; data: Record<string, unknown> }> = [];
  const fakeDb = {
    doc: (path: string) => ({ path }),
    batch: () => ({
      set: (ref: { path: string }, data: Record<string, unknown>) => sets.push({ path: ref.path, data }),
      commit: async () => undefined,
    }),
  } as unknown as Firestore;
  const incrementOf = (v: unknown) => (v as { operand?: number } | undefined)?.operand;

  await applyPaidMarketplaceInventory(fakeDb, 'commit', lines);
  assert.equal(sets[0].path, 'catalog/hanukkah/inventory/stuffie');
  assert.equal(incrementOf(sets[0].data.directReservedQty), -2);
  assert.equal(incrementOf(sets[0].data.directSoldQty), 2);

  sets.length = 0;
  await applyPaidMarketplaceInventory(fakeDb, 'sell', lines);
  assert.equal(incrementOf(sets[0].data.directSoldQty), 2);
  assert.equal('directReservedQty' in sets[0].data, false);

  sets.length = 0;
  await applyPaidMarketplaceInventory(fakeDb, null, lines);
  assert.equal(sets.length, 0);
}

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
  .then(paidInventoryTests)
  .then(lateCreditTxTests)
  .then(() => console.log('catalogInventory tests passed'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
