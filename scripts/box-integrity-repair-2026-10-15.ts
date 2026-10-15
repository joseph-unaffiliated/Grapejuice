/**
 * Customer-favor box repairs approved on 2026-10-15 after the first included-items audit
 * (scripts/box-audit.ts). Drafts only (account, signed-out, gift); secured orders are never touched.
 *
 *   - a paid present or gelt bag in its own included slot becomes $0
 *   - a box with fewer than two food slots gets them back at $0: a paid kit/cutters add-on moves
 *     into the empty slot, else the slot's default kit is added
 *   - gelt below the household's allowance is topped up with free Little Bags
 *
 * Each box is re-audited after the edit; a box whose fix wouldn't clear exactly those problems is
 * skipped. Writes are transactional against the lines read, backed up as JSON first, and carry
 * lastChangeSource so box history records them. updatedBy is never touched.
 *
 *   npx tsx scripts/box-integrity-repair-2026-10-15.ts [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';
import { loadBoxes, type BoxRef } from './box-audit';
import {
  auditIncluded,
  auditSlotBase,
  geltBagOf,
  GELT_LITTLE_EQUIVALENT,
  type AuditCatalogRow,
  type AuditProblem,
} from '../src/services/box/includedAudit';
import type { BoxLineItem } from '../src/types/pilot';

const SOURCE = 'script:box-integrity-2026-10-15';
const LITTLE = 'little-bag-of-gelt-2-big-5-little';
const FOOD_DEFAULT: Record<string, string> = { 'latke-mix': 'latke-kit', 'sufganiyot-mix': 'sufganiyot-kit' };
const FOOD_ADDON_ITEMS = new Set(['latke-kit', 'sufganiyot-kit', 'dreidel-cookie-cutters']);
const here = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(here, '../../backups/box-repair-2026-10-15');
const apply = process.argv.includes('--apply');
/** Restored separately from its pre-signup box (lost its book, kits and gelt at sign-in). */
const SKIP_PATHS = new Set(['households/4gEkslQLSR50MqF3nwp0/boxDrafts/hanukkah-2026']);

type Fix = { lines: BoxLineItem[]; changes: string[]; fixed: AuditProblem[] };

const cents = (n: number) => `$${(n / 100).toFixed(2)}`;

function planFixes(box: BoxRef, catalog: AuditCatalogRow[]): Fix | null {
  const nameOf = (id: string) => catalog.find((r) => r.id === id)?.name ?? id;
  const audit = auditIncluded(box.lines, catalog, { kidKeys: box.kidKeys, adults: box.adults }, {
    wrapSelectedItemIds: box.wrapSelectedItemIds,
  });
  const lines = box.lines.map((l) => ({ ...l }));
  const changes: string[] = [];
  const fixed: AuditProblem[] = [];

  for (const p of audit.problems) {
    if (p.grandfathered) continue;

    if (p.code === 'paid-in-included-slot' && (p.section === 'presents' || p.section === 'gelt')) {
      const line = lines.find((l) => l.slotId === p.slotId && l.itemId === p.itemId);
      if (!line) continue;
      changes.push(`${line.slotId}: ${nameOf(line.itemId)} ×${line.quantity} ${cents(line.unitCents)} → $0.00`);
      line.unitCents = 0;
      line.includedQty = line.quantity;
      fixed.push(p);
      continue;
    }

    if (p.code === 'food-slot-missing') {
      const filled = new Set(
        lines.filter((l) => l.unitCents === 0 && !/::x$/.test(l.slotId)).map((l) => auditSlotBase(l.slotId))
      );
      const empty = Object.keys(FOOD_DEFAULT).filter((s) => !filled.has(s));
      let need = audit.sections.food.allowed - audit.sections.food.filled;
      for (const slotId of empty) {
        if (need <= 0) break;
        need -= 1;
        const paidInSlot = lines.find((l) => l.slotId === slotId && l.unitCents > 0);
        const addOn = lines.find(
          (l) => /^addon-/.test(l.slotId) && FOOD_ADDON_ITEMS.has(l.itemId) && l.unitCents > 0 && l.quantity === 1
        );
        if (paidInSlot) {
          changes.push(`${slotId}: ${nameOf(paidInSlot.itemId)} ${cents(paidInSlot.unitCents)} → $0.00`);
          paidInSlot.unitCents = 0;
          paidInSlot.includedQty = 1;
        } else if (addOn) {
          changes.push(`${addOn.slotId} → ${slotId}: ${nameOf(addOn.itemId)} ${cents(addOn.unitCents)} → $0.00 (moved into the empty food slot)`);
          addOn.slotId = slotId;
          addOn.unitCents = 0;
          addOn.includedQty = 1;
        } else {
          const itemId = FOOD_DEFAULT[slotId];
          lines.push({ slotId, itemId, quantity: 1, includedQty: 1, unitCents: 0, label: nameOf(itemId) });
          changes.push(`+ ${slotId}: ${nameOf(itemId)} at $0.00`);
        }
      }
      fixed.push(p);
      continue;
    }

    if (p.code === 'gelt-short') {
      const allowance = audit.sections.gelt.allowed;
      const units = box.lines
        .filter((l) => l.unitCents === 0 && !/::x$/.test(l.slotId) && l.program !== 'pilot')
        .reduce((s, l) => {
          const bag = geltBagOf(l.itemId, catalog.find((r) => r.id === l.itemId)?.name);
          if (!bag || /^(latke|sufganiyot)-/.test(auditSlotBase(l.slotId))) return s;
          return s + GELT_LITTLE_EQUIVALENT[bag] * (l.quantity + Math.max(0, (l.includedQty ?? 0) - l.quantity));
        }, 0);
      const need = allowance - units;
      if (need <= 0) continue;
      const little = lines.find((l) => l.slotId === 'gelt-small' && l.itemId === LITTLE && l.unitCents === 0);
      if (little) {
        changes.push(`gelt-small: Little Bag ×${little.quantity} → ×${little.quantity + need} (free)`);
        little.includedQty = (little.includedQty ?? little.quantity) + need;
        little.quantity += need;
      } else if (!lines.some((l) => l.slotId === 'gelt-small')) {
        lines.push({ slotId: 'gelt-small', itemId: LITTLE, quantity: need, includedQty: need, unitCents: 0, label: nameOf(LITTLE) });
        changes.push(`+ gelt-small: Little Bag ×${need} at $0.00`);
      } else {
        continue;
      }
      fixed.push(p);
    }
  }

  if (!fixed.length) return null;

  const after = auditIncluded(lines, catalog, { kidKeys: box.kidKeys, adults: box.adults }, {
    wrapSelectedItemIds: box.wrapSelectedItemIds,
  });
  const key = (p: AuditProblem) => `${p.code}|${p.section}|${p.slotId ?? ''}|${p.itemId ?? ''}`;
  const remaining = new Set(after.problems.map(key));
  const before = new Set(audit.problems.map(key));
  const stillThere = fixed.filter((p) => remaining.has(key(p)));
  const introduced = after.problems.filter((p) => !before.has(key(p)));
  if (stillThere.length || introduced.length) {
    throw new Error(
      `fix check failed: still ${stillThere.map(key).join(', ') || 'none'}; new ${introduced.map(key).join(', ') || 'none'}`
    );
  }
  return { lines, changes, fixed };
}

function target(box: BoxRef): { docPath: string; field: string; read: (d: Record<string, any>) => unknown } {
  if (box.kind === 'account') return { docPath: box.path, field: 'lineItems', read: (d) => d.lineItems };
  const docPath = box.path.replace(/#gift$/, '');
  return box.kind === 'gift'
    ? { docPath, field: 'snapshot.gift.draft.lineItems', read: (d) => d.snapshot?.gift?.draft?.lineItems }
    : { docPath, field: 'snapshot.guest.lineItems', read: (d) => d.snapshot?.guest?.lineItems };
}

/**
 * vactree: a second sign-in at 16:40 replaced the box and dropped the book, both kits (and the
 * first sign-in had dropped the default Big Bag). Put back the book last picked, the kits and the
 * Big Bag at $0, and the Shamash present at $0. The paid stuffie add-ons stay as they are.
 */
async function restoreVactree(db: FirebaseFirestore.Firestore, catalog: AuditCatalogRow[]) {
  const nameOf = (id: string) => catalog.find((r) => r.id === id)?.name ?? id;
  const kid = 'IjKEGb2gP2JxlMu6rbFj';
  const ref = db.doc('households/4gEkslQLSR50MqF3nwp0/boxDrafts/hanukkah-2026');
  const snap = await ref.get();
  const data = snap.data() ?? {};
  const lines = (data.lineItems ?? []) as BoxLineItem[];
  const sig = (ls: BoxLineItem[]) => ls.map((l) => `${l.slotId}:${l.itemId}:${l.quantity}:${l.unitCents}`).sort().join(',');
  const expected = [
    'candles:beeswax-candles:1:0',
    'wrapping-paper:wrapping-paper:1:0',
    `gift-${kid}:shamash-the-menorah-stuffie:1:1000`,
    'decor:crispy-the-latke-stuffie:1:1000',
    'addon-gimmel-the-dreidel-stuffie:gimmel-the-dreidel-stuffie:1:1000',
    'addon-jelly-the-sufganiyah-stuffie:jelly-the-sufganiyah-stuffie:1:1000',
    'wood-dreidel:classic-wooden-dreidel:3:0',
  ].sort().join(',');
  if (sig(lines) !== expected) throw new Error('box no longer matches what was reviewed');
  const next: BoxLineItem[] = lines.map((l) =>
    l.slotId === `gift-${kid}` ? { ...l, unitCents: 0, includedQty: 1 } : { ...l }
  );
  const add = (l: BoxLineItem) => next.push({ ...l, label: nameOf(l.itemId) });
  add({ slotId: `story-${kid}`, itemId: 'book-elmo-s-little-dreidel-sesame-street', quantity: 1, includedQty: 1, unitCents: 0, childId: kid });
  add({ slotId: 'latke-mix', itemId: 'latke-kit', quantity: 1, includedQty: 1, unitCents: 0 });
  add({ slotId: 'sufganiyot-mix', itemId: 'sufganiyot-kit', quantity: 1, includedQty: 1, unitCents: 0 });
  add({ slotId: 'gelt-medium', itemId: 'big-bag-of-gelt', quantity: 1, includedQty: 1, unitCents: 0 });
  console.log('vactree  (households/4gEkslQLSR50MqF3nwp0, restore after sign-in)');
  console.log(`  gift-${kid}: Shamash $10.00 → $0.00`);
  console.log(`  + story, latke-mix, sufganiyot-mix, gelt-medium (Big Bag) at $0.00`);
  if (!apply) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(BACKUP_DIR, 'households_4gEkslQLSR50MqF3nwp0_vactree.json'), JSON.stringify(data, null, 2));
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (sig((fresh.data()?.lineItems ?? []) as BoxLineItem[]) !== expected) throw new Error('box changed while running');
    tx.update(ref, { lineItems: next, lastChangeSource: SOURCE });
  });
}

/**
 * vactree, second time: her open My Box tab saved a candle swap 48 seconds after the restore above
 * and wrote its stale box back, dropping the kits and Big Bag and charging Shamash again. She then
 * re-added the Elmo book, which the old free-add priced as an $8 add-on, and removed Jelly. Put
 * back the kits, Big Bag and Shamash at $0, make Elmo her included book, keep everything else.
 */
async function restoreVactreeAfterStaleTab(db: FirebaseFirestore.Firestore, catalog: AuditCatalogRow[]) {
  const nameOf = (id: string) => catalog.find((r) => r.id === id)?.name ?? id;
  const kid = 'IjKEGb2gP2JxlMu6rbFj';
  const elmo = 'book-elmo-s-little-dreidel-sesame-street';
  const ref = db.doc('households/4gEkslQLSR50MqF3nwp0/boxDrafts/hanukkah-2026');
  const snap = await ref.get();
  const data = snap.data() ?? {};
  const lines = (data.lineItems ?? []) as BoxLineItem[];
  const sig = (ls: BoxLineItem[]) => ls.map((l) => `${l.slotId}:${l.itemId}:${l.quantity}:${l.unitCents}`).sort().join(',');
  const expected = [
    'candles:electric-candles:1:0',
    'wrapping-paper:wrapping-paper:1:0',
    `gift-${kid}:shamash-the-menorah-stuffie:1:1000`,
    'decor:crispy-the-latke-stuffie:1:1000',
    'addon-gimmel-the-dreidel-stuffie:gimmel-the-dreidel-stuffie:1:1000',
    'wood-dreidel:classic-wooden-dreidel:3:0',
    `addon-${elmo}:${elmo}:1:800`,
  ].sort().join(',');
  if (sig(lines) !== expected) throw new Error('box no longer matches what was reviewed');
  const next: BoxLineItem[] = lines
    .filter((l) => l.slotId !== `addon-${elmo}`)
    .map((l) => (l.slotId === `gift-${kid}` ? { ...l, unitCents: 0, includedQty: 1 } : { ...l }));
  const add = (l: BoxLineItem) => next.push({ ...l, label: nameOf(l.itemId) });
  add({ slotId: `story-${kid}`, itemId: elmo, quantity: 1, includedQty: 1, unitCents: 0, childId: kid });
  add({ slotId: 'latke-mix', itemId: 'latke-kit', quantity: 1, includedQty: 1, unitCents: 0 });
  add({ slotId: 'sufganiyot-mix', itemId: 'sufganiyot-kit', quantity: 1, includedQty: 1, unitCents: 0 });
  add({ slotId: 'gelt-medium', itemId: 'big-bag-of-gelt', quantity: 1, includedQty: 1, unitCents: 0 });
  console.log('vactree  (households/4gEkslQLSR50MqF3nwp0, restore after stale-tab overwrite)');
  console.log(`  gift-${kid}: Shamash $10.00 → $0.00`);
  console.log(`  Elmo book: $8.00 add-on → included book at $0.00`);
  console.log(`  + latke-mix, sufganiyot-mix, gelt-medium (Big Bag) at $0.00`);
  if (!apply) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(BACKUP_DIR, 'households_4gEkslQLSR50MqF3nwp0_vactree_2.json'), JSON.stringify(data, null, 2));
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (sig((fresh.data()?.lineItems ?? []) as BoxLineItem[]) !== expected) throw new Error('box changed while running');
    tx.update(ref, { lineItems: next, lastChangeSource: SOURCE });
  });
}

async function main() {
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  if (!db) throw new Error('No Firebase CLI login; run `firebase login`.');
  const { boxes, catalog } = await loadBoxes(db);
  const drafts = boxes.filter((b) => !b.test && b.kind !== 'order' && !SKIP_PATHS.has(b.path));
  const done: string[] = [];
  const skipped: string[] = [];

  for (const box of drafts) {
    const who = box.email ?? box.path;
    let fix: Fix | null;
    try {
      fix = planFixes(box, catalog);
    } catch (err) {
      skipped.push(`${who}: ${(err as Error).message}`);
      continue;
    }
    if (!fix) continue;
    console.log(`${who}  (${box.kind} ${box.path})`);
    fix.changes.forEach((c) => console.log(`  ${c}`));
    if (!apply) {
      done.push(who);
      continue;
    }
    const t = target(box);
    const ref = db.doc(t.docPath);
    try {
      const snap = await ref.get();
      const data = snap.data() ?? {};
      if (typeof data.convertedUid === 'string' && data.convertedUid) throw new Error('signed-out box became an account');
      const original = t.read(data);
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.writeFileSync(path.join(BACKUP_DIR, `${t.docPath.replace(/\//g, '_')}${box.kind === 'gift' ? '_gift' : ''}.json`), JSON.stringify(data, null, 2));
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (JSON.stringify(t.read(fresh.data() ?? {})) !== JSON.stringify(original)) throw new Error('box changed while running');
        const current = (original as BoxLineItem[]) ?? [];
        if (JSON.stringify(current.map((l) => [l.slotId, l.itemId, l.quantity, l.unitCents])) !==
            JSON.stringify(box.lines.map((l) => [l.slotId, l.itemId, l.quantity, l.unitCents]))) {
          throw new Error('box differs from the audited lines');
        }
        tx.update(ref, { [t.field]: fix!.lines, lastChangeSource: SOURCE });
      });
      done.push(who);
    } catch (err) {
      skipped.push(`${who}: ${(err as Error).message}`);
      console.log(`  SKIPPED — ${(err as Error).message}`);
    }
  }

  try {
    await restoreVactree(db, catalog);
    done.push('vactree');
  } catch (err) {
    skipped.push(`vactree: ${(err as Error).message}`);
  }
  try {
    await restoreVactreeAfterStaleTab(db, catalog);
    done.push('vactree (after stale tab)');
  } catch (err) {
    skipped.push(`vactree (after stale tab): ${(err as Error).message}`);
  }

  console.log(`\n${done.length} box(es) ${apply ? 'repaired' : 'ready'}, ${skipped.length} skipped.`);
  skipped.forEach((s) => console.log(`  skipped ${s}`));
  console.log(apply ? `Backups in ${BACKUP_DIR}` : 'Dry run — nothing written.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
