import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import {
  combineFollowUpRows,
  dedupeAudienceRows,
  followUpSkipReason,
  fromStoredRow,
  hashedAudienceRow,
  normalizeName,
  normalizePhone,
  replaceAudienceMembers,
  toStoredRow,
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

// Stored rows round-trip; junk is dropped.
assert.deepEqual(fromStoredRow(toStoredRow(b)), b);
assert.deepEqual(toStoredRow(a), { em: a[0] });
assert.equal(fromStoredRow({ fn: sha('sarah') }), null);
assert.equal(fromStoredRow({ em: 'not-a-hash' }), null);

// Builders first; static rows lose paying households and anyone already listed.
const builder = hashedAudienceRow({ email: 'builder@x.com' })!;
const lead = hashedAudienceRow({ email: 'lead@x.com', phone: '2125550199' })!;
const paidLead = hashedAudienceRow({ email: 'paid@x.com' })!;
const combined = combineFollowUpRows([builder], [lead, paidLead, builder, lead], new Set([sha('paid@x.com')]));
assert.deepEqual(combined.rows, [builder, lead]);
assert.equal(combined.staticPaid, 1);
assert.equal(combined.duplicates, 2);

// Upload safety: only customer lists in our account, never empty, always replace.
type Call = { url: string; method?: string; body?: URLSearchParams };
function fakeMeta(audience: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init?: { method?: string; body?: URLSearchParams }) => {
    calls.push({ url, ...init });
    const body = url.includes('/usersreplace')
      ? { num_received: JSON.parse(init!.body!.get('payload')!).data.length, num_invalid_entries: 0 }
      : audience;
    return { json: async () => body };
  };
  return { calls, fetchImpl };
}

(async () => {
  const ok = fakeMeta({ subtype: 'CUSTOM', account_id: '1311852520406314' });
  assert.deepEqual(await replaceAudienceMembers('123', [builder, lead], 'tok', ok.fetchImpl), { received: 2, invalid: 0 });
  const post = ok.calls.find((c) => c.method === 'POST')!;
  assert.ok(post.url.endsWith('/123/usersreplace'));
  assert.equal(JSON.parse(post.body!.get('session')!).last_batch_flag, true);

  const website = fakeMeta({ subtype: 'WEBSITE', account_id: '1311852520406314' });
  await assert.rejects(replaceAudienceMembers('123', [builder], 'tok', website.fetchImpl), /not a customer list/);
  assert.equal(website.calls.filter((c) => c.method === 'POST').length, 0);

  const otherAccount = fakeMeta({ subtype: 'CUSTOM', account_id: '999' });
  await assert.rejects(replaceAudienceMembers('123', [builder], 'tok', otherAccount.fetchImpl), /not a customer list/);

  const none = fakeMeta({ subtype: 'CUSTOM', account_id: '1311852520406314' });
  await assert.rejects(replaceAudienceMembers('123', [], 'tok', none.fetchImpl), /empty list/);
  await assert.rejects(replaceAudienceMembers('120247150226310519', [builder], 'tok', none.fetchImpl), /protected/);
  assert.equal(none.calls.length, 0);

  console.log('followUpAudience tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
