/**
 * Run: npx tsx src/services/rav/applyRavDraftActions.test.ts
 *
 * Rav adds into an empty food slot are free (a second kit is fine; Little Bags come as three),
 * and the box summary Rav reads marks each line included or paid.
 */
import assert from 'node:assert/strict';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { applyRavDraftActions, summarizeLineItemsForRav } from './applyRavDraftActions';

const item = (over: Partial<CatalogItem> & { id: string; name: string }): CatalogItem =>
  ({
    description: '',
    slot: 'food',
    slotId: over.id,
    category: 'Food',
    ageGroups: [],
    defaultFor: [],
    swapOptions: [],
    dollarCostCents: 800,
    holiday: 'hanukkah',
    ...over,
  }) as CatalogItem;

const catalog = [
  item({ id: 'latke-kit', name: 'Latke Kit' }),
  item({ id: 'sufganiyot-kit', name: 'Sufganiyot Kit' }),
  item({
    id: 'little-bag-of-gelt-2-big-5-little',
    name: 'Little Bag of Gelt (2 big, 5 little)',
    category: 'Gelt',
    slotId: 'decor',
  }),
];

const line = (slotId: string, itemId: string, unitCents = 0): BoxLineItem => ({
  slotId,
  itemId,
  quantity: 1,
  unitCents,
  label: itemId,
});

const oneKit = [line('latke-mix', 'latke-kit')];
const twoKits = [line('latke-mix', 'latke-kit'), line('sufganiyot-mix', 'sufganiyot-kit')];

{
  const { lineItems, applied } = applyRavDraftActions([{ type: 'add', itemId: 'latke-kit' }], oneKit, catalog);
  assert.equal(applied.length, 1);
  const added = lineItems.slice(oneKit.length);
  assert.equal(added.length, 1);
  assert.equal(added[0].itemId, 'latke-kit');
  assert.equal(added[0].unitCents, 0, 'second kit in an empty food slot is free');
  assert.equal(added[0].quantity, 1);
}

{
  const { lineItems } = applyRavDraftActions(
    [{ type: 'add', itemId: 'little-bag-of-gelt-2-big-5-little' }],
    oneKit,
    catalog
  );
  const added = lineItems.slice(oneKit.length);
  assert.equal(added.length, 1);
  assert.equal(added[0].unitCents, 0);
  assert.equal(added[0].quantity, 3, 'a food slot of Little Bags holds three');
  assert.equal(added[0].includedQty, 3);
}

{
  const { lineItems, skipped } = applyRavDraftActions([{ type: 'add', itemId: 'latke-kit' }], twoKits, catalog);
  assert.equal(skipped.length, 1, 'both food slots full: no free extra kit');
  assert.equal(lineItems.length, twoKits.length);
}

{
  const summary = summarizeLineItemsForRav([line('latke-mix', 'latke-kit'), line('addon-latke-kit', 'latke-kit', 1200)]);
  assert.equal(summary, 'latke-mix:latke-kit (included); addon-latke-kit:latke-kit (paid $12 each)');
}

console.log('applyRavDraftActions: ok');
