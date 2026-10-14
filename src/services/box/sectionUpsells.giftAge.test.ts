/**
 * Run: npx tsx src/services/box/sectionUpsells.giftAge.test.ts
 */
import assert from 'node:assert/strict';
import { orderGiftOptionsForAge, resolveIncludedGiftOptions } from './sectionUpsells';
import type { CatalogItem } from '../../types/pilot';

const item = (id: string, name: string, category: string): CatalogItem =>
  ({
    id,
    name,
    category,
    categories: [category],
    slot: 'addon',
    slotId: 'decor',
    description: '',
    ageGroups: [],
    defaultFor: [],
    swapOptions: [],
    dollarCostCents: 0,
    holiday: 'hanukkah',
    inventory: 100,
    memberPriceCents: 1000,
  }) as CatalogItem;

const catalog = [
  item('airdry-clay-menorah', 'Airdry Clay Menorah', 'Toys'),
  item('lego-menorah', '"Lego" Menorah', 'Menorah'),
  item('toddler-play-menorah', 'Toddler Play Menorah', 'Menorah'),
  item('draw-your-own-dreidel', 'Draw Your Own Dreidel', 'Dreidel'),
  item('airdry-clay-dreidel', 'Airdry Clay Dreidel', 'Dreidel'),
  item('crispy-the-latke-stuffie', 'Crispy, the Latke Stuffie', 'Stuffies'),
  item('gimmel-the-dreidel-stuffie', 'Gimmel, the Dreidel Stuffie', 'Stuffies'),
];

const ids = (items: CatalogItem[]) => items.map((i) => i.id);

assert.deepEqual(ids(orderGiftOptionsForAge(catalog, 1)).slice(0, 3), [
  'toddler-play-menorah',
  'crispy-the-latke-stuffie',
  'gimmel-the-dreidel-stuffie',
]);
assert.deepEqual(ids(orderGiftOptionsForAge(catalog, 4)).slice(0, 2), ['crispy-the-latke-stuffie', 'gimmel-the-dreidel-stuffie']);
assert.deepEqual(ids(orderGiftOptionsForAge(catalog, 8)).slice(0, 2), ['airdry-clay-menorah', 'airdry-clay-dreidel']);
// Then the age's fallback (stuffies); everything else keeps its order behind them.
assert.deepEqual(ids(orderGiftOptionsForAge(catalog, 8)).slice(2), [
  'crispy-the-latke-stuffie',
  'gimmel-the-dreidel-stuffie',
  'lego-menorah',
  'toddler-play-menorah',
  'draw-your-own-dreidel',
]);

// A toddler swapping out the play menorah sees stuffies first; no age keeps the old order.
const toddlerShelf = ids(resolveIncludedGiftOptions(catalog, 'toddler-play-menorah', 6, 1));
assert.deepEqual(toddlerShelf.slice(0, 2), ['crispy-the-latke-stuffie', 'gimmel-the-dreidel-stuffie']);
assert.equal(toddlerShelf.includes('toddler-play-menorah'), false);
assert.equal(ids(resolveIncludedGiftOptions(catalog, 'toddler-play-menorah', 6))[0], 'airdry-clay-menorah');

console.log('sectionUpsells gift age ok');
