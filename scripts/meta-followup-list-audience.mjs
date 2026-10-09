#!/usr/bin/env node
/**
 * Customer-list half of the Meta follow-up audience. The ad set's website audience
 * ("Grapejuice box follow-up 30d") only holds browsers that fired BoxFollowUp in the last 30 days;
 * this list adds account holders who built a Hanukkah box but never added a card, plus any lead
 * CSVs (columns containing "first", "last", "email", "phone").
 *
 *   node scripts/meta-followup-list-audience.mjs [--firebase-cli-login] [--csv <file>]...
 *       counts only; nothing is sent anywhere
 *   ... --create                       create the customer-list audience, then upload
 *   ... --audience <id> --upload       replace that audience's members with the current list
 *
 * Uploads need META_ADS_ACCESS_TOKEN in the environment and only ever target a customer-list
 * (subtype CUSTOM) audience in act_1311852520406314; the website audience can't take uploads.
 * Rerun after new signups so people who added a card drop off (replace, not append).
 * Rules (who counts, normalization, hashing, test accounts) live in functions/src/followUpAudience.ts.
 * Prints counts only. Firestore is read-only.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomInt } from 'node:crypto';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const require = createRequire(import.meta.url);
require('sucrase/register/ts');
const {
  AUDIENCE_SCHEMA,
  FOLLOW_UP_HOLIDAY_ID,
  PAID_ORDER_STATUSES,
  dedupeAudienceRows,
  followUpSkipReason,
  hashedAudienceRow,
  normalizeEmail,
} = require('../functions/src/followUpAudience.ts');
const { isTest } = require('../functions/src/testAccounts.ts');

const AD_ACCOUNT = 'act_1311852520406314';
const GRAPH = 'https://graph.facebook.com/v21.0';
const AUDIENCE_NAME = 'Grapejuice follow-up list (box, no card + leads)';
const PROTECTED_AUDIENCES = new Set(['120247150226310519']);
const BATCH = 10000;

const args = process.argv.slice(2);
const argValues = (flag) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const csvPaths = argValues('--csv');
const create = args.includes('--create');
let audienceId = argValues('--audience')[0] ?? null;
const upload = args.includes('--upload') || create;
const projectId = process.env.FIREBASE_PROJECT_ID || 'grapejuice-pilot';

let db;
if (args.includes('--firebase-cli-login')) {
  db = firestoreFromFirebaseCliLogin(projectId);
  if (!db) {
    console.error('No usable `firebase login` session found.');
    process.exit(1);
  }
} else {
  admin.initializeApp({ projectId });
  db = admin.firestore();
}

// --- Firestore: households with a box draft and no card ---
const [householdSnap, draftSnap, orderSnap, userSnap] = await Promise.all([
  db.collection('households').select('ownerId', 'cardOnFileAt', 'stripeDefaultPaymentMethodId').get(),
  db.collectionGroup('boxDrafts').get(),
  db.collectionGroup('orders').select('status').get(),
  db.collection('users').select('email', 'displayName', 'phone').get(),
]);

const households = new Map(householdSnap.docs.map((d) => [d.id, d.data()]));
const users = new Map(userSnap.docs.map((d) => [d.id, d.data()]));
const ordersByHousehold = new Map();
for (const d of orderSnap.docs) {
  const hh = d.ref.parent.parent;
  if (hh?.parent.id !== 'households') continue;
  const list = ordersByHousehold.get(hh.id) ?? [];
  list.push(d.data().status);
  ordersByHousehold.set(hh.id, list);
}

const skipped = {};
const builderPeople = [];
const paidEmails = new Set();
for (const [hid, h] of households) {
  const owner = typeof h.ownerId === 'string' ? users.get(h.ownerId) : undefined;
  const email = normalizeEmail(owner?.email);
  const statuses = ordersByHousehold.get(hid) ?? [];
  if (email && (h.cardOnFileAt || h.stripeDefaultPaymentMethodId || statuses.some((s) => PAID_ORDER_STATUSES.includes(s)))) {
    paidEmails.add(email);
  }
}
for (const d of draftSnap.docs) {
  const hh = d.ref.parent.parent;
  if (d.id !== FOLLOW_UP_HOLIDAY_ID || hh?.parent.id !== 'households') continue;
  const h = households.get(hh.id) ?? {};
  const owner = typeof h.ownerId === 'string' ? users.get(h.ownerId) : undefined;
  const reason = followUpSkipReason({
    draftLineItems: d.data().lineItems,
    cardOnFileAt: h.cardOnFileAt,
    stripeDefaultPaymentMethodId: h.stripeDefaultPaymentMethodId,
    orderStatuses: ordersByHousehold.get(hh.id) ?? [],
    email: owner?.email ?? null,
  });
  if (reason) {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
    continue;
  }
  const [firstName, ...rest] = String(owner?.displayName ?? '').trim().split(/\s+/);
  builderPeople.push({ email: owner.email, phone: owner.phone, firstName, lastName: rest.at(-1) });
}

// --- Lead CSVs ---
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += text[++i];
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(field), (field = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      (row = []), (field = '');
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

const csvStats = { rows: 0, validEmail: 0, validPhone: 0, unusable: 0, test: 0, alreadyPaid: 0 };
const csvPeople = [];
for (const path of csvPaths) {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  const col = (word) => header.findIndex((h) => h.toLowerCase().includes(word));
  const [fi, li, ei, pi] = ['first', 'last', 'email', 'phone'].map(col);
  for (const r of rows) {
    csvStats.rows++;
    const person = { firstName: r[fi], lastName: r[li], email: r[ei], phone: r[pi] };
    const email = normalizeEmail(person.email);
    const row = hashedAudienceRow(person);
    if (!row) {
      csvStats.unusable++;
      continue;
    }
    if (row[0]) csvStats.validEmail++;
    if (row[1]) csvStats.validPhone++;
    if (email && isTest(email)) {
      csvStats.test++;
      continue;
    }
    if (email && paidEmails.has(email)) {
      csvStats.alreadyPaid++;
      continue;
    }
    csvPeople.push(person);
  }
}

const builderRows = builderPeople.map(hashedAudienceRow).filter(Boolean);
const csvRows = csvPeople.map(hashedAudienceRow).filter(Boolean);
const { rows, duplicates } = dedupeAudienceRows([...builderRows, ...csvRows]);

console.log(`Signed-in builders, no card (${FOLLOW_UP_HOLIDAY_ID} draft):  ${builderRows.length}`);
console.log(`  skipped: ${JSON.stringify(skipped)}`);
if (csvPaths.length) {
  console.log(`CSV rows: ${csvStats.rows}  valid email: ${csvStats.validEmail}  valid phone: ${csvStats.validPhone}`);
  console.log(`  unusable: ${csvStats.unusable}  test: ${csvStats.test}  already paid: ${csvStats.alreadyPaid}  kept: ${csvRows.length}`);
}
console.log(`Duplicates removed: ${duplicates}`);
console.log(`Rows to upload: ${rows.length} (with phone: ${rows.filter((r) => r[1]).length})`);

if (!upload) process.exit(0);

// --- Meta upload ---
const token = process.env.META_ADS_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('META_ADS_ACCESS_TOKEN is not set.');
  process.exit(1);
}

async function graph(method, path, params = {}) {
  const body = new URLSearchParams({ access_token: token });
  for (const [k, v] of Object.entries(params)) body.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const res = await fetch(method === 'GET' ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`, {
    method,
    ...(method === 'GET' ? {} : { body }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method} ${path}: ${json.error.message}`);
  return json;
}

if (create && !audienceId) {
  const made = await graph('POST', `${AD_ACCOUNT}/customaudiences`, {
    name: AUDIENCE_NAME,
    subtype: 'CUSTOM',
    customer_file_source: 'USER_PROVIDED_ONLY',
    description: 'Box builders without a card on file, plus lead lists. Rebuilt by scripts/meta-followup-list-audience.mjs.',
  });
  audienceId = made.id;
  console.log(`Created audience ${audienceId}`);
}
if (!audienceId) {
  console.error('Pass --audience <id> or --create.');
  process.exit(1);
}
if (PROTECTED_AUDIENCES.has(audienceId)) {
  console.error(`Refusing to write to protected audience ${audienceId}.`);
  process.exit(1);
}
const target = await graph('GET', audienceId, { fields: 'subtype,account_id' });
if (target.subtype !== 'CUSTOM' || `act_${target.account_id}` !== AD_ACCOUNT) {
  console.error(`Audience ${audienceId} is not a customer list in ${AD_ACCOUNT}; not uploading.`);
  process.exit(1);
}

const sessionId = randomInt(1, 2 ** 47);
let received = 0;
let invalid = 0;
for (let i = 0, seq = 1; i < rows.length; i += BATCH, seq++) {
  const batch = rows.slice(i, i + BATCH);
  const r = await graph('POST', `${audienceId}/usersreplace`, {
    session: { session_id: sessionId, batch_seq: seq, last_batch_flag: i + BATCH >= rows.length, estimated_num_total: rows.length },
    payload: { schema: AUDIENCE_SCHEMA, data: batch },
  });
  received += r.num_received ?? 0;
  invalid += r.num_invalid_entries ?? 0;
}
console.log(`Uploaded to ${audienceId}: received ${received}, invalid ${invalid}`);
const after = await graph('GET', audienceId, {
  fields: 'name,approximate_count_lower_bound,approximate_count_upper_bound,operation_status',
});
console.log(
  `Audience status: ${after.operation_status?.description ?? '?'}; approx size ${after.approximate_count_lower_bound}-${after.approximate_count_upper_bound} (Meta updates this over a few hours)`
);
