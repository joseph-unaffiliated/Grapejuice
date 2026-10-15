/**
 * Run: npx tsx src/components/box/defaultPreWrapSelection.test.ts
 *
 * "We wrap the presents instead" marks presents to wrap so My Box can say what comes wrapped:
 * every kid's present, then other wrappable items up to three picks.
 */
import assert from 'node:assert/strict';
import { defaultPreWrapSelection } from './boxLineDisplay';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';

const line = (over: Partial<BoxLineItem> & Pick<BoxLineItem, 'slotId' | 'itemId'>): BoxLineItem =>
  ({ quantity: 1, includedQty: 1, unitCents: 0, ...over }) as BoxLineItem;
const catalog = [
  { id: 'menorah-lego', name: 'Lego Menorah', category: 'Menorah' },
  { id: 'book-dragon', name: 'Dragon book', category: 'Book' },
  { id: 'stuffie-latke', name: 'Crispy, the Latke Stuffie' },
  { id: 'little-bag-of-gelt', name: 'Little bag of gelt' },
  { id: 'clay-dreidel', name: 'Clay dreidel', category: 'Dreidel' },
] as CatalogItem[];

const menorah = line({ slotId: 'menorah', itemId: 'menorah-lego' });
const book = line({ slotId: 'story-archie', itemId: 'book-dragon', childId: 'archie' });
const giftArchie = line({ slotId: 'gift-archie', itemId: 'stuffie-latke', childId: 'archie' });
const giftBeau = line({ slotId: 'gift-beau', itemId: 'clay-dreidel', childId: 'beau' });
const gelt = line({ slotId: 'gelt-small', itemId: 'little-bag-of-gelt' });

// Presents lead; gelt never wraps; other wrappables fill up to 3 picks.
assert.deepEqual(defaultPreWrapSelection([menorah, book, gelt, giftArchie, giftBeau], catalog), [
  'stuffie-latke',
  'clay-dreidel',
  'menorah-lego',
]);

// Pre-wrap has no cap: every kid's present is marked, even past 3.
const giftFour = ['a', 'b', 'c', 'd'].map((kid, i) =>
  line({ slotId: `gift-${kid}`, itemId: `stuffie-${i}`, childId: kid })
);
const stuffies = giftFour.map((g) => ({ id: g.itemId, name: `${g.itemId} stuffie` })) as CatalogItem[];
assert.deepEqual(defaultPreWrapSelection([menorah, ...giftFour], [...catalog, ...stuffies]), [
  'stuffie-0',
  'stuffie-1',
  'stuffie-2',
  'stuffie-3',
]);

// Same SKU for two kids is one wrap choice.
const giftBeauStuffie = { ...giftArchie, slotId: 'gift-beau', childId: 'beau' };
assert.deepEqual(defaultPreWrapSelection([giftArchie, giftBeauStuffie], catalog), ['stuffie-latke']);

// Nothing wrappable: nothing marked.
assert.deepEqual(defaultPreWrapSelection([gelt], catalog), []);

console.log('defaultPreWrapSelection: ok');
