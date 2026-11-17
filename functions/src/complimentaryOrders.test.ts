/**
 * Run: npx tsx src/complimentaryOrders.test.ts
 */
import assert from "node:assert/strict";
import {
  complimentaryRemaining,
  validateComplimentaryRequest,
} from "./complimentaryOrders";

// On hand 10, set aside 2, 3 in boxes, 1 held by a shop checkout, 2 sold: 2 left.
assert.equal(
  complimentaryRemaining(10, 2, {
    boxAllocatedQty: 3,
    directReservedQty: 1,
    directSoldQty: 2,
  }),
  2,
);
assert.equal(complimentaryRemaining(10, null, {}), 10);
assert.equal(complimentaryRemaining(1, 0, { directSoldQty: 4 }), 0);
assert.equal(
  complimentaryRemaining(null, 0, { directSoldQty: 4 }),
  null,
  "untracked items have no ceiling",
);

const ok = validateComplimentaryRequest({
  recipient: { name: " Dana Partner ", email: "dana@example.org" },
  shippingAddress: {
    line1: "1 Main St",
    city: "Austin",
    stateProvince: "TX",
    postalCode: "78701",
  },
  lineItems: [
    { itemId: "book-a", quantity: 1 },
    { itemId: "book-a", quantity: 2 },
    { itemId: "beeswax-candles", quantity: 1 },
  ],
  reason: "Partner gift: Dana",
});
assert.equal(ok.recipient.name, "Dana Partner");
assert.equal(ok.shippingAddress.country, "US");
assert.equal(ok.shippingAddress.name, "Dana Partner");
assert.equal(ok.shippingAddress.email, "dana@example.org");
assert.deepEqual(ok.lineItems, [
  { itemId: "book-a", quantity: 3 },
  { itemId: "beeswax-candles", quantity: 1 },
]);
assert.equal(ok.dryRun, false);

const address = {
  line1: "1 Main St",
  city: "Austin",
  stateProvince: "TX",
  postalCode: "78701",
};
const base = {
  recipient: { name: "Dana" },
  shippingAddress: address,
  lineItems: [{ itemId: "x", quantity: 1 }],
  reason: "r",
};
assert.throws(
  () => validateComplimentaryRequest({ ...base, recipient: {} }),
  /recipient.name/,
);
assert.throws(
  () =>
    validateComplimentaryRequest({
      ...base,
      recipient: { name: "D", email: "nope" },
    }),
  /email/,
);
assert.throws(
  () =>
    validateComplimentaryRequest({
      ...base,
      shippingAddress: { ...address, postalCode: "" },
    }),
  /postalCode/,
);
assert.throws(
  () =>
    validateComplimentaryRequest({
      ...base,
      shippingAddress: { ...address, country: "GB" },
    }),
  /US or CA/,
);
assert.throws(
  () => validateComplimentaryRequest({ ...base, lineItems: [] }),
  /non-empty/,
);
assert.throws(
  () =>
    validateComplimentaryRequest({
      ...base,
      lineItems: [{ itemId: "x", quantity: 1.5 }],
    }),
  /whole quantity/,
);
assert.throws(
  () => validateComplimentaryRequest({ ...base, reason: "  " }),
  /reason/,
);
assert.equal(
  validateComplimentaryRequest({ ...base, dryRun: true }).dryRun,
  true,
);

console.log("complimentaryOrders tests passed");
