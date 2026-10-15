/**
 * Run: npx tsx src/services/box/boxRules.gelt.test.ts
 */
import assert from 'node:assert/strict';
import { geltCeilingForPeople, geltSizeOf, geltSwapQuantity, isGeltSwapUp, planGelt, type GeltSize } from './boxRules';
import { resolveFreeSwapUnitCents, resolveSwapOptionsForItem } from './sectionUpsells';
import { householdFreeQtyForItem, householdPracticeQty } from './buildDefaultBox';
import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';

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

// Same chocolate (Little 1, Big 3, Party 12), never past one Little Bag per person.
assert.equal(geltSwapQuantity('medium', 'small', 1, 3), 3);
assert.equal(geltSwapQuantity('medium', 'small', 1, 2), 2);
assert.equal(geltSwapQuantity('party', 'small', 1, 7), 7);
assert.equal(geltSwapQuantity('party', 'medium', 1, 7), 2);
assert.equal(geltSwapQuantity('small', 'medium', 3, 3), 1);
assert.equal(geltSwapQuantity('small', 'medium', 5, 5), 1);
assert.equal(geltSwapQuantity('small', 'medium', 6, 6), 2);
assert.equal(geltSwapQuantity('small', 'party', 12, 12), 1);
assert.equal(geltSwapQuantity('medium', 'small', 2, 7), 6);

// Up to the biggest bag the allowance covers is free; past it is an add-on.
assert.equal(isGeltSwapUp('small', 'party', 'party'), false);
assert.equal(isGeltSwapUp('small', 'medium', 'party'), false);
assert.equal(isGeltSwapUp('small', 'party', 'medium'), true);
assert.equal(isGeltSwapUp('medium', 'party', 'medium'), true);
assert.equal(geltCeilingForPeople(2), 'small');
assert.equal(geltCeilingForPeople(3), 'medium');
assert.equal(geltCeilingForPeople(11), 'medium');
assert.equal(geltCeilingForPeople(12), 'party');

// Defaults: one Little Bag's worth per person.
const kids = (n: number) => Array.from({ length: n }, () => ({ age: 5 }));
assert.deepEqual(planGelt({ kids: kids(1) }), { size: 'medium', quantity: 1, mixedDefault: false });
assert.deepEqual(planGelt({ kids: kids(1), adults: 1 }), { size: 'small', quantity: 2, mixedDefault: false });
assert.deepEqual(planGelt({ kids: kids(1), adults: 3 }), { size: 'small', quantity: 4, mixedDefault: false });
assert.deepEqual(planGelt({ kids: kids(3) }), { size: 'small', quantity: 5, mixedDefault: false });
assert.deepEqual(planGelt({ kids: kids(4), adults: 1 }), { size: 'small', quantity: 5, mixedDefault: false });
assert.deepEqual(planGelt({ kids: kids(5) }), {
  size: 'medium',
  quantity: 2,
  mixedDefault: true,
  also: { size: 'small', quantity: 1 },
});
assert.deepEqual(planGelt({ kids: kids(6), adults: 3 }), { size: 'medium', quantity: 3, mixedDefault: false });
assert.deepEqual(planGelt({ kids: [] }), { size: 'small', quantity: 2, mixedDefault: false });

// Without a ceiling, shelves never offer a bigger bag.
const ids = (src: CatalogItem, geltCeiling?: GeltSize) =>
  resolveSwapOptionsForItem(src, catalog, 6, { geltCeiling }).map((o) => o.id).sort();
assert.deepEqual(ids(little), []);
assert.deepEqual(ids(big), [little.id]);
assert.deepEqual(ids(party), [big.id, little.id].sort());
// 12+ people: little bags can go up to big or party.
assert.deepEqual(ids(little, 'party'), [big.id, party.id].sort());
// 3–11 people: little can go to big, never party.
assert.deepEqual(ids(little, 'medium'), [big.id]);
// 1–2 people: nothing bigger.
assert.deepEqual(ids(little, 'small'), []);
assert.deepEqual(ids(big, 'small'), [little.id]);

// Gelt for gelt is free.
assert.equal(resolveFreeSwapUnitCents(party, little, 'dreidel'), 0);
assert.equal(resolveFreeSwapUnitCents(party, big, 'dreidel'), 0);

// Dreidel headcount: explicit adults win; otherwise free gelt in Little Bags' worth.
const oneKid = [{ id: 'k1' }] as ChildProfile[];
const bigLine = { slotId: 'gelt-medium', itemId: big.id, quantity: 1, unitCents: 0 } as BoxLineItem;
assert.equal(householdPracticeQty(oneKid, 1, [bigLine]), 2);
assert.equal(householdPracticeQty(oneKid, undefined, [bigLine]), 3);
assert.equal(householdPracticeQty(oneKid, undefined, []), 3);

// Claiming gelt free into an empty section: bags the allowance covers, never one per person.
assert.equal(householdFreeQtyForItem(big, oneKid, 2, []), 1);
assert.equal(householdFreeQtyForItem(little, oneKid, 2, []), 3);
assert.equal(householdFreeQtyForItem(party, oneKid, 2, []), 1);
assert.equal(householdFreeQtyForItem(dreidel, oneKid, 3, []), 4);

console.log('boxRules.gelt.test: ok');
