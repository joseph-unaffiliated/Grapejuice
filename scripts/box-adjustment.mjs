#!/usr/bin/env node
/**
 * Price or charge a change to a Hanukkah box that has already been charged. Writes a
 * `boxAdjustments` request for the `processBoxAdjustment` function and prints its result.
 *
 *   node scripts/box-adjustment.mjs quote  <request.json> --firebase-cli-login
 *   node scripts/box-adjustment.mjs charge <request.json> --expect <cents> --firebase-cli-login
 *
 * request.json: { "householdId", "orderId", "reason", "lineItems": [{ slotId, itemId, quantity, unitCents, childId?, includedQty? }],
 *                 "oversellItemIds"?: [itemId] }   // items promised past stock
 * `lineItems` is the whole new box, not just what changes. `charge` bills the saved card for the
 * difference and refuses unless it still equals `--expect` (the difference from the agreed quote).
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS, `gcloud auth application-default login`, or
 * `--firebase-cli-login` to reuse the local `firebase login` session.
 */
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const [mode, file] = process.argv.slice(2);
const expectAt = process.argv.indexOf('--expect');
const expected = expectAt > 0 ? Number(process.argv[expectAt + 1]) : NaN;
if (!['quote', 'charge'].includes(mode) || !file) {
  console.error('Usage: box-adjustment.mjs quote|charge <request.json> [--expect <cents>] [--firebase-cli-login]');
  process.exit(1);
}
if (mode === 'charge' && !Number.isInteger(expected)) {
  console.error('charge needs --expect <cents> from the quote the customer agreed to.');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID || 'grapejuice-pilot';
let db;
if (process.argv.includes('--firebase-cli-login')) {
  db = firestoreFromFirebaseCliLogin(projectId);
  if (!db) {
    console.error('No usable `firebase login` session found.');
    process.exit(1);
  }
} else {
  admin.initializeApp({ projectId });
  db = admin.firestore();
}

const request = JSON.parse(readFileSync(file, 'utf8'));
const ref = db.collection('boxAdjustments').doc();
await ref.set({
  householdId: request.householdId,
  orderId: request.orderId,
  reason: request.reason ?? '',
  lineItems: request.lineItems,
  oversellItemIds: request.oversellItemIds ?? [],
  mode,
  ...(mode === 'charge' ? { expectedDifferenceCents: expected } : {}),
  status: 'requested',
  requestedAt: new Date().toISOString(),
});
console.log(`boxAdjustments/${ref.id} requested (${mode})`);

const usd = (c) => `$${(c / 100).toFixed(2)}`;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const doc = (await ref.get()).data() ?? {};
  if (doc.status === 'requested' || doc.status === 'processing') continue;
  console.log(`status: ${doc.status}${doc.reason ? ` (${doc.reason})` : ''}`);
  const q = doc.quote;
  if (q) {
    for (const li of q.lineItems) {
      const price = li.unitCents ? `${usd(li.unitCents * li.quantity)}` : 'included';
      console.log(`  ${li.quantity} x ${li.label}  [${li.slotId}]  ${price}`);
    }
    console.log(`  subtotal ${usd(q.subtotalCents)}  tax ${usd(q.taxCents)}  total ${usd(q.totalCents)}`);
    console.log(`  already charged ${usd(q.previousTotalCents)}  difference ${usd(q.differenceCents)} (${q.differenceCents} cents)`);
    for (const p of q.problems ?? []) console.log(`  PROBLEM: ${p}`);
    for (const p of q.oversold ?? []) console.log(`  OVERSOLD (allowed): ${p}`);
  }
  if (doc.paymentIntentId) console.log(`  payment: ${doc.paymentIntentId}`);
  if (doc.shipStation) console.log(`  ShipStation: ${doc.shipStation}`);
  process.exit(['quoted', 'charged'].includes(doc.status) ? 0 : 1);
}
console.error('Timed out waiting for processBoxAdjustment.');
process.exit(1);
