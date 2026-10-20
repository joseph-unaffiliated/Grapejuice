#!/usr/bin/env node
/**
 * Dry-run counts for the non-Prime book sell-out (plan: book_sell-out_rollout).
 *
 * Per flagged book prints:
 *   committed  = boxAllocatedQty from the live inventory counters (secured box
 *                orders + paid gift boxes — exactly what stockLeft nets out)
 *   drafts     = copies sitting in unsecured drafts (household boxDrafts without
 *                a secured order + signed-out guest boxes/gift drafts)
 *   procured   = Airtable "Procured" as synced onto the catalog item (display)
 *   phase1     = committed + 2  (the low-stock Airtable Inventory for phase 1)
 *   phase2     = committed      (the sell-out Airtable Inventory for phase 2)
 *
 * Read-only. Nothing is written.
 *
 *   node scripts/book-sellout-counts.mjs [--firebase-cli-login]
 */
import { createRequire } from 'node:module';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const require = createRequire(import.meta.url);
require('sucrase/register/ts');
const { loadUnsecuredDrafts } = require('../functions/src/inventoryWatch.ts');

const args = process.argv.slice(2);
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

const FLAGGED = [
  'book-the-story-of-hanukkah',
  'book-ava-s-homemade-hanukkah',
  'book-a-rugrats-chanukah',
  'book-the-latke-who-couldn-t-stop-screaming',
  'book-queen-of-the-hanukkah-dosas',
  'book-simon-and-the-bear-a-hanukkah-tale',
  'book-nathan-blows-out-the-hanukkah-candles',
  'book-there-was-a-young-rabbi',
  'book-the-hanukkah-hop',
  'book-mrs-maccabee-s-miracle',
];

const items = new Map();
const counters = new Map();
const [itemsSnap, invSnap] = await Promise.all([
  db.collection('catalog/hanukkah/items').get(),
  db.collection('catalog/hanukkah/inventory').get(),
]);
for (const d of itemsSnap.docs) items.set(d.id, d.data());
for (const d of invSnap.docs) counters.set(d.id, d.data());

const drafts = await loadUnsecuredDrafts(db);
const draftQty = new Map();
for (const draft of drafts) {
  for (const line of [...draft.lines, ...draft.giftLines]) {
    if (!line.itemId) continue;
    const q = Math.max(1, Math.floor(Number(line.quantity) || 1));
    draftQty.set(line.itemId, (draftQty.get(line.itemId) ?? 0) + q);
  }
}

const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

console.log(`Unsecured drafts scanned: ${drafts.length}\n`);
const rows = [];
for (const id of FLAGGED) {
  const item = items.get(id) ?? {};
  const c = counters.get(id) ?? {};
  const committed = n0(c.boxAllocatedQty);
  const draftCopies = draftQty.get(id) ?? 0;
  const procured = typeof item.procured === 'number' ? item.procured : null;
  rows.push({
    id,
    name: item.name ?? id,
    inventory: typeof item.inventory === 'number' ? item.inventory : null,
    hold: item.holdInventory === true,
    committed,
    drafts: draftCopies,
    procured,
    direct: n0(c.directSoldQty) + n0(c.directReservedQty),
    phase1: committed + 2,
    phase2: committed,
    gap: committed - (procured ?? 0),
  });
}

for (const r of rows) {
  console.log(
    `${r.name}\n  id=${r.id}\n  Inventory=${r.inventory ?? 'untracked'} hold=${r.hold} ` +
      `committed=${r.committed} drafts=${r.drafts} procured=${r.procured ?? '—'} direct=${r.direct} ` +
      `| phase1 Inventory=${r.phase1} | phase2 Inventory=${r.phase2} | sourcing gap=${r.gap}`
  );
}

const zero = rows.filter((r) => r.committed === 0 && r.drafts === 0);
console.log(`\nZero-inclusion group (${zero.length}): ${zero.map((r) => r.name).join('; ') || 'none'}`);
console.log(
  `Totals: committed=${rows.reduce((s, r) => s + r.committed, 0)} drafts=${rows.reduce((s, r) => s + r.drafts, 0)}`
);
process.exit(0);
