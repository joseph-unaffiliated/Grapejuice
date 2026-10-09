import assert from 'node:assert/strict';
import { buildShopOrder, shopOrderState } from './shopOrders';

// Paid at checkout, waiting for box lock to ship.
assert.deepEqual(shopOrderState({ status: 'confirmed', totalCents: 5000 }), {
  status: 'confirmed',
  paid: true,
  abandoned: false,
  fulfillment: 'Ships after box lock',
});
// Lock-timing order with a saved card: not paid yet, not abandoned.
assert.deepEqual(shopOrderState({ status: 'committed', totalCents: 5000 }), {
  status: 'committed',
  paid: false,
  abandoned: false,
  fulfillment: 'Ships after box lock',
});
// Never paid.
assert.equal(shopOrderState({ status: 'pending' }).abandoned, true);
assert.equal(shopOrderState({ status: 'cancelled', cancelReason: 'stale_inventory_reservation' }).abandoned, true);
// Cancelled after payment still counts as paid.
assert.equal(shopOrderState({ status: 'cancelled', confirmedAt: '2026-10-09T17:35:00Z' }).paid, true);
// Full refund shows as refunded; partial keeps the status.
assert.equal(shopOrderState({ status: 'confirmed', totalCents: 5000, refundedCents: 5000 }).status, 'refunded');
assert.equal(shopOrderState({ status: 'confirmed', totalCents: 5000, refundedCents: 1000 }).status, 'confirmed');
assert.equal(shopOrderState({ status: 'confirmed', marketplaceFulfilledAt: 'x' }).fulfillment, 'Sent to ShipStation');
assert.equal(shopOrderState({ status: 'shipped', trackingNumber: '9400' }).fulfillment, 'Shipped');
assert.equal(shopOrderState({ status: 'confirmed', playthrough: true }).fulfillment, 'Not shipped (playthrough)');

const row = buildShopOrder({
  householdId: 'hh1',
  orderId: 'abcdefgh1234',
  order: {
    status: 'confirmed',
    chargeTiming: 'checkout',
    guestEmail: 'buyer@gmail.com',
    checkoutSignedOut: true,
    shippingAddress: { name: 'Pat Buyer' },
    lineItems: [
      { itemId: 'gimmel', quantity: 2, unitCents: 2500, label: 'Gimmel' },
      { itemId: 'gone', quantity: 1, unitCents: 1000, label: 'Old label' },
    ],
    subtotalCents: 6000,
    discountCents: 600,
    giftCreditAppliedCents: 100,
    platformCreditAppliedCents: 200,
    totalCents: 5500,
    promo: { source: 'code', code: 'LATKE10', influencerSlug: 'rachel' },
  },
  user: null,
  itemNames: new Map([['gimmel', 'Gimmel the Dreidel Stuffie']]),
  attribution: null,
  location: 'NY',
});
assert.equal(row.orderNumber, 'ABCDEFGH');
assert.equal(row.guest, true);
assert.equal(row.test, false);
assert.equal(row.units, 3);
assert.deepEqual(
  row.lines.map((l) => l.name),
  ['Gimmel the Dreidel Stuffie', 'Old label']
);
assert.equal(row.creditCents, 300);
assert.equal(row.promo, 'Code LATKE10 · @rachel');
assert.equal(row.buyer, 'Pat Buyer');

const testRow = buildShopOrder({
  householdId: 'hh2',
  orderId: 'zzzz',
  order: { status: 'confirmed', userId: 'u1' },
  user: { email: 'qa@unaffiliated.co', name: 'QA' },
  itemNames: new Map(),
  attribution: 'meta / launch',
  location: null,
});
assert.equal(testRow.test, true);
assert.equal(testRow.guest, false);
assert.equal(testRow.email, 'qa@unaffiliated.co');

console.log('shopOrders tests passed');
