/**
 * The latke kit and the sufganiyot kit are products. latke-mix and sufganiyot-mix are the two
 * spots in the box. Four drafts had a line sitting on the product id as if it were a third spot.
 *
 *   npx tsx scripts/food-slot-merge-2026-10-22.ts
 *   npx tsx scripts/food-slot-merge-2026-10-22.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const SOURCE = 'script:food-slot-merge-2026-10-22';
const here = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(here, '../backups/food-slot-merge-2026-10-22');

type Move = {
  path: string;
  email: string;
  from: { slotId: string; itemId: string; unitCents: number };
  to: { slotId: string; unitCents?: number; includedQty?: number };
};

const MOVES: Move[] = [
  {
    path: 'households/D9ahYpaKBdANJ0iF2OMm/boxDrafts/hanukkah-2026',
    email: 'anduiza.family@outlook.com',
    from: { slotId: 'sufganiyot-kit', itemId: 'sufganiyot-kit', unitCents: 0 },
    to: { slotId: 'sufganiyot-mix' },
  },
  {
    path: 'households/R73bdxldiA3CLicJ3mmc/boxDrafts/hanukkah-2026',
    email: 'annabanana124@gmail.com',
    from: { slotId: 'latke-kit', itemId: 'latke-kit', unitCents: 0 },
    to: { slotId: 'sufganiyot-mix' },
  },
  {
    path: 'households/czYWsQCeGY1iuEGZbnAp/boxDrafts/hanukkah-2026',
    email: 'mela1130@aol.com',
    from: { slotId: 'sufganiyot-kit', itemId: 'sufganiyot-kit', unitCents: 500 },
    to: { slotId: 'addon-sufganiyot-kit', includedQty: 0 },
  },
  {
    path: 'households/zXyeIPyKqZwi0sgWQjb8/boxDrafts/hanukkah-2026',
    email: 'tali.brownstein@gmail.com',
    from: { slotId: 'sufganiyot-kit', itemId: 'sufganiyot-kit', unitCents: 0 },
    to: { slotId: 'addon-sufganiyot-kit', unitCents: 500, includedQty: 0 },
  },
];

type Line = { slotId: string; itemId: string; unitCents?: number; includedQty?: number; quantity?: number };

function applyMove(lines: Line[], move: Move): Line[] | string {
  const hits = lines.filter(
    (li) => li.slotId === move.from.slotId && li.itemId === move.from.itemId && (li.unitCents ?? 0) === move.from.unitCents
  );
  if (hits.length !== 1) return `expected one ${move.from.slotId} line, found ${hits.length}`;
  if (lines.some((li) => li.slotId === move.to.slotId)) return `${move.to.slotId} is already taken`;
  return lines.map((li) =>
    li === hits[0]
      ? {
          ...li,
          slotId: move.to.slotId,
          ...(move.to.unitCents != null ? { unitCents: move.to.unitCents } : {}),
          ...(move.to.includedQty != null ? { includedQty: move.to.includedQty } : {}),
        }
      : li
  );
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  if (!db) throw new Error('no firebase login');
  for (const move of MOVES) {
    const ref = db.doc(move.path);
    const snap = await ref.get();
    const data = snap.data() ?? {};
    const lines = (data.lineItems ?? []) as Line[];
    const next = applyMove(lines, move);
    if (typeof next === 'string') {
      console.log(`SKIP ${move.email}: ${next}`);
      continue;
    }
    const before = lines.find((li) => li.slotId === move.from.slotId);
    const after = next.find((li) => li.slotId === move.to.slotId);
    console.log(
      `${apply ? 'WRITE' : 'DRY'} ${move.email}: ${before?.slotId} $${((before?.unitCents ?? 0) / 100).toFixed(2)} → ${after?.slotId} $${((after?.unitCents ?? 0) / 100).toFixed(2)}`
    );
    if (!apply) continue;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(path.join(BACKUP_DIR, `${move.path.replace(/\//g, '_')}.json`), JSON.stringify(data, null, 2));
    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(ref)).data() ?? {};
      const freshLines = (fresh.lineItems ?? []) as Line[];
      const planned = applyMove(freshLines, move);
      if (typeof planned === 'string') throw new Error(planned);
      tx.update(ref, {
        lineItems: planned,
        updatedAt: new Date().toISOString(),
        lastChangeSource: SOURCE,
      });
    });
  }
  console.log(apply ? 'Applied.' : 'Dry run. Re-run with --apply to write.');
}

main();
