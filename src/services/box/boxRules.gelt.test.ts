/**
 * Run: npx tsx src/services/box/boxRules.gelt.test.ts
 */
import assert from 'node:assert/strict';
import { defaultGeltSize, geltSizeOf, geltSwapQuantity, isGeltSwapUp, type GeltSize } from './boxRules';
import { resolveFreeSwapUnitCents, resolveSwapOptionsForItem } from './sectionUpsells';
import type { CatalogItem } from '../../types/pilot';

function item(id: string, name: string, memberPriceCents: number, extra: Partial<CatalogItem> = {}): CatalogItem {
  return { id, name, memberPriceCents, slotId: 'decor', category: 'Gelt', pricingTier: 'included', swapOptions: [], inventory: 100, ...extra } as CatalogItem;
}

// Live catalog names: all three bags share the catch-all `decor` slot.
const little = item('little-bag-of-gelt-2-big-5-little', 'Little Bag of Gelt (2 big, 5 little)', 200);
const big = item('big-bag-of-gelt', 'Big Bag of Gelt', 500);
const party = item('party-bag-of-gelt', 'Party Bag of Gelt', 1800);
const dreidel = item('classic-wooden-dreidel', 'Classic Wooden Dreidel', 400, { slotId: 'wood-dreidel', category: 'Dreidel' });
const catalog = [little, big, party, dreidel];

assert.equal(geltSizeOf(little), 'small');
assert.equal(geltSizeOf(big), 'medium');
assert.equal(geltSizeOf(party), 'party');
assert.equal(geltSizeOf(dreidel), null);

assert.equal(isGeltSwapUp('small', 'party'), true);
assert.equal(isGeltSwapUp('party', 'small'), false);
assert.equal(isGeltSwapUp('medium', 'medium'), false);

// Same people covered: party → a little bag each, big → two little, and back again.
assert.equal(geltSwapQuantity('party', 'small', 1, 7), 7);
assert.equal(geltSwapQuantity('medium', 'small', 1, 3), 2);
assert.equal(geltSwapQuantity('party', 'medium', 1, 7), 4);
assert.equal(geltSwapQuantity('small', 'party', 7, 7), 1);
assert.equal(geltSwapQuantity('small', 'medium', 2, 3), 1);

// Up to the household default is a restore; past it is an add-on.
assert.equal(isGeltSwapUp('small', 'party', 'party'), false);
assert.equal(isGeltSwapUp('small', 'medium', 'party'), false);
assert.equal(isGeltSwapUp('small', 'party', 'medium'), true);
assert.equal(isGeltSwapUp('medium', 'party', 'medium'), true);
assert.equal(defaultGeltSize(1), 'medium');
assert.equal(defaultGeltSize(3), 'small');
assert.equal(defaultGeltSize(5), 'party');

// Without a ceiling, shelves never offer a bigger bag.
const ids = (src: CatalogItem, geltCeiling?: GeltSize) =>
  resolveSwapOptionsForItem(src, catalog, 6, { geltCeiling }).map((o) => o.id).sort();
assert.deepEqual(ids(little), []);
assert.deepEqual(ids(big), [little.id]);
assert.deepEqual(ids(party), [big.id, little.id].sort());
// Party default swapped down to little bags can go back up to big or party.
assert.deepEqual(ids(little, 'party'), [big.id, party.id].sort());
// Big default: little can come back to big, never party.
assert.deepEqual(ids(little, 'medium'), [big.id]);
// Little default (2–4 kids): nothing bigger.
assert.deepEqual(ids(little, 'small'), []);
assert.deepEqual(ids(big, 'small'), [little.id]);

// Gelt for gelt is free.
assert.equal(resolveFreeSwapUnitCents(party, little, 'dreidel'), 0);
assert.equal(resolveFreeSwapUnitCents(party, big, 'dreidel'), 0);

console.log('boxRules.gelt.test: ok');
