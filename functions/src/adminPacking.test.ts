import assert from 'node:assert/strict';
import {
  LARGE_BOX_UNITS,
  estimateWeightOunces,
  maxDimensionInches,
  mayNeedLargeBox,
  packingBoxCharge,
  parseWeightOunces,
  recommendedSizeFor,
  weightForLine,
} from './adminPacking';

// Largest of the first three numbers, ignoring anything in parentheses.
assert.equal(maxDimensionInches('6.3" height × 5.1" width × 1.4" depth'), 6.3);
assert.equal(maxDimensionInches('9.8" width x 2.8" height × 2" depth (fits candles 12 in)'), 9.8);
assert.equal(maxDimensionInches('11.8 × 12.6 × 2.0 in'), 12.6);
assert.equal(maxDimensionInches(null), null);
assert.equal(maxDimensionInches('no numbers here'), null);

const line = (maxInches: number | null) =>
  ({
    key: 'k',
    itemId: 'i',
    name: 'n',
    qty: 1,
    child: null,
    forHousehold: true,
    origin: null,
    wrap: false,
    dimensions: null,
    maxInches,
    packed: false,
  }) as const;

// Boxes and gifts start at 14×14×6; shop orders start at 10×8×6. Height no longer changes the size.
assert.equal(recommendedSizeFor('box'), '14x14x6');
assert.equal(recommendedSizeFor('gift'), '14x14x6');
assert.equal(recommendedSizeFor('shop'), '10x8x6');

// Flag only: a long item or a lot of units. Plain packages are not flagged.
const many = (qty: number) => ({ ...line(4), qty });
assert.equal(mayNeedLargeBox([line(4), line(6)]), false);
assert.equal(mayNeedLargeBox([line(null)]), false);
assert.equal(mayNeedLargeBox([line(12)]), false, '12 in still fits');
assert.equal(mayNeedLargeBox([line(12.6)]), true, 'an item over 12 in is flagged');
assert.equal(mayNeedLargeBox([line(4), line(12.6)]), true);
assert.equal(mayNeedLargeBox([many(LARGE_BOX_UNITS)]), false, 'the threshold itself is fine');
assert.equal(mayNeedLargeBox([many(LARGE_BOX_UNITS + 1)]), true, 'a lot of units is flagged');
assert.equal(mayNeedLargeBox([many(10), many(9)]), true, 'units add up across lines');

// Charged boxes always pack. Committed boxes are the post-lock preview. Other statuses stay off the list.
assert.equal(packingBoxCharge('confirmed'), 'charged');
assert.equal(packingBoxCharge('shipped'), 'charged');
assert.equal(packingBoxCharge('delivered'), 'charged');
assert.equal(packingBoxCharge('committed'), 'awaiting');
assert.equal(packingBoxCharge('pending'), 'hidden');
assert.equal(packingBoxCharge('cancelled'), 'hidden');

assert.equal(parseWeightOunces('3 lb'), 48);
assert.equal(parseWeightOunces('4 lb'), 64);
assert.equal(parseWeightOunces('6 oz'), 6);
assert.equal(parseWeightOunces('2 oz'), 2);
assert.equal(parseWeightOunces('1.5 pounds'), 24);
assert.equal(parseWeightOunces(null), null);
assert.equal(parseWeightOunces('not weighed'), null);

assert.equal(estimateWeightOunces({ category: 'Book', name: 'Hanukkah Bear', itemId: 'book-hanukkah-bear' }), 12);
assert.equal(estimateWeightOunces({ category: null, name: 'Some Book', itemId: 'book-some-book' }), 12);
assert.equal(estimateWeightOunces({ category: 'Dreidel', name: 'Solid Brass Dreidel', itemId: 'solid-brass-dreidel' }), 8);
assert.equal(estimateWeightOunces({ category: 'Dreidel', name: 'Classic Wooden Dreidel', itemId: 'classic-wooden-dreidel' }), 2);
assert.equal(estimateWeightOunces({ category: 'Gelt', name: 'Party Bag of Gelt', itemId: 'party' }), 32);
assert.equal(estimateWeightOunces({ category: 'Gelt', name: 'Little Bag of Gelt', itemId: 'little' }), 4);
assert.deepEqual(weightForLine({ weight: '6 oz', category: 'Stuffies', name: 'Crispy', itemId: 'crispy' }), {
  weightOz: 6,
  weightEstimated: false,
});
assert.deepEqual(weightForLine({ weight: null, category: 'Book', name: 'Hanukkah Bear', itemId: 'book-hanukkah-bear' }), {
  weightOz: 12,
  weightEstimated: true,
});

console.log('adminPacking tests passed');
