import assert from 'node:assert/strict';
import { sanitizeAttribution } from './metaCapi';
import { unaffiliatedUserIdFrom, visitAttributes } from './unaffiliated';

const id = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';

// --- attribution carries the Unaffiliated reader id ------------------------------------------

assert.deepEqual(sanitizeAttribution({ unaffiliatedUserID: id }), { unaffiliatedUserID: id.toLowerCase() });
assert.equal(sanitizeAttribution({ unaffiliatedUserID: 'e0910c1234' }), null, 'cio_id-shaped values are dropped');
assert.equal(unaffiliatedUserIdFrom({ unaffiliatedUserID: id }), id.toLowerCase());
assert.equal(unaffiliatedUserIdFrom({ firstTouch: {} }), null);
assert.equal(unaffiliatedUserIdFrom(null), null);

// --- forwarded visit → Untraditional attributes ----------------------------------------------

const full = visitAttributes({
  email: 'a@b.co',
  userID: id.toLowerCase(),
  geo: { country: 'US', region: 'NY', city: 'Brooklyn', postalCode: '11215', metro: 'New York NY' },
  utm: { source: 'thepicklereport', campaign: 'hanukkah26' },
  at: '2026-10-07T18:00:00.000Z',
});
assert.equal(full.unaffiliated_reader, true);
assert.equal(full.country, 'US');
assert.equal(full.postal_code, '11215');
assert.equal(full.metro, 'New York NY');
assert.equal(full.grapejuice_email_visit_source, 'thepicklereport');
assert.equal(full.grapejuice_email_visit_at, '2026-10-07T18:00:00.000Z');

const noGeo = visitAttributes({ email: 'a@b.co', userID: id, geo: null });
assert.equal('country' in noGeo, false, 'no geo → location attributes untouched');

const partial = visitAttributes({ email: 'a@b.co', geo: { country: 'CA', region: 'ON' } });
assert.equal(partial.city, '', 'missing fields clear stale values');
assert.equal(partial.metro, '');

console.log('unaffiliated.test.ts ok');
