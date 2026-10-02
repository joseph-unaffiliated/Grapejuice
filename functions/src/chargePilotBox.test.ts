import assert from 'node:assert/strict';
import { boxPriceCentsForKids, boxPriceForUser, computeCommittedBoxTotals } from './chargePilotBox';

assert.equal(boxPriceCentsForKids(1), 8000);
assert.equal(boxPriceCentsForKids(2), 9000);
assert.equal(boxPriceCentsForKids(4), 11000);
assert.equal(boxPriceCentsForKids(0), 8000);
assert.equal(boxPriceCentsForKids(3, 5000), 7000);

const fakeDb = (kids: number) =>
  ({
    collection: (path: string) => {
      assert.equal(path, 'users/u1/children');
      return { get: async () => ({ size: kids }) };
    },
  }) as unknown as FirebaseFirestore.Firestore;

(async () => {
  assert.deepEqual(await boxPriceForUser(fakeDb(3), 'u1', {}), { boxPriceCents: 10000, kidCount: 3 });
  assert.deepEqual(await boxPriceForUser(fakeDb(0), 'u1', {}), { boxPriceCents: 8000, kidCount: 1 });
  assert.deepEqual(await boxPriceForUser(fakeDb(5), null, {}), { boxPriceCents: 8000, kidCount: 1 });
  assert.deepEqual(await boxPriceForUser(fakeDb(2), 'u1', { boxPriceCents: 5000 }), {
    boxPriceCents: 6000,
    kidCount: 2,
  });

  // Two kids, one $15 add-on, no credit: (9000 + 1500) * 1.075.
  const totals = computeCommittedBoxTotals(
    [
      { slotId: 'candles', unitCents: 0, quantity: 1 },
      { itemId: 'lego-menorah', unitCents: 1500, quantity: 1 },
    ],
    await boxPriceForUser(fakeDb(2), 'u1', {}).then((p) => p.boxPriceCents),
    false,
    0,
    0
  );
  assert.equal(totals.subtotalCents, 10500);
  assert.equal(totals.totalCents, 11288);

  console.log('chargePilotBox pricing tests passed');
})();
