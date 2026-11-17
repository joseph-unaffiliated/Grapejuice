/**
 * Run: npx tsx src/complimentaryPlan.test.ts
 */
import assert from "node:assert/strict";
import {
  compSkipsShipStation,
  nextPersonLines,
  parseCompAddress,
} from "./complimentaryPlan";

const candle = {
  itemId: "beeswax-candles",
  label: "Beeswax Candles",
  quantity: 2,
};
assert.deepEqual(nextPersonLines([candle], "shamash", "Shamash", 1), [
  candle,
  { itemId: "shamash", label: "Shamash", quantity: 1 },
]);
assert.deepEqual(
  nextPersonLines([candle], "beeswax-candles", "Beeswax Candles", 3),
  [{ itemId: "beeswax-candles", label: "Beeswax Candles", quantity: 3 }],
);
assert.deepEqual(
  nextPersonLines([candle], "beeswax-candles", "Beeswax Candles", 0),
  [],
);

const address = parseCompAddress(
  {
    line1: " 1 Main ",
    city: "Austin",
    stateProvince: "TX",
    postalCode: "78701",
  },
  "Dana",
);
assert.equal(address.name, "Dana");
assert.equal(address.line1, "1 Main");
assert.equal(address.country, "US");
assert.throws(
  () => parseCompAddress({ city: "Austin" }, "Dana"),
  /Street address/,
);
assert.throws(
  () =>
    parseCompAddress(
      {
        line1: "1",
        city: "A",
        stateProvince: "TX",
        postalCode: "1",
        country: "GB",
      },
      "Dana",
    ),
  /US or CA/,
);

assert.equal(compSkipsShipStation({}), false);
assert.equal(compSkipsShipStation({ country: "US" }), false);
assert.equal(compSkipsShipStation({ handDeliver: true }), true);
assert.equal(compSkipsShipStation({ canada: true }), true);
assert.equal(compSkipsShipStation({ country: "CA" }), true);

console.log("complimentaryPlan tests passed");
