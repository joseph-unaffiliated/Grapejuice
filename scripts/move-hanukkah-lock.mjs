#!/usr/bin/env node
/**
 * One-off: Hanukkah box orders snapshot `lockAt` when committed, and charging / editing read that
 * snapshot. After moving `config/hanukkah-2026.lockAt`, carry the new time onto open orders that
 * still hold the old one.
 *
 *   node scripts/move-hanukkah-lock.mjs           # counts only, writes nothing
 *   node scripts/move-hanukkah-lock.mjs --apply   # update matching orders
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS, `gcloud auth application-default login`, or
 * `--firebase-cli-login` to reuse the local `firebase login` session.
 * Prints counts only.
 */
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const OLD_LOCK = '2026-11-07T05:00:00.000Z';
const NEW_LOCK = '2026-11-08T04:59:59.000Z';
const apply = process.argv.includes('--apply');
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

const config = (await db.doc('config/hanukkah-2026').get()).data() ?? {};
if (config.lockAt !== NEW_LOCK) {
  console.error(`config/hanukkah-2026.lockAt is ${config.lockAt}, expected ${NEW_LOCK}. Not touching orders.`);
  process.exit(1);
}

// Filtered in memory: a collection-group equality query would need a collection-group index.
const all = await db.collectionGroup('orders').get();
const matches = all.docs.filter((d) => d.data().lockAt === OLD_LOCK);
const byStatus = {};
const toUpdate = [];
for (const doc of matches) {
  const status = String(doc.data().status ?? 'unknown');
  byStatus[status] = (byStatus[status] ?? 0) + 1;
  if (status === 'committed' || status === 'pending') toUpdate.push(doc.ref);
}
console.log(`Orders with the old lock: ${matches.length} of ${all.size}`, byStatus);
console.log(`Open (committed/pending) to update: ${toUpdate.length}`);

if (!apply) {
  console.log('Dry run. Re-run with --apply to update.');
  process.exit(0);
}
for (let i = 0; i < toUpdate.length; i += 400) {
  const batch = db.batch();
  for (const ref of toUpdate.slice(i, i + 400)) batch.update(ref, { lockAt: NEW_LOCK });
  await batch.commit();
}
console.log(`Updated ${toUpdate.length} orders to ${NEW_LOCK}.`);
