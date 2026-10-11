/**
 * Run: npx tsx src/services/box/boxMath.characterization.test.ts
 *
 * Locks in today's My Box arithmetic before the editing logic moves out of
 * MyBoxScreen (useMyBoxEditing). These are facts about the current behavior, not
 * a spec; if one changes, the change must be deliberate.
 */
import assert from 'node:assert/strict';
import {
  boxAddOnUnitCents,
  chargeableLineTotal,
  DEFAULT_BOX_PRICE_CENTS,
  EXTRA_FLAT_CENTS,
  extraUnitCents,
  inferPricingTier,
  orderSubtotalCents,
  orderTotalCents,
  SHIPPING_FLAT_CENTS,
} from './pricing';
import { coalesceLinesByItemId } from '../../components/box/boxLineDisplay';
import { repairExtraPerKidPricing, repairZeroExtraUnits } from './buildDefaultBox';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';

const item = (over: Partial<CatalogItem>): CatalogItem =>
  ({ name: over.id ?? 'Item', slot: 'dreidel', slotId: 'wood-dreidel', category: 'Dreidel', ...over }) as CatalogItem;

const line = (over: Partial<BoxLineItem>): BoxLineItem =>
  ({ slotId: 'wood-dreidel', itemId: 'wood', quantity: 1, unitCents: 0, ...over }) as BoxLineItem;

// Totals: the box price plus every paid unit; shipping is flat (currently $0).
{
  const lines = [
    line({ slotId: 'candles', itemId: 'beeswax' }),
    line({ slotId: 'wood-dreidel', itemId: 'wood', quantity: 2 }),
    line({ slotId: 'wood-dreidel::x', itemId: 'wood', quantity: 1, unitCents: 100 }),
    line({ slotId: 'addon-lego', itemId: 'lego', quantity: 1, unitCents: 1500 }),
  ];
  assert.equal(chargeableLineTotal(lines), 1600);
  assert.equal(orderSubtotalCents(lines), DEFAULT_BOX_PRICE_CENTS + 1600);
  assert.equal(orderTotalCents(lines), DEFAULT_BOX_PRICE_CENTS + 1600 + SHIPPING_FLAT_CENTS);
  assert.equal(orderTotalCents(lines, DEFAULT_BOX_PRICE_CENTS, false), DEFAULT_BOX_PRICE_CENTS + 1600);
  // An empty box has no base price.
  assert.equal(orderSubtotalCents([]), 0);
}

// Coalescing: one row per item, paid extra units fold into the included row.
{
  const rows = coalesceLinesByItemId([
    line({ slotId: 'wood-dreidel', itemId: 'wood', quantity: 2 }),
    line({ slotId: 'wood-dreidel::x', itemId: 'wood', quantity: 1, unitCents: 100 }),
    line({ slotId: 'gift-kid1', itemId: 'shamash', childId: 'kid1' }),
    line({ slotId: 'gift-kid2', itemId: 'shamash', childId: 'kid2' }),
    line({ slotId: 'addon-shamash', itemId: 'shamash', unitCents: 1000 }),
  ]);
  const wood = rows.find((r) => r.itemId === 'wood')!;
  assert.equal(wood.quantity, 3, 'included + extra units count together');
  assert.equal(wood.includedQuantity, 2, 'only the free, non-::x units are included');
  // Per-kid presents stay separate per kid; the extra copy is its own row.
  const shamashRows = rows.filter((r) => r.itemId === 'shamash');
  assert.equal(shamashRows.length, 3);
}

// Pricing tiers and add-on prices as they are today.
{
  assert.equal(inferPricingTier(item({ id: 'wood' })), 'included');
  assert.equal(inferPricingTier(item({ id: 'book', slot: 'story', slotId: 'story', category: 'Book' })), 'perKid');
  assert.equal(inferPricingTier(item({ id: 'extra-x', slotId: 'extra-x' })), 'extra');
  assert.equal(inferPricingTier(item({ id: 'ala-hanukkiah', slotId: 'family-hanukkiah' })), 'alaCarte');
  assert.equal(boxAddOnUnitCents(item({ id: 'wood' })), 0, 'included defaults are free when added as a slot fill');
  assert.equal(boxAddOnUnitCents(item({ id: 'extra-x', slotId: 'extra-x' })), EXTRA_FLAT_CENTS);
  assert.equal(boxAddOnUnitCents(item({ id: 'book', slot: 'story', slotId: 'story', category: 'Book', memberPriceCents: 1200 })), 1200);
  assert.equal(boxAddOnUnitCents(item({ id: 'book2', slot: 'story', slotId: 'story', category: 'Book', memberPriceCents: 0 })), EXTRA_FLAT_CENTS);
  assert.equal(extraUnitCents(item({ id: 'wood', memberPriceCents: 100 })), 100);
  assert.equal(extraUnitCents(item({ id: 'wood', memberPriceCents: 0 })), EXTRA_FLAT_CENTS);
}

// Load-time repairs: per-kid books added free as extras get re-priced; practice defaults never do.
{
  const catalog = [
    item({ id: 'book', slot: 'story', slotId: 'story', category: 'Book', memberPriceCents: 1200 }),
    item({ id: 'wood' }),
  ];
  const r = repairExtraPerKidPricing(
    [
      line({ slotId: 'story', itemId: 'book', unitCents: 0 }),
      line({ slotId: 'story-kid1', itemId: 'book', unitCents: 0, childId: 'kid1' }),
      line({ slotId: 'wood-dreidel', itemId: 'wood', unitCents: 0 }),
    ],
    catalog
  );
  assert.equal(r.dirty, true);
  assert.equal(r.lineItems[0].unitCents, 1200, 'a free book outside a kid slot becomes a paid add-on');
  assert.equal(r.lineItems[0].slotId, 'addon-book');
  assert.equal(r.lineItems[1].unitCents, 0, "a kid's included book stays free");
  assert.equal(r.lineItems[2].unitCents, 0, 'practice defaults stay free');

  const z = repairZeroExtraUnits([line({ slotId: 'wood-dreidel::x', itemId: 'wood', unitCents: 0 })], catalog);
  assert.equal(z.lineItems[0].unitCents, EXTRA_FLAT_CENTS);
}

console.log('boxMath.characterization: ok');
