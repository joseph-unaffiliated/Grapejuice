/**
 * Run: npx tsx src/services/box/swapPricing.test.ts
 *
 * Fixture rows are live catalog docs (Oct 15, 2026) trimmed to the fields the matchers read.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { swapOptionsForLine, swapUnitCents } from './swapPricing';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';

const catalog = JSON.parse(readFileSync(new URL('./swapPricing.fixture.json', import.meta.url), 'utf8')) as CatalogItem[];
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

console.log('swapPricing.test: ok');
