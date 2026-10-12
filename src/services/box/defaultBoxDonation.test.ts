/**
 * Run: npx tsx src/services/box/defaultBoxDonation.test.ts
 *
 * A fresh 1-adult, 1-kid box must not list à la carte stuffies or toys as a
 * donation. Those SKUs are paid extras unless they fill an empty gift slot.
 */
import assert from 'node:assert/strict';
import { buildCuratedBox, toRulesRow } from './buildDefaultBox';
import { resolveGiftKind } from './boxRules';
import {
  donatedItemQuantities,
  includedClaimAlreadyTaken,
  includedClaimBlockedUnitCents,
  seedIncludedBaselines,
} from '../../components/box/boxLineDisplay';
import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';

const item = (over: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'name'>): CatalogItem =>
  ({
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
    ...over,
  }) as CatalogItem;

const line = (over: Partial<BoxLineItem> & Pick<BoxLineItem, 'slotId' | 'itemId'>): BoxLineItem =>
  ({ quantity: 1, unitCents: 0, ...over }) as BoxLineItem;

const catalog: CatalogItem[] = [
  item({ id: 'beeswax-candles', name: 'Beeswax Candles', slotId: 'candles', category: 'Candles', pricingTier: 'included', defaultSlot: 'candles', memberPriceCents: 500 }),
  item({ id: 'latke-kit', name: 'Latke Kit', slotId: 'latke-kit', category: 'Food', pricingTier: 'included', defaultSlot: 'latke-mix', memberPriceCents: 500 }),
  item({ id: 'sufganiyot-kit', name: 'Sufganiyot Kit', slotId: 'sufganiyot-kit', category: 'Food', pricingTier: 'included', defaultSlot: 'sufganiyot-mix', memberPriceCents: 500 }),
  item({ id: 'classic-wooden-dreidel', name: 'Classic Wooden Dreidel', slotId: 'gift', category: 'Dreidel', pricingTier: 'perKid', memberPriceCents: 100 }),
  item({ id: 'draw-your-own-dreidel', name: 'Draw Your Own Dreidel', slotId: 'gift', category: 'Dreidel', pricingTier: 'perKid', memberPriceCents: 100 }),
  item({ id: 'big-bag-of-gelt', name: 'Big Bag of Gelt', slotId: 'decor', category: 'Gelt', pricingTier: 'included', defaultSlot: 'gelt-medium', memberPriceCents: 500 }),
  item({ id: 'wrapping-paper', name: 'Wrapping Paper', slotId: 'wrapping', category: 'Other', pricingTier: 'included', defaultSlot: 'wrapping-paper', memberPriceCents: 500 }),
  item({ id: 'book-a-dragon-for-hanukkah', name: 'A Dragon for Hanukkah', slot: 'story', slotId: 'story', category: 'Book', pricingTier: 'perKid', defaultBookAges: [0, 1, 2, 3, 4, 5, 6, 7, 8], memberPriceCents: 800 }),
  item({ id: 'jelly-the-sufganiyah-stuffie', name: 'Jelly, the Sufganiyah Stuffie', category: 'Stuffies', categories: ['Stuffies', 'Toys'], pricingTier: 'alaCarte', inventory: 100, memberPriceCents: 1000 }),
  item({ id: 'crispy-the-latke-stuffie', name: 'Crispy, the Latke Stuffie', category: 'Stuffies', pricingTier: 'alaCarte', inventory: 80, memberPriceCents: 1000 }),
  item({ id: 'gimmel-the-dreidel-stuffie', name: 'Gimmel, the Dreidel Stuffie', category: 'Stuffies', pricingTier: 'alaCarte', inventory: 70, memberPriceCents: 1000 }),
  item({ id: 'shamash-the-menorah-stuffie', name: 'Shamash, the Menorah Stuffie', category: 'Stuffies', pricingTier: 'alaCarte', inventory: 60, memberPriceCents: 1000 }),
  item({ id: 'lego-menorah', name: '"Lego" Menorah', category: 'Menorah', pricingTier: 'alaCarte', inventory: 40, memberPriceCents: 1500 }),
  item({ id: 'toddler-play-menorah', name: 'Toddler Play Menorah', category: 'Menorah', pricingTier: 'alaCarte', inventory: 90, memberPriceCents: 1500 }),
  item({ id: 'airdry-clay-menorah', name: 'Airdry Clay Menorah', category: 'Toys', pricingTier: 'alaCarte', inventory: 90, memberPriceCents: 300 }),
  item({ id: 'airdry-clay-dreidel', name: 'Airdry Clay Dreidel', slotId: 'keepsake-dreidel', category: 'Dreidel', pricingTier: 'alaCarte', inventory: 200, memberPriceCents: 300 }),
];

const alaCarteIds = new Set(catalog.filter((c) => c.pricingTier === 'alaCarte').map((c) => c.id));

const sam = (age: number): ChildProfile =>
  ({ id: 'sam', name: 'Sam', ageGroup: '3-5', plannerAge: age }) as ChildProfile;

for (const age of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
  const built = buildCuratedBox(catalog, [sam(age)], { practice: 'minimal', adults: 1 });
  const gifts = built.lineItems.filter((li) => li.slotId.startsWith('gift-'));
  assert.equal(gifts.length, 1, `age ${age} gift count`);
  assert.equal(alaCarteIds.has(gifts[0]!.itemId), false, `age ${age} gift ${gifts[0]!.itemId}`);
  for (const li of built.lineItems) {
    assert.equal(alaCarteIds.has(li.itemId), false, `age ${age} line ${li.itemId}`);
  }
  const baselines = seedIncludedBaselines(built.lineItems);
  const donated = donatedItemQuantities(built.lineItems, catalog, baselines);
  assert.deepEqual(
    donated.map((d) => d.item.id),
    [],
    `age ${age} donations`
  );
  assert.equal(baselines.has('jelly-the-sufganiyah-stuffie'), false);
}

const age5 = buildCuratedBox(catalog, [sam(5)], { practice: 'minimal', adults: 1 });
const jelly = catalog.find((c) => c.id === 'jelly-the-sufganiyah-stuffie')!;
const crispy = catalog.find((c) => c.id === 'crispy-the-latke-stuffie')!;
const gimmel = catalog.find((c) => c.id === 'gimmel-the-dreidel-stuffie')!;
const menorahToy = catalog.find((c) => c.id === 'airdry-clay-menorah')!;
const lego = catalog.find((c) => c.id === 'lego-menorah')!;

// Sam already has a present. Undo must not make an à la carte stuffie/toy a second included gift.
for (const extra of [jelly, crispy, gimmel, menorahToy, lego]) {
  assert.equal(includedClaimAlreadyTaken(extra, [], age5.lineItems, catalog), true, extra.id);
  assert.equal(includedClaimBlockedUnitCents(extra), extra.memberPriceCents);
}

// The gift slot is empty — restoring the donated present is included.
const withoutGift = age5.lineItems.filter((li) => !li.slotId.startsWith('gift-'));
const giftLine = age5.lineItems.find((li) => li.slotId.startsWith('gift-'))!;
assert.equal(includedClaimAlreadyTaken(jelly, [giftLine], withoutGift, catalog), false);
assert.equal(
  includedClaimAlreadyTaken(
    jelly,
    [line({ slotId: 'gift-sam', itemId: jelly.id, childId: 'sam', label: jelly.name })],
    withoutGift,
    catalog
  ),
  false
);

// A phantom baseline (no gift snapshot) while Sam still has a present stays paid.
const phantom = seedIncludedBaselines(age5.lineItems);
phantom.set(jelly.id, 1);
const donatedPhantom = donatedItemQuantities(age5.lineItems, catalog, phantom);
assert.equal(donatedPhantom.some((d) => d.item.id === jelly.id), true);
assert.equal(includedClaimAlreadyTaken(jelly, [], age5.lineItems, catalog), true);

// A one-row lookup still recognizes the stuffie so "swap in any stuffie" keeps working.
assert.equal(resolveGiftKind([toRulesRow(jelly)], 'stuffie')?.id, jelly.id);
assert.equal(resolveGiftKind(catalog.map(toRulesRow), 'stuffie', 5), undefined);

console.log('defaultBoxDonation.test.ts ok');
