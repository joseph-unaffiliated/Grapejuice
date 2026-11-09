/**
 * Run: npx tsx src/boxAdjustment.test.ts
 */
import assert from 'node:assert/strict';
import { adjustmentBlocker, boxAdjustmentTotals, type AdjustmentLine } from './boxAdjustment';

const charged = {
  orderType: 'hanukkah_box',
  holidayId: 'hanukkah-2026',
  status: 'confirmed',
  boxPriceCents: 9000,
  subtotalCents: 9000,
  taxCents: 675,
  totalCents: 9675,
  expeditedShipping: false,
  giftCreditAppliedCents: 0,
  platformCreditAppliedCents: 0,
};

const included = (slotId: string, itemId: string, quantity = 1): AdjustmentLine => ({ slotId, itemId, quantity, unitCents: 0, includedQty: quantity });
const paid = (slotId: string, itemId: string): AdjustmentLine => ({ slotId, itemId, quantity: 1, unitCents: 1000 });
const base = [included('candles', 'beeswax-candles'), included('wood-dreidel', 'airdry-clay-dreidel', 3)];

// Four $10 add-ons on a $90 box: $130 + 7.5% tax = $139.75, so $43.00 more than the $96.75 charged.
const four = boxAdjustmentTotals(charged, [
  ...base,
  paid('decor', 'gimmel-the-dreidel-stuffie'),
  paid('decor::x', 'gimmel-the-dreidel-stuffie'),
  paid('gift-a::x', 'crispy-the-latke-stuffie'),
  paid('gift-b::x', 'jelly-the-sufganiyah-stuffie'),
]);
assert.equal(four.subtotalCents, 13000);
assert.equal(four.taxCents, 975);
assert.equal(four.totalCents, 13975);
assert.equal(four.previousTotalCents, 9675);
assert.equal(four.differenceCents, 4300);

// Same lines as what was charged: nothing more to pay.
assert.equal(boxAdjustmentTotals(charged, base).differenceCents, 0);

// Credit already applied to the order stays applied; only the new lines are taxed and charged.
const credited = { ...charged, giftCreditAppliedCents: 2000, totalCents: Math.round(7000 * 1.075) };
const withCredit = boxAdjustmentTotals(credited, [...base, paid('decor', 'gimmel-the-dreidel-stuffie')]);
assert.equal(withCredit.totalCents, Math.round(8000 * 1.075));
assert.equal(withCredit.differenceCents, Math.round(8000 * 1.075) - Math.round(7000 * 1.075));

assert.equal(adjustmentBlocker(charged), null);
assert.equal(adjustmentBlocker(undefined), 'Order not found');
assert.equal(adjustmentBlocker({ ...charged, status: 'committed' }), 'Order is committed, not confirmed');
assert.equal(adjustmentBlocker({ ...charged, status: 'shipped' }), 'Order is shipped, not confirmed');
assert.equal(adjustmentBlocker({ ...charged, trackingNumber: '1Z' }), 'Order has already shipped');
assert.equal(adjustmentBlocker({ ...charged, orderType: 'marketplace' }), 'Not a Hanukkah box order');

console.log('boxAdjustment tests passed');
