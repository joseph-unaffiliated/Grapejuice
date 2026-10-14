import assert from 'node:assert/strict';
import {
  formatPilotDay,
  formatPilotDollars,
  maskEmail,
  mergePilotLines,
  pickProblem,
  pilotAgreementText,
  pilotLineFor,
  PILOT_DEFAULT_ITEMS,
} from './pilotRules';
import { pilotAgreementText as clientAgreementText } from '../../src/services/pilot/pilotAgreement';

const approved = PILOT_DEFAULT_ITEMS.map((i) => i.id);
const nameOf = (id: string) => PILOT_DEFAULT_ITEMS.find((i) => i.id === id)?.name ?? id;
const crispy = { itemId: 'crispy-the-latke-stuffie', name: 'Crispy the Latke stuffie', deferredChargeCents: 1000 };
const gelt = { itemId: 'party-bag-of-gelt', name: 'Party bag of gelt', deferredChargeCents: 1800 };
const clay = { itemId: 'airdry-clay-dreidel', name: 'Air-dry clay dreidel', deferredChargeCents: 300 };

// Nine approved items, stuffies not next to each other.
{
  assert.equal(PILOT_DEFAULT_ITEMS.length, 9);
  const stuffie = PILOT_DEFAULT_ITEMS.map((i) => i.id.endsWith('-stuffie'));
  assert.ok(stuffie.every((s, i) => !(s && stuffie[i + 1])));
}

// A pilot line is a $0 included line that carries the snapshot price.
{
  const line = pilotLineFor(crispy);
  assert.deepEqual(line, {
    slotId: 'pilot-crispy-the-latke-stuffie',
    itemId: 'crispy-the-latke-stuffie',
    quantity: 1,
    includedQty: 1,
    unitCents: 0,
    label: 'Crispy the Latke stuffie',
    program: 'pilot',
    deferredChargeCents: 1000,
  });
}

// Merge restores dropped pilot lines, undoes edits, removes strays, and leaves matching lines alone.
{
  const pilot = [crispy, gelt, clay].map(pilotLineFor);
  const box = [{ slotId: 'candles', itemId: 'beeswax-candles', quantity: 1, unitCents: 0 }];
  const restored = mergePilotLines(box, pilot);
  assert.equal(restored.changed, true);
  assert.equal(restored.lines.length, 4);

  const same = mergePilotLines([...box, ...pilot.map((p) => ({ ...p }))], pilot);
  assert.equal(same.changed, false);

  const edited = [...box, { ...pilot[0], quantity: 3 }, pilot[1], pilot[2]];
  const fixed = mergePilotLines(edited, pilot);
  assert.equal(fixed.changed, true);
  assert.equal(fixed.lines.filter((l) => l.program === 'pilot').every((l) => l.quantity === 1), true);

  const stray = mergePilotLines([...box, ...pilot, pilotLineFor({ ...crispy, itemId: 'other' })], pilot);
  assert.equal(stray.changed, true);
  assert.equal(stray.lines.length, 4);
}

// Picks: exactly three, distinct, approved, and not already a regular line in the box.
{
  const box = [{ itemId: 'toddler-play-menorah' }, pilotLineFor(gelt)];
  assert.equal(pickProblem([crispy.itemId, gelt.itemId, clay.itemId], approved, box, nameOf), null);
  assert.match(pickProblem([crispy.itemId, gelt.itemId], approved, box, nameOf)!, /Pick 3/);
  assert.match(pickProblem([crispy.itemId, crispy.itemId, clay.itemId], approved, box, nameOf)!, /different/);
  assert.match(pickProblem([crispy.itemId, 'lego-menorah', clay.itemId], approved, box, nameOf)!, /isn’t part of the pilot/);
  assert.equal(
    pickProblem(['toddler-play-menorah', gelt.itemId, clay.itemId], approved, box, nameOf),
    'Toddler play menorah is already in your box. Pick something else.'
  );
}

// Agreement text names the items, the total, and the due date; no refund language.
{
  const text = pilotAgreementText([crispy, gelt, clay]);
  assert.equal(
    text,
    [
      "I'm joining Grapejuice Pilot Participants. I'll get these three items free: Crispy the Latke stuffie, Party bag of gelt and Air-dry clay dreidel (value $31).",
      "I agree to complete the post-Hanukkah survey by January 15, 2027. If I don't, I authorize Grapejuice to charge my card on file $31 plus applicable tax, once, after that date.",
      "Grapejuice may invite me to a paid follow-up conversation; that's optional and not guaranteed.",
    ].join('\n')
  );
  assert.equal(/refund/i.test(text), false);
  // The page builds the same text; enrollPilot refuses when they differ.
  assert.equal(clientAgreementText([crispy, gelt, clay]), text);
  assert.equal(clientAgreementText([{ ...crispy, deferredChargeCents: 1050 }, gelt, clay]), pilotAgreementText([{ ...crispy, deferredChargeCents: 1050 }, gelt, clay]));
}

assert.equal(formatPilotDollars(4300), '$43');
assert.equal(formatPilotDollars(1050), '$10.50');
assert.equal(maskEmail('joseph@unaffiliated.co'), 'j•••@unaffiliated.co');
assert.equal(formatPilotDay('2026-11-21'), 'Nov 21');
assert.equal(formatPilotDay('2026-11-08T04:59:59.000Z'), 'Nov 7');
assert.equal(formatPilotDay(''), '');

console.log('pilotRules tests passed');
