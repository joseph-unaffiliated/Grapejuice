/**
 * Run: npx tsx functions/src/inventoryEmails.test.ts
 */
import assert from 'node:assert/strict';
import type { DocumentReference } from 'firebase-admin/firestore';
import {
  buildRecipients,
  displayName,
  etDate,
  planInventoryEmails,
  subjectWords,
  type PlanInput,
  type Recipient,
} from './inventoryEmails';
import { countDraftHolds, guestDraftLines, guestKidAges, type UnsecuredDraft } from './inventoryWatch';
import { emailHash } from './guestSessions';

const ref = (id: string) => ({ id }) as DocumentReference;
const line = (itemId: string, quantity = 1, slotId = `gift-${itemId}`) => ({ slotId, itemId, quantity });

function draft(over: Partial<UnsecuredDraft> & Pick<UnsecuredDraft, 'key' | 'kind'>): UnsecuredDraft {
  return { ref: ref(over.key.replace(/^(hh|guest)_/, '')), lines: [], giftLines: [], test: false, ...over };
}

// —— Draft holds ————————————————————————————————————————————————————————
{
  const totals = countDraftHolds([
    draft({ key: 'hh_a', kind: 'household', lines: [line('lego-menorah'), line('beeswax-candles', 2, 'candles')] }),
    draft({ key: 'guest_v', kind: 'guest', lines: [line('lego-menorah')], giftLines: [line('lego-menorah')] }),
    draft({ key: 'hh_t', kind: 'household', lines: [line('lego-menorah', 5)], test: true }),
  ]);
  assert.equal(totals.get('lego-menorah'), 3);
  assert.equal(totals.get('beeswax-candles'), 2);
}

// Signed-out box lines count once the box is built; gift lines only while the gift is unfinished.
{
  const snap = (guest: Record<string, unknown>, gift?: Record<string, unknown>) => ({ guest, gift });
  const box = { lineItems: [line('lego-menorah')] };
  assert.equal(guestDraftLines(snap(box)).lines.length, 0);
  assert.equal(guestDraftLines(snap({ ...box, boxRevealComplete: true })).lines.length, 1);
  const gift = { status: 'incomplete', draft: { lineItems: [line('electric-candles')] } };
  assert.equal(guestDraftLines(snap({}, gift)).giftLines.length, 1);
  assert.equal(guestDraftLines(snap({}, { ...gift, status: 'complete' })).giftLines.length, 0);
}

// Guest kid ids skip adults.
{
  const ages = guestKidAges({
    guest: { childDrafts: [{ role: 'adult', plannerAge: 40 }, { plannerAge: 6 }, { ageGroup: '0-2' }] },
    gift: { draft: { childDrafts: [{ plannerAge: 9 }] } },
  });
  assert.equal(ages.get('guest-0'), 6);
  assert.ok(ages.has('guest-1'));
  assert.equal(ages.get('gift-child-0'), 9);
}

// —— Wording ———————————————————————————————————————————————————————————
assert.equal(displayName('"Lego" Menorah'), 'Lego Menorah');
assert.deepEqual(subjectWords('"Lego" Menorah'), { item_title: 'The Lego Menorah', is_are: 'is', it_they: 'it', it_them: 'it' });
assert.deepEqual(subjectWords('Roll Your Own Beeswax Candles'), {
  item_title: 'The Roll Your Own Beeswax Candles',
  is_are: 'are',
  it_they: 'they',
  it_them: 'them',
});
assert.equal(subjectWords('Glass Dreidel Glass').is_are, 'is');
assert.equal(subjectWords('Chess').is_are, 'is');

// 10am ET date key, across the UTC midnight.
assert.equal(etDate(new Date('2026-10-11T02:30:00Z')), '2026-10-10');
assert.equal(etDate(new Date('2026-10-11T14:00:00Z')), '2026-10-11');

// —— Recipients ————————————————————————————————————————————————————————
{
  const leadHash = emailHash('Pat@Example.com');
  const recipients = buildRecipients(
    [
      draft({ key: 'guest_v1', kind: 'guest', leadEmailHash: leadHash, lines: [line('electric-candles')] }),
      draft({ key: 'hh_h1', kind: 'household', ownerId: 'u1', ownerEmail: ' PAT@example.com', lines: [line('lego-menorah')] }),
      draft({ key: 'guest_v2', kind: 'guest', leadEmailHash: 'unknown', lines: [line('lego-menorah')] }),
      draft({ key: 'hh_h2', kind: 'household', ownerId: 'u2', ownerEmail: null, lines: [line('lego-menorah')] }),
      draft({ key: 'hh_h3', kind: 'household', ownerId: 'u3', ownerEmail: 'qa@example.com', test: true }),
    ],
    new Map([[leadHash, 'pat@example.com']])
  );
  // Same person as account and signed-out visitor → one account recipient covering both drafts.
  assert.equal(recipients.length, 1);
  const [pat] = recipients;
  assert.equal(pat.kind, 'household');
  assert.equal(pat.uid, 'u1');
  assert.equal(pat.email, 'pat@example.com');
  assert.deepEqual([...pat.draftKeys].sort(), ['guest_v1', 'hh_h1']);
  assert.deepEqual([...pat.itemIds].sort(), ['electric-candles', 'lego-menorah']);
}

// —— Plan ————————————————————————————————————————————————————————————————
function person(name: string, itemIds: string[], kind: Recipient['kind'] = 'household'): Recipient {
  return {
    hash: `h-${name}`,
    email: `${name}@example.com`,
    kind,
    uid: kind === 'household' ? `u-${name}` : undefined,
    visitorId: kind === 'guest' ? `v-${name}` : undefined,
    itemIds: new Set(itemIds),
    draftKeys: new Set([`${kind === 'household' ? 'hh' : 'guest'}_${name}`]),
  };
}

function plan(over: Partial<PlanInput>) {
  return planInventoryEmails({
    recipients: [],
    lowItemIds: [],
    swaps: [],
    lowAlreadySent: new Set(),
    sentToday: new Set(),
    unsubscribed: new Set(),
    ...over,
  });
}

// Lego Menorah first, then the most urgent low item; one email per person.
{
  const { picks } = plan({
    recipients: [person('a', ['roll-your-own-beeswax-candles', 'lego-menorah']), person('b', ['roll-your-own-beeswax-candles'])],
    lowItemIds: ['lego-menorah', 'roll-your-own-beeswax-candles'],
  });
  assert.deepEqual(
    picks.map((p) => [p.hash, p.kind === 'low' ? p.itemId : '']),
    [
      ['h-a', 'lego-menorah'],
      ['h-b', 'roll-your-own-beeswax-candles'],
    ]
  );
}

// A low item already emailed moves the person on to their next low item.
{
  const { picks } = plan({
    recipients: [person('a', ['roll-your-own-beeswax-candles', 'lego-menorah'])],
    lowItemIds: ['lego-menorah', 'roll-your-own-beeswax-candles'],
    lowAlreadySent: new Set(['h-a_lego-menorah']),
  });
  assert.equal(picks.length, 1);
  assert.equal(picks[0].kind === 'low' && picks[0].itemId, 'roll-your-own-beeswax-candles');
}

// Swapped beats low; the swap's item never also gets a low email.
{
  const swap = { id: 'hh_a_lego-menorah', draftKey: 'hh_a', fromItemId: 'lego-menorah', toItemId: 'airdry-clay-dreidel' };
  const { picks } = plan({
    recipients: [person('a', ['electric-candles', 'lego-menorah'])],
    lowItemIds: ['lego-menorah', 'electric-candles'],
    swaps: [swap],
  });
  assert.equal(picks.length, 1);
  assert.equal(picks[0].kind, 'swapped');
}

// Throttles and skips.
{
  const r = [person('a', ['lego-menorah']), person('b', ['lego-menorah']), person('c', ['lego-menorah']), person('d', [])];
  const { picks, skipped } = plan({
    recipients: r,
    lowItemIds: ['lego-menorah'],
    unsubscribed: new Set(['h-a']),
    sentToday: new Set(['h-b']),
  });
  assert.deepEqual(picks.map((p) => p.hash), ['h-c']);
  assert.deepEqual(skipped, { unsubscribed: 1, alreadyToday: 1, nothingNew: 1 });
}

// Swaps on drafts nobody can be emailed about are reported, not sent.
{
  const { picks, unreachableSwapIds } = plan({
    recipients: [person('a', [])],
    swaps: [{ id: 'hh_gone_lego-menorah', draftKey: 'hh_gone', fromItemId: 'lego-menorah', toItemId: null }],
  });
  assert.equal(picks.length, 0);
  assert.deepEqual(unreachableSwapIds, ['hh_gone_lego-menorah']);
}

console.log('inventoryEmails tests passed');
