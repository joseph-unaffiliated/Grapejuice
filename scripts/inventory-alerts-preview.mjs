#!/usr/bin/env node
/**
 * Read-only: what the inventory jobs would do right now.
 *   scheduledInventoryWatch  (functions/src/inventoryWatch.ts)  draft holds, low items, sold-out swaps
 *   scheduledInventoryEmails (functions/src/inventoryEmails.ts) who would get which email today
 * Prints counts and item ids only; writes nothing and sends nothing.
 *
 *   node scripts/inventory-alerts-preview.mjs [--firebase-cli-login]
 *
 * The Customer.io App API key comes from CUSTOMERIO_APP_API_KEY or functions/.env.grapejuice-pilot.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const require = createRequire(import.meta.url);
require('sucrase/register/ts');

const envFile = new URL('../functions/.env.grapejuice-pilot', import.meta.url);
if (!process.env.CUSTOMERIO_APP_API_KEY && existsSync(envFile)) {
  const match = readFileSync(envFile, 'utf8').match(/^CUSTOMERIO_APP_API_KEY=(.*)$/m);
  if (match) process.env.CUSTOMERIO_APP_API_KEY = match[1].trim().replace(/^["']|["']$/g, '');
}

const { runInventoryWatch } = require('../functions/src/inventoryWatch.ts');
const { runInventoryEmails } = require('../functions/src/inventoryEmails.ts');

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

const watch = await runInventoryWatch(db, { dryRun: true });
console.log('Inventory watch (dry run)');
console.log(`  unsecured drafts: ${JSON.stringify(watch.drafts)}  items held in drafts: ${watch.heldItems}`);
console.log(`  locked: ${watch.locked}`);
const fmt = (i) => `${i.id} (inventory ${i.inventory}, left ${i.stockLeft}, in drafts ${i.draftHeld}, remaining ${i.remaining})`;
console.log(`  low (${watch.low.length}):`);
for (const i of watch.low) console.log(`    ${fmt(i)}`);
console.log(`  sold out (${watch.soldOut.length}):`);
for (const i of watch.soldOut) console.log(`    ${fmt(i)}`);
console.log(`  swaps that would happen: ${JSON.stringify(watch.swaps)}`);

const emails = await runInventoryEmails(db, { dryRun: true });
console.log('\nInventory emails (dry run)');
console.log(`  recipients: ${JSON.stringify(emails.recipients)}  signed-out boxes with no matched lead: ${emails.guestsWithoutLead}`);
console.log(`  pending swaps: ${emails.pendingSwaps}  swapped boxes since secured: ${emails.swapsNoLongerDraft}`);
console.log(`  emails today: ${JSON.stringify(emails.picks)}`);
console.log(`  skipped: ${JSON.stringify(emails.skipped)}`);
process.exit(0);
