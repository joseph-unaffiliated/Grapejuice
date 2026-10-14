import assert from 'node:assert/strict';
import { diffBoxLines, historyLines, nextDefault } from './boxHistoryDiff';

const lines = historyLines([
  { slotId: 'gift-a', itemId: 'draw-your-own-dreidel', quantity: 1, includedQty: 1, unitCents: 0, childId: 'a' },
  { slotId: 'story-a', itemId: 'dragon', quantity: 1, includedQty: 1, unitCents: 0, childId: 'a', curationNote: 'Loves dragons' },
  { slotId: 'candles', itemId: 'beeswax', quantity: 1, unitCents: 1200, extra: 'dropped' },
  { slotId: 'bad' },
  'junk',
]);
assert.equal(lines.length, 3);
assert.deepEqual(lines[2], { slotId: 'candles', itemId: 'beeswax', quantity: 1, unitCents: 1200 });
assert.equal(lines[1].curationNote, 'Loves dragons');

assert.deepEqual(diffBoxLines(lines, lines), []);

// Same slot, new item: a swap.
const swapped = lines.map((l) => (l.slotId === 'gift-a' ? { ...l, itemId: 'stuffie-gimmel' } : l));
assert.deepEqual(diffBoxLines(lines, swapped), [
  {
    type: 'swap', slotId: 'gift-a', childId: 'a', fromItemId: 'draw-your-own-dreidel', toItemId: 'stuffie-gimmel',
    fromQty: 1, toQty: 1, fromUnitCents: 0, toUnitCents: 0,
  },
]);

// Line moved to a new slot for the same kid: still one swap.
const moved = [...lines.filter((l) => l.slotId !== 'story-a'), { slotId: 'story-a-2', itemId: 'clifford', quantity: 1, unitCents: 0, childId: 'a' }];
const movedDiff = diffBoxLines(lines, moved);
assert.equal(movedDiff.length, 1);
assert.equal(movedDiff[0].type, 'swap');
assert.equal(movedDiff[0].type === 'swap' && movedDiff[0].toSlotId, 'story-a-2');

// Quantity / price changes, plain adds and removes.
const more = lines.map((l) => (l.slotId === 'candles' ? { ...l, quantity: 2 } : l));
assert.equal(diffBoxLines(lines, more)[0].type, 'quantity');
const added = [...lines, { slotId: 'extra-1', itemId: 'gelt', quantity: 1, unitCents: 500 }];
assert.deepEqual(diffBoxLines(lines, added), [{ type: 'add', slotId: 'extra-1', childId: undefined, itemId: 'gelt', qty: 1, unitCents: 500 }]);
assert.deepEqual(diffBoxLines(added, lines).map((c) => c.type), ['remove']);

// Two removes for one kid and one add: ambiguous, so no swap pairing.
const ambiguous = diffBoxLines(lines, [lines[2], { slotId: 'new-a', itemId: 'lego', quantity: 1, unitCents: 0, childId: 'a' }]);
assert.deepEqual(ambiguous.map((c) => c.type).sort(), ['add', 'remove', 'remove']);

// Default snapshot: first box with lines, then only on rebuilds.
assert.equal(nextDefault(undefined, 'customer', [])?.source, undefined);
assert.equal(nextDefault(undefined, 'customer', lines)?.source, 'first-save:customer');
assert.equal(nextDefault({ lineItems: lines }, 'customer', swapped), null);
assert.equal(nextDefault({ lineItems: lines }, 'rav', swapped), null);
assert.equal(nextDefault({ lineItems: lines }, 'default-build', swapped)?.lineItems[0].itemId, 'stuffie-gimmel');

console.log('boxHistoryDiff tests passed');
