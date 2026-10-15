/**
 * Run: npx tsx functions/src/boxAudit.parity.test.ts
 *
 * boxAudit.ts must stay a copy of the app's src/services/box/includedAudit.ts: same text after
 * the line type, and the same results on the same boxes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as server from './boxAudit';
import * as client from '../../src/services/box/includedAudit';

const MODULE_DOC = '/**\n * Included-items integrity check';
const body = (path: string) => {
  const text = readFileSync(path, 'utf8');
  const at = text.indexOf(MODULE_DOC);
  assert.ok(at >= 0, `${path} lost its module comment`);
  return text.slice(at);
};
assert.equal(
  body(join(__dirname, 'boxAudit.ts')),
  body(join(__dirname, '../../src/services/box/includedAudit.ts')),
  'functions/src/boxAudit.ts drifted from src/services/box/includedAudit.ts; copy the app file over'
);

const catalog = [
  { id: 'beeswax-candles', category: 'Candles' },
  { id: 'classic-wooden-dreidel', category: 'Dreidel' },
  { id: 'little-bag-of-gelt-2-big-5-little', name: 'Little Bag of Gelt (2 big, 5 little)', category: 'Gelt' },
  { id: 'big-bag-of-gelt', name: 'Big Bag of Gelt (5 big, 20 little)', category: 'Gelt' },
  { id: 'party-bag-of-gelt', name: 'Party Bag of Gelt (20 big, 80 little)', category: 'Gelt' },
  { id: 'latke-kit', category: 'Food' },
  { id: 'sufganiyot-kit', category: 'Food' },
  { id: 'wrapping-paper', category: 'Other' },
  { id: 'book-hanukkah-bear', category: 'Book' },
  { id: 'crispy-the-latke-stuffie', category: 'Stuffies' },
  { id: 'arch-menorah', category: 'Menorah' },
];
const L = (slotId: string, itemId: string, quantity = 1, unitCents = 0) => ({ slotId, itemId, quantity, unitCents });
const oneKid = { kidKeys: ['a'], adults: 2 };

const boxes = [
  [
    L('story-a', 'book-hanukkah-bear'),
    L('gift-a', 'crispy-the-latke-stuffie'),
    L('candles', 'beeswax-candles'),
    L('wood-dreidel', 'classic-wooden-dreidel', 3),
    L('gelt-medium', 'big-bag-of-gelt'),
    L('latke-mix', 'latke-kit'),
    L('sufganiyot-mix', 'sufganiyot-kit'),
    L('wrapping-paper', 'wrapping-paper'),
  ],
  [
    L('story-a', 'book-hanukkah-bear', 1, 1400),
    L('gift-a', 'arch-menorah'),
    L('candles', 'beeswax-candles', 2),
    L('wood-dreidel', 'classic-wooden-dreidel', 5),
    L('gelt-party', 'party-bag-of-gelt'),
    L('latke-mix', 'little-bag-of-gelt-2-big-5-little', 4),
    L('wrapping-paper', 'wrapping-paper', 1, 500),
  ],
  [],
];

for (const lines of boxes) {
  assert.deepEqual(server.auditIncluded(lines, catalog, oneKid), client.auditIncluded(lines, catalog, oneKid));
}
assert.ok(!server.auditIncluded(boxes[1], catalog, oneKid).ok, 'the messy box has problems');

console.log('boxAudit parity: ok');
