/**
 * Restore approved on 2026-10-15: the load-time wood-dreidel repair (fixed in ec9e012) refilled
 * dreidels two customers had lowered on purpose. Each draft's wood line goes back to the exact
 * line from just before that auto-repair, so the lowered units read as donated again.
 *
 * Drafts only. A draft whose wood line changed since the auto-repair is skipped. Writes are
 * transactional, backed up as JSON first, and carry lastChangeSource so box history records them.
 * updatedBy is never touched.
 *
 *   npx tsx scripts/dreidel-donation-restore-2026-10-15.ts [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';
import type { BoxLineItem } from '../src/types/pilot';

const SOURCE = 'script:dreidel-donation-restore-2026-10-15';
const HOUSEHOLDS = ['UNIFPanrFUupUM73NPk4', 'zVFngNCgop3q3EruwylW'];
const here = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(here, '../../backups/dreidel-donation-restore-2026-10-15');
const apply = process.argv.includes('--apply');

type HistoryChange = { type: string; slotId?: string; fromQty?: number; toQty?: number };
type HistoryEntry = { at?: string; source?: string; changes?: HistoryChange[]; before?: BoxLineItem[] };

const sameLine = (a: BoxLineItem | undefined, b: BoxLineItem | undefined) =>
  !!a && !!b && a.itemId === b.itemId && a.quantity === b.quantity && (a.unitCents ?? 0) === (b.unitCents ?? 0);

async function main() {
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  if (!db) throw new Error('No Firebase CLI login; run `firebase login`.');
  let done = 0;

  for (const hh of HOUSEHOLDS) {
    const ref = db.doc(`households/${hh}/boxDrafts/hanukkah-2026`);
    const user = await db.collection('users').where('householdId', '==', hh).limit(1).get();
    const who = user.docs[0]?.get('email') ?? hh;
    try {
      const orders = await db.collection('orders').where('householdId', '==', hh).get();
      if (!orders.empty) throw new Error('household has an order');
      const hist = await ref.collection('history').get();
      const repair = hist.docs
        .map((d) => d.data() as HistoryEntry)
        .filter((v) => v.source === 'auto-repair')
        .find((v) => (v.changes ?? []).some((c) => c.type === 'quantity' && c.slotId === 'wood-dreidel' && (c.toQty ?? 0) > (c.fromQty ?? 0)));
      if (!repair) throw new Error('no dreidel auto-repair in history');
      const wanted = (repair.before ?? []).find((l) => l.slotId === 'wood-dreidel');
      if (!wanted || !((wanted.includedQty ?? 0) > wanted.quantity)) throw new Error('pre-repair line was not a donation');

      const snap = await ref.get();
      const data = snap.data() ?? {};
      const lines = (data.lineItems ?? []) as BoxLineItem[];
      const current = lines.find((l) => l.slotId === 'wood-dreidel');
      const change = repair.changes!.find((c) => c.slotId === 'wood-dreidel')!;
      if (!current || current.itemId !== wanted.itemId || current.quantity !== change.toQty) {
        throw new Error('wood line changed since the auto-repair');
      }
      console.log(`${who}  (${ref.path})\n  ${wanted.label ?? wanted.itemId}: ${current.quantity} → ${wanted.quantity} (included ${wanted.includedQty}, repaired at ${repair.at})`);
      if (!apply) {
        done++;
        continue;
      }
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.writeFileSync(path.join(BACKUP_DIR, `${ref.path.replace(/\//g, '_')}.json`), JSON.stringify(data, null, 2));
      await db.runTransaction(async (tx) => {
        const fresh = ((await tx.get(ref)).data()?.lineItems ?? []) as BoxLineItem[];
        if (JSON.stringify(fresh) !== JSON.stringify(lines)) throw new Error('box changed while running');
        const next = fresh.map((l) => (l.slotId === 'wood-dreidel' && sameLine(l, current) ? { ...wanted } : l));
        tx.update(ref, { lineItems: next, lastChangeSource: SOURCE });
      });
      done++;
    } catch (err) {
      console.log(`${who}: SKIPPED — ${(err as Error).message}`);
    }
  }

  console.log(`\n${done} box(es) ${apply ? 'restored' : 'ready'}.`);
  console.log(apply ? `Backups in ${BACKUP_DIR}` : 'Dry run — nothing written.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
