/**
 * Run: npx tsx src/services/box/boxRules.soldOut.test.ts
 */
import assert from 'node:assert/strict';
import {
  isDefaultEligible,
  isLowWithDrafts,
  isSoldOutForBoxes,
  planGifts,
  rowRemainingWithDrafts,
  swapSoldOutLines,
  type BoxRulesCatalogRow,
} from './boxRules';

function row(
  id: string,
  name: string,
  inventory: number | null,
  extra: Partial<BoxRulesCatalogRow> = {}
): BoxRulesCatalogRow {
  return { id, name, inventory, ...extra };
}

function catalog(over: Record<string, Partial<BoxRulesCatalogRow>> = {}): BoxRulesCatalogRow[] {
  const rows = [
    row('beeswax-candles', 'Beeswax Candles', 100, { defaultSlot: 'candles' }),
    row('roll-your-own-beeswax-candles', 'Roll Your Own Beeswax Candles', 50, {
      defaultGiftAges: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    }),
    row('electric-candles', 'Electric Candles', 22),
    row('latke-kit', 'Latke Kit', 100, { defaultSlot: 'latke-mix' }),
    row('sufganiyot-kit', 'Sufganiyot Kit', 100, { defaultSlot: 'sufganiyot-mix' }),
    row('airdry-clay-dreidel', 'Airdry Clay Dreidel', 300, { defaultGiftAges: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    row('airdry-clay-menorah', 'Airdry Clay Menorah', 300, { defaultGiftAges: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    row('toddler-play-menorah', 'Toddler Play Menorah', 100, { defaultGiftAges: [0, 1, 2, 3] }),
    row('draw-your-own-dreidel', 'Draw Your Own Dreidel', 100, { defaultGiftAges: [4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    row('lego-menorah', '"Lego" Menorah', 30, { defaultGiftAges: [5, 6, 7, 8, 9, 10, 11, 12] }),
    row('crispy-the-latke-stuffie', 'Crispy, the Latke Stuffie', 100, { defaultGiftAges: [0, 1, 2, 3, 4, 5, 6, 7] }),
    row('gimmel-the-dreidel-stuffie', 'Gimmel, the Dreidel Stuffie', 100, { defaultGiftAges: [0, 1, 2, 3, 4, 5, 6, 7] }),
  ];
  return rows.map((r) => (r.id in over ? { ...r, ...over[r.id] } : r));
}

const find = (c: BoxRulesCatalogRow[], id: string) => c.find((r) => r.id === id)!;

// Remaining subtracts every draft and can go below zero; only real holds mean sold out.
{
  const c = catalog({ 'roll-your-own-beeswax-candles': { stockLeft: 10, draftHeld: 12 } });
  const r = find(c, 'roll-your-own-beeswax-candles');
  assert.equal(rowRemainingWithDrafts(r), -2);
  assert.equal(isLowWithDrafts(r), true);
  assert.equal(isSoldOutForBoxes(r), false);
  assert.equal(isDefaultEligible(r), false);
}

// Low at five remaining (draft-inclusive), not at six.
{
  const five = find(catalog({ 'airdry-clay-dreidel': { stockLeft: 200, draftHeld: 195 } }), 'airdry-clay-dreidel');
  const six = find(catalog({ 'airdry-clay-dreidel': { stockLeft: 200, draftHeld: 194 } }), 'airdry-clay-dreidel');
  assert.equal(isLowWithDrafts(five), true);
  assert.equal(isDefaultEligible(five), false);
  assert.equal(isLowWithDrafts(six), false);
  assert.equal(isDefaultEligible(six), true);
}

// Food kits restock: drafts don't count against them, only real holds.
{
  const c = catalog({ 'latke-kit': { stockLeft: 95, draftHeld: 199 }, 'sufganiyot-kit': { stockLeft: 5, draftHeld: 0 } });
  assert.equal(rowRemainingWithDrafts(find(c, 'latke-kit')), 95);
  assert.equal(isLowWithDrafts(find(c, 'latke-kit')), false);
  assert.equal(isLowWithDrafts(find(c, 'sufganiyot-kit')), true);
}

// Untracked items are never low or sold out.
{
  const book = row('book', 'A Book', null, { draftHeld: 500 });
  assert.equal(rowRemainingWithDrafts(book), null);
  assert.equal(isLowWithDrafts(book), false);
  assert.equal(isSoldOutForBoxes(book), false);
}

// Sold out = no stock left after real holds.
{
  assert.equal(isSoldOutForBoxes(find(catalog({ 'lego-menorah': { stockLeft: 0 } }), 'lego-menorah')), true);
  assert.equal(isSoldOutForBoxes(find(catalog({ 'lego-menorah': { stockLeft: 1, draftHeld: 40 } }), 'lego-menorah')), false);
}

// Defaults skip items that drafts are about to use up.
{
  const c = catalog({ 'airdry-clay-dreidel': { stockLeft: 300, draftHeld: 298 }, 'airdry-clay-menorah': { stockLeft: 300, draftHeld: 296 } });
  assert.notEqual(planGifts({ kids: [{ age: 6 }], catalog: c })[0].kind, 'airdry');
}

// Nothing sold out: same array back.
{
  const lines = [{ slotId: 'gift-k1', itemId: 'lego-menorah', childId: 'k1', quantity: 1 }];
  assert.equal(swapSoldOutLines(lines, catalog(), () => 6).lines, lines);
}

// Sold-out Lego gift → another gift for that kid, not already in the box; quantity kept, note dropped.
{
  const c = catalog({ 'lego-menorah': { stockLeft: 0 } });
  const lines = [
    { slotId: 'candles', itemId: 'beeswax-candles', quantity: 1, label: 'Beeswax Candles' },
    { slotId: 'gift-k1', itemId: 'lego-menorah', childId: 'k1', quantity: 1, label: '"Lego" Menorah', curationNote: 'Builders love it' },
    { slotId: 'gift-k2', itemId: 'airdry-clay-dreidel', childId: 'k2', quantity: 1, label: 'Airdry Clay Dreidel' },
  ];
  const { lines: out, swaps } = swapSoldOutLines(lines, c, () => 6);
  assert.equal(swaps.length, 1);
  assert.equal(swaps[0].fromItemId, 'lego-menorah');
  const swapped = out[1];
  assert.ok(swaps[0].toItemId && swapped.itemId === swaps[0].toItemId);
  assert.notEqual(swapped.itemId, 'lego-menorah');
  assert.notEqual(swapped.itemId, 'airdry-clay-dreidel');
  assert.equal(swapped.quantity, 1);
  assert.equal(swapped.childId, 'k1');
  assert.equal(swapped.label, find(c, swapped.itemId).name);
  assert.equal('curationNote' in swapped, false);
  assert.deepEqual(out[0], lines[0]);
}

// Sold-out beeswax candles → roll-your-own, the next candles default.
{
  const c = catalog({ 'beeswax-candles': { stockLeft: 0 } });
  const { lines: out, swaps } = swapSoldOutLines([{ slotId: 'candles', itemId: 'beeswax-candles', quantity: 1 }], c);
  assert.deepEqual(swaps, [{ fromItemId: 'beeswax-candles', toItemId: 'roll-your-own-beeswax-candles' }]);
  assert.equal(out[0].itemId, 'roll-your-own-beeswax-candles');
}

// Every candles option sold out → the line comes out of the box.
{
  const c = catalog({
    'beeswax-candles': { stockLeft: 0 },
    'roll-your-own-beeswax-candles': { stockLeft: 0 },
    'electric-candles': { stockLeft: 0 },
  });
  const { lines: out, swaps } = swapSoldOutLines([{ slotId: 'candles', itemId: 'beeswax-candles', quantity: 1 }], c);
  assert.deepEqual(swaps, [{ fromItemId: 'beeswax-candles', toItemId: null }]);
  assert.equal(out.length, 0);
}

// Two kids with the sold-out Lego get different replacements.
{
  const c = catalog({ 'lego-menorah': { stockLeft: 0 } });
  const lines = [
    { slotId: 'gift-k1', itemId: 'lego-menorah', childId: 'k1', quantity: 1 },
    { slotId: 'gift-k2', itemId: 'lego-menorah', childId: 'k2', quantity: 1 },
  ];
  const { lines: out, swaps } = swapSoldOutLines(lines, c, () => 8);
  assert.equal(swaps.length, 1);
  assert.equal(out.length, 2);
  assert.notEqual(out[0].itemId, out[1].itemId);
}

console.log('boxRules sold-out tests passed');
