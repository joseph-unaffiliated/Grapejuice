import assert from 'node:assert/strict';
import { LARGE_BOX_UNITS, maxDimensionInches, mayNeedLargeBox, recommendedSizeFor } from './adminPacking';

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

console.log('adminPacking tests passed');
