/**
 * Run: npx tsx src/services/box/sectionUpsells.storyOrder.test.ts
 *
 * Tell the Story swap shelf: age-defaults from resolveBookForAge / buildDefaultBox
 * lead, then other age-fitting books, then the rest. Not alphabetical.
 */
import assert from 'node:assert/strict';
import type { CatalogItem } from '../../types/pilot';
import { STORY_SWAP_PREVIEW, orderStorySwapBooks, storySwapShelf } from './sectionUpsells';

const book = (over: Partial<CatalogItem> & { id: string; name: string }): CatalogItem =>
  ({
    description: '',
    slot: 'story',
    slotId: 'story',
    category: 'Book',
    ageGroups: [],
    defaultFor: [],
    swapOptions: [],
    dollarCostCents: 0,
    holiday: 'hanukkah',
    ...over,
  }) as CatalogItem;

const ids = (items: CatalogItem[]) => items.map((b) => b.id);

// Alphabetical input must not bury the age-default. buildDefaultBox picks the
// first row whose Default book ages include the kid's age.
{
  const books = [
    book({ id: 'apple', name: 'Apple Tales' }),
    book({ id: 'mango', name: 'Mango Nights', ageGroups: ['9-12'] }),
    book({ id: 'zebra', name: 'Zebra and the Shamash', defaultBookAges: [5] }),
  ];
  assert.deepEqual(ids(orderStorySwapBooks(books, [5])), ['zebra', 'mango', 'apple']);
}

// One default per kid, younger kid first — not A-to-Z.
{
  const books = [
    book({ id: 'apple', name: 'Apple', defaultBookAges: [8] }),
    book({ id: 'mango', name: 'Mango' }),
    book({ id: 'zebra', name: 'Zebra', defaultBookAges: [3] }),
  ];
  assert.deepEqual(ids(orderStorySwapBooks(books, [8, 3])), ['zebra', 'apple', 'mango']);
}

// Several rows can share an age. The one resolveBookForAge returns (first in
// catalog order) leads; the other tagged row stays ahead of everything else.
{
  const books = [
    book({ id: 'zebra', name: 'Zebra', defaultBookAges: [5] }),
    book({ id: 'apple', name: 'Apple', defaultBookAges: [5] }),
    book({ id: 'mango', name: 'Mango' }),
  ];
  assert.deepEqual(ids(orderStorySwapBooks(books, [5])), ['zebra', 'apple', 'mango']);
}

// No Default book ages: the defaultFor band tag is the default, same as resolveBookForAge.
{
  const books = [
    book({ id: 'apple', name: 'Apple', ageGroups: ['9-12'] }),
    book({ id: 'zebra', name: 'Zebra', defaultFor: ['3-5'] }),
  ];
  assert.deepEqual(ids(orderStorySwapBooks(books, [4])), ['zebra', 'apple']);
}

// After the age-default, nearer books come before farther ones (swap note:
// prefer closer ages), even when the nearer title sorts later.
{
  const books = [
    book({ id: 'apple', name: 'Apple', defaultBookAges: [12] }),
    book({ id: 'middle', name: 'Middle', defaultBookAges: [5] }),
    book({ id: 'zebra', name: 'Zebra', defaultBookAges: [4] }),
  ];
  assert.deepEqual(ids(orderStorySwapBooks(books, [5])), ['middle', 'zebra', 'apple']);
}

// No kids on the account: rows that have Default book ages still lead, younger first.
{
  const books = [
    book({ id: 'apple', name: 'Apple', defaultBookAges: [10] }),
    book({ id: 'mango', name: 'Mango' }),
    book({ id: 'zebra', name: 'Zebra', defaultBookAges: [2] }),
  ];
  assert.deepEqual(ids(orderStorySwapBooks(books, [])), ['zebra', 'apple', 'mango']);
}

// Age-fitting swaps sit between the default and books for other ages.
{
  const books = [
    book({ id: 'far', name: 'Far', defaultBookAges: [12] }),
    book({ id: 'fit', name: 'Fit', ageGroups: ['6-8'] }),
    book({ id: 'def', name: 'Default', defaultBookAges: [7] }),
  ];
  assert.deepEqual(ids(orderStorySwapBooks(books, [7])), ['def', 'fit', 'far']);
}

// Shelf keeps every row it was given (sold-out filtering stays with the caller)
// and the phone preview is the first 12 after that order.
{
  const books = [
    book({ id: 'sold', name: 'Sold', boxStockLeft: 0 }),
    ...Array.from({ length: 14 }, (_, i) =>
      book({
        id: `b${String(i).padStart(2, '0')}`,
        name: `Book ${i}`,
        defaultBookAges: i === 13 ? [6] : [30 + i],
      })
    ),
  ];
  const ordered = orderStorySwapBooks(books, [6]);
  assert.equal(ordered.length, books.length);
  assert.equal(ordered[0]?.id, 'b13');
  assert.ok(ordered.some((b) => b.id === 'sold'));
  const shelf = storySwapShelf(books, [6]);
  assert.equal(shelf.length, STORY_SWAP_PREVIEW);
  assert.equal(shelf[0]?.id, 'b13');
  assert.equal(STORY_SWAP_PREVIEW, 12);
}

console.log('sectionUpsells.storyOrder: ok');
