/**
 * Run: npx tsx src/services/box/buildDefaultBox.dreidel.test.ts
 *
 * One included dreidel per person: kids and adults, adult-only households and 5+ kid boxes too.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDefaultLineItems, repairWoodDreidelHouseholdQty } from './buildDefaultBox';
import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';

const catalog = JSON.parse(
  readFileSync(fileURLToPath(new URL('./swapPricing.fixture.json', import.meta.url).href), 'utf8')
) as CatalogItem[];

const kid = (id: string, age: number) => ({ id, name: id, age }) as unknown as ChildProfile;
const DREIDEL_SLOTS = /^(wood-dreidel|blank-dreidel|airdry-dreidel)/;
const freeDreidels = (lines: BoxLineItem[]) =>
  lines
    .filter((l) => DREIDEL_SLOTS.test(l.slotId) && (l.unitCents ?? 0) === 0)
    .reduce((n, l) => n + l.quantity, 0);

assert.equal(freeDreidels(buildDefaultLineItems(catalog, [], [], 2)), 2, 'adult-only household');
assert.equal(freeDreidels(buildDefaultLineItems(catalog, [], [], 1)), 1, 'one adult');
assert.equal(freeDreidels(buildDefaultLineItems(catalog, [kid('a', 4)], [], 2)), 3, 'one kid, two adults');
assert.equal(freeDreidels(buildDefaultLineItems(catalog, [kid('a', 3), kid('b', 6)], [], 1)), 3, 'two kids, one adult');

const fiveYoung = ['a', 'b', 'c', 'd', 'e'].map((id) => kid(id, 3));
assert.equal(freeDreidels(buildDefaultLineItems(catalog, fiveYoung, [], 2)), 7, 'five little kids, two adults');

const wood = buildDefaultLineItems(catalog, [], [], 2).find((l) => l.slotId === 'wood-dreidel');
assert.equal(wood?.includedQty, 2, 'wood line includes every unit');

const woodLine = (quantity: number, includedQty: number): BoxLineItem => ({
  slotId: 'wood-dreidel',
  itemId: 'classic-wooden-dreidel',
  quantity,
  includedQty,
  unitCents: 0,
  label: 'Classic Wooden Dreidel',
});
const oneKid = [kid('a', 4)];

const donated = repairWoodDreidelHouseholdQty([woodLine(1, 2)], oneKid, 1);
assert.equal(donated.dirty, false, 'a lowered wood dreidel is a donation, not a short seed');

const shortSeed = repairWoodDreidelHouseholdQty([woodLine(1, 1)], oneKid, 1);
assert.equal(shortSeed.dirty, true, 'an old one-dreidel seed still grows to household size');
assert.equal(freeDreidels(shortSeed.lineItems), 2);

const donatedWithPaid = repairWoodDreidelHouseholdQty(
  [woodLine(1, 2), { ...woodLine(1, 0), slotId: 'wood-dreidel::x', unitCents: 100 }],
  oneKid,
  1
);
assert.equal(freeDreidels(donatedWithPaid.lineItems), 2, 'paid overflow still converts to free');

const stuffieOnWood = repairWoodDreidelHouseholdQty(
  [{
    slotId: 'wood-dreidel',
    itemId: 'gimmel-the-dreidel-stuffie',
    quantity: 1,
    includedQty: 1,
    unitCents: 0,
    label: 'Gimmel, the Dreidel Stuffie',
  }],
  oneKid,
  1
);
assert.equal(stuffieOnWood.dirty, false, 'a stuffie on the dreidel slot is not a household dreidel');
assert.equal(stuffieOnWood.lineItems[0]?.quantity, 1);

console.log('buildDefaultBox.dreidel: ok');
