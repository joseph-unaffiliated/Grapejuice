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
    row('airdry-clay-dreidel', 'Airdry Clay Dreidel', 300, { defaultGiftAges: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    row('airdry-clay-menorah', 'Airdry Clay Menorah', 300, { defaultGiftAges: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    row('toddler-play-menorah', 'Toddler Play Menorah', 100, { defaultGiftAges: [0, 1, 2, 3] }),
    row('draw-your-own-dreidel', 'Draw Your Own Dreidel', 100, { defaultGiftAges: [4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    row('lego-menorah', '"Lego" Menorah', 20, { defaultGiftAges: [5, 6, 7, 8, 9, 10, 11, 12] }),
    row('crispy-the-latke-stuffie', 'Crispy, the Latke Stuffie', 100, { defaultGiftAges: [0, 1, 2, 3, 4, 5, 6, 7] }),
    row('gimmel-the-dreidel-stuffie', 'Gimmel, the Dreidel Stuffie', 100, { defaultGiftAges: [0, 1, 2, 3, 4, 5, 6, 7] }),
    row('jelly-the-sufganiyah-stuffie', 'Jelly, the Sufganiyah Stuffie', 100, { defaultGiftAges: [0, 1, 2, 3, 4, 5, 6, 7] }),
    row('shamash-the-menorah-stuffie', 'Shamash, the Menorah Stuffie', 100, { defaultGiftAges: [0, 1, 2, 3, 4, 5, 6, 7] }),
  ];
  return rows.map((r) => (r.id in stockLeft ? { ...r, stockLeft: stockLeft[r.id] } : r));
}

// Without stock data the fixed age table still applies.
{
  const untracked = catalog().map((r) => ({ ...r, inventory: null }));
  const gifts = planGifts({ kids: [{ age: 6 }, { age: 1 }], catalog: untracked });
  assert.deepEqual(gifts.map((g) => g.kind), ['lego-menorah', 'wood-toy-menorah']);
  assert.deepEqual(planGifts({ kids: [{ age: 6 }] }).map((g) => g.kind), ['lego-menorah']);
}

// Big-stock gifts lead; Lego (20) is never a default at full stock.
{
  const c = catalog();
  assert.equal(planGifts({ kids: [{ age: 6 }], catalog: c })[0].kind, 'airdry');
  assert.equal(planGifts({ kids: [{ age: 1 }], catalog: c })[0].kind, 'wood-toy-menorah');
  for (const age of ALL_AGES) {
    assert.notEqual(planGifts({ kids: [{ age }], catalog: c })[0].kind, 'lego-menorah');
  }
}

// Siblings get distinct gift kinds when stock allows.
{
  const kinds = planGifts({ kids: [{ age: 5 }, { age: 5 }], catalog: catalog() }).map((g) => g.kind);
  assert.equal(new Set(kinds).size, 2);
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
}

// Items at their swap reserve stop being defaults.
{
  const c = catalog({ 'toddler-play-menorah': 15 });
  assert.equal(isDefaultEligible(c.find((r) => r.id === 'toddler-play-menorah')!), false);
  assert.notEqual(planGifts({ kids: [{ age: 1 }], catalog: c })[0].kind, 'wood-toy-menorah');
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

// Food: both mixes until either kit reaches its swap reserve, then the fuller one.
{
  assert.deepEqual(planFoodDefaults(catalog()), ['latke-mix', 'sufganiyot-mix']);
  assert.deepEqual(
    planFoodDefaults(catalog({ 'latke-kit': 20, 'sufganiyot-kit': 25 })),
    ['latke-mix', 'sufganiyot-mix']
  );
  assert.deepEqual(planFoodDefaults(catalog({ 'latke-kit': 15, 'sufganiyot-kit': 25 })), ['sufganiyot-mix']);
  assert.deepEqual(planFoodDefaults(catalog({ 'latke-kit': 1, 'sufganiyot-kit': 1 })), []);
}

console.log('boxRules stock tests passed');
