import assert from 'node:assert/strict';
import {
  boxPriceCentsForKids,
  boxPriceForUser,
  checkoutTotalsAfterCredit,
  computeCommittedBoxTotals,
  settleLockCredit,
} from './chargePilotBox';

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
  assert.equal(totals.discountCents, 0);

  // 10% code snapshotted at checkout reprices against the lock-time subtotal, before credit and tax.
  const discounted = computeCommittedBoxTotals(
    [
      { slotId: 'candles', unitCents: 0, quantity: 1 },
      { itemId: 'lego-menorah', unitCents: 1500, quantity: 1 },
    ],
    9000,
    true,
    2000,
    0,
    { percentOff: 10, amountOffCents: null }
  );
  assert.equal(discounted.subtotalCents, 10500);
  assert.equal(discounted.shippingCents, 1500);
  assert.equal(discounted.discountCents, 1050);
  // (10500 − 1050 + 1500 − 2000 credit) = 8950 taxable → 8950 + 671 tax.
  assert.equal(discounted.giftCreditAppliedCents, 2000);
  assert.equal(discounted.taxCents, 671);
  assert.equal(discounted.totalCents, 9621);

  // A fixed $20 code never discounts shipping.
  const fixed = computeCommittedBoxTotals([{ slotId: 'candles', unitCents: 0, quantity: 1 }], 1000, true, 0, 0, {
    percentOff: null,
    amountOffCents: 2000,
  });
  assert.equal(fixed.discountCents, 1000);
  assert.equal(fixed.totalCents, 1500 + Math.round(1500 * 0.075));

  // Credit covers what the discount leaves; tax only on the unpaid remainder.
  const covered = checkoutTotalsAfterCredit(8000, 8000, 0, 800);
  assert.equal(covered.discountApplied, 800);
  assert.equal(covered.giftCreditApplied, 7200);
  assert.equal(covered.totalCents, 0);

  // Credit granted after checkout is applied at lock and leaves the household balance.
  const box = [{ slotId: 'candles', unitCents: 0, quantity: 1 }];
  const late = settleLockCredit(box, 8000, false, { gift: 0, platform: 0 }, { gift: 2500, platform: 0 });
  assert.equal(late.totals.giftCreditAppliedCents, 2500);
  assert.equal(late.totals.totalCents, 5500 + Math.round(5500 * 0.075));
  assert.deepEqual(late.balance, { gift: 0, platform: 0 });

  // Reserved at checkout plus a later grant, more than the box costs: the box is free and the rest stays.
  const plenty = settleLockCredit(box, 8000, false, { gift: 5000, platform: 0 }, { gift: 1000, platform: 4000 });
  assert.equal(plenty.totals.totalCents, 0);
  assert.equal(plenty.totals.giftCreditAppliedCents, 6000);
  assert.equal(plenty.totals.platformCreditAppliedCents, 2000);
  assert.deepEqual(plenty.balance, { gift: 0, platform: 2000 });

  // The box got cheaper after checkout: unused reserve goes back to the balance.
  const shrunk = settleLockCredit(box, 3000, false, { gift: 8000, platform: 0 }, { gift: 0, platform: 0 });
  assert.equal(shrunk.totals.giftCreditAppliedCents, 3000);
  assert.deepEqual(shrunk.balance, { gift: 5000, platform: 0 });

  // Settling twice (a retried charge) changes nothing the second time.
  const again = settleLockCredit(
    box,
    8000,
    false,
    { gift: late.totals.giftCreditAppliedCents, platform: late.totals.platformCreditAppliedCents },
    late.balance
  );
  assert.equal(again.totals.totalCents, late.totals.totalCents);
  assert.deepEqual(again.balance, late.balance);

  console.log('chargePilotBox pricing tests passed');
})();
