/**
 * Run: npx tsx src/components/box/kidSlots.test.ts
 */
import assert from 'node:assert/strict';
import { fillOpenKidSlot, includedClaimAlreadyTaken, includedPracticeSlotVacant, kidsMissingIncluded, openKidSlotFor } from './boxLineDisplay';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';

function book(id: string): CatalogItem {
  return { id, name: id, category: 'Book', slotId: 'story', memberPriceCents: 1500, pricingTier: 'included', swapOptions: [], inventory: 50 } as unknown as CatalogItem;
}
const a = book('book-a');
const b = book('book-b');
const c = book('book-c');
const catalog = [a, b, c];
const kids = ['k1', 'k2'];
const line = (slotId: string, item: CatalogItem, unitCents = 0, childId?: string): BoxLineItem =>
  ({ slotId, itemId: item.id, quantity: 1, unitCents, label: item.name, ...(childId ? { childId } : {}) }) as BoxLineItem;

const full = [line('story-k1', a, 0, 'k1'), line('story-k2', b, 0, 'k2')];
const k2Removed = [full[0]!];
const k2Snapshot = [full[1]!];

assert.deepEqual(kidsMissingIncluded(full, kids, 'story'), []);
assert.deepEqual(kidsMissingIncluded(k2Removed, kids, 'story'), ['k2']);

// Removing one kid's book frees only that kid's slot; a sibling's book doesn't count as taken.
assert.equal(includedClaimAlreadyTaken(b, k2Snapshot, k2Removed, catalog, kids), false);
assert.equal(includedClaimAlreadyTaken(b, [], k2Removed, catalog, kids), false);
assert.equal(includedClaimAlreadyTaken(b, [], full, catalog, kids), true);
// Same book for both kids: putting one back is still that kid's included book.
const sameBook = [line('story-k1', a, 0, 'k1')];
assert.equal(includedClaimAlreadyTaken(a, [line('story-k2', a, 0, 'k2')], sameBook, catalog, kids), false);
// The kid's own slot already refilled with another book: a second one is paid.
assert.equal(includedClaimAlreadyTaken(b, k2Snapshot, [...k2Removed, line('story-k2', c, 0, 'k2')], catalog, kids), true);

// Re-adding a book while a kid has none fills that kid's slot at $0.
assert.deepEqual(openKidSlotFor(b, 'story', k2Removed, kids, catalog), { kidId: 'k2', kind: 'story' });
assert.equal(openKidSlotFor(b, 'story', full, kids, catalog), null);
assert.equal(openKidSlotFor(b, 'food', k2Removed, kids, catalog), null);

// A paid copy added after the removal converts to included instead of staying charged.
const withPaid = [...k2Removed, line('addon-book-b', b, 1500)];
const slot = openKidSlotFor(b, 'story', withPaid, kids, catalog)!;
const fixed = fillOpenKidSlot(withPaid, slot, b);
assert.equal(fixed.length, 2);
assert.deepEqual(
  fixed.map((li) => [li.slotId, li.itemId, li.unitCents, li.childId]),
  [
    ['story-k1', 'book-a', 0, 'k1'],
    ['story-k2', 'book-b', 0, 'k2'],
  ]
);

// Eat & Drink has two included slots: one kit removed leaves a slot open; gelt there takes one.
const kit = (slotId: string, itemId: string, unitCents = 0) => ({ slotId, itemId, quantity: 1, unitCents }) as BoxLineItem;
assert.equal(includedPracticeSlotVacant('food', [kit('latke-mix', 'latke-kit'), kit('sufganiyot-mix', 'sufganiyot-kit')]), false);
assert.equal(includedPracticeSlotVacant('food', [kit('latke-mix', 'latke-kit')]), true);
assert.equal(includedPracticeSlotVacant('food', [kit('latke-mix', 'latke-kit'), kit('latke-kit', 'latke-kit')]), false);
assert.equal(includedPracticeSlotVacant('food', [kit('latke-mix', 'latke-kit'), kit('addon-sufganiyot-kit', 'sufganiyot-kit', 500)]), true);
assert.equal(
  includedPracticeSlotVacant('food', [kit('latke-mix', 'latke-kit'), { ...kit('sufganiyot-mix', 'little-bag-of-gelt-2-big-5-little'), quantity: 3 }]),
  false
);
assert.equal(includedPracticeSlotVacant('candles', [kit('candles', 'beeswax-candles')]), false);

console.log('kidSlots.test: ok');
