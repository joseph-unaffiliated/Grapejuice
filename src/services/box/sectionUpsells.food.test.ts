/**
 * Run: npx tsx src/services/box/sectionUpsells.food.test.ts
 *
 * Eat & Drink: either food slot can hold either kit (two of one kit is fine),
 * and napkins are no longer a food swap.
 */
import assert from 'node:assert/strict';
import type { CatalogItem } from '../../types/pilot';
import { resolveSwapOptionsForItem } from './sectionUpsells';

const item = (over: Partial<CatalogItem> & { id: string; name: string }): CatalogItem =>
  ({
    description: '',
    slot: 'food',
    slotId: over.id,
    category: 'Food',
    ageGroups: [],
    defaultFor: [],
    swapOptions: [],
    dollarCostCents: 0,
    holiday: 'hanukkah',
    ...over,
  }) as CatalogItem;

const catalog = [
  item({ id: 'latke-kit', name: 'Latke Kit' }),
  item({ id: 'sufganiyot-kit', name: 'Sufganiyot Kit' }),
  item({ id: 'dreidel-cookie-cutters', name: 'Dreidel Cookie Cutters', slotId: 'decor' }),
  item({ id: 'cocktail-napkins', name: 'Hanukkah Cocktail Napkins', slotId: 'decor' }),
  item({ id: 'big-bag-of-gelt', name: 'Big Bag of Gelt (5 big, 20 little)', category: 'Gelt', slotId: 'decor' }),
  item({ id: 'little-bag-of-gelt-2-big-5-little', name: 'Little Bag of Gelt (2 big, 5 little)', category: 'Gelt', slotId: 'decor' }),
];
const byId = (id: string) => catalog.find((c) => c.id === id)!;
const ids = (items: CatalogItem[]) => items.map((c) => c.id);

{
  const latkeSwaps = ids(resolveSwapOptionsForItem(byId('latke-kit'), catalog, 12));
  assert.ok(latkeSwaps.includes('sufganiyot-kit'), `latke → sufganiyot: ${latkeSwaps}`);
  assert.ok(!latkeSwaps.includes('cocktail-napkins'), `no napkins: ${latkeSwaps}`);
  const sufSwaps = ids(resolveSwapOptionsForItem(byId('sufganiyot-kit'), catalog, 12));
  assert.ok(sufSwaps.includes('latke-kit'), `sufganiyot → latke: ${sufSwaps}`);
  assert.ok(!sufSwaps.includes('cocktail-napkins'), `no napkins: ${sufSwaps}`);
}

console.log('sectionUpsells.food: ok');
