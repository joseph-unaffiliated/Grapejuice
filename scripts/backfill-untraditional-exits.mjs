#!/usr/bin/env node
/**
 * One-off: mark every existing Grapejuice account (and placed order) on its person in the
 * Untraditional Customer.io workspace, so the guest-box recovery automations exclude people
 * who signed up or ordered before the exit signals in welcome.ts / chargePilotBox.ts existed.
 *
 *   node scripts/backfill-untraditional-exits.mjs           # counts only, sends nothing
 *   node scripts/backfill-untraditional-exits.mjs --apply   # identify each person
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default login`, and
 * UNTRADITIONAL_CIO_SITE_ID / UNTRADITIONAL_CIO_TRACK_API_KEY in functions/.env.grapejuice-pilot.
 * Never prints email addresses.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const apply = process.argv.includes('--apply');
const PLACED_STATUSES = new Set(['committed', 'confirmed', 'shipped']);

const envPath = fileURLToPath(new URL('../functions/.env.grapejuice-pilot', import.meta.url));
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()])
);
const siteId = env.UNTRADITIONAL_CIO_SITE_ID || '';
const apiKey = env.UNTRADITIONAL_CIO_TRACK_API_KEY || '';
const trackBase = env.UNTRADITIONAL_CIO_TRACK_URL || 'https://track.customer.io/api/v1';
if (apply && (!siteId || !apiKey)) {
  console.error('UNTRADITIONAL_CIO_SITE_ID / UNTRADITIONAL_CIO_TRACK_API_KEY are empty in functions/.env.grapejuice-pilot');
  process.exit(1);
}
const auth = `Basic ${Buffer.from(`${siteId}:${apiKey}`).toString('base64')}`;

admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'grapejuice-pilot' });

/** uid -> { email, createdAt } */
const accounts = new Map();
let pageToken;
do {
  const page = await admin.auth().listUsers(1000, pageToken);
  for (const u of page.users) {
    const email = u.email?.trim().toLowerCase();
    if (email && email.includes('@')) {
      accounts.set(u.uid, { email, createdAt: new Date(u.metadata.creationTime).toISOString() });
    }
  }
  pageToken = page.pageToken;
} while (pageToken);

/** email -> earliest placed-order timestamp */
const ordered = new Map();
const orders = await admin.firestore().collectionGroup('orders').select('status', 'userId', 'createdAt').get();
for (const doc of orders.docs) {
  const { status, userId, createdAt } = doc.data();
  if (!PLACED_STATUSES.has(status) || typeof userId !== 'string') continue;
  const email = accounts.get(userId)?.email;
  if (!email) continue;
  const at = typeof createdAt === 'string' ? createdAt : new Date().toISOString();
  if (!ordered.has(email) || at < ordered.get(email)) ordered.set(email, at);
}

const people = new Map();
for (const { email, createdAt } of accounts.values()) {
  const prev = people.get(email);
  if (!prev || createdAt < prev.grapejuice_account_at) {
    people.set(email, { grapejuice_account: true, grapejuice_account_at: createdAt });
  }
}
for (const [email, at] of ordered) {
  Object.assign(people.get(email), { grapejuice_order_placed: true, grapejuice_order_placed_at: at });
}

console.log(`Accounts with email: ${people.size}`);
console.log(`  …with a placed order: ${ordered.size}`);
if (!apply) {
  console.log('Dry run — nothing sent. Re-run with --apply.');
  process.exit(0);
}

let ok = 0;
let failed = 0;
for (const [email, attributes] of people) {
  const res = await fetch(`${trackBase}/customers/${encodeURIComponent(email)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ ...attributes, email }),
  });
  if (res.ok) ok += 1;
  else {
    failed += 1;
    console.error(`identify failed: HTTP ${res.status}`);
  }
  await new Promise((r) => setTimeout(r, 25));
}
console.log(`Identified: ${ok}, failed: ${failed}`);
