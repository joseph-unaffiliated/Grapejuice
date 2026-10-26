/**
 * Run: npx tsx src/services/box/foodAdd.test.ts
 */
import assert from 'node:assert/strict';
import type { CatalogItem } from '../../types/pilot';
import { foodAddPlacement } from './foodAdd';

const kit = (id: 'latke-kit' | 'sufganiyot-kit') =>
  ({ id, name: id, memberPriceCents: 500, dollarCostCents: 1000 }) as CatalogItem;
const line = (slotId: string, itemId: string, unitCents = 0) => ({ slotId, itemId, quantity: 1, unitCents });

const empty = foodAddPlacement(kit('sufganiyot-kit'), []);
assert.equal(empty?.slotId, 'sufganiyot-mix');
assert.equal(empty?.unitCents, 0);

const otherOpen = foodAddPlacement(kit('sufganiyot-kit'), [line('sufganiyot-mix', 'dreidel-cookie-cutters')]);
assert.equal(otherOpen?.slotId, 'latke-mix');
assert.equal(otherOpen?.unitCents, 0);

const full = foodAddPlacement(kit('sufganiyot-kit'), [
  line('latke-mix', 'latke-kit'),
  line('sufganiyot-mix', 'dreidel-cookie-cutters'),
]);
assert.equal(full?.slotId, 'addon-sufganiyot-kit');
assert.equal(full?.unitCents, 500);

assert.equal(foodAddPlacement({ id: 'dreidel-cookie-cutters' } as CatalogItem, []), null);

console.log('foodAdd.test: ok');
