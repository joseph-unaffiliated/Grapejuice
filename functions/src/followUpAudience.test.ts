import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import {
  dedupeAudienceRows,
  followUpSkipReason,
  hashedAudienceRow,
  normalizeName,
  normalizePhone,
} from './followUpAudience';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const box = [{ itemId: 'candles', quantity: 1 }];
const base = { draftLineItems: box, orderStatuses: [], email: 'Sarah@Gmail.com ' };

assert.equal(followUpSkipReason(base), null);
assert.equal(followUpSkipReason({ ...base, draftLineItems: [] }), 'no_box');
assert.equal(followUpSkipReason({ ...base, cardOnFileAt: '2026-10-01T00:00:00Z' }), 'card_on_file');
assert.equal(followUpSkipReason({ ...base, stripeDefaultPaymentMethodId: 'pm_1' }), 'card_on_file');
assert.equal(followUpSkipReason({ ...base, orderStatuses: ['pending'] }), null);
assert.equal(followUpSkipReason({ ...base, orderStatuses: ['committed'] }), 'paid_order');
assert.equal(followUpSkipReason({ ...base, email: null }), 'no_email');
assert.equal(followUpSkipReason({ ...base, email: 'qa@unaffiliated.co' }), 'test');

assert.equal(normalizePhone('+1 (212) 555-0100'), '12125550100');
assert.equal(normalizePhone('212-555-0100'), '12125550100');
assert.equal(normalizePhone('555-0100'), null);
assert.equal(normalizeName(" O'Brien "), 'obrien');

assert.deepEqual(hashedAudienceRow({ email: ' Sarah@Gmail.com', phone: '', firstName: 'Sarah', lastName: '' }), [
  sha('sarah@gmail.com'),
  '',
  sha('sarah'),
  '',
]);
assert.equal(hashedAudienceRow({ firstName: 'Sarah' }), null);

const a = hashedAudienceRow({ email: 'a@x.com' })!;
const b = hashedAudienceRow({ email: 'A@x.com', phone: '2125550100' })!;
const c = hashedAudienceRow({ phone: '2125550100' })!;
const deduped = dedupeAudienceRows([a, b, c, c]);
assert.equal(deduped.rows.length, 2);
assert.equal(deduped.duplicates, 2);

console.log('followUpAudience tests passed');
