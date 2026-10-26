/**
 * Run: npx tsx functions/src/boxProblemFixes.test.ts
 */
import assert from 'node:assert/strict';
import { applyCheckedLineFix, fixesForProblem, historyClue } from './boxProblemFixes';

const catalog = [
  { id: 'sufganiyot-kit', name: 'Sufganiyot Kit', memberPriceCents: 500, category: 'Food' },
  { id: 'latke-kit', name: 'Latke Kit', memberPriceCents: 500, category: 'Food' },
  { id: 'dreidel-cookie-cutters', name: 'Dreidel Cookie Cutters', memberPriceCents: 500, category: 'Food' },
  { id: 'big-bag-of-gelt', name: 'Big Bag of Gelt (5 big, 20 little)', category: 'Gelt' },
];
const food = { code: 'over-allowance', section: 'food', detail: '3 free food slots (allowed 2)' };
const lines = [
  { slotId: 'sufganiyot-mix', itemId: 'dreidel-cookie-cutters', quantity: 1, unitCents: 0, label: 'Dreidel Cookie Cutters' },
  { slotId: 'latke-mix', itemId: 'latke-kit', quantity: 1, unitCents: 0, label: 'Latke Kit' },
  { slotId: 'sufganiyot-kit', itemId: 'sufganiyot-kit', quantity: 1, unitCents: 0, label: 'Sufganiyot Kit' },
];

const parked = {
  code: 'free-add-on',
  section: 'other',
  detail: '1× sufganiyot-kit is $0 outside an included slot',
  itemId: 'sufganiyot-kit',
  slotId: 'sufganiyot-kit',
};
const fixes = fixesForProblem(parked, lines, catalog, 2, 1);
assert.equal(fixes[0]?.recommended, true);
assert.equal(fixes[0]?.id, 'charge');
assert.equal(fixes[0]?.label, 'Charge the Sufganiyot Kit, $5');
assert.deepEqual(fixes.map((fix) => fix.id), ['charge', 'remove', 'approve']);
assert.equal(fixesForProblem(food, lines, catalog, 2, 1)[0]?.id, 'approve');

const charged = applyCheckedLineFix('charge', parked, lines, catalog, 2, [], 1);
assert.equal(charged?.find((li) => li.itemId === 'sufganiyot-kit')?.unitCents, 500);
assert.equal(charged?.find((li) => li.itemId === 'sufganiyot-kit')?.slotId, 'addon-sufganiyot-kit');
assert.equal(charged?.find((li) => li.slotId === 'latke-mix')?.unitCents, 0);

const removed = applyCheckedLineFix('remove', parked, lines, catalog, 2, [], 1);
assert.equal(removed?.some((li) => li.itemId === 'sufganiyot-kit'), false);
assert.equal(removed?.length, 2);

const gelt = fixesForProblem(
  { code: 'over-allowance', section: 'gelt', detail: "3 Little Bags' worth of gelt for 2 people" },
  [{ slotId: 'gelt-medium', itemId: 'big-bag-of-gelt', quantity: 1, unitCents: 0 }],
  catalog,
  2,
  1
);
assert.equal(gelt[0]?.id, 'approve');
assert.equal(gelt[0]?.recommended, true);

const clue = historyClue(
  [{ at: '2026-10-20T18:36:46.000Z', source: 'customer', changes: [{ type: 'add', itemId: 'sufganiyot-kit', slotId: 'sufganiyot-kit', unitCents: 0 }] }],
  { itemIds: ['sufganiyot-kit'], section: 'food' }
);
assert.match(clue ?? '', /sufganiyot-kit showed up Oct 20/);
assert.match(clue ?? '', /from the customer/);

console.log('boxProblemFixes: ok');
