import assert from 'node:assert/strict';
import type { BoxLineItem } from '../../types/pilot';
import {
  auditIncluded,
  freeDreidelUnits,
  geltBagOf,
  includedCountLabel,
  topUpDreidelLines,
  type AuditCatalogRow,
} from './includedAudit';

const catalog: AuditCatalogRow[] = [
  { id: 'beeswax-candles', category: 'Candles' },
  { id: 'classic-wooden-dreidel', category: 'Dreidel' },
  { id: 'solid-brass-dreidel', category: 'Dreidel' },
  { id: 'little-bag-of-gelt-2-big-5-little', name: 'Little Bag of Gelt (2 big, 5 little)', category: 'Gelt' },
  { id: 'big-bag-of-gelt', name: 'Big Bag of Gelt (5 big, 20 little)', category: 'Gelt' },
  { id: 'party-bag-of-gelt', name: 'Party Bag of Gelt (20 big, 80 little)', category: 'Gelt' },
  { id: 'latke-kit', category: 'Food' },
  { id: 'sufganiyot-kit', category: 'Food' },
  { id: 'wrapping-paper', category: 'Other' },
  { id: 'book-hanukkah-bear', category: 'Book' },
  { id: 'book-latke-s-first-hanukkah', category: 'Book' },
  { id: 'crispy-the-latke-stuffie', category: 'Stuffies' },
  { id: 'arch-menorah', category: 'Menorah' },
  { id: 'lego-menorah', category: 'Menorah' },
];

const L = (slotId: string, itemId: string, quantity = 1, unitCents = 0, extra: Partial<BoxLineItem> = {}): BoxLineItem => ({
  slotId,
  itemId,
  quantity,
  unitCents,
  ...extra,
});

function twoKidBox(): BoxLineItem[] {
  return [
    L('story-a', 'book-hanukkah-bear'),
    L('story-b', 'book-latke-s-first-hanukkah'),
    L('gift-a', 'crispy-the-latke-stuffie'),
    L('gift-b', 'lego-menorah'),
    L('candles', 'beeswax-candles'),
    L('wood-dreidel', 'classic-wooden-dreidel', 4),
    L('gelt-small', 'little-bag-of-gelt-2-big-5-little', 4),
    L('latke-mix', 'latke-kit'),
    L('sufganiyot-mix', 'sufganiyot-kit'),
    L('wrapping-paper', 'wrapping-paper'),
  ];
}
const twoKids = { kidKeys: ['a', 'b'], adults: 2 };
const codes = (lines: BoxLineItem[], hh: { kidKeys: string[]; adults?: number } = twoKids, opts = {}) =>
  auditIncluded(lines, catalog, hh, opts).problems.map((p) => `${p.section}:${p.code}`);

// Clean default box.
{
  const a = auditIncluded(twoKidBox(), catalog, twoKids);
  assert.equal(a.ok, true, JSON.stringify(a.problems));
  assert.deepEqual(a.sections.story, { allowed: 2, filled: 2 });
  assert.deepEqual(a.sections.gelt, { allowed: 4, filled: 4 });
  assert.deepEqual(a.sections.food, { allowed: 2, filled: 2 });
}

// Paid add-ons on top are fine; pilot and cash donation lines are ignored.
{
  const lines = [
    ...twoKidBox(),
    L('story-a::x', 'book-hanukkah-bear', 1, 1400),
    L('addon-arch-menorah', 'arch-menorah', 1, 8000),
    L('pilot-crispy-the-latke-stuffie', 'crispy-the-latke-stuffie', 1, 0, { program: 'pilot' }),
    L('cash-donation', 'cash-donation', 1, 0),
  ];
  assert.deepEqual(codes(lines), []);
}

// Re-added book charged with the kid's slot empty → under.
{
  const lines = twoKidBox().map((l) => (l.slotId === 'story-b' ? { ...l, unitCents: 1400 } : l));
  assert.deepEqual(codes(lines), ['story:paid-in-included-slot']);
  assert.equal(auditIncluded(lines, catalog, twoKids).sections.story.filled, 1);
}

// Restored book stacked onto a sibling's line → that kid has 2, still 2 total.
{
  const lines = twoKidBox()
    .filter((l) => l.slotId !== 'story-b')
    .map((l) => (l.slotId === 'story-a' ? { ...l, quantity: 2 } : l));
  assert.deepEqual(codes(lines), ['story:over-allowance']);
}

// A third free present for two kids.
{
  const lines = [...twoKidBox(), L('gift-c', 'crispy-the-latke-stuffie')];
  assert.deepEqual(codes(lines), ['presents:over-allowance']);
}

// Free extra unit and free add-on.
{
  const lines = [...twoKidBox(), L('candles::x', 'beeswax-candles'), L('addon-arch-menorah', 'arch-menorah')];
  assert.deepEqual(codes(lines), ['other:free-add-on', 'other:free-add-on']);
}

// Brass dreidel free in the dreidel slot; too many dreidels.
{
  const brass = twoKidBox().map((l) => (l.slotId === 'wood-dreidel' ? { ...l, itemId: 'solid-brass-dreidel', quantity: 1 } : l));
  assert.deepEqual(codes(brass), ['dreidel:not-included-item']);
  const many = twoKidBox().map((l) => (l.slotId === 'wood-dreidel' ? { ...l, quantity: 6 } : l));
  assert.deepEqual(codes(many), ['dreidel:over-allowance']);
}

// Gelt: exchange rate and grandfathered defaults.
{
  assert.equal(geltBagOf('big-bag-of-gelt'), 'big');
  assert.equal(geltBagOf('little-bag-of-gelt-2-big-5-little'), 'little');
  assert.equal(geltBagOf('party-bag-of-gelt'), 'party');
  const oneKid3 = { kidKeys: ['a'], adults: 2 };
  const base = twoKidBox().filter((l) => !/-b$/.test(l.slotId) && l.slotId !== 'gelt-small');
  const fix = (lines: BoxLineItem[]) => lines.map((l) => (l.slotId === 'wood-dreidel' ? { ...l, quantity: 3 } : l));
  // Big Bag = 3 Little = exactly 3 people.
  assert.deepEqual(codes(fix([...base, L('gelt-medium', 'big-bag-of-gelt')]), oneKid3), []);
  // Big Bag swapped to 2 Little under the old math → short.
  assert.deepEqual(codes(fix([...base, L('gelt-small', 'little-bag-of-gelt-2-big-5-little', 2)]), oneKid3), ['gelt:gelt-short']);
  // Old default Big Bag in a 2-person household is grandfathered.
  const twoPeople = [...base, L('gelt-medium', 'big-bag-of-gelt')].map((l) =>
    l.slotId === 'wood-dreidel' ? { ...l, quantity: 2 } : l
  );
  const a = auditIncluded(twoPeople, catalog, { kidKeys: ['a'], adults: 1 });
  assert.equal(a.ok, true);
  assert.equal(a.problems[0]?.grandfathered, true);
  // Party Bag for 2 kids is over; for 5 kids it's grandfathered.
  const party = [...twoKidBox().filter((l) => l.slotId !== 'gelt-small'), L('gelt-party', 'party-bag-of-gelt')];
  assert.deepEqual(codes(party), ['gelt:over-allowance']);
  const fiveKids = { kidKeys: ['a', 'b', 'c', 'd', 'e'], adults: 2 };
  const p5 = auditIncluded(party, catalog, fiveKids);
  assert.equal(p5.problems.find((p) => p.section === 'gelt')?.grandfathered, true);
}

// Gelt in a dreidel slot counts as gelt; donating bags down isn't a shortfall.
{
  const swapped = twoKidBox().map((l) =>
    l.slotId === 'wood-dreidel' ? { ...l, itemId: 'little-bag-of-gelt-2-big-5-little', quantity: 2 } : l
  );
  assert.deepEqual(codes(swapped), ['gelt:over-allowance']);
  const donated = twoKidBox().map((l) => (l.slotId === 'gelt-small' ? { ...l, quantity: 2, includedQty: 4 } : l));
  assert.deepEqual(codes(donated), []);
  const short = twoKidBox().map((l) => (l.slotId === 'gelt-small' ? { ...l, quantity: 2, includedQty: 2 } : l));
  assert.deepEqual(codes(short), ['gelt:gelt-short']);
}

// A paid book keyed to a kid who isn't in the household is just a paid extra.
{
  const lines = [...twoKidBox(), L('story-zz', 'book-hanukkah-bear', 1, 1400)];
  assert.deepEqual(codes(lines), []);
}

// Food: two slots; gelt in a food slot; napkins gone; duplicate kits OK.
{
  const noSuf = twoKidBox().filter((l) => l.slotId !== 'sufganiyot-mix');
  assert.deepEqual(codes(noSuf), ['food:food-slot-missing']);
  const napkins = [...noSuf, L('sufganiyot-mix', 'hanukkah-napkins')];
  assert.deepEqual(codes(napkins), ['food:not-included-item', 'food:food-slot-missing']);
  const twoLatke = twoKidBox().map((l) => (l.slotId === 'sufganiyot-mix' ? { ...l, itemId: 'latke-kit' } : l));
  assert.deepEqual(codes(twoLatke), []);
  const threeLittle = twoKidBox().map((l) =>
    l.slotId === 'sufganiyot-mix' ? { ...l, itemId: 'little-bag-of-gelt-2-big-5-little', quantity: 3 } : l
  );
  assert.deepEqual(codes(threeLittle), []);
  const fourLittle = threeLittle.map((l) => (l.slotId === 'sufganiyot-mix' ? { ...l, quantity: 4 } : l));
  assert.deepEqual(codes(fourLittle), ['food:not-included-item', 'food:food-slot-missing']);
  const stuffie = twoKidBox().map((l) => (l.slotId === 'latke-mix' ? { ...l, itemId: 'crispy-the-latke-stuffie' } : l));
  assert.deepEqual(codes(stuffie), ['food:not-included-item', 'food:food-slot-missing']);
  const paidKit = twoKidBox().map((l) => (l.slotId === 'latke-mix' ? { ...l, unitCents: 500 } : l));
  assert.deepEqual(codes(paidKit), ['food:paid-in-included-slot', 'food:food-slot-missing']);
}

// Wrap: one included wrap; paper on top of pre-wrap is paid.
{
  assert.deepEqual(codes(twoKidBox(), twoKids, { wrapSelectedItemIds: ['lego-menorah'] }), ['wrap:over-allowance']);
  const paidPaper = twoKidBox().map((l) => (l.slotId === 'wrapping-paper' ? { ...l, unitCents: 500 } : l));
  assert.deepEqual(codes(paidPaper), ['wrap:wrap-charged']);
  assert.deepEqual(codes(paidPaper, twoKids, { wrapSelectedItemIds: ['lego-menorah'] }), []);
  const noPaper = twoKidBox().filter((l) => l.slotId !== 'wrapping-paper');
  assert.deepEqual(codes(noPaper, twoKids, { wrapSelectedItemIds: ['a', 'b', 'c', 'd', 'e'] }), []);
}

{
  // "X of Y included" headers; nothing for a household with no slots there.
  assert.equal(includedCountLabel({ allowed: 2, filled: 1 }), '1 of 2 included');
  assert.equal(includedCountLabel({ allowed: 1, filled: 3 }), '1 of 1 included');
  assert.equal(includedCountLabel({ allowed: 0, filled: 0 }), null);

  // Dreidel top-up to one per person: grows the free wood line, ignores gelt in a dreidel slot.
  const wood = { id: 'classic-wooden-dreidel', name: 'Classic wooden dreidel' };
  const short = [L('wood-dreidel', 'classic-wooden-dreidel', 2, 0, { includedQty: 2 }), L('addon-x', 'classic-wooden-dreidel', 1, 100)];
  const topped = topUpDreidelLines(short, 4, wood);
  assert.equal(freeDreidelUnits(topped), 4);
  assert.equal(topped[0].includedQty, 4);
  assert.equal(topped[1].unitCents, 100);
  assert.equal(topUpDreidelLines(topped, 4, wood), topped);
  const adultOnly = topUpDreidelLines([L('wood-dreidel', 'little-bag-of-gelt-2-big-5-little', 2)], 2, wood);
  assert.equal(freeDreidelUnits(adultOnly), 2);
  assert.equal(adultOnly[1].slotId, 'wood-dreidel-household');
  // A free brass dreidel in the wood slot never multiplies; wood fills the rest.
  const brass = topUpDreidelLines([L('wood-dreidel', 'solid-brass-dreidel', 1)], 3, wood);
  assert.equal(brass[0].quantity, 1);
  assert.deepEqual([brass[1].itemId, brass[1].quantity], ['classic-wooden-dreidel', 2]);
}

console.log('includedAudit: ok');
