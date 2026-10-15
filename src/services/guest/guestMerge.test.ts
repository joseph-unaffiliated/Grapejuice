import assert from 'node:assert/strict';
import type { BoxLineItem } from '../../types/pilot';
import { guestRebuiltSince, mergeGuestAddOns } from './guestMerge';

const L = (slotId: string, itemId: string, unitCents = 0, extra: Partial<BoxLineItem> = {}): BoxLineItem => ({
  slotId,
  itemId,
  quantity: 1,
  unitCents,
  ...extra,
});

// Rebuilt after the account box was last saved → the signed-out box wins.
assert.equal(guestRebuiltSince(Date.parse('2026-10-15T16:45:00Z'), '2026-10-15T16:37:42Z'), true);
// Built before → the account box stays.
assert.equal(guestRebuiltSince(Date.parse('2026-10-15T16:30:00Z'), '2026-10-15T16:37:42Z'), false);
// Never built in this session (only add-ons from the shop) → the account box stays.
assert.equal(guestRebuiltSince(undefined, '2026-10-15T16:37:42Z'), false);
assert.equal(guestRebuiltSince(Date.now(), undefined), true);

// Account box keeps its free lines; only new paid add-ons come over.
{
  const account = [L('candles', 'beeswax-candles'), L('latke-mix', 'latke-kit'), L('story-k1', 'book-a')];
  const guest = [
    L('candles', 'beeswax-candles'),
    L('gift-k1', 'shamash-the-menorah-stuffie'),
    L('addon-gimmel-the-dreidel-stuffie', 'gimmel-the-dreidel-stuffie', 1000),
    L('latke-mix', 'latke-kit', 500),
    L('pilot-x', 'crispy-the-latke-stuffie', 1000, { program: 'pilot' }),
  ];
  const merged = mergeGuestAddOns(account, guest);
  assert.deepEqual(
    merged.map((l) => l.slotId),
    ['candles', 'latke-mix', 'story-k1', 'addon-gimmel-the-dreidel-stuffie']
  );
  assert.equal(mergeGuestAddOns(account, [L('candles', 'beeswax-candles')]), account);
}

console.log('guestMerge: ok');
