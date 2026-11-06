import assert from 'node:assert/strict';
import { mergeTwinFunnelPeople, type DashFunnelPerson } from './adminDashboard';

const base = (over: Partial<DashFunnelPerson>): DashFunnelPerson => ({
  id: 'x',
  firstSeen: null,
  ad: 'Organic',
  test: false,
  outsideUs: false,
  family: false,
  sliders: false,
  gateEmail: false,
  sawBox: false,
  account: false,
  anyEmail: false,
  card: false,
  purchase: false,
  ...over,
});

// Rotated visitor id: the copy (no gate) and the original (gate) share the email step time.
const copy = base({ id: 'copy', firstSeen: '2026-11-06T14:20:11Z', sliders: true, family: true, sawBox: true, ad: 'Meta' });
const gated = base({
  id: 'gated',
  firstSeen: '2026-11-06T14:16:06Z',
  sliders: true,
  family: true,
  gateEmail: true,
  sawBox: true,
  account: true,
  anyEmail: true,
});
const unrelated = base({ id: 'solo', firstSeen: '2026-11-01T10:00:00Z', sliders: true, family: true });

const merged = mergeTwinFunnelPeople([
  { person: copy, stepMs: [1000, 1700] },
  { person: gated, stepMs: [900, 1700] },
  { person: unrelated, stepMs: [5555] },
]);

assert.equal(merged.length, 2, 'twin records collapse to one person');
const person = merged.find((p) => p.id === 'gated');
assert.ok(person, 'the record that passed the gate represents the person');
assert.equal(person.gateEmail, true);
assert.equal(person.account, true);
assert.equal(person.firstSeen, '2026-11-06T14:16:06Z', 'firstSeen is the earliest record in the group');
assert.equal(person.sawBox, true);
assert.equal(person.sliders, true);
assert.equal(person.ad, 'Organic', 'representative keeps its own ad label');
assert.ok(merged.some((p) => p.id === 'solo'), 'unrelated record stays separate');

// Transitive: A shares with B, B shares with C -> one person.
const chain = mergeTwinFunnelPeople([
  { person: base({ id: 'a', firstSeen: '2026-10-10T00:00:00Z' }), stepMs: [1] },
  { person: base({ id: 'b', firstSeen: '2026-10-11T00:00:00Z', gateEmail: true }), stepMs: [1, 2] },
  { person: base({ id: 'c', firstSeen: '2026-10-12T00:00:00Z', purchase: true }), stepMs: [2] },
]);
assert.equal(chain.length, 1);
assert.equal(chain[0].id, 'b');
assert.equal(chain[0].purchase, true, 'flags OR across the group');
assert.equal(chain[0].firstSeen, '2026-10-10T00:00:00Z');

// No shared timestamps -> nothing merges, order-independent.
const apart = mergeTwinFunnelPeople([
  { person: base({ id: 'p' }), stepMs: [10] },
  { person: base({ id: 'q' }), stepMs: [] },
]);
assert.equal(apart.length, 2);

console.log('adminDashboard funnel twin tests passed');
