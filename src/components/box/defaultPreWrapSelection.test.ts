/**
 * Run: npx tsx src/components/box/defaultPreWrapSelection.test.ts
 *
 * "We wrap the presents instead" marks presents to wrap so My Box can say what comes wrapped:
 * kids' presents first, then other wrappable items, never more than the included wrap count.
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

// Presents lead; gelt never wraps; capped at the 3 included wraps.
assert.deepEqual(defaultPreWrapSelection([menorah, book, gelt, giftArchie, giftBeau], catalog), [
  'stuffie-latke',
  'clay-dreidel',
  'menorah-lego',
]);

// Same SKU for two kids is one wrap choice.
const giftBeauStuffie = { ...giftArchie, slotId: 'gift-beau', childId: 'beau' };
assert.deepEqual(defaultPreWrapSelection([giftArchie, giftBeauStuffie], catalog), ['stuffie-latke']);

// Nothing wrappable: nothing marked.
assert.deepEqual(defaultPreWrapSelection([gelt], catalog), []);

console.log('defaultPreWrapSelection: ok');
