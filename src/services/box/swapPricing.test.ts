/**
 * Run: npx tsx src/services/box/swapPricing.test.ts
 *
 * Fixture rows are live catalog docs (Oct 15, 2026) trimmed to the fields the matchers read.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  addOnTopUnitCents,
  includedGeltLittleBags,
  swapCandidatesForLine,
  swapOptionsForLine,
  swappedQuantity,
  swapQuantities,
  swapUnitCents,
} from './swapPricing';
import { transferIncludedBaselineOnSwap } from '../../components/box/boxLineDisplay';
import { EXTRA_FLAT_CENTS } from './pricing';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';

const catalog = JSON.parse(readFileSync(fileURLToPath(new URL('./swapPricing.fixture.json', import.meta.url).href), 'utf8')) as CatalogItem[];
const get = (id: string) => {
  const hit = catalog.find((c) => c.id === id);
  if (!hit) throw new Error(`fixture missing ${id}`);
  return hit;
};
const line = (slotId: string, itemId: string, unitCents = 0, childId?: string): BoxLineItem =>
  ({ slotId, itemId, quantity: 1, unitCents, ...(childId ? { childId } : {}) }) as BoxLineItem;
const price = (li: BoxLineItem, to: string, geltCeiling: 'small' | 'medium' | 'party' = 'medium') =>
  swapUnitCents(li, get(li.itemId), get(to), { catalog, geltCeiling });

// A kid's present slot swaps to any included present for free — even a "menorah" stuffie
// coming from the toddler menorah (charged $10 before because candles rules priced it).
assert.equal(price(line('gift-k1', 'toddler-play-menorah', 0, 'k1'), 'shamash-the-menorah-stuffie'), 0);
assert.equal(price(line('gift-k1', 'crispy-the-latke-stuffie', 0, 'k1'), 'shamash-the-menorah-stuffie'), 0);

// Candles only swap to included candles; menorahs and candle books are add-ons, not $0 swaps.
assert.equal(price(line('candles', 'beeswax-candles'), 'electric-candles'), 0);
assert.equal(price(line('candles', 'beeswax-candles'), 'lego-menorah'), undefined);
assert.equal(price(line('candles', 'welcome-menorah'), 'lego-menorah'), undefined);
assert.equal(price(line('candles', 'beeswax-candles'), 'book-nathan-blows-out-the-hanukkah-candles'), undefined);

// Dreidels: clay is included; gelt and the brass dreidel are not swaps.
assert.equal(price(line('wood-dreidel', 'classic-wooden-dreidel'), 'airdry-clay-dreidel'), 0);
assert.equal(price(line('wood-dreidel', 'classic-wooden-dreidel'), 'little-bag-of-gelt-2-big-5-little'), undefined);
assert.equal(price(line('wood-dreidel', 'classic-wooden-dreidel'), 'solid-brass-dreidel'), undefined);

// Gelt for gelt is free up to the household's biggest included bag.
assert.equal(price(line('gelt-medium', 'big-bag-of-gelt'), 'little-bag-of-gelt-2-big-5-little'), 0);
assert.equal(price(line('gelt-medium', 'big-bag-of-gelt'), 'party-bag-of-gelt'), undefined);
assert.equal(price(line('gelt-medium', 'big-bag-of-gelt'), 'party-bag-of-gelt', 'party'), 0);

// A food slot holds a kit, a Big Bag, or Little Bags — never a book or a Party Bag.
assert.equal(price(line('latke-mix', 'latke-kit'), 'big-bag-of-gelt'), 0);
assert.equal(price(line('latke-mix', 'latke-kit'), 'little-bag-of-gelt-2-big-5-little'), 0);
assert.equal(price(line('latke-mix', 'latke-kit'), 'dreidel-cookie-cutters'), 0);
assert.equal(price(line('latke-mix', 'latke-kit'), 'party-bag-of-gelt'), undefined);
assert.equal(price(line('latke-mix', 'latke-kit'), 'book-you-re-my-little-latke'), undefined);
// Gelt sitting in a food slot prices by the slot, so it can go back to either kit.
assert.equal(price(line('latke-mix', 'big-bag-of-gelt'), 'latke-kit'), 0);
assert.equal(price(line('latke-mix', 'big-bag-of-gelt'), 'sufganiyot-kit'), 0);

// Story slots take any book, and only books.
assert.equal(price(line('story-k1', 'book-you-re-my-little-latke', 0, 'k1'), 'book-the-three-latkes'), 0);
assert.equal(price(line('story-k1', 'book-you-re-my-little-latke', 0, 'k1'), 'crispy-the-latke-stuffie'), undefined);

// A paid extra swaps at the target's own price — never $0, even for an "included"-tier item.
assert.equal(price(line('addon-lego-menorah', 'lego-menorah', 1500), 'welcome-menorah'), get('welcome-menorah').memberPriceCents);
assert.equal(price(line('addon-x', 'electric-candles', 900), 'beeswax-candles'), get('beeswax-candles').memberPriceCents);

// Swap shelves for a free line only list what it can swap to for free.
const shelf = swapOptionsForLine(
  line('wood-dreidel', 'classic-wooden-dreidel'),
  get('classic-wooden-dreidel'),
  ['airdry-clay-dreidel', 'solid-brass-dreidel', 'little-bag-of-gelt-2-big-5-little'].map(get),
  { catalog, geltCeiling: 'medium' }
);
assert.deepEqual(shelf.map((c) => c.id), ['airdry-clay-dreidel']);

// "Add on top" charges exactly what the "+$X" label shows.
const paper = { id: 'wrapping-paper', name: 'Wrapping paper', pricingTier: 'included', memberPriceCents: 500, slotId: 'wrapping-paper', swapOptions: [], ageGroups: [] } as unknown as CatalogItem;
const addCtx = (lineItems: BoxLineItem[], people = 4, wrapSelectedCount = 0) => ({ catalog, lineItems, people, wrapSelectedCount });
const full = [line('candles', 'beeswax-candles'), line('wood-dreidel', 'classic-wooden-dreidel'), line('latke-mix', 'latke-kit'), line('sufganiyot-mix', 'sufganiyot-kit')];
// Listed add-ons cost their member price.
assert.equal(addOnTopUnitCents(get('lego-menorah'), 'presents', addCtx(full)), 1500);
assert.equal(addOnTopUnitCents(get('book-the-three-latkes'), 'story', addCtx(full)), 800);
// An included-tier item is free only while its slot is empty.
assert.equal(addOnTopUnitCents(get('beeswax-candles'), 'candles', addCtx(full)), 500);
assert.equal(addOnTopUnitCents(get('beeswax-candles'), 'candles', addCtx(full.slice(1))), 0);
assert.equal(addOnTopUnitCents(get('latke-kit'), 'food', addCtx(full)), 500);
assert.equal(addOnTopUnitCents(get('latke-kit'), 'food', addCtx(full.slice(0, 3))), 0);
// Empty practice slot does not make à la carte free (brass dreidel, stuffie in food).
assert.equal(addOnTopUnitCents(get('solid-brass-dreidel'), 'dreidel', addCtx(full.slice(1))), 3000);
assert.equal(addOnTopUnitCents(get('crispy-the-latke-stuffie'), 'food', addCtx(full.slice(0, 3))), 1000);
// Gelt is free only while it fits one Little Bag per person — an empty dreidel slot doesn't open it.
const littles = { ...line('gelt-small', 'little-bag-of-gelt-2-big-5-little'), quantity: 4 };
assert.equal(addOnTopUnitCents(get('little-bag-of-gelt-2-big-5-little'), 'dreidel', addCtx([littles])), 200);
assert.equal(addOnTopUnitCents(get('little-bag-of-gelt-2-big-5-little'), 'dreidel', addCtx([{ ...littles, quantity: 3 }])), 0);
assert.equal(addOnTopUnitCents(get('party-bag-of-gelt'), 'dreidel', addCtx([])), 1800);
assert.equal(addOnTopUnitCents(get('party-bag-of-gelt'), 'dreidel', addCtx([], 12)), 0);
// Paid gelt doesn't use up the allowance.
assert.equal(addOnTopUnitCents(get('big-bag-of-gelt'), 'dreidel', addCtx([{ ...littles, quantity: 1 }, { ...line('addon-big', 'big-bag-of-gelt', 500), quantity: 2 }])), 0);
// Paper is free back in place of pre-wrap, extra on top of an active wrap list.
assert.equal(addOnTopUnitCents(paper, 'presents', addCtx([])), 0);
assert.equal(addOnTopUnitCents(paper, 'presents', addCtx([], 4, 2)), EXTRA_FLAT_CENTS);

// Food slots hold one kit, one Big Bag or three Little Bags — whatever the household size.
const LITTLE = 'little-bag-of-gelt-2-big-5-little';
const qtyAfter = (li: BoxLineItem, to: string, people = 2) => swapQuantities(li, get(li.itemId), get(to), people);
assert.deepEqual(qtyAfter(line('latke-mix', 'latke-kit'), LITTLE), { quantity: 3 });
assert.deepEqual(qtyAfter({ ...line('latke-mix', 'latke-kit'), includedQty: 1 }, LITTLE), { quantity: 3, includedQty: 3 });
assert.equal(qtyAfter(line('latke-mix', 'latke-kit'), 'big-bag-of-gelt'), null);
assert.deepEqual(qtyAfter({ ...line('sufganiyot-mix', LITTLE), quantity: 3 }, 'sufganiyot-kit'), { quantity: 1 });
assert.deepEqual(qtyAfter({ ...line('sufganiyot-mix', LITTLE), quantity: 3 }, 'big-bag-of-gelt'), { quantity: 1 });
assert.deepEqual(qtyAfter(line('sufganiyot-mix', 'big-bag-of-gelt'), LITTLE, 1), { quantity: 3 });
// Outside the food slots gelt keeps its chocolate, capped at the allowance; other lines keep their count.
assert.deepEqual(qtyAfter(line('gelt-medium', 'big-bag-of-gelt'), LITTLE, 3), { quantity: 3 });
assert.deepEqual(qtyAfter(line('gelt-medium', 'big-bag-of-gelt'), LITTLE, 2), { quantity: 2 });
assert.equal(qtyAfter({ ...line('wood-dreidel', 'classic-wooden-dreidel'), quantity: 3 }, 'airdry-clay-dreidel'), null);
// A paid extra in a food slot isn't a food slot.
assert.equal(qtyAfter(line('latke-mix::x', 'latke-kit', 500), LITTLE), null);

// Food-slot gelt is extra to the one-Little-Bag-per-person allowance.
const foodGelt = [{ ...line('latke-mix', LITTLE), quantity: 3 }, line('sufganiyot-mix', 'big-bag-of-gelt')];
assert.equal(includedGeltLittleBags(foodGelt, catalog), 0);
assert.equal(addOnTopUnitCents(get(LITTLE), 'dreidel', addCtx(foodGelt, 1)), 0);

// Three Little Bags in a food slot swap back to either kit, cookie cutters or a Big Bag — even
// when the household's own gelt tops out at Little Bags. Never a Party Bag or a stuffie.
{
  const bags = { ...line('latke-mix', LITTLE), quantity: 3 };
  const ids = (items: CatalogItem[]) => items.map((c) => c.id);
  const shelf = ids(
    swapOptionsForLine(bags, get(LITTLE), swapCandidatesForLine(bags, get(LITTLE), catalog, 24), { catalog, geltCeiling: 'small' })
  );
  for (const want of ['latke-kit', 'sufganiyot-kit', 'big-bag-of-gelt']) assert.ok(shelf.includes(want), `${want} in ${shelf}`);
  assert.ok(shelf.some((id) => /cookie-cutter/.test(id)), `cookie cutters in ${shelf}`);
  assert.ok(!shelf.includes('party-bag-of-gelt'), `no party bag: ${shelf}`);
  assert.ok(!shelf.some((id) => /stuffie/.test(id)), `no stuffie: ${shelf}`);
  assert.equal(price(bags, 'big-bag-of-gelt', 'small'), 0);
  assert.equal(price(bags, 'party-bag-of-gelt'), undefined);
}

// A swap card's "×N": what the box holds after the swap.
const kitBox = [line('latke-mix', 'latke-kit'), line('sufganiyot-mix', 'sufganiyot-kit')];
assert.equal(swappedQuantity(kitBox, ['latke-mix'], get(LITTLE), catalog, 2), 3);
assert.equal(swappedQuantity(kitBox, ['latke-mix'], get('sufganiyot-kit'), catalog, 2), 1);
assert.equal(swappedQuantity([{ ...line('gelt-medium', 'big-bag-of-gelt') }], ['gelt-medium'], get(LITTLE), catalog, 4), 3);

// Three Little Bags out, one kit in: nothing is left behind as donated.
{
  const baselines = new Map([[LITTLE, 3]]);
  transferIncludedBaselineOnSwap(baselines, LITTLE, 'latke-kit', 3, 0, 1);
  assert.equal(baselines.has(LITTLE), false);
  assert.equal(baselines.get('latke-kit'), 1);
  const back = new Map([['latke-kit', 1]]);
  transferIncludedBaselineOnSwap(back, 'latke-kit', LITTLE, 1, 0, 3);
  assert.equal(back.get(LITTLE), 3);
}

console.log('swapPricing.test: ok');
