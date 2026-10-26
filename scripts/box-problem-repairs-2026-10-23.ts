/**
 * Three open box problems, decided 2026-10-23:
 * - jhillman: one Lego menorah. Drop the extra $15 copy added a second after the swap.
 * - meagan: the second wrapping sheet she added at $5, which a repair then zeroed.
 * - michelle: Crispy at the $10 member price. Her one gift slot is already filled.
 *
 *   npx tsx scripts/box-problem-repairs-2026-10-23.ts
 *   npx tsx scripts/box-problem-repairs-2026-10-23.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const SOURCE = 'script:box-problem-repairs-2026-10-23';
const here = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(here, '../backups/box-problem-repairs-2026-10-23');

type Line = {
  slotId: string;
  itemId: string;
  unitCents?: number;
  includedQty?: number;
  quantity?: number;
};

type Repair = {
  path: string;
  email: string;
  apply: (lines: Line[]) => Line[] | string;
  describe: (before: Line[], after: Line[]) => string;
};

const REPAIRS: Repair[] = [
  {
    path: 'households/hthTNsLDjy7fQ3M5gSzk/boxDrafts/hanukkah-2026',
    email: 'jhillman1014@gmail.com',
    apply(lines) {
      const extra = lines.filter((li) => li.slotId === 'candles::x' && li.itemId === 'lego-menorah');
      const kept = lines.filter((li) => li.slotId === 'candles' && li.itemId === 'lego-menorah');
      if (extra.length !== 1) return `expected one candles::x lego, found ${extra.length}`;
      if (kept.length !== 1) return `expected the swapped menorah to remain, found ${kept.length}`;
      return lines.filter((li) => li !== extra[0]);
    },
    describe: (_before, after) => {
      const left = after.filter((li) => li.itemId === 'lego-menorah');
      return `one menorah on ${left.map((li) => li.slotId).join(', ')}`;
    },
  },
  {
    path: 'households/QPauFyxwDrgifpwZUlD9/boxDrafts/hanukkah-2026',
    email: 'stull.meagan@gmail.com',
    apply(lines) {
      const hits = lines.filter((li) => li.slotId === 'wrapping-paper::x' && li.itemId === 'wrapping-paper');
      if (hits.length !== 1) return `expected one extra wrapping sheet, found ${hits.length}`;
      return lines.map((li) => (li === hits[0] ? { ...li, unitCents: 500, includedQty: 0 } : li));
    },
    describe: () => 'second wrapping sheet $5',
  },
  {
    path: 'households/sQFBy21KEeydo3Sl33Wf/boxDrafts/hanukkah-2026',
    email: 'michellebatko@gmail.com',
    apply(lines) {
      const gifts = lines.filter((li) => li.slotId.startsWith('gift-') && (li.unitCents ?? 0) === 0);
      const hits = lines.filter((li) => li.slotId === 'decor' && li.itemId === 'crispy-the-latke-stuffie');
      if (gifts.length !== 1) return `expected one filled gift slot, found ${gifts.length}`;
      if (hits.length !== 1) return `expected one stuffie, found ${hits.length}`;
      return lines.map((li) => (li === hits[0] ? { ...li, unitCents: 1000, includedQty: 0 } : li));
    },
    describe: () => 'Crispy $10',
  },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  if (!db) throw new Error('no firebase login');
  for (const repair of REPAIRS) {
    const ref = db.doc(repair.path);
    const snap = await ref.get();
    const data = snap.data() ?? {};
    const lines = (data.lineItems ?? []) as Line[];
    const next = repair.apply(lines);
    if (typeof next === 'string') {
      console.log(`SKIP ${repair.email}: ${next}`);
      continue;
    }
    console.log(`${apply ? 'WRITE' : 'DRY'} ${repair.email}: ${repair.describe(lines, next)}`);
    if (!apply) continue;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(path.join(BACKUP_DIR, `${repair.path.replace(/\//g, '_')}.json`), JSON.stringify(data, null, 2));
    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(ref)).data() ?? {};
      const freshLines = (fresh.lineItems ?? []) as Line[];
      const planned = repair.apply(freshLines);
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
