/**
 * Run: npx tsx src/constants/boxDisplaySections.test.ts
 *
 * Dreidel Cookie Cutters are Food even though the name says dreidel.
 * Real dreidels stay in Play Dreidel.
 */
import assert from 'node:assert/strict';
import {
  displaySectionForCatalogItem,
  displaySectionForLineItem,
  inferGiftDisplaySection,
} from './boxDisplaySections';
import {
  donatedItemQuantities,
  includedClaimAlreadyTaken,
  includedClaimBlockedUnitCents,
  notePromotedIncludedSwap,
  paidSiblingForIncludedPromotion,
  promotePaidSiblingToIncludedPractice,
  removeCoalescedGroup,
  revertPromotedIncludedSwap,
  seedIncludedBaselines,
  takePromotedIncludedUndo,
  transferIncludedBaselineOnSwap,
  uniqueSlotForFreeSectionAdd,
} from '../components/box/boxLineDisplay';
import type { BoxLineItem, CatalogItem } from '../types/pilot';

const item = (over: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'name'>): CatalogItem =>
  ({ slot: 'addon', slotId: 'decor', ...over }) as CatalogItem;

const line = (over: Partial<BoxLineItem> & Pick<BoxLineItem, 'slotId' | 'itemId'>): BoxLineItem =>
  ({ quantity: 1, unitCents: 0, ...over }) as BoxLineItem;

const cutters = item({
  id: 'dreidel-cookie-cutters',
  name: 'Dreidel Cookie Cutters',
  slotId: 'decor',
  category: 'Food',
  categories: ['Food', 'On Sale', 'Activity', 'Other'],
  pricingTier: 'alaCarte',
  memberPriceCents: 400,
});

const dreidels = [
  item({ id: 'classic-wooden-dreidel', name: 'Classic Wooden Dreidel', slotId: 'gift', category: 'Dreidel' }),
  item({ id: 'draw-your-own-dreidel', name: 'Draw Your Own Dreidel', slotId: 'gift', category: 'Dreidel' }),
  item({ id: 'airdry-clay-dreidel', name: 'Airdry Clay Dreidel', slotId: 'keepsake-dreidel', category: 'Dreidel' }),
  item({ id: 'solid-brass-dreidel', name: 'Solid Brass Dreidel', slotId: 'keepsake-dreidel', category: 'Dreidel' }),
  item({ id: 'slipcast-dreidel', name: 'Slipcast Dreidel', slotId: 'keepsake-dreidel', category: 'Dreidel' }),
  item({ id: 'gimmel-the-dreidel-stuffie', name: 'Gimmel, the Dreidel Stuffie', slotId: 'decor', category: 'Stuffies' }),
];

const elmo = item({
  id: 'book-elmo-s-little-dreidel-sesame-street',
  name: "Elmo's Little Dreidel (Sesame Street)",
  slotId: 'story',
  category: 'Book',
});

{
  assert.equal(displaySectionForCatalogItem(cutters), 'food');
  assert.equal(inferGiftDisplaySection(cutters), 'food');
  assert.equal(
    displaySectionForLineItem(
      line({
        slotId: 'addon-dreidel-cookie-cutters',
        itemId: cutters.id,
        unitCents: 400,
        displaySectionId: 'dreidel',
      }),
      cutters
    ),
    'food'
  );
  assert.equal(
    displaySectionForLineItem(line({ slotId: 'decor', itemId: cutters.id, unitCents: 400 }), cutters),
    'food'
  );
}

const jelly = item({
  id: 'jelly-the-sufganiyah-stuffie',
  name: 'Jelly, the Sufganiyah Stuffie',
  slotId: 'decor',
  category: 'Stuffies',
  categories: ['Stuffies', 'Toys'],
  pricingTier: 'alaCarte',
  memberPriceCents: 1000,
});
assert.equal(displaySectionForCatalogItem(jelly), 'presents');
assert.equal(inferGiftDisplaySection(jelly), 'presents');

const crispy = item({
  id: 'crispy-the-latke-stuffie',
  name: 'Crispy, the Latke Stuffie',
  slotId: 'decor',
  category: 'Stuffies',
});
assert.equal(inferGiftDisplaySection(crispy), 'presents');

for (const dreidel of dreidels) {
  if (dreidel.id === 'gimmel-the-dreidel-stuffie') {
    assert.equal(displaySectionForCatalogItem(dreidel), 'presents');
    assert.equal(inferGiftDisplaySection(dreidel), 'dreidel');
  } else {
    assert.equal(displaySectionForCatalogItem(dreidel), 'dreidel', dreidel.id);
    assert.equal(inferGiftDisplaySection(dreidel), 'dreidel', dreidel.id);
  }
}

assert.equal(displaySectionForCatalogItem(elmo), 'story');
assert.equal(
  displaySectionForLineItem(
    line({ slotId: 'story', itemId: elmo.id, displaySectionId: 'story' }),
    elmo
  ),
  'story'
);

const beeswax = item({
  id: 'beeswax-candles',
  name: 'Beeswax Candles',
  slotId: 'candles',
  category: 'Candles',
  pricingTier: 'included',
  memberPriceCents: 500,
});
const roll = item({
  id: 'roll-your-own-beeswax-candles',
  name: 'Roll Your Own Beeswax Candles',
  slotId: 'extra-candles',
  category: 'Candles',
  pricingTier: 'alaCarte',
  memberPriceCents: 600,
});
const catalog = [beeswax, roll, cutters];

const before = [
  line({ slotId: 'candles', itemId: beeswax.id, label: beeswax.name, includedQty: 1, displaySectionId: 'candles' }),
  line({
    slotId: 'addon-roll-your-own-beeswax-candles',
    itemId: roll.id,
    unitCents: 600,
    label: roll.name,
    includedQty: 0,
    displaySectionId: 'candles',
  }),
];
const baselines = seedIncludedBaselines(before);
const snapshots = new Map<string, BoxLineItem[]>();
const undos = new Map();
const removed = removeCoalescedGroup(before, {
  key: beeswax.id,
  itemId: beeswax.id,
  primary: before[0]!,
  lines: [before[0]!],
  quantity: 1,
  includedQuantity: 1,
  childIds: [],
  unitCents: 0,
});
const promotedBefore = paidSiblingForIncludedPromotion(
  removed,
  'candles',
  catalog,
  displaySectionForLineItem
);
assert.equal(promotedBefore?.itemId, roll.id);
const promoted = promotePaidSiblingToIncludedPractice(
  removed,
  'candles',
  catalog,
  displaySectionForLineItem
);
assert.notEqual(promoted, removed);
notePromotedIncludedSwap(baselines, snapshots, undos, beeswax.id, [before[0]!], promotedBefore!);

assert.equal(baselines.has(beeswax.id), false);
assert.equal(baselines.get(roll.id), 1);
assert.equal(snapshots.has(beeswax.id), false);
const donated = donatedItemQuantities(promoted, catalog, baselines);
assert.equal(donated.some((d) => d.item.id === beeswax.id), false);
const rollLine = promoted.find((li) => li.itemId === roll.id);
assert.equal(rollLine?.unitCents, 0);

const undo = takePromotedIncludedUndo(undos, beeswax.id, promoted);
assert.ok(undo);
transferIncludedBaselineOnSwap(baselines, undo.promotedBefore.itemId, beeswax.id, undo.movedQty, 0);
const restored = revertPromotedIncludedSwap(promoted, undo);
const restoredBeeswax = restored.find((li) => li.itemId === beeswax.id);
const restoredRoll = restored.find((li) => li.itemId === roll.id);
assert.equal(restoredBeeswax?.unitCents, 0);
assert.equal(restoredBeeswax?.slotId, 'candles');
assert.equal(restoredRoll?.unitCents, 600);
assert.equal(restoredRoll?.slotId, 'addon-roll-your-own-beeswax-candles');
assert.equal(baselines.get(beeswax.id), 1);
assert.equal(baselines.has(roll.id), false);
assert.equal(
  restored.filter((li) => (li.unitCents ?? 0) === 0 && (li.itemId === beeswax.id || li.itemId === roll.id)).length,
  1
);

// Included-tier beeswax must not come back free once Roll Your Own holds the slot.
assert.equal(includedClaimAlreadyTaken(beeswax, [before[0]!], promoted, catalog), true);
assert.equal(includedClaimBlockedUnitCents(beeswax), 500);

const airdry = dreidels.find((d) => d.id === 'airdry-clay-dreidel')!;
const lego = item({ id: 'lego-menorah', name: '"Lego" Menorah', slotId: 'decor', category: 'Menorah' });
assert.equal(
  displaySectionForLineItem(line({ slotId: 'gift-kid', itemId: airdry.id, displaySectionId: 'dreidel' }), airdry),
  'presents'
);
assert.equal(
  displaySectionForLineItem(line({ slotId: 'gift-kid', itemId: lego.id, displaySectionId: 'candles' }), lego),
  'presents'
);
assert.equal(
  displaySectionForLineItem(line({ slotId: 'wood-dreidel', itemId: airdry.id, displaySectionId: 'dreidel' }), airdry),
  'dreidel'
);

const gimmel = dreidels.find((d) => d.id === 'gimmel-the-dreidel-stuffie')!;
const crispyItem = item({
  id: 'crispy-the-latke-stuffie',
  name: 'Crispy, the Latke Stuffie',
  slotId: 'decor',
  category: 'Stuffies',
});
const jellyItem = item({
  id: 'jelly-the-sufganiyah-stuffie',
  name: 'Jelly, the Sufganiyah Stuffie',
  slotId: 'decor',
  category: 'Stuffies',
});
const wood = dreidels.find((d) => d.id === 'classic-wooden-dreidel')!;
const latke = item({ id: 'latke-kit', name: 'Latke Kit', slotId: 'latke-mix', category: 'Food', pricingTier: 'included' });
const sufganiyot = item({ id: 'sufganiyot-kit', name: 'Sufganiyot Kit', slotId: 'sufganiyot-mix', category: 'Food', pricingTier: 'included' });

function paidAfterDroppingIncluded(included: BoxLineItem, extra: BoxLineItem, section: 'dreidel' | 'food' | 'candles', rows: CatalogItem[]) {
  const removed = removeCoalescedGroup([included, extra], {
    key: included.itemId,
    itemId: included.itemId,
    primary: included,
    lines: [included],
    quantity: included.quantity ?? 1,
    includedQuantity: included.quantity ?? 1,
    childIds: [],
    unitCents: 0,
  });
  const sibling = paidSiblingForIncludedPromotion(removed, section, rows, displaySectionForLineItem);
  const next = promotePaidSiblingToIncludedPractice(removed, section, rows, displaySectionForLineItem);
  return { siblingId: sibling?.itemId, line: next.find((li) => li.itemId === extra.itemId) };
}

const gimmelKept = paidAfterDroppingIncluded(
  line({ slotId: 'wood-dreidel', itemId: wood.id, displaySectionId: 'dreidel' }),
  line({ slotId: 'addon-gimmel-the-dreidel-stuffie', itemId: gimmel.id, unitCents: 1000, displaySectionId: 'dreidel' }),
  'dreidel',
  [wood, gimmel]
);
assert.equal(gimmelKept.siblingId, undefined);
assert.equal(gimmelKept.line?.unitCents, 1000);

const crispyKept = paidAfterDroppingIncluded(
  line({ slotId: 'latke-mix', itemId: latke.id, displaySectionId: 'food' }),
  line({ slotId: 'addon-crispy-the-latke-stuffie', itemId: crispyItem.id, unitCents: 1000, displaySectionId: 'food' }),
  'food',
  [latke, crispyItem]
);
assert.equal(crispyKept.siblingId, undefined);
assert.equal(crispyKept.line?.unitCents, 1000);

const jellyKept = paidAfterDroppingIncluded(
  line({ slotId: 'sufganiyot-mix', itemId: sufganiyot.id, displaySectionId: 'food' }),
  line({ slotId: 'addon-jelly-the-sufganiyah-stuffie', itemId: jellyItem.id, unitCents: 1000, displaySectionId: 'food' }),
  'food',
  [sufganiyot, jellyItem]
);
assert.equal(jellyKept.siblingId, undefined);
assert.equal(jellyKept.line?.unitCents, 1000);

const legoKept = paidAfterDroppingIncluded(
  line({ slotId: 'candles', itemId: beeswax.id, displaySectionId: 'candles' }),
  line({ slotId: 'addon-lego-menorah', itemId: lego.id, unitCents: 1500, displaySectionId: 'candles' }),
  'candles',
  [beeswax, lego]
);
assert.equal(legoKept.siblingId, undefined, 'a Lego menorah is not a free candle');
assert.equal(legoKept.line?.unitCents, 1500);

assert.equal(
  uniqueSlotForFreeSectionAdd('dreidel', gimmel, [line({ slotId: 'wood-dreidel', itemId: wood.id })]),
  `addon-${gimmel.id}`
);

console.log('boxDisplaySections.test.ts ok');
