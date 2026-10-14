#!/usr/bin/env node
/**
 * Give open drafts (household drafts without a secured box, plus signed-out boxes and gift
 * drafts) one copy of each book. Secured orders are never touched.
 *
 * When two free kid lines hold the same book, one copy stays (Rav-curated line first, then
 * the kid whose age default it is, then the story slot) and the other kid gets the book the
 * box builder would pick now: their age default, or the nearest default not already in the box.
 *
 * Left alone and reported:
 *   - a duplicate where one copy is a paid add-on (someone bought it on purpose)
 *   - a single line at quantity 2+ (someone pressed +)
 *   - lines whose kid's age is unknown
 *
 * Dry run by default. Writes only with --apply. Never touches updatedBy. Posts no notices.
 *
 *   node scripts/books-dedupe.mjs [--firebase-cli-login] [--apply]
 */
import { createRequire } from 'node:module';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const require = createRequire(import.meta.url);
globalThis.__DEV__ = false;
require('sucrase/register/ts');
const { loadUnsecuredDrafts, toDraftLines, guestDraftLines } = require('../functions/src/inventoryWatch.ts');
const { plannerAgeOf } = require('../functions/src/rav/boxRules.ts');
const { resolveBookForAge } = require('../src/services/box/boxRules.ts');
const { toRulesRow } = require('../src/services/box/buildDefaultBox.ts');

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

const catalogSnap = await db.collection('catalog/hanukkah/items').get();
const catalog = catalogSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const byId = new Map(catalog.map((c) => [c.id, c]));
const rows = catalog.map(toRulesRow);
const nameOf = (id) => byId.get(id)?.name ?? id;
const isBook = (id) => id.startsWith('book-');
const qtyOf = (l) => (typeof l.quantity === 'number' ? l.quantity : 1);
const isDefaultFor = (itemId, age) =>
  age != null && (byId.get(itemId)?.defaultBookAges ?? []).map(Number).includes(Math.floor(age));

/** Returns { lines, changes, notes } for one box's line list. */
function dedupeLines(lines, ageFor) {
  const notes = [];
  const changes = [];
  const groups = new Map();
  lines.forEach((l, i) => {
    if (!isBook(l.itemId)) return;
    if (qtyOf(l) > 1) notes.push(`${nameOf(l.itemId)} at qty ${qtyOf(l)} ($${((l.unitCents ?? 0) / 100).toFixed(2)} each) — left`);
    groups.set(l.itemId, [...(groups.get(l.itemId) ?? []), i]);
  });

  const out = lines.slice();
  const inBox = new Set(lines.map((l) => l.itemId));
  for (const [itemId, idxs] of groups) {
    if (idxs.length < 2) continue;
    if (idxs.some((i) => (lines[i].unitCents ?? 0) > 0)) {
      notes.push(`${nameOf(itemId)} ×${idxs.length}, one is a paid add-on — left`);
      continue;
    }
    const rank = (i) => {
      const l = lines[i];
      return (l.curationNote ? 4 : 0) + (isDefaultFor(itemId, ageFor(l.childId)) ? 2 : 0) + (l.slotId.startsWith('story') ? 1 : 0);
    };
    const keep = [...idxs].sort((a, b) => rank(b) - rank(a) || a - b)[0];
    for (const i of idxs) {
      if (i === keep) continue;
      const line = lines[i];
      const age = line.childId ? ageFor(line.childId) : undefined;
      if (age == null) {
        notes.push(`${nameOf(itemId)} on ${line.slotId}: kid age unknown — left`);
        continue;
      }
      const to = resolveBookForAge(rows, age, inBox)?.id;
      if (!to || inBox.has(to)) {
        notes.push(`${nameOf(itemId)} on ${line.slotId}: no other book for age ${age} — left`);
        continue;
      }
      inBox.add(to);
      const { curationNote: _note, ...rest } = line;
      out[i] = { ...rest, itemId: to, label: nameOf(to) };
      changes.push({ slot: line.slotId, from: itemId, to, age });
    }
  }
  return { lines: out, changes, notes };
}

async function householdAges(ownerId) {
  const ages = new Map();
  if (!ownerId) return ages;
  const snap = await db.collection(`users/${ownerId}/children`).get();
  for (const d of snap.docs) {
    const age = plannerAgeOf(d.data());
    if (age != null) ages.set(d.id, age);
  }
  return ages;
}

const drafts = await loadUnsecuredDrafts(db);
const at = new Date().toISOString();
let changed = 0;
let flagged = 0;
for (const draft of drafts) {
  if (draft.test) continue;
  const ages = draft.kind === 'household' ? await householdAges(draft.ownerId) : draft.guestKidAges ?? new Map();
  const ageFor = (id) => (id ? ages.get(id) : undefined);
  const box = dedupeLines(draft.lines, ageFor);
  const gift = dedupeLines(draft.giftLines, ageFor);
  const changes = [...box.changes, ...gift.changes.map((c) => ({ ...c, slot: `gift box ${c.slot}` }))];
  const notes = [...box.notes, ...gift.notes];
  if (!changes.length && !notes.length) continue;
  if (changes.length) changed += 1;
  else flagged += 1;

  const label = draft.kind === 'household' ? draft.ownerEmail ?? draft.key : `${draft.key} (signed out)`;
  console.log(label);
  for (const c of changes) console.log(`    ${c.slot}: ${nameOf(c.from)}  →  ${nameOf(c.to)}   (age ${c.age})`);
  for (const n of notes) console.log(`    · ${n}`);

  if (!apply || !changes.length) continue;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(draft.ref);
    const data = snap.data() ?? {};
    if (draft.kind === 'household') {
      const next = dedupeLines(toDraftLines(data.lineItems), ageFor);
      if (!next.changes.length) return;
      // updatedBy stays the customer's uid — the admin dashboard reads the customer from it.
      tx.set(draft.ref, { lineItems: next.lines, updatedAt: at }, { merge: true });
      return;
    }
    if (typeof data.convertedUid === 'string' && data.convertedUid) return;
    const snapshot = data.snapshot && typeof data.snapshot === 'object' ? data.snapshot : {};
    const current = guestDraftLines(snapshot);
    const nextBox = dedupeLines(current.lines, ageFor);
    const nextGift = dedupeLines(current.giftLines, ageFor);
    const update = {};
    if (nextBox.changes.length) update['snapshot.guest.lineItems'] = nextBox.lines;
    if (nextGift.changes.length) update['snapshot.gift.draft.lineItems'] = nextGift.lines;
    if (Object.keys(update).length) tx.update(draft.ref, update);
  });
}

console.log(
  `\n${changed} draft(s) to fix, ${flagged} more with only flagged lines. ${apply ? 'Applied.' : 'Dry run — nothing written.'}`
);
process.exit(0);
