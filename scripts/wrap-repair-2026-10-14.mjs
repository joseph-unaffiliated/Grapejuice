#!/usr/bin/env node
/**
 * One-off repair approved on 2026-10-14 for drafts hit by the stale wrap-list bug (fixed in
 * useBoxDraft): the customer chose "Send me wrapping paper instead", but a later save restored the
 * old wrap list, so the included paper was charged (or shown) as a $5 extra.
 *
 * Each draft goes back to included paper at $0 with an empty wrap list. A draft whose paper line or
 * wrap list no longer matches is skipped. Drafts are backed up as JSON before writing, and writes
 * carry lastChangeSource so the box history records them; updatedBy is never touched.
 *
 * Dry run by default. Writes only with --apply.
 *
 *   node scripts/wrap-repair-2026-10-14.mjs [--firebase-cli-login] [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const SOURCE = 'script:box-repair-2026-10-14';
const HOLIDAY = 'hanukkah-2026';
const BACKUP_DIR = path.resolve(import.meta.dirname, '../../backups/box-repair-2026-10-14');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
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

const TARGETS = [
  { who: 'alondra0715', h: 'CtAkZC1OmSDMpewkb9k5', paperCents: 500, wrap: ['book-hanukkah-hippity-hop'] },
  { who: 'hillarytisman', h: 'Tn3D9bVyozRtV52HuQYr', paperCents: 500, wrap: ['airdry-clay-menorah'] },
  { who: 'marion.vilberg', h: 'bOAJGwwdMtjLvFzKrmDf', paperCents: 0, wrap: ['book-hanukkah-hippity-hop'] },
];

const summary = { done: [], skipped: [] };

async function repair(t) {
  const ref = db.doc(`households/${t.h}/boxDrafts/${HOLIDAY}`);
  const data = (await ref.get()).data() ?? {};
  const lines = data.lineItems ?? [];
  const paper = lines.filter((l) => l.slotId === 'wrapping-paper');
  if (paper.length !== 1) throw new Error(`expected 1 wrapping-paper line, found ${paper.length}`);
  const p = paper[0];
  if (p.itemId !== 'wrapping-paper' || (p.quantity ?? 1) !== 1 || p.includedQty !== 1) {
    throw new Error(`paper line is ${JSON.stringify(p)}`);
  }
  if ((p.unitCents ?? 0) !== t.paperCents) throw new Error(`paper is ${p.unitCents}¢, expected ${t.paperCents}¢`);
  if (JSON.stringify(data.wrapSelectedItemIds ?? []) !== JSON.stringify(t.wrap)) {
    throw new Error(`wrap list is ${JSON.stringify(data.wrapSelectedItemIds)}`);
  }
  const orders = await db.collection(`households/${t.h}/orders`).limit(1).get();
  if (!orders.empty) throw new Error('household has an order; leaving it');

  const next = lines.map((l) => (l.slotId === 'wrapping-paper' ? { ...l, unitCents: 0 } : l));
  console.log(`${t.who}  (households/${t.h})`);
  console.log(`  wrapping paper ${t.paperCents}¢ → 0¢ (included); wrap list ${JSON.stringify(t.wrap)} → []`);
  if (!apply) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(BACKUP_DIR, `wrap-draft-${t.who}-${t.h}.json`), JSON.stringify(data, null, 2));
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() ?? {};
    if (
      JSON.stringify(fresh.lineItems) !== JSON.stringify(data.lineItems) ||
      JSON.stringify(fresh.wrapSelectedItemIds) !== JSON.stringify(data.wrapSelectedItemIds)
    ) {
      throw new Error('draft changed while running');
    }
    tx.update(ref, { lineItems: next, wrapSelectedItemIds: [], lastChangeSource: SOURCE });
  });
}

for (const t of TARGETS) {
  try {
    await repair(t);
    summary.done.push(t.who);
  } catch (err) {
    summary.skipped.push(`${t.who}: ${err.message}`);
    console.log(`${t.who}  SKIPPED — ${err.message}`);
  }
}

console.log(`\n${summary.done.length} draft(s) ${apply ? 'repaired' : 'ready'}, ${summary.skipped.length} skipped.`);
summary.skipped.forEach((s) => console.log(`  skipped ${s}`));
if (apply) console.log(`Backups in ${BACKUP_DIR}`);
else console.log('Dry run — nothing written.');
process.exit(0);
