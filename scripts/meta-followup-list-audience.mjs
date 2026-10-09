#!/usr/bin/env node
/**
 * Customer-list half of the Meta follow-up audience, by hand. scheduledFollowUpListAudience
 * (functions/src/followUpListAudience.ts) runs the same refresh daily; rules, hashing and the Meta
 * upload live in functions/src/followUpAudience.ts.
 *
 *   node scripts/meta-followup-list-audience.mjs [--firebase-cli-login] [--csv <file>]...
 *       counts only; nothing is written or sent
 *   ... --csv <file> --seed-static     store the CSV rows (hashed, test accounts dropped) in
 *                                      adminConfig/metaFollowupStatic, replacing what's there
 *   ... --upload [--audience <id>]     replace the audience's members (default: the follow-up list)
 *   ... --create [--name <name>]       create a new customer-list audience, then upload
 *
 * CSV columns are matched by "first", "last", "email", "phone". Uploads need META_ADS_ACCESS_TOKEN
 * (ads_management) in the environment. Prints counts only.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const require = createRequire(import.meta.url);
require('sucrase/register/ts');
const {
  FOLLOW_UP_HOLIDAY_ID,
  FOLLOW_UP_LIST_AUDIENCE_ID,
  STATIC_ROWS_DOC,
  combineFollowUpRows,
  createFollowUpListAudience,
  hashedAudienceRow,
  loadStaticRows,
  normalizeEmail,
  replaceAudienceMembers,
  selectBuilderRows,
  toStoredRow,
} = require('../functions/src/followUpAudience.ts');
const { isTest } = require('../functions/src/testAccounts.ts');

const args = process.argv.slice(2);
const argValues = (flag) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const csvPaths = argValues('--csv');
const seedStatic = args.includes('--seed-static');
const create = args.includes('--create');
const upload = args.includes('--upload') || create;
const projectId = process.env.FIREBASE_PROJECT_ID || 'grapejuice-pilot';

if (seedStatic && !csvPaths.length) {
  console.error('--seed-static needs at least one --csv file.');
  process.exit(1);
}

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

const csvStats = { rows: 0, validEmail: 0, validPhone: 0, unusable: 0, test: 0 };
const csvRows = [];
for (const path of csvPaths) {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  const col = (word) => header.findIndex((h) => h.toLowerCase().includes(word));
  const [fi, li, ei, pi] = ['first', 'last', 'email', 'phone'].map(col);
  for (const r of rows) {
    csvStats.rows++;
    const row = hashedAudienceRow({ firstName: r[fi], lastName: r[li], email: r[ei], phone: r[pi] });
    if (!row) {
      csvStats.unusable++;
      continue;
    }
    if (row[0]) csvStats.validEmail++;
    if (row[1]) csvStats.validPhone++;
    const email = normalizeEmail(r[ei]);
    if (email && isTest(email)) {
      csvStats.test++;
      continue;
    }
    csvRows.push(row);
  }
}

const builders = await selectBuilderRows(db);
const storedRows = seedStatic ? null : await loadStaticRows(db);
const staticRows = seedStatic ? csvRows : [...(storedRows ?? []), ...csvRows];
const { rows, duplicates, staticPaid } = combineFollowUpRows(builders.rows, staticRows, builders.paidEmailHashes);

console.log(`Signed-in builders, no card (${FOLLOW_UP_HOLIDAY_ID} draft):  ${builders.rows.length}`);
console.log(`  skipped: ${JSON.stringify(builders.skipped)}`);
if (!seedStatic) console.log(`Stored static rows (${STATIC_ROWS_DOC}): ${storedRows ? storedRows.length : 'not seeded'}`);
if (csvPaths.length) {
  console.log(`CSV rows: ${csvStats.rows}  valid email: ${csvStats.validEmail}  valid phone: ${csvStats.validPhone}`);
  console.log(`  unusable: ${csvStats.unusable}  test: ${csvStats.test}  kept: ${csvRows.length}`);
}
console.log(`Static rows already paid: ${staticPaid}  duplicates removed: ${duplicates}`);
console.log(`Rows for the audience: ${rows.length} (with phone: ${rows.filter((r) => r[1]).length})`);

if (seedStatic) {
  await db.doc(STATIC_ROWS_DOC).set({
    rows: csvRows.map(toStoredRow),
    count: csvRows.length,
    seededAt: new Date().toISOString(),
  });
  console.log(`Stored ${csvRows.length} hashed rows in ${STATIC_ROWS_DOC}`);
}

if (!upload) process.exit(0);

const token = process.env.META_ADS_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('META_ADS_ACCESS_TOKEN is not set.');
  process.exit(1);
}
let audienceId = argValues('--audience')[0] ?? (create ? null : FOLLOW_UP_LIST_AUDIENCE_ID);
if (!audienceId) {
  audienceId = await createFollowUpListAudience(token, argValues('--name')[0] ?? 'Follow-up - builders no payment + form list');
  console.log(`Created audience ${audienceId}`);
}
const { received, invalid } = await replaceAudienceMembers(audienceId, rows, token);
console.log(`Uploaded to ${audienceId}: received ${received}, invalid ${invalid}`);
