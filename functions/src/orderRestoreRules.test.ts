import assert from 'node:assert/strict';
import { hasCompleteShippingAddress, restoreEligibility } from './orderRestoreRules';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const LOCK = '2026-11-20T05:00:00Z';
const address = { name: 'A', line1: '1 Main St', city: 'Town', stateProvince: 'NY', postalCode: '10001' };
const order = {
  status: 'cancelled',
  lineItems: [{ itemId: 'dreidel', quantity: 1 }],
  shippingAddress: address,
  totalCents: 8600,
  giftCreditAppliedCents: 0,
  platformCreditAppliedCents: 0,
};
const household = { giftCreditCents: 0, platformCreditCents: 0, stripeDefaultPaymentMethodId: 'pm_1' };
const base = { order, isBoxOrder: true, household, lockAt: LOCK, otherActiveBox: false, nowMs: NOW };

function code(input: Parameters<typeof restoreEligibility>[0]) {
  const v = restoreEligibility(input);
  if (v.ok) return 'ok';
  return v.code === 'needs_checkout' ? `needs_checkout:${v.reason}` : v.code;
}

assert.equal(code(base), 'ok');
assert.equal(code({ ...base, lockAt: null }), 'ok');

assert.equal(code({ ...base, isBoxOrder: false }), 'not_box_order');
assert.equal(code({ ...base, order: { ...order, status: 'committed' } }), 'not_cancelled');
assert.equal(code({ ...base, order: { ...order, cancelReason: 'payment_intent_canceled' } }), 'system_cancelled');
assert.equal(code({ ...base, order: { ...order, lineItems: [] } }), 'empty_box');
assert.equal(code({ ...base, order: { ...order, lineItems: undefined } }), 'empty_box');

assert.equal(code({ ...base, nowMs: Date.parse(LOCK) }), 'locked');
assert.equal(code({ ...base, nowMs: Date.parse(LOCK) + 1 }), 'locked');
assert.equal(code({ ...base, otherActiveBox: true }), 'other_active_box');
// Hard blocks win over checkout fallbacks.
assert.equal(
  code({ ...base, otherActiveBox: true, household: { ...household, stripeDefaultPaymentMethodId: '' } }),
  'other_active_box'
);

assert.equal(code({ ...base, order: { ...order, shippingAddress: undefined } }), 'needs_checkout:no_address');
assert.equal(
  code({ ...base, order: { ...order, shippingAddress: { ...address, postalCode: ' ' } } }),
  'needs_checkout:no_address'
);
assert.equal(
  code({ ...base, household: { ...household, stripeDefaultPaymentMethodId: undefined } }),
  'needs_checkout:no_card'
);
// Fully covered by credit: no card needed, as at commit.
assert.equal(
  code({
    ...base,
    order: { ...order, totalCents: 0, giftCreditAppliedCents: 8600 },
    household: { giftCreditCents: 8600, platformCreditCents: 0 },
  }),
  'ok'
);
// The credit cancel handed back has since been spent.
assert.equal(
  code({
    ...base,
    order: { ...order, giftCreditAppliedCents: 8000 },
    household: { ...household, giftCreditCents: 5000 },
  }),
  'needs_checkout:credit_changed'
);
assert.equal(
  code({
    ...base,
    order: { ...order, platformCreditAppliedCents: 1000 },
    household: { ...household, platformCreditCents: 999 },
  }),
  'needs_checkout:credit_changed'
);

assert.equal(hasCompleteShippingAddress(address), true);
assert.equal(hasCompleteShippingAddress(null), false);
assert.equal(hasCompleteShippingAddress({ line1: 'x', city: 'y', stateProvince: 'NY' }), false);

console.log('orderRestoreRules tests passed');
