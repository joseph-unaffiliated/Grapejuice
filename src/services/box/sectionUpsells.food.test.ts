/**
 * Run: npx tsx src/services/box/sectionUpsells.food.test.ts
 *
 * Eat & Drink: either food slot can hold either kit (two of one kit is fine),
 * and napkins are no longer a food swap.
 */
import assert from 'node:assert/strict';
import type { CatalogItem } from '../../types/pilot';
import { resolveIncludedGiftOptions, resolveSectionUpsellItems, resolveSwapOptionsForItem } from './sectionUpsells';

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

const shelves = [
  ...catalog,
  item({ id: 'classic-wooden-dreidel', name: 'Classic Wooden Dreidel', category: 'Dreidel', slotId: 'wood-dreidel' }),
  item({ id: 'gimmel-the-dreidel-stuffie', name: 'Gimmel, the Dreidel Stuffie', category: 'Stuffies', slotId: 'decor' }),
  item({ id: 'crispy-the-latke-stuffie', name: 'Crispy, the Latke Stuffie', category: 'Stuffies', slotId: 'decor' }),
  item({ id: 'jelly-the-sufganiyah-stuffie', name: 'Jelly, the Sufganiyah Stuffie', category: 'Stuffies', slotId: 'decor' }),
  item({ id: 'shamash-the-menorah-stuffie', name: 'Shamash, the Menorah Stuffie', category: 'Stuffies', slotId: 'decor' }),
  item({ id: 'lego-menorah', name: '"Lego" Menorah', category: 'Menorah', slotId: 'decor' }),
  item({ id: 'beeswax-candles', name: 'Beeswax Candles', category: 'Candles', slotId: 'candles' }),
];
const up = (section: 'dreidel' | 'food' | 'candles') =>
  ids(resolveSectionUpsellItems(section, shelves, new Set(), 24));
assert.ok(!up('dreidel').includes('gimmel-the-dreidel-stuffie'));
assert.ok(!up('food').includes('crispy-the-latke-stuffie'));
assert.ok(!up('food').includes('jelly-the-sufganiyah-stuffie'));
assert.ok(!up('candles').includes('shamash-the-menorah-stuffie'));
assert.ok(up('candles').includes('lego-menorah'), `candles keeps lego: ${up('candles')}`);
const gifts = ids(resolveIncludedGiftOptions(shelves, undefined, 24));
assert.ok(gifts.includes('gimmel-the-dreidel-stuffie'));
assert.ok(gifts.includes('crispy-the-latke-stuffie'));
assert.ok(gifts.includes('jelly-the-sufganiyah-stuffie'));

console.log('sectionUpsells.food: ok');
