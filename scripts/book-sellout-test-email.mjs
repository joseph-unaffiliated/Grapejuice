#!/usr/bin/env node
/**
 * Send ONE test `inventory-low` email (a phase-1 flagged book as context) for copy
 * approval before phase 1 flags anything. Writes nothing to Firestore.
 *
 *   node scripts/book-sellout-test-email.mjs --firebase-cli-login [--to joseph@unaffiliated.co] [--item book-a-rugrats-chanukah]
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

const { emailDataFor } = require('../functions/src/inventoryEmails.ts');
const { sendEmail } = require('../functions/src/email.ts');
const { catalogEmailImage } = require('../functions/src/emailItems.ts');

const args = process.argv.slice(2);
const argValue = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const to = argValue('--to', 'joseph@unaffiliated.co');
const itemId = argValue('--item', 'book-a-rugrats-chanukah');
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

const snap = await db.doc(`catalog/hanukkah/items/${itemId}`).get();
if (!snap.exists) {
  console.error(`No catalog item ${itemId}`);
  process.exit(1);
}
const catalog = new Map([[itemId, snap.data()]]);
const { template, data } = await emailDataFor(
  { kind: 'low', hash: 'test', itemId },
  catalog,
  { secure: 'https://grapejuice.co/box' },
  // Locally there's no Storage admin app, so conversion returns null; fall back to
  // the item's synced photo so the test renders like the production send will.
  async (id, prefer) => {
    const converted = await catalogEmailImage(id, catalog.get(id), prefer).catch(() => null);
    if (converted) return converted;
    const doc = catalog.get(id) ?? {};
    const urls = Array.isArray(doc.imageUrls) ? doc.imageUrls : [];
    return (prefer === 'secondary' ? urls[1] : doc.imageUrl) ?? urls[0] ?? null;
  }
);
console.log(`Template: ${template}\nTo: ${to}\nData: ${JSON.stringify(data, null, 1)}`);
const status = await sendEmail({ to, template, data });
console.log(`sendEmail: ${status}`);
process.exit(0);
