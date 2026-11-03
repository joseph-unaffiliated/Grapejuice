import assert from 'node:assert/strict';
import {
  postLockShippingCents,
  weightTierCents,
  parseCatalogWeightOuncesClient,
} from './postLockShipping';

assert.equal(parseCatalogWeightOuncesClient('12 oz'), 12);
assert.equal(parseCatalogWeightOuncesClient('1.5 lb'), 24);
assert.equal(weightTierCents(8), 1199);
assert.equal(weightTierCents(16), 1499);
assert.equal(weightTierCents(12), 1499);

const example = postLockShippingCents([
  { qty: 1, weight: '12 oz', fbaFeeCents: 300 },
]);
assert.equal(example.tierCents, 1499);
assert.equal(example.fbaCents, 300);
assert.equal(example.shippingCents, 1799);

console.log('postLockShipping.test.ts: all passed');
