#!/usr/bin/env node
/**
 * Phase-2 sell-out flip for ONE tracked book: recompute committed copies
 * (secured boxes + paid gifts), set Airtable Inventory = committed, trigger the
 * catalog sync, and verify the book reads sold out (stockLeft 0) in Firestore.
 * Drafts holding it are then swapped by the 30-min inventory watch.
 *
 * Dry run by default; writes only with --apply.
 *
 *   node scripts/book-sellout-flip.mjs --firebase-cli-login --book book-the-hanukkah-hop [--apply]
 *
 * Secrets (AIRTABLE_PAT, CATALOG_SYNC_SECRET) are read from functions/.env.grapejuice-pilot.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const require = createRequire(import.meta.url);
require('sucrase/register/ts');
const { recomputeBoxAllocations } = require('../functions/src/catalogInventory.ts');

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const apply = args.includes('--apply');
const bookId = argValue('--book');
if (!bookId) {
  console.error('--book <catalog-item-id> is required');
  process.exit(1);
}

const envPath = new URL('../functions/.env.grapejuice-pilot', import.meta.url);
const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const envVar = (name) => envText.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
const airtablePat = process.env.AIRTABLE_PAT || envVar('AIRTABLE_PAT');
const syncSecret = envVar('CATALOG_SYNC_SECRET');
if (!airtablePat || !syncSecret) {
  console.error('AIRTABLE_PAT / CATALOG_SYNC_SECRET not found in env or functions/.env.grapejuice-pilot');
  process.exit(1);
}

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

const BASE = 'appQscrPCQUIj4shh';
const TABLE = 'tblCUCVfohWTQy8fP';
const F = { inventory: 'fldXpTJPasuaXfoeW', hold: 'fldFpeHc3sxneJ1TH' };

const itemSnap = await db.doc(`catalog/hanukkah/items/${bookId}`).get();
if (!itemSnap.exists) {
  console.error(`No catalog item ${bookId}`);
  process.exit(1);
}
const item = itemSnap.data();
console.log(`Book: ${item.name} (${bookId}) — Hold=${item.holdInventory} Inventory=${item.inventory}`);

const recompute = await recomputeBoxAllocations(db);
const invSnap = await db.doc(`catalog/hanukkah/inventory/${bookId}`).get();
const committed = Math.max(0, Math.floor(Number(invSnap.data()?.boxAllocatedQty) || 0));
console.log(`Recompute: ${JSON.stringify(recompute)} → committed (boxes+gifts) = ${committed}`);

// Find the Full Catalog record for this book via its synced Airtable record id.
const recordId = item.airtableRecordId;
if (!recordId) {
  console.error('Catalog item has no airtableRecordId — cannot flip.');
  process.exit(1);
}

if (!apply) {
  console.log(`DRY RUN: would set Airtable Inventory=${committed} on ${recordId} (Hold stays checked).`);
  process.exit(0);
}

const res = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${airtablePat}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { [F.inventory]: committed, [F.hold]: true }, typecast: true }),
});
if (!res.ok) {
  console.error(`Airtable update failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`Airtable: Inventory=${committed}, Hold inventory=checked (${recordId}).`);

const syncRes = await fetch('https://syncairtablecatalog-xixzph7nrq-uc.a.run.app', {
  method: 'POST',
  headers: { Authorization: `Bearer ${syncSecret}` },
});
console.log(`Catalog sync: ${syncRes.status} ${await syncRes.text().then((t) => t.slice(0, 160))}`);

const after = (await db.doc(`catalog/hanukkah/items/${bookId}`).get()).data();
const counters = (await db.doc(`catalog/hanukkah/inventory/${bookId}`).get()).data() ?? {};
const left = after.inventory == null ? null : after.inventory - Math.max(0, Math.floor(Number(counters.boxAllocatedQty) || 0));
console.log(`After sync: Inventory=${after.inventory} Hold=${after.holdInventory} boxAllocated=${counters.boxAllocatedQty ?? 0} → stockLeft=${left}`);
console.log(left === 0 ? 'SOLD OUT ✓ — drafts swap within ~30 min via the inventory watch.' : 'WARNING: stockLeft is not 0 — investigate before the next flip.');
process.exit(left === 0 ? 0 : 2);
