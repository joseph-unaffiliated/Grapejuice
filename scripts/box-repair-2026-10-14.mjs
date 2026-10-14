#!/usr/bin/env node
/**
 * One-off box repairs approved on 2026-10-14 after reviewing each customer's Clarity session:
 *   - a second Draw Your Own Dreidel present (a builder default) becomes the present the builder
 *     picks by age now: Toddler Play Menorah 0–2 (one per box), a stuffie 3–5, the other clay kit 6+
 *   - gelt bags that open drafts and signed-out boxes swapped up for free go back to the
 *     household's included bag (committed boxes keep theirs)
 *   - choconaut: free wooden dreidels back, one paid Slipcast Dreidel instead of nine free ones
 *   - jenniandlulu (committed): the 3 extra units become paid; order totals follow
 *   - awhitelaw1 (committed): all 3 candle sets marked included (no price change)
 *
 * Every line edit names the item it expects to find; a box whose lines no longer match is
 * skipped and reported. Each document is backed up as JSON before it is written. Writes carry
 * lastChangeSource so the box history records them; updatedBy is never touched.
 *
 * Dry run by default. Writes only with --apply.
 *
 *   node scripts/box-repair-2026-10-14.mjs [--firebase-cli-login] [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const SOURCE = 'script:box-repair-2026-10-14';
const HOLIDAY = 'hanukkah-2026';
const TAX_RATE = 0.075;
const BACKUP_DIR = path.resolve(
  import.meta.dirname,
  '../../backups/box-repair-2026-10-14'
);

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
const byId = new Map(catalogSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
const nameOf = (id) => byId.get(id)?.name ?? id;
const memberCents = (id) => byId.get(id)?.memberPriceCents ?? byId.get(id)?.member_price_cents;

const TPM = 'toddler-play-menorah';
const JELLY = 'jelly-the-sufganiyah-stuffie';
const CRISPY = 'crispy-the-latke-stuffie';
const CLAY_DREIDEL = 'airdry-clay-dreidel';
const CLAY_MENORAH = 'airdry-clay-menorah';
const DYOD = 'draw-your-own-dreidel';
const LITTLE = 'little-bag-of-gelt-2-big-5-little';
const BIG = 'big-bag-of-gelt';
const PARTY = 'party-bag-of-gelt';

const present = (childId, to) => ({ slot: `gift-${childId}`, expect: { itemId: DYOD }, swapTo: to });
const gelt = (slot, fromItem, fromQty, toItem, toQty) => ({
  slot,
  expect: { itemId: fromItem, quantity: fromQty },
  set: { itemId: toItem, quantity: toQty, includedQty: toQty, unitCents: 0 },
  headcount: toItem === LITTLE ? toQty : undefined,
});
const partyToBig = () => gelt('gelt-medium', PARTY, 1, BIG, 1);

const HOUSEHOLD_DRAFTS = [
  { who: 'lylapekarsky', h: '2XcnX5qe7hkY5yUHh44h', ops: [present('mqex8y4yi8oWzGiXqiQw', TPM)] },
  { who: 'brittanyrdewing', h: '41xbo88F42LoS0Ki7mss', ops: [present('vlmUlx8cACaSk6JIT9Nf', CLAY_DREIDEL)] },
  {
    who: 'flora.cross',
    h: 'QPRkIE1A8VQRDYApxR6o',
    ops: [present('LD6m8BLrMcEockYHJ5Gr', JELLY), present('NFoVpOftp2c60duwQPTB', TPM)],
  },
  {
    who: 'pluggehannah',
    h: 'UHynffYw2tPm5PZEbKrL',
    ops: [present('Y1uZajiTevLOrGPxuVFK', TPM), present('pSklCwbvBMHhcMHKePY6', JELLY)],
  },
  { who: 'katie219', h: 'ZgqxHyEKlqgvnB4hVPG2', ops: [present('yCMgUfFSo5UsSlXiV32a', JELLY)] },
  { who: 'daniellezeisloft', h: 'dtKgkqdtDqakFV1J5afL', ops: [present('UFHJwz464Vamza0w2tpP', JELLY)] },
  { who: 'hannahamilgrom', h: 'tlQXro4QUQANVTvOqecU', ops: [present('fPu7GLh1S1JMlxbZ6vfL', TPM)] },
  { who: 'r.e.mcmor', h: 'S2a3HSEmK3Ig5E6atY50', ops: [present('6ittnIDO4N5QE3pySYuC', JELLY)] },

  { who: 'alexaot95', h: '7gMYWBYluKBahtsm0pyk', ops: [partyToBig()] },
  { who: 'sarahrsacks', h: 'T4Mcab0gnTnB4SSTQeP0', ops: [partyToBig()] },
  { who: 'kaitlynnconley', h: 'TDIoPjWfevURVIR3BUrC', ops: [partyToBig()] },
  { who: 'mlee08992', h: 'nd90gy5R6OmCw6f19cAi', ops: [partyToBig()] },
  { who: 'annielcaprio', h: 'Y1a1XtXVeTFWkTBXJIeD', ops: [partyToBig()] },
  { who: 'megan.pelts', h: 'KjXTRh66KPwFcplT6gA8', ops: [partyToBig()] },
  { who: 'romyrichman', h: 'krfAZFYmebZKY9ctKved', ops: [partyToBig()] },
  { who: 'kortni.bowen', h: 'qpAy7b980lIhQlccWllb', ops: [gelt('gelt-small', BIG, 4, LITTLE, 4)] },
  { who: 'alondra0715', h: 'CtAkZC1OmSDMpewkb9k5', ops: [gelt('gelt-small', BIG, 3, LITTLE, 3)] },
  { who: 'amrivera071996', h: 'hMqGSnX7ZSaargPEFIeE', ops: [gelt('gelt-small', BIG, 3, LITTLE, 3)] },
  { who: 'issa890', h: 'lnAvY5TP8l50Dy7vGusk', ops: [gelt('gelt-medium', BIG, 2, BIG, 1)] },
  { who: 'esther.piwovar', h: 'rze4e2jGgQPsVCp6wpTr', ops: [gelt('gelt-small', PARTY, 4, LITTLE, 4)] },
  {
    who: 'choconaut',
    h: '5pJORmPFjqUUp8tJvfvH',
    ops: [
      gelt('gelt-small', LITTLE, 9, LITTLE, 3),
      {
        slot: 'wood-dreidel',
        expect: { itemId: 'slipcast-dreidel', quantity: 9 },
        set: { itemId: 'classic-wooden-dreidel', quantity: 3, includedQty: 3, unitCents: 0 },
        headcount: 3,
      },
      {
        add: {
          slotId: 'addon-slipcast-dreidel',
          itemId: 'slipcast-dreidel',
          quantity: 1,
          unitCents: 3000,
          includedQty: 0,
          displaySectionId: 'dreidel',
        },
      },
    ],
  },
];

const jenniOps = [
  { slot: 'gift-VCLHrEWOqtGc7rHDn89W', expect: { itemId: 'lego-menorah', quantity: 3 }, set: { quantity: 1, includedQty: 1 } },
  {
    add: {
      slotId: 'gift-VCLHrEWOqtGc7rHDn89W::x',
      itemId: 'lego-menorah',
      quantity: 2,
      unitCents: 1500,
      childId: 'VCLHrEWOqtGc7rHDn89W',
    },
  },
  { slot: 'gift-HL0I7o6eEVtYMmt4YDyx', expect: { itemId: CLAY_MENORAH, quantity: 2 }, set: { quantity: 1, includedQty: 1 } },
  { slot: 'gift-HL0I7o6eEVtYMmt4YDyx::x', expect: { itemId: CLAY_MENORAH, quantity: 1, unitCents: 300 }, set: { quantity: 2 } },
];

const COMMITTED = [
  { who: 'jenniandlulu', h: 'xIYrJ28gHgauVQ7o60lY', order: 'RhmAB8udBNaqUv53V2YW', ops: jenniOps },
  {
    who: 'awhitelaw1',
    h: 'zqv5Xht9K6M3YfD6zAoE',
    order: 'Hv2TXHIofh2SGcVx3Ylk',
    ops: [{ slot: 'candles', expect: { itemId: 'beeswax-candles', quantity: 3, unitCents: 0 }, set: { includedQty: 3 } }],
  },
];

const GUEST = [
  { id: '4d0a801d86184253a5e46fd6e6b507d0', list: 'guest', ops: [present('guest-2', JELLY), present('guest-3', TPM)] },
  { id: '5801085b01c24c30bfb360d2e9cccd3d', list: 'guest', ops: [present('guest-2', JELLY)] },
  { id: '988b822687d3442f8225b97564c3dce1', list: 'guest', ops: [present('guest-2', JELLY)] },
  { id: 'bae4038a7a204aed8680e333490b21ea', list: 'guest', ops: [present('guest-2', JELLY), present('guest-3', TPM)] },
  {
    id: 'e68ed4430d1e4dad9a5c7a9a02d5a084',
    list: 'guest',
    ops: [present('guest-2', JELLY), present('guest-3', CLAY_MENORAH)],
  },
  { id: 'a25fac51949b41659d9798c79fbc6870', list: 'gift', ops: [present('gift-child-2', CRISPY)] },
  { id: '57cea17577874ce2ad89bf3ba6671b2e', list: 'gift', ops: [gelt('gelt-small', PARTY, 4, LITTLE, 4)] },
];

const qtyOf = (l) => (typeof l.quantity === 'number' ? l.quantity : 1);
const cents = (n) => `$${(n / 100).toFixed(2)}`;
const describe = (l) =>
  `${nameOf(l.itemId)} ×${qtyOf(l)} at ${cents(l.unitCents ?? 0)}${l.includedQty != null ? ` (incl ${l.includedQty})` : ''}`;

/** Applies ops to a line list. Throws when a line isn't what the op expects. */
function applyOps(lines, ops) {
  const out = lines.map((l) => ({ ...l }));
  const changes = [];
  for (const op of ops) {
    if (op.add) {
      if (out.some((l) => l.slotId === op.add.slotId)) throw new Error(`${op.add.slotId} already exists`);
      const line = { ...op.add, label: nameOf(op.add.itemId) };
      out.push(line);
      changes.push(`+ ${line.slotId}: ${describe(line)}`);
      continue;
    }
    const idx = out.map((l, i) => (l.slotId === op.slot ? i : -1)).filter((i) => i >= 0);
    if (idx.length !== 1) throw new Error(`${op.slot}: expected 1 line, found ${idx.length}`);
    const line = out[idx[0]];
    for (const [k, v] of Object.entries(op.expect)) {
      const actual = k === 'quantity' ? qtyOf(line) : k === 'unitCents' ? line.unitCents ?? 0 : line[k];
      if (actual !== v) throw new Error(`${op.slot}: expected ${k}=${v}, found ${actual}`);
    }
    const before = describe(line);
    let next;
    if (op.swapTo) {
      if ((line.unitCents ?? 0) !== 0) throw new Error(`${op.slot}: present line is not free`);
      const { curationNote: _note, ...rest } = line;
      next = { ...rest, itemId: op.swapTo, label: nameOf(op.swapTo) };
    } else {
      next = { ...line, ...op.set };
      if (op.set.itemId) next.label = nameOf(op.set.itemId);
    }
    out[idx[0]] = next;
    changes.push(`  ${op.slot}: ${before}  →  ${describe(next)}`);
  }
  return { lines: out, changes };
}

function checkSiblingPresents(lines) {
  const presents = lines.filter((l) => /^gift-/.test(l.slotId) && !l.slotId.endsWith('::x') && (l.unitCents ?? 0) === 0);
  const tpm = presents.filter((l) => l.itemId === TPM).length;
  if (tpm > 1) throw new Error(`would leave ${tpm} free Toddler Play Menorahs`);
  for (const id of [JELLY, CRISPY, 'gimmel-the-dreidel-stuffie', 'shamash-the-menorah-stuffie']) {
    const n = presents.filter((l) => l.itemId === id).length;
    if (n > 1) throw new Error(`would leave ${n} free ${nameOf(id)} presents`);
  }
}

/** Kids on the account plus adults from the last family answers (adults aren't saved as children). */
async function householdHeadcount(uid) {
  if (!uid) return undefined;
  const [kids, user] = await Promise.all([db.collection(`users/${uid}/children`).get(), db.doc(`users/${uid}`).get()]);
  const drafts = user.data()?.lastBoxAnswers?.childDrafts;
  if (!Array.isArray(drafts)) return undefined;
  const adults = drafts.filter((d) => d?.role === 'adult').length;
  return kids.size + (adults > 0 ? adults : 2);
}

function backup(name, data) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(BACKUP_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

function subtotalOf(order, lines) {
  return (order.boxPriceCents ?? 0) + lines.reduce((s, l) => s + (l.unitCents ?? 0) * qtyOf(l), 0);
}

const summary = { done: [], skipped: [] };

async function repairHouseholdDraft(t) {
  const ref = db.doc(`households/${t.h}/boxDrafts/${HOLIDAY}`);
  const snap = await ref.get();
  const data = snap.data() ?? {};
  const { lines, changes } = applyOps(data.lineItems ?? [], t.ops);
  checkSiblingPresents(lines);
  const counts = t.ops.filter((o) => o.headcount != null);
  if (counts.length) {
    const hh = await db.doc(`households/${t.h}`).get();
    const people = await householdHeadcount(hh.data()?.ownerId ?? data.updatedBy);
    for (const o of counts) {
      if (people !== undefined && people !== o.headcount) {
        throw new Error(`${o.slot}: household has ${people} people, op assumes ${o.headcount}`);
      }
    }
  }
  console.log(`${t.who}  (households/${t.h})`);
  changes.forEach((c) => console.log(`  ${c}`));
  if (!apply) return;
  backup(`draft-${t.who}-${t.h}`, data);
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (JSON.stringify(fresh.data()?.lineItems) !== JSON.stringify(data.lineItems)) {
      throw new Error('draft changed while running');
    }
    tx.update(ref, { lineItems: lines, lastChangeSource: SOURCE });
  });
}

async function repairCommitted(t) {
  const draftRef = db.doc(`households/${t.h}/boxDrafts/${HOLIDAY}`);
  const orderRef = db.doc(`households/${t.h}/orders/${t.order}`);
  const [draftSnap, orderSnap] = await Promise.all([draftRef.get(), orderRef.get()]);
  const draft = draftSnap.data() ?? {};
  const order = orderSnap.data() ?? {};
  if (order.status !== 'committed') throw new Error(`order status is ${order.status}`);
  const nextDraft = applyOps(draft.lineItems ?? [], t.ops);
  const nextOrder = applyOps(order.lineItems ?? [], t.ops);

  const oldSub = subtotalOf(order, order.lineItems ?? []);
  if (oldSub !== order.subtotalCents) throw new Error(`stored subtotal ${order.subtotalCents} ≠ computed ${oldSub}`);
  if (Math.round(oldSub * TAX_RATE) !== order.taxCents) throw new Error(`stored tax ${order.taxCents} doesn't match 7.5%`);
  const newSub = subtotalOf(order, nextOrder.lines);
  if (subtotalOf(order, nextDraft.lines) !== newSub) throw new Error('draft and order totals would differ');
  const newTax = Math.round(newSub * TAX_RATE);
  const newTotal = order.totalCents + (newSub - oldSub) + (newTax - order.taxCents);

  console.log(`${t.who}  (committed order households/${t.h}/orders/${t.order}, and its draft)`);
  nextOrder.changes.forEach((c) => console.log(`  ${c}`));
  if (newSub !== oldSub) {
    console.log(
      `    subtotal ${cents(oldSub)} → ${cents(newSub)}, tax ${cents(order.taxCents)} → ${cents(newTax)}, total ${cents(order.totalCents)} → ${cents(newTotal)}`
    );
  } else {
    console.log('    totals unchanged');
  }
  if (!apply) return;
  backup(`draft-${t.who}-${t.h}`, draft);
  backup(`order-${t.who}-${t.order}`, order);
  await db.runTransaction(async (tx) => {
    const [d, o] = await Promise.all([tx.get(draftRef), tx.get(orderRef)]);
    if (JSON.stringify(d.data()?.lineItems) !== JSON.stringify(draft.lineItems)) throw new Error('draft changed');
    if (JSON.stringify(o.data()?.lineItems) !== JSON.stringify(order.lineItems)) throw new Error('order changed');
    tx.update(draftRef, { lineItems: nextDraft.lines, lastChangeSource: SOURCE });
    const orderUpdate = { lineItems: nextOrder.lines };
    if (newSub !== oldSub) Object.assign(orderUpdate, { subtotalCents: newSub, taxCents: newTax, totalCents: newTotal });
    tx.update(orderRef, orderUpdate);
  });
}

async function repairGuest(t) {
  const ref = db.doc(`guestSessions/${t.id}`);
  const snap = await ref.get();
  const data = snap.data() ?? {};
  if (typeof data.convertedUid === 'string' && data.convertedUid) {
    throw new Error(`signed-out box became account ${data.convertedUid}; leaving it`);
  }
  const field = t.list === 'gift' ? 'snapshot.gift.draft.lineItems' : 'snapshot.guest.lineItems';
  const current = t.list === 'gift' ? data.snapshot?.gift?.draft?.lineItems : data.snapshot?.guest?.lineItems;
  const { lines, changes } = applyOps(current ?? [], t.ops);
  checkSiblingPresents(lines);
  console.log(`${t.id.slice(0, 8)}  (signed-out ${t.list === 'gift' ? 'gift box' : 'box'})`);
  changes.forEach((c) => console.log(`  ${c}`));
  if (!apply) return;
  backup(`guest-${t.id}`, data);
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const now = t.list === 'gift' ? fresh.data()?.snapshot?.gift?.draft?.lineItems : fresh.data()?.snapshot?.guest?.lineItems;
    if (JSON.stringify(now) !== JSON.stringify(current)) throw new Error('signed-out box changed while running');
    tx.update(ref, { [field]: lines, lastChangeSource: SOURCE });
  });
}

async function run(label, fn) {
  try {
    await fn();
    summary.done.push(label);
  } catch (err) {
    summary.skipped.push(`${label}: ${err.message}`);
    console.log(`${label}  SKIPPED — ${err.message}`);
  }
  console.log('');
}

if (memberCents('slipcast-dreidel') !== undefined && memberCents('slipcast-dreidel') !== 3000) {
  console.error('Slipcast Dreidel member price changed; check the choconaut add-on price.');
  process.exit(1);
}

for (const t of HOUSEHOLD_DRAFTS) await run(t.who, () => repairHouseholdDraft(t));
for (const t of COMMITTED) await run(t.who, () => repairCommitted(t));
for (const t of GUEST) await run(t.id.slice(0, 8), () => repairGuest(t));

console.log(`${summary.done.length} box(es) ${apply ? 'repaired' : 'ready'}, ${summary.skipped.length} skipped.`);
summary.skipped.forEach((s) => console.log(`  skipped ${s}`));
if (apply) console.log(`Backups in ${BACKUP_DIR}`);
else console.log('Dry run — nothing written.');
process.exit(0);
