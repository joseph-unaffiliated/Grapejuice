#!/usr/bin/env node
/**
 * Swap books that are no longer listed out of open drafts (household drafts without a
 * secured box, plus signed-out boxes and gift drafts). Secured orders are never touched.
 *
 *   A kid's book (line with a childId)  → that kid's age-default book, or the nearest-age
 *                                         default not already in the draft. Quantity and
 *                                         price stay as they were.
 *   A paid add-on (no childId)          → removed.
 *
 * "No longer listed" = a `book-*` line whose item is missing from catalog/hanukkah/items,
 * plus any ids passed with --remove. Defaults come from the catalog's defaultBookAges;
 * --default-ages <file.json> ({ "book-id": [ages] }) overrides them (for a dry run before
 * the Full Catalog sync has written defaultBookAges).
 *
 * Dry run by default. Writes only with --apply. Posts no in-app notices and queues no emails.
 *
 *   node scripts/books-unlisted-swap.mjs [--firebase-cli-login] [--remove id,id] [--default-ages f.json] [--apply]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const require = createRequire(import.meta.url);
require('sucrase/register/ts');
const { loadUnsecuredDrafts, toDraftLines, guestDraftLines } = require('../functions/src/inventoryWatch.ts');
const { plannerAgeOf } = require('../functions/src/rav/boxRules.ts');

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
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
const catalog = new Map(catalogSnap.docs.map((d) => [d.id, d.data()]));

const defaultAges = new Map();
for (const [id, item] of catalog) {
  if (Array.isArray(item.defaultBookAges) && item.defaultBookAges.length) {
    defaultAges.set(id, item.defaultBookAges.map(Number).filter(Number.isFinite));
  }
}
const overridePath = argValue('--default-ages');
if (overridePath) {
  defaultAges.clear();
  for (const [id, ages] of Object.entries(JSON.parse(readFileSync(overridePath, 'utf8')))) {
    defaultAges.set(id, ages.map(Number).filter(Number.isFinite));
  }
}
if (!defaultAges.size) {
  console.error('No default book ages in the catalog — pass --default-ages or run the catalog sync first.');
  process.exit(1);
}

const forcedRemove = new Set((argValue('--remove') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const isRemoved = (itemId) =>
  forcedRemove.has(itemId) || (itemId.startsWith('book-') && !catalog.has(itemId));

const nameOf = (id) => catalog.get(id)?.name ?? id;

function defaultBookFor(age, avoid) {
  const ranked = [...defaultAges.entries()]
    .filter(([id]) => !avoid.has(id) && !isRemoved(id))
    .map(([id, ages]) => ({ id, distance: Math.min(...ages.map((a) => Math.abs(a - age))) }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  return ranked[0]?.id ?? null;
}

/** Returns { lines, changes } with removed books swapped or dropped. */
function swapLines(lines, ageFor, avoid) {
  const changes = [];
  const out = [];
  for (const line of lines) {
    if (!isRemoved(line.itemId)) {
      out.push(line);
      continue;
    }
    const age = line.childId ? ageFor(line.childId) : undefined;
    if (line.childId && age == null) {
      changes.push({ from: line.itemId, to: null, note: 'kid age unknown — left in place' });
      out.push(line);
      continue;
    }
    if (!line.childId) {
      changes.push({ from: line.itemId, to: null, note: `add-on removed (${line.quantity} × $${((line.unitCents ?? 0) / 100).toFixed(2)})` });
      continue;
    }
    const to = defaultBookFor(age, avoid);
    if (!to) {
      changes.push({ from: line.itemId, to: null, note: `no replacement for age ${age} — left in place` });
      out.push(line);
      continue;
    }
    avoid.add(to);
    const { curationNote: _note, ...rest } = line;
    out.push({ ...rest, itemId: to, label: nameOf(to) });
    changes.push({ from: line.itemId, to, note: `kid age ${age}` });
  }
  return { lines: out, changes };
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
let touched = 0;
for (const draft of drafts) {
  if (![...draft.lines, ...draft.giftLines].some((l) => isRemoved(l.itemId))) continue;
  const ages = draft.kind === 'household' ? await householdAges(draft.ownerId) : draft.guestKidAges ?? new Map();
  const ageFor = (id) => ages.get(id);
  const label = draft.kind === 'household' ? draft.ownerEmail ?? draft.key : `${draft.key} (signed out)`;

  const avoid = new Set([...draft.lines, ...draft.giftLines].map((l) => l.itemId));
  const box = swapLines(draft.lines, ageFor, avoid);
  const gift = swapLines(draft.giftLines, ageFor, avoid);
  const changes = [...box.changes, ...gift.changes];
  touched += 1;
  console.log(`${draft.test ? '[test] ' : ''}${label}`);
  for (const c of changes) console.log(`    ${nameOf(c.from)}  →  ${c.to ? nameOf(c.to) : '—'}   (${c.note})`);

  if (!apply || draft.test || !changes.some((c) => c.to || c.note.startsWith('add-on removed'))) continue;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(draft.ref);
    const data = snap.data() ?? {};
    if (draft.kind === 'household') {
      const next = swapLines(toDraftLines(data.lineItems), ageFor, new Set(toDraftLines(data.lineItems).map((l) => l.itemId)));
      if (!next.changes.length) return;
      // updatedBy stays the customer's uid — the admin dashboard reads the customer from it.
      tx.set(draft.ref, { lineItems: next.lines, updatedAt: at }, { merge: true });
      return;
    }
    if (typeof data.convertedUid === 'string' && data.convertedUid) return;
    const snapshot = data.snapshot && typeof data.snapshot === 'object' ? data.snapshot : {};
    const current = guestDraftLines(snapshot);
    const guestAvoid = new Set([...current.lines, ...current.giftLines].map((l) => l.itemId));
    const nextBox = swapLines(current.lines, ageFor, guestAvoid);
    const nextGift = swapLines(current.giftLines, ageFor, guestAvoid);
    const update = {};
    if (nextBox.changes.length) update['snapshot.guest.lineItems'] = nextBox.lines;
    if (nextGift.changes.length) update['snapshot.gift.draft.lineItems'] = nextGift.lines;
    if (Object.keys(update).length) tx.update(draft.ref, update);
  });
}

console.log(`\n${touched} draft(s) with unlisted books. ${apply ? 'Applied (test accounts skipped).' : 'Dry run — nothing written.'}`);
process.exit(0);
