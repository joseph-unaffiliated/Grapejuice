/**
 * Run: npx tsx src/services/box/boxAuditOnSave.test.ts
 *
 * Save-time audit: customer-favor price fixes only, and Sentry-worthy problems only when the
 * edit introduced them.
 */
import assert from 'node:assert/strict';
import type { BoxLineItem } from '../../types/pilot';
import { auditBoxSave } from './boxAuditOnSave';
import type { AuditCatalogRow } from './includedAudit';

const catalog: AuditCatalogRow[] = [
  { id: 'beeswax-candles', category: 'Candles' },
  { id: 'classic-wooden-dreidel', category: 'Dreidel' },
  { id: 'solid-brass-dreidel', category: 'Dreidel' },
  { id: 'little-bag-of-gelt-2-big-5-little', name: 'Little Bag of Gelt (2 big, 5 little)', category: 'Gelt' },
  { id: 'party-bag-of-gelt', name: 'Party Bag of Gelt (20 big, 80 little)', category: 'Gelt' },
  { id: 'latke-kit', category: 'Food' },
  { id: 'sufganiyot-kit', category: 'Food' },
  { id: 'wrapping-paper', category: 'Other' },
  { id: 'book-hanukkah-bear', category: 'Book' },
  { id: 'book-latke-s-first-hanukkah', category: 'Book' },
  { id: 'crispy-the-latke-stuffie', category: 'Stuffies' },
];

const L = (slotId: string, itemId: string, quantity = 1, unitCents = 0): BoxLineItem => ({
  slotId,
  itemId,
  quantity,
  unitCents,
});

const box = (): BoxLineItem[] => [
  L('story-a', 'book-hanukkah-bear'),
  L('story-b', 'book-latke-s-first-hanukkah'),
  L('gift-a', 'crispy-the-latke-stuffie'),
  L('gift-b', 'crispy-the-latke-stuffie'),
  L('candles', 'beeswax-candles'),
  L('wood-dreidel', 'classic-wooden-dreidel', 4),
  L('gelt-small', 'little-bag-of-gelt-2-big-5-little', 4),
  L('latke-mix', 'latke-kit'),
  L('sufganiyot-mix', 'sufganiyot-kit'),
  L('wrapping-paper', 'wrapping-paper'),
];
const hh = { kidKeys: ['a', 'b'], adults: 2 };
const swap = (lines: BoxLineItem[], slotId: string, over: Partial<BoxLineItem>) =>
  lines.map((l) => (l.slotId === slotId ? { ...l, ...over } : l));
const line = (lines: BoxLineItem[], slotId: string) => lines.find((l) => l.slotId === slotId)!;

// A re-added book charged while the kid's free book slot is empty becomes free.
{
  const next = swap(box(), 'story-b', { unitCents: 1400 });
  const r = auditBoxSave(box(), next, catalog, hh)!;
  assert.equal(line(r.lineItems, 'story-b').unitCents, 0);
  assert.deepEqual(r.healed.map((p) => p.code), ['paid-in-included-slot']);
  assert.deepEqual(r.introduced, []);
}

// A charged kit in its own empty food slot becomes free.
{
  const next = swap(box(), 'latke-mix', { unitCents: 1200 });
  const r = auditBoxSave(box(), next, catalog, hh)!;
  assert.equal(line(r.lineItems, 'latke-mix').unitCents, 0);
}

// Wrapping paper charged as the only wrap becomes free.
{
  const next = swap(box(), 'wrapping-paper', { unitCents: 500 });
  const r = auditBoxSave(box(), next, catalog, hh)!;
  assert.equal(line(r.lineItems, 'wrapping-paper').unitCents, 0);
  assert.deepEqual(r.healed.map((p) => p.code), ['wrap-charged']);
}

// A paid Party Bag on top of a full gelt allowance stays paid.
{
  const next = [...box(), L('gelt-party', 'party-bag-of-gelt', 1, 1800)];
  const r = auditBoxSave(box(), next, catalog, hh)!;
  assert.equal(line(r.lineItems, 'gelt-party').unitCents, 1800);
  assert.deepEqual(r.healed, []);
}

// A paid brass dreidel in the dreidel slot isn't an included dreidel: stays paid.
{
  const next = swap(box(), 'wood-dreidel', { itemId: 'solid-brass-dreidel', quantity: 1, unitCents: 3000 });
  const r = auditBoxSave(box(), next, catalog, hh)!;
  assert.equal(line(r.lineItems, 'wood-dreidel').unitCents, 3000);
}

// Two paid candle sets in an empty candles slot: freeing both would exceed the allowance.
{
  const next = swap(box(), 'candles', { quantity: 2, unitCents: 1000 });
  const r = auditBoxSave(box(), next, catalog, hh)!;
  assert.equal(line(r.lineItems, 'candles').unitCents, 1000);
}

// A free Party Bag added by this edit is reported; one the box already had is not.
{
  const withParty = [...box(), L('gelt-party', 'party-bag-of-gelt')];
  const r = auditBoxSave(box(), withParty, catalog, hh)!;
  assert.deepEqual(r.introduced.map((p) => `${p.section}:${p.code}`), ['gelt:over-allowance']);
  const again = auditBoxSave(withParty, swap(withParty, 'candles', { itemId: 'beeswax-candles' }), catalog, hh)!;
  assert.deepEqual(again.introduced, []);
}

// Donating gelt or a food kit is never refilled.
{
  const next = box().filter((l) => l.slotId !== 'sufganiyot-mix' && l.slotId !== 'gelt-small');
  const r = auditBoxSave(box(), next, catalog, hh)!;
  assert.deepEqual(r.lineItems, next);
}

// Kids not loaded yet: skip.
assert.equal(auditBoxSave(box(), box(), catalog, { kidKeys: [], adults: 2 }), null);
assert.equal(auditBoxSave([], [], catalog, hh), null);

console.log('boxAuditOnSave: ok');
