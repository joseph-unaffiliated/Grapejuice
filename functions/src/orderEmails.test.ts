import assert from 'node:assert/strict';
import type { DocumentReference } from 'firebase-admin/firestore';
import { claimOrderEmail, orderConfirmationTemplate, orderEmailLines, orderItemSummary } from './orderEmails';

// Template selection: storefront orders get the marketplace email; boxes and gift boxes the box one.
assert.equal(orderConfirmationTemplate({ orderType: 'marketplace' }), 'marketplace-order-confirmed');
assert.equal(orderConfirmationTemplate({ orderType: 'hanukkah_box' }), 'order-confirmed');
assert.equal(orderConfirmationTemplate({ orderType: 'gift' }), 'order-confirmed');
assert.equal(orderConfirmationTemplate({ orderType: 'received_gift' }), 'order-confirmed');
assert.equal(orderConfirmationTemplate({}), 'order-confirmed');

const lines = orderEmailLines([
  { itemId: 'dreidel', label: 'Wooden dreidel', quantity: 2 },
  { itemId: 'gelt', quantity: 1 },
  { itemId: 'candles', label: 'Candles', quantity: 0 },
  null,
  'junk',
]);
assert.deepEqual(lines, [
  { name: 'Wooden dreidel', quantity: 2 },
  { name: 'gelt', quantity: 1 },
  { name: 'Candles', quantity: 1 },
]);
assert.equal(orderItemSummary(lines), '2× Wooden dreidel, gelt, Candles');
assert.deepEqual(orderEmailLines(undefined), []);

// Send claim: the checkout callable and the Stripe webhook race; exactly one sends.
type Doc = Record<string, unknown>;
function fakeOrderRef(initial: Doc) {
  const state = { data: { ...initial } };
  const ref = {
    firestore: {
      runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
        fn({
          get: async () => ({ data: () => state.data }),
          update: (_ref: unknown, patch: Doc) => {
            state.data = { ...state.data, ...patch };
          },
        }),
    },
  };
  return { ref: ref as unknown as DocumentReference, state };
}

void (async () => {
  const NOW = Date.parse('2026-11-01T12:00:00Z');
  const fresh = fakeOrderRef({});
  assert.equal(await claimOrderEmail(fresh.ref, 'marketplaceEmail', NOW), true);
  assert.equal(await claimOrderEmail(fresh.ref, 'marketplaceEmail', NOW + 1000), false);
  // The other template's claim is independent.
  assert.equal(await claimOrderEmail(fresh.ref, 'orderConfirmedEmail', NOW), true);
  // A crashed send frees the claim after ten minutes.
  assert.equal(await claimOrderEmail(fresh.ref, 'marketplaceEmail', NOW + 11 * 60 * 1000), true);

  const sent = fakeOrderRef({ marketplaceEmailSentAt: '2026-11-01T11:00:00Z' });
  assert.equal(await claimOrderEmail(sent.ref, 'marketplaceEmail', NOW), false);

  console.log('orderEmails tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
