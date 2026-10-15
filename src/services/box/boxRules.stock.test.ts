/**
 * Run: npx tsx src/services/box/boxRules.stock.test.ts
 */
import assert from 'node:assert/strict';
import {
  isDefaultEligible,
  planCandlesDefault,
  planCuratedOutline,
  planFoodDefaults,
  planGifts,
  resolveGiftKind,
  type BoxRulesCatalogRow,
} from './boxRules';

const ALL_AGES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function row(
  id: string,
  name: string,
  inventory: number | null,
  extra: Partial<BoxRulesCatalogRow> = {}
): BoxRulesCatalogRow {
  return { id, name, inventory, ...extra };
}

/** Hanukkah 2026 Airtable inventory (Oct 1). */
function catalog(stockLeft: Record<string, number> = {}): BoxRulesCatalogRow[] {
  const rows = [
    row('beeswax-candles', 'Beeswax Candles', 100, { defaultSlot: 'candles' }),
    row('roll-your-own-beeswax-candles', 'Roll Your Own Beeswax Candles', 50, {
      defaultGiftAges: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    }),
    row('electric-candles', 'Electric Candles', 22),
    row('latke-kit', 'Latke Kit', 100, { defaultSlot: 'latke-mix' }),
    row('sufganiyot-kit', 'Sufganiyot Kit', 100, { defaultSlot: 'sufganiyot-mix' }),
    row('airdry-clay-dreidel', 'Airdry Clay Dreidel', 300, { defaultGiftAges: [6, 7, 8, 9, 10, 11, 12] }),
    row('airdry-clay-menorah', 'Airdry Clay Menorah', 300, { defaultGiftAges: [6, 7, 8, 9, 10, 11, 12] }),
    row('toddler-play-menorah', 'Toddler Play Menorah', 100, { defaultGiftAges: [0, 1, 2] }),
    row('draw-your-own-dreidel', 'Draw Your Own Dreidel', 100, { defaultGiftAges: [4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    row('lego-menorah', '"Lego" Menorah', 20, { defaultGiftAges: [5, 6, 7, 8, 9, 10, 11, 12] }),
    row('crispy-the-latke-stuffie', 'Crispy, the Latke Stuffie', 100, { defaultGiftAges: [0, 1, 2, 3, 4, 5, 6, 7] }),
    row('gimmel-the-dreidel-stuffie', 'Gimmel, the Dreidel Stuffie', 100, { defaultGiftAges: [0, 1, 2, 3, 4, 5, 6, 7] }),
    row('jelly-the-sufganiyah-stuffie', 'Jelly, the Sufganiyah Stuffie', 100, { defaultGiftAges: [0, 1, 2, 3, 4, 5, 6, 7] }),
    row('shamash-the-menorah-stuffie', 'Shamash, the Menorah Stuffie', 100, { defaultGiftAges: [0, 1, 2, 3, 4, 5, 6, 7] }),
  ];
  return rows.map((r) => (r.id in stockLeft ? { ...r, stockLeft: stockLeft[r.id] } : r));
}

// Presents by age: toddler play menorah 0–2, stuffie 3–5, clay 6+. Same with or without stock data.
{
  const untracked = catalog().map((r) => ({ ...r, inventory: null }));
  for (const c of [catalog(), untracked, undefined]) {
    for (const age of ALL_AGES) {
      const kind = planGifts({ kids: [{ age }], catalog: c })[0].kind;
      assert.equal(kind, age <= 2 ? 'wood-toy-menorah' : age <= 5 ? 'stuffie' : 'airdry', `age ${age}`);
    }
  }
}

// Never a book, gelt, or a non-default gift — under any stock.
{
  const allLow = catalog(Object.fromEntries(catalog().map((r) => [r.id, 1])));
  for (const c of [catalog(), allLow]) {
    for (const age of ALL_AGES) {
      const kind = planGifts({ kids: [{ age }, { age }, { age }], catalog: c })[0].kind;
      assert.ok(['wood-toy-menorah', 'stuffie', 'airdry'].includes(kind), `age ${age} ${kind}`);
    }
  }
}

// Siblings: a second toddler gets a stuffie; stuffies and clay kits repeat by kind (rows differ in the box).
{
  assert.deepEqual(
    planGifts({ kids: [{ age: 1 }, { age: 2 }], catalog: catalog() }).map((g) => g.kind),
    ['wood-toy-menorah', 'stuffie']
  );
  assert.deepEqual(
    planGifts({ kids: [{ age: 4 }, { age: 4 }, { age: 8 }, { age: 9 }], catalog: catalog() }).map((g) => g.kind),
    ['stuffie', 'stuffie', 'airdry', 'airdry']
  );
}

// Within a kind, the row with the most left wins.
{
  const c = catalog({
    'crispy-the-latke-stuffie': 30,
    'gimmel-the-dreidel-stuffie': 90,
    'jelly-the-sufganiyah-stuffie': 50,
    'shamash-the-menorah-stuffie': 40,
  });
  assert.equal(resolveGiftKind(c, 'stuffie', 2)?.id, 'gimmel-the-dreidel-stuffie');
  assert.equal(resolveGiftKind(c, 'stuffie', 4, new Set(['gimmel-the-dreidel-stuffie']))?.id, 'jelly-the-sufganiyah-stuffie');
  // A sibling's clay kit → the other one.
  const clay = catalog({ 'airdry-clay-menorah': 250, 'airdry-clay-dreidel': 280 });
  assert.equal(resolveGiftKind(clay, 'airdry', 8)?.id, 'airdry-clay-dreidel');
  assert.equal(resolveGiftKind(clay, 'airdry', 8, new Set(['airdry-clay-dreidel']))?.id, 'airdry-clay-menorah');
}

// Items at their swap reserve stop being defaults.
{
  const c = catalog({ 'toddler-play-menorah': 15 });
  assert.equal(isDefaultEligible(c.find((r) => r.id === 'toddler-play-menorah')!), false);
  assert.equal(planGifts({ kids: [{ age: 1 }], catalog: c })[0].kind, 'stuffie');
}

// Candles: beeswax → roll-your-own → electric as each hits its reserve.
{
  assert.equal(planCandlesDefault(catalog()), 'candles');
  assert.equal(planCandlesDefault(catalog({ 'beeswax-candles': 15 })), 'diy-candles');
  assert.equal(
    planCandlesDefault(catalog({ 'beeswax-candles': 15, 'roll-your-own-beeswax-candles': 8 })),
    'electric-candles'
  );
}

// Roll-your-own as the candles default never doubles as that household's gift.
{
  const c = catalog({ 'beeswax-candles': 10 });
  const outline = planCuratedOutline({ kids: [{ age: 9 }, { age: 10 }, { age: 11 }], catalog: c });
  assert.equal(outline.candlesDefault, 'diy-candles');
  assert.ok(outline.gifts.every((g) => g.kind !== 'diy-candles'));
}

// Food: always two slots. A kit at its swap reserve gives its slot to the other kit, then a Big Bag.
{
  assert.deepEqual(planFoodDefaults(catalog()), ['latke-mix', 'sufganiyot-mix']);
  assert.deepEqual(
    planFoodDefaults(catalog({ 'latke-kit': 20, 'sufganiyot-kit': 25 })),
    ['latke-mix', 'sufganiyot-mix']
  );
  assert.deepEqual(
    planFoodDefaults(catalog({ 'latke-kit': 15, 'sufganiyot-kit': 25 })),
    ['sufganiyot-mix', 'sufganiyot-mix']
  );
  const withGelt = [...catalog({ 'latke-kit': 1, 'sufganiyot-kit': 1 }), row('big-bag-of-gelt', 'Big Bag of Gelt (5 big, 20 little)', 200, { defaultSlot: 'gelt-medium' })];
  assert.deepEqual(planFoodDefaults(withGelt), ['gelt-medium', 'gelt-medium']);
  assert.equal(planFoodDefaults(catalog({ 'latke-kit': 0, 'sufganiyot-kit': 0 })).length, 2);
}

console.log('boxRules stock tests passed');
