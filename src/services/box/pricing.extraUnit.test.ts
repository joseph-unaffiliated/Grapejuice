/**
 * Run: npx tsx src/services/box/pricing.extraUnit.test.ts
 * One more unit of an item already in the box is never $0.
 */
import assert from 'node:assert/strict';
import { EXTRA_FLAT_CENTS, extraUnitCents } from './pricing';
import { repairZeroExtraUnits } from './buildDefaultBox';
import type { CatalogItem } from '../../types/pilot';
import type { BoxLineItem } from '../../types/pilot';

const base = {
  name: 'Item',
  slot: 'dreidel',
  slotId: 'wood-dreidel',
  category: 'Dreidel',
} as unknown as CatalogItem;

const item = (over: Partial<CatalogItem>): CatalogItem => ({ ...base, ...over }) as CatalogItem;

// Member price set: the extra unit costs the member price.
assert.equal(extraUnitCents(item({ id: 'a', memberPriceCents: 1500 })), 1500);

// Member price missing: falls back to the catalog cost, then the flat extra price.
assert.equal(extraUnitCents(item({ id: 'b', dollarCostCents: 900 })), 900);
assert.equal(extraUnitCents(item({ id: 'c' })), EXTRA_FLAT_CENTS);

// Member price explicitly 0 (the bug case): flat extra price, never $0.
assert.equal(extraUnitCents(item({ id: 'd', memberPriceCents: 0 })), EXTRA_FLAT_CENTS);
assert.ok(extraUnitCents(item({ id: 'd', memberPriceCents: 0 })) > 0);

// Included-tier practice item with no prices at all: still charged as an extra unit.
assert.equal(
  extraUnitCents(item({ id: 'e', pricingTier: 'included', memberPriceCents: 0, dollarCostCents: 0 })),
  EXTRA_FLAT_CENTS
);

// Repair: only `::x` lines at $0 are re-priced; everything else is left alone.
const catalog = [item({ id: 'gelt', memberPriceCents: 0 }), item({ id: 'book', memberPriceCents: 1200 })];
const lines = [
  { slotId: 'gelt', itemId: 'gelt', quantity: 1, unitCents: 0, label: 'Gelt' },
  { slotId: 'gelt::x', itemId: 'gelt', quantity: 2, unitCents: 0, label: 'Gelt' },
  { slotId: 'story::x', itemId: 'book', quantity: 1, unitCents: 1200, label: 'Book' },
  { slotId: 'story::x', itemId: 'missing', quantity: 1, unitCents: 0, label: 'Gone' },
] as unknown as BoxLineItem[];
const repaired = repairZeroExtraUnits(lines, catalog);
assert.equal(repaired.dirty, true);
assert.equal(repaired.lineItems[0].unitCents, 0, 'included line untouched');
assert.equal(repaired.lineItems[1].unitCents, EXTRA_FLAT_CENTS, '$0 extra unit re-priced');
assert.equal(repaired.lineItems[2].unitCents, 1200, 'priced extra unit untouched');
assert.equal(repaired.lineItems[3].unitCents, 0, 'unknown item left for other repairs');

const clean = repairZeroExtraUnits([lines[0], lines[2]] as BoxLineItem[], catalog);
assert.equal(clean.dirty, false);

console.log('pricing.extraUnit: ok');
