/**
 * Run: npx tsx src/components/box/restoreIncludedUnit.test.ts
 *
 * Dragon was both Archie's book and his present (one "Dragon ×2" row). − dropped the
 * present copy; + used to put it back on the book line for free, and the empty present
 * slot then took a free dreidel too.
 */
import assert from 'node:assert/strict';
import { restoreIncludedUnit } from './boxLineDisplay';
import type { BoxLineItem } from '../../types/pilot';

const line = (over: Partial<BoxLineItem> & Pick<BoxLineItem, 'slotId' | 'itemId'>): BoxLineItem =>
  ({ quantity: 1, includedQty: 1, unitCents: 0, ...over }) as BoxLineItem;

const book = line({ slotId: 'story-archie', itemId: 'book-dragon', childId: 'archie' });
const presentCopy = line({ slotId: 'gift-archie', itemId: 'book-dragon', childId: 'archie' });
const afterMinus = [book];

// Present slot still empty: + puts the copy back as his present.
assert.deepEqual(restoreIncludedUnit(afterMinus, 'book-dragon', presentCopy), [book, presentCopy]);

// Present slot filled since (free dreidel): + is a paid copy, never a free second Dragon.
const dreidel = line({ slotId: 'gift-archie', itemId: 'draw-your-own-dreidel', childId: 'archie' });
assert.equal(restoreIncludedUnit([book, dreidel], 'book-dragon', presentCopy), null);
const dreidelOtherSlot = { ...dreidel, slotId: 'gift-archie-2' };
assert.equal(restoreIncludedUnit([book, dreidelOtherSlot], 'book-dragon', presentCopy), null);

// No record of what − dropped (e.g. after a reload): never piles a free unit on the book line.
assert.equal(restoreIncludedUnit(afterMinus, 'book-dragon'), null);
assert.equal(restoreIncludedUnit([{ ...book, quantity: 2 }], 'book-dragon'), null);

// A sibling's book line comes back to that sibling.
const siblingBook = line({ slotId: 'story-beau', itemId: 'book-dragon', childId: 'beau' });
assert.deepEqual(restoreIncludedUnit([book], 'book-dragon', siblingBook), [book, siblingBook]);

// Household lines that lost included units (gelt ×4 → ×3) get one back.
const gelt = line({ slotId: 'gelt-small', itemId: 'little-bag-of-gelt', quantity: 3, includedQty: 4 });
assert.deepEqual(restoreIncludedUnit([gelt], 'little-bag-of-gelt'), [{ ...gelt, quantity: 4 }]);
assert.equal(restoreIncludedUnit([{ ...gelt, quantity: 4 }], 'little-bag-of-gelt'), null);

console.log('restoreIncludedUnit ok');
