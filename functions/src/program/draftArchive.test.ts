/**
 * Run: npx tsx --test functions/src/program/draftArchive.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { itemIdsFromLines, retireAllowed } from './draftArchive';

test('item ids keep one copy and drop empty quantities', () => {
  assert.deepEqual(
    itemIdsFromLines([
      { itemId: 'gelt', quantity: 1 },
      { itemId: 'gelt', quantity: 2 },
      { itemId: 'gone', quantity: 0 },
      { itemId: '', quantity: 1 },
      { nope: true },
    ]),
    ['gelt']
  );
  assert.deepEqual(itemIdsFromLines(null), []);
});

test('favorites conversion stays closed until Monday noon ET', () => {
  assert.equal(retireAllowed(new Date('2026-11-08T11:00:00.000Z')), false);
  assert.equal(retireAllowed(new Date('2026-11-09T16:59:59.000Z')), false);
  assert.equal(retireAllowed(new Date('2026-11-09T17:00:00.000Z')), true);
});
