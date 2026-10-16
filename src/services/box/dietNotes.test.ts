import assert from 'node:assert/strict';
import type { BoxLineItem } from '../../types/pilot';
import { applyDietNotes, dietExclusionsFromNotes } from './dietNotes';

const line = (slotId: string, itemId: string, label = itemId): BoxLineItem => ({
  slotId,
  itemId,
  quantity: 1,
  unitCents: 0,
  label,
});

const box = [
  line('latke-mix', 'latke-kit', 'Latke Kit'),
  line('sufganiyot-mix', 'sufganiyot-kit', 'Sufganiyot Kit'),
  line('gelt-small', 'little-bag-of-gelt-2-big-5-little', 'Little Bag of Gelt'),
  line('story-kid', 'book-latke-s-first-hanukkah', "Latke's First Hanukkah"),
  line('gift-kid', 'crispy-the-latke-stuffie', 'Crispy, the Latke Stuffie'),
  line('candles', 'beeswax-candles', 'Beeswax Candles'),
];

const ids = (notes: string) => applyDietNotes(box, notes).map((li) => li.itemId);

assert.deepEqual(dietExclusionsFromNotes(''), { noFood: false, noSufganiyot: false, noGelt: false });
assert.deepEqual(ids('loves chocolate'), box.map((li) => li.itemId));
assert.deepEqual(ids('not kosher'), box.map((li) => li.itemId));
assert.deepEqual(ids('kosher-style, like my grandmother'), box.map((li) => li.itemId));

assert.deepEqual(ids('We keep kosher'), [
  'book-latke-s-first-hanukkah',
  'crispy-the-latke-stuffie',
  'beeswax-candles',
]);
assert.deepEqual(ids('No gluten at all'), [
  'latke-kit',
  'little-bag-of-gelt-2-big-5-little',
  'book-latke-s-first-hanukkah',
  'crispy-the-latke-stuffie',
  'beeswax-candles',
]);
assert.deepEqual(ids('No chocolate please'), [
  'latke-kit',
  'sufganiyot-kit',
  'book-latke-s-first-hanukkah',
  'crispy-the-latke-stuffie',
  'beeswax-candles',
]);
assert.equal(dietExclusionsFromNotes('gluten-free and allergic to chocolate').noSufganiyot, true);
assert.equal(dietExclusionsFromNotes('gluten-free and allergic to chocolate').noGelt, true);
assert.equal(dietExclusionsFromNotes('Kosher home').noFood, true);

console.log('dietNotes tests passed');
