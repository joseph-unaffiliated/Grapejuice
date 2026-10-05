import assert from 'node:assert/strict';
import { draftItemCount, lockDateLabel, setupNudgeSkipReason } from './setupNudge';

const now = new Date('2026-10-20T15:00:00Z');
const lines = [
  { itemId: 'a', quantity: 2 },
  { itemId: 'b', quantity: 1 },
  { itemId: 'c', quantity: 0 },
];
const base = { lineItems: lines, draftUpdatedAt: '2026-10-18T12:00:00Z', hasCommittedOrder: false };

assert.equal(draftItemCount(lines), 3);
assert.equal(draftItemCount(undefined), 0);
assert.equal(draftItemCount([null, 'x', { quantity: -1 }]), 0);

assert.equal(setupNudgeSkipReason(base, now), null);
assert.equal(setupNudgeSkipReason({ ...base, setupNudgeSentAt: '2026-10-19T00:00:00Z' }, now), 'already_sent');
assert.equal(setupNudgeSkipReason({ ...base, hasCommittedOrder: true }, now), 'committed');
assert.equal(setupNudgeSkipReason({ ...base, lineItems: [] }, now), 'empty_draft');
assert.equal(setupNudgeSkipReason({ ...base, lineItems: [{ itemId: 'a', quantity: 0 }] }, now), 'empty_draft');
assert.equal(setupNudgeSkipReason({ ...base, draftUpdatedAt: '2026-10-20T03:00:00Z' }, now), 'too_recent');
assert.equal(setupNudgeSkipReason({ ...base, draftUpdatedAt: undefined }, now), null, 'missing timestamp is not a blocker');

assert.equal(lockDateLabel('2026-11-07T05:00:00Z'), 'November 7');

console.log('setupNudge.test: ok');
