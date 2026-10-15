/**
 * Run: npx tsx functions/src/boxAuditLoad.test.ts
 */
import assert from 'node:assert/strict';
import { auditBoxRef, boxAuditId, guestBoxRefs, type BoxRef } from './boxAuditLoad';

const catalog = [
  { id: 'beeswax-candles', category: 'Candles' },
  { id: 'classic-wooden-dreidel', category: 'Dreidel' },
  { id: 'big-bag-of-gelt', name: 'Big Bag of Gelt (5 big, 20 little)', category: 'Gelt' },
  { id: 'latke-kit', category: 'Food' },
  { id: 'sufganiyot-kit', category: 'Food' },
  { id: 'wrapping-paper', category: 'Other' },
  { id: 'book-hanukkah-bear', category: 'Book' },
  { id: 'crispy-the-latke-stuffie', category: 'Stuffies' },
];
const L = (slotId: string, itemId: string, quantity = 1, unitCents = 0) => ({ slotId, itemId, quantity, unitCents });
const lines = [
  L('story-guest-0', 'book-hanukkah-bear'),
  L('gift-guest-0', 'crispy-the-latke-stuffie'),
  L('candles', 'beeswax-candles'),
  L('wood-dreidel', 'classic-wooden-dreidel', 3),
  L('gelt-medium', 'big-bag-of-gelt'),
  L('latke-mix', 'latke-kit'),
  L('sufganiyot-mix', 'sufganiyot-kit'),
  L('wrapping-paper', 'wrapping-paper'),
];

// Signed-out box and incomplete gift draft from one guest session.
{
  const data = {
    email: 'shopper@gmail.com',
    snapshot: {
      guest: { onboardingComplete: true, lineItems: lines, childDrafts: [{ role: 'child' }] },
      gift: { status: 'incomplete', draft: { lineItems: lines, childDrafts: [{ role: 'child' }], form: { giftAdults: 2 } } },
    },
  };
  const { guest, gift } = guestBoxRefs('guestSessions/v1', data);
  assert.equal(guest?.kind, 'guest');
  assert.deepEqual(guest?.kidKeys, ['guest-0']);
  assert.equal(guest?.adults, undefined);
  assert.equal(gift?.path, 'guestSessions/v1#gift');
  assert.equal(gift?.adults, 2);
  assert.equal(auditBoxRef(guest!, catalog).ok, true);
}

// Converted, unfinished or completed sessions have nothing to audit.
{
  assert.deepEqual(guestBoxRefs('guestSessions/v2', { convertedUid: 'u1', snapshot: { guest: { onboardingComplete: true, lineItems: lines } } }), { guest: null, gift: null });
  assert.equal(guestBoxRefs('guestSessions/v3', { snapshot: { guest: { lineItems: lines } } }).guest, null);
  assert.equal(guestBoxRefs('guestSessions/v4', { snapshot: { gift: { status: 'paid', draft: { lineItems: lines } } } }).gift, null);
  assert.equal(guestBoxRefs('guestSessions/agenttest-1', { snapshot: { guest: { onboardingComplete: true, lineItems: lines } } }).guest?.test, true);
}

// Approved exceptions don't count as open; other over-allowance does.
{
  const box = (email: string): BoxRef => ({
    kind: 'account',
    path: 'households/h1/boxDrafts/hanukkah-2026',
    email,
    test: false,
    lines: lines.map((l) =>
      l.slotId === 'candles' ? { ...l, quantity: 3 } : { ...l, slotId: l.slotId.replace('guest-0', 'k1') }
    ),
    kidKeys: ['k1'],
    wrapSelectedItemIds: [],
  });
  const approved = auditBoxRef(box('awhitelaw1@gmail.com'), catalog);
  assert.ok(approved.problems.some((p) => p.approved));
  assert.equal(approved.ok, true);
  const other = auditBoxRef(box('someone@gmail.com'), catalog);
  assert.equal(other.ok, false);
  assert.ok(other.open > 0);
}

// A donated food kit is listed but not open.
{
  const donated = guestBoxRefs('guestSessions/v5', {
    snapshot: { guest: { onboardingComplete: true, lineItems: lines.filter((l) => l.slotId !== 'latke-mix'), childDrafts: [{ role: 'child' }] } },
  }).guest!;
  const record = auditBoxRef(donated, catalog);
  assert.deepEqual(record.problems.map((p) => p.code), ['food-slot-missing']);
  assert.equal(record.open, 0);
}

assert.equal(boxAuditId('guestSessions/v1#gift'), 'guestSessions__v1__gift');

console.log('boxAuditLoad: ok');
