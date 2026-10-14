/**
 * Run: npx tsx src/services/box/pilotLines.test.ts
 */
import assert from 'node:assert/strict';
import type { BoxLineItem } from '../../types/pilot';
import { isPilotLine, keepPilotLines } from './pilotLines';

const book = { slotId: 'story-1', itemId: 'book-a', quantity: 1, includedQty: 1, unitCents: 0 } as BoxLineItem;
const gelt = { slotId: 'addon-gelt', itemId: 'gelt', quantity: 1, includedQty: 0, unitCents: 1800 } as BoxLineItem;
const pick = {
  slotId: 'pilot-crispy',
  itemId: 'crispy',
  quantity: 1,
  includedQty: 1,
  unitCents: 0,
  label: 'Crispy the Latke',
  program: 'pilot',
  deferredChargeCents: 1000,
} as BoxLineItem;

assert.equal(isPilotLine(pick), true);
assert.equal(isPilotLine(book), false);
assert.equal(isPilotLine(null), false);

// No pilot lines before: the edit stands as-is.
{
  const next = [book];
  assert.equal(keepPilotLines([book, gelt], next), next);
}

// Untouched pilot lines: same array back.
{
  const next = [book, pick];
  assert.equal(keepPilotLines([book, gelt, pick], next), next);
}

// Edit dropped the pick: it comes back, the rest of the edit stands.
{
  const out = keepPilotLines([book, gelt, pick], [book]);
  assert.deepEqual(out, [book, pick]);
}

// Edit changed the pick's quantity or price: original restored.
{
  const out = keepPilotLines([book, pick], [book, { ...pick, quantity: 2 }]);
  assert.deepEqual(out, [book, pick]);
  const priced = keepPilotLines([book, pick], [book, { ...pick, unitCents: 1000 }]);
  assert.deepEqual(priced, [book, pick]);
}

console.log('pilotLines tests passed');
