/**
 * Run: npx tsx functions/src/airtableCatalogSync.ids.test.ts
 */
import assert from 'node:assert/strict';
import { listingCatalogId } from './airtableCatalogSync';

assert.equal(listingCatalogId('recxIaQkZ55qi5hv7', 'Big Bag of Gelt (5 big, 20 little)'), 'big-bag-of-gelt');
assert.equal(listingCatalogId('recF3yMAHEv61pJJR', 'Party Bag of Gelt (20 big, 80 little)'), 'party-bag-of-gelt');
assert.equal(
  listingCatalogId('recx7MTWrpgad9sQD', 'Little Bag of Gelt (2 big, 5 little)'),
  'little-bag-of-gelt-2-big-5-little'
);
assert.equal(listingCatalogId('recOther', 'Beeswax Candles'), 'beeswax-candles');

console.log('airtableCatalogSync ids: ok');
