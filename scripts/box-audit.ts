/**
 * Included-items audit of every Hanukkah box (functions/src/boxAudit.ts, a copy of
 * src/services/box/includedAudit.ts).
 *
 *   npx tsx scripts/box-audit.ts [--out /tmp/box-audit.json]   report only (default)
 *   npx tsx scripts/box-audit.ts --write                       also store results in boxAudits now
 *   npx tsx scripts/box-audit.ts --apply                       customer-favor price fixes on drafts
 *
 * Covers account drafts, signed-out boxes, gift drafts and secured orders. Approved exceptions
 * live in functions/src/boxAuditExceptions.ts. --apply only lowers prices (the same fixes the app
 * makes on save), never touches orders, committed households or test boxes, backs up each doc to
 * backups/box-audit-apply-<date>/ and labels the write `lastChangeSource: box-audit-heal`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';
import { healIncludedInCustomerFavor, type BoxLineItem } from '../functions/src/boxAudit';
import { auditBoxRef, isOpenProblem, loadBoxes, type BoxRef } from '../functions/src/boxAuditLoad';

export { isTestEmail, loadBoxes, matchException, type BoxRef } from '../functions/src/boxAuditLoad';

const here = path.dirname(fileURLToPath(import.meta.url));
const HEAL_SOURCE = 'box-audit-heal';

function target(box: BoxRef): { docPath: string; field: string; read: (d: Record<string, any>) => unknown } {
  if (box.kind === 'account') return { docPath: box.path, field: 'lineItems', read: (d) => d.lineItems };
  const docPath = box.path.replace(/#gift$/, '');
  return box.kind === 'gift'
    ? { docPath, field: 'snapshot.gift.draft.lineItems', read: (d) => d.snapshot?.gift?.draft?.lineItems }
    : { docPath, field: 'snapshot.guest.lineItems', read: (d) => d.snapshot?.guest?.lineItems };
}

const lineSig = (ls: BoxLineItem[]) => JSON.stringify(ls.map((l) => [l.slotId, l.itemId, l.quantity, l.unitCents]));

async function applyHeals(db: FirebaseFirestore.Firestore, apply: boolean) {
  const { boxes, catalog } = await loadBoxes(db);
  const backupDir = path.join(here, '..', 'backups', `box-audit-apply-${new Date().toISOString().slice(0, 10)}`);
  let ready = 0;
  const skipped: string[] = [];
  for (const box of boxes) {
    if (box.test || box.kind === 'order' || box.committed) continue;
    const heal = healIncludedInCustomerFavor(box.lines, catalog, { kidKeys: box.kidKeys, adults: box.adults }, {
      wrapSelectedItemIds: box.wrapSelectedItemIds,
    });
    if (!heal.healed.length) continue;
    ready += 1;
    const who = box.email ?? box.path;
    console.log(`${who}  (${box.kind} ${box.path})`);
    heal.healed.forEach((p) => console.log(`  ${p.detail} → $0`));
    if (!apply) continue;
    const t = target(box);
    const ref = db.doc(t.docPath);
    try {
      const data = (await ref.get()).data() ?? {};
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(
        path.join(backupDir, `${t.docPath.replace(/\//g, '_')}${box.kind === 'gift' ? '_gift' : ''}.json`),
        JSON.stringify(data, null, 2)
      );
      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(ref)).data() ?? {};
        if (typeof fresh.convertedUid === 'string' && fresh.convertedUid) throw new Error('signed-out box became an account');
        if (lineSig((t.read(fresh) as BoxLineItem[]) ?? []) !== lineSig(box.lines)) throw new Error('box changed while running');
        tx.update(ref, { [t.field]: heal.lineItems, lastChangeSource: HEAL_SOURCE });
      });
    } catch (err) {
      skipped.push(`${who}: ${(err as Error).message}`);
      console.log(`  SKIPPED — ${(err as Error).message}`);
    }
  }
  console.log(`\n${ready} draft(s) ${apply ? 'fixed' : 'would be fixed'}, ${skipped.length} skipped.`);
  skipped.forEach((s) => console.log(`  skipped ${s}`));
  console.log(apply ? (ready ? `Backups in ${backupDir}` : 'Nothing to write.') : 'Dry run (add --apply to write).');
}

async function main() {
  const flag = (name: string) => process.argv.includes(name);
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx > 0 ? process.argv[outIdx + 1] : '/tmp/box-audit.json';
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  if (!db) throw new Error('No Firebase CLI login; run `firebase login`.');

  if (flag('--apply') || flag('--heal-dry-run')) {
    await applyHeals(db, flag('--apply'));
    process.exit(0);
  }

  const { boxes, catalog } = await loadBoxes(db);
  const report = boxes.map((b) => auditBoxRef(b, catalog));
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  const real = report.filter((r) => !r.test);
  const tally = new Map<string, number>();
  for (const r of real) {
    for (const p of r.problems) {
      const status = p.approved ? 'approved' : p.grandfathered ? 'grandfathered' : p.direction;
      const key = `${r.kind === 'order' ? 'order' : 'draft'} | ${status} | ${p.section}:${p.code}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  const byKind = (k: string) => real.filter((r) => r.kind === k).length;
  console.log(
    `Boxes: ${real.length} real (account ${byKind('account')}, signed-out ${byKind('guest')}, gift ${byKind('gift')}, orders ${byKind('order')}), ${report.length - real.length} test`
  );
  console.log(`Clean: ${real.filter((r) => r.problems.length === 0).length}; open: ${real.filter((r) => r.problems.some(isOpenProblem)).length}`);
  for (const [k, n] of [...tally].sort()) console.log(`${String(n).padStart(4)}  ${k}`);
  console.log(`Report: ${out}`);

  if (flag('--write')) {
    const { runBoxAuditSweep } = await import('../functions/src/boxAuditJob');
    const sweep = await runBoxAuditSweep(db as never);
    console.log(`boxAudits: ${sweep.written} written, ${sweep.deleted} removed (${sweep.open} real boxes open)`);
  }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
