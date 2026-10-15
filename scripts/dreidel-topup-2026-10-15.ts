/**
 * Dreidel top-up approved on 2026-10-15: boxes built under the old one-per-kid rule get free wood
 * dreidels up to one per person (kids + adults). Drafts only (account, signed-out, gift); secured
 * orders are never touched.
 *
 * Only boxes whose free wood dreidel line was never lowered by the customer (includedQty is not
 * above quantity) are topped up. A box where dreidels were donated, or that has no wood dreidel
 * line (adult-only boxes, removed dreidels), is left alone; My Box shows the empty slot instead.
 *
 * Writes are transactional against the lines read, backed up as JSON first, and carry
 * lastChangeSource so box history records them. updatedBy is never touched.
 *
 *   npx tsx scripts/dreidel-topup-2026-10-15.ts [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';
import { loadBoxes, type BoxRef } from './box-audit';
import { auditIncluded, auditSlotBase, freeDreidelUnits, topUpDreidelLines } from '../src/services/box/includedAudit';
import type { BoxLineItem } from '../src/types/pilot';

const SOURCE = 'script:dreidel-topup-2026-10-15';
const WOOD = { id: 'classic-wooden-dreidel', name: 'Classic Wooden Dreidel' };
const DEFAULT_ADULTS = 2;
const here = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(here, '../../backups/dreidel-topup-2026-10-15');
const apply = process.argv.includes('--apply');

function planTopUp(box: BoxRef): { lines: BoxLineItem[]; change: string } | null {
  if (!box.kidKeys.length) return null;
  const wood = box.lines.find(
    (l) => l.itemId === WOOD.id && auditSlotBase(l.slotId) === 'wood-dreidel' && (l.unitCents ?? 0) === 0 && !/::x$/i.test(l.slotId)
  );
  if (!wood) return null;
  if ((wood.includedQty ?? wood.quantity) > wood.quantity) return null;
  const people = box.kidKeys.length + (box.adults != null && box.adults >= 0 ? box.adults : DEFAULT_ADULTS);
  const before = freeDreidelUnits(box.lines);
  if (before >= people) return null;
  const lines = topUpDreidelLines(box.lines, people, { id: WOOD.id, name: wood.label ?? WOOD.name });
  const after = auditIncluded(lines, [], { kidKeys: box.kidKeys, adults: box.adults });
  if (after.sections.dreidel.filled !== after.sections.dreidel.allowed) throw new Error('top-up did not reach one per person');
  return { lines, change: `wood dreidels ${before} → ${freeDreidelUnits(lines)} free (${people} people)` };
}

function target(box: BoxRef): { docPath: string; field: string; read: (d: Record<string, any>) => unknown } {
  if (box.kind === 'account') return { docPath: box.path, field: 'lineItems', read: (d) => d.lineItems };
  const docPath = box.path.replace(/#gift$/, '');
  return box.kind === 'gift'
    ? { docPath, field: 'snapshot.gift.draft.lineItems', read: (d) => d.snapshot?.gift?.draft?.lineItems }
    : { docPath, field: 'snapshot.guest.lineItems', read: (d) => d.snapshot?.guest?.lineItems };
}

async function main() {
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  if (!db) throw new Error('No Firebase CLI login; run `firebase login`.');
  const { boxes } = await loadBoxes(db);
  const drafts = boxes.filter((b) => !b.test && b.kind !== 'order');
  const done: string[] = [];
  const skipped: string[] = [];

  for (const box of drafts) {
    const who = box.email ?? box.path;
    let plan: ReturnType<typeof planTopUp>;
    try {
      plan = planTopUp(box);
    } catch (err) {
      skipped.push(`${who}: ${(err as Error).message}`);
      continue;
    }
    if (!plan) continue;
    console.log(`${who}  (${box.kind} ${box.path})\n  ${plan.change}`);
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
        tx.update(ref, { [t.field]: plan!.lines, lastChangeSource: SOURCE });
      });
      done.push(who);
    } catch (err) {
      skipped.push(`${who}: ${(err as Error).message}`);
      console.log(`  SKIPPED — ${(err as Error).message}`);
    }
  }

  console.log(`\n${done.length} box(es) ${apply ? 'topped up' : 'ready'}, ${skipped.length} skipped.`);
  skipped.forEach((s) => console.log(`  skipped ${s}`));
  console.log(apply ? `Backups in ${BACKUP_DIR}` : 'Dry run — nothing written.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
