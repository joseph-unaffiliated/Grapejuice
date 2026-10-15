/**
 * Run: npx tsx src/services/box/mergeBoxLines.test.ts
 */
import assert from 'node:assert/strict';
import { mergeBoxLines, sameBoxLines } from './mergeBoxLines';
import type { BoxLineItem } from '../../types/pilot';

const li = (slotId: string, itemId: string, unitCents = 0, quantity = 1): BoxLineItem =>
  ({ slotId, itemId, unitCents, quantity }) as BoxLineItem;
const slots = (lines: BoxLineItem[]) => lines.map((l) => `${l.slotId}=${l.itemId}:${l.unitCents}`);

// A repair landed while the tab was open (Shamash to $0, kits and a book added); the tab
// then swapped candles from its stale copy. Only the candle swap applies.
const stale = [li('candles', 'beeswax-candles'), li('gift-k1', 'shamash', 1000)];
const repaired = [li('candles', 'beeswax-candles'), li('gift-k1', 'shamash', 0), li('story-k1', 'elmo'), li('latke-mix', 'latke-kit')];
const tabEdit = [li('candles', 'electric-candles'), li('gift-k1', 'shamash', 1000)];
assert.deepEqual(slots(mergeBoxLines(stale, tabEdit, repaired)), [
  'candles=electric-candles:0',
  'gift-k1=shamash:0',
  'story-k1=elmo:0',
  'latke-mix=latke-kit:0',
]);

// Nothing changed on the server: the edit is written as-is.
const plain = mergeBoxLines(stale, tabEdit, stale);
assert.ok(sameBoxLines(plain, tabEdit));

// Removals and additions from the tab still apply.
const removedAndAdded = [li('candles', 'beeswax-candles'), li('addon-x', 'x', 500)];
assert.deepEqual(slots(mergeBoxLines(stale, removedAndAdded, repaired)), [
  'candles=beeswax-candles:0',
  'story-k1=elmo:0',
  'latke-mix=latke-kit:0',
  'addon-x=x:500',
]);

// Both changed the same slot: the tab's version wins.
const tabPrice = [li('candles', 'beeswax-candles'), li('gift-k1', 'jelly', 0)];
assert.deepEqual(slots(mergeBoxLines(stale, tabPrice, repaired)).slice(0, 2), ['candles=beeswax-candles:0', 'gift-k1=jelly:0']);

// A slot the server removed stays removed unless the tab changed it.
assert.deepEqual(slots(mergeBoxLines(stale, stale, [li('candles', 'beeswax-candles')])), ['candles=beeswax-candles:0']);

console.log('mergeBoxLines.test: ok');
