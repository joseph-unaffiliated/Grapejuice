/**
 * Server side of the included-items audit. boxAudits/{id} holds the latest audit of each box
 * (written by the box write triggers in ./boxHistory and by the daily sweep below); a doc is
 * only rewritten when its result changes. boxAuditRuns/{date} keeps each sweep's totals.
 * Read-only for boxes: nothing here changes a line (scripts/box-audit.ts --apply does, by hand).
 */
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';
import { withoutUndefined } from './boxHistoryDiff';
import {
  accountBoxRef,
  auditBoxRef,
  boxAuditId,
  guestBoxRefs,
  isOpenProblem,
  loadAuditCatalog,
  loadBoxes,
  type BoxAuditRecord,
  type BoxRef,
} from './boxAuditLoad';
import type { AuditCatalogRow } from './boxAudit';

export const BOX_AUDITS = 'boxAudits';
export const BOX_AUDIT_RUNS = 'boxAuditRuns';
const CATALOG_TTL_MS = 10 * 60 * 1000;

let catalogCache: { rows: AuditCatalogRow[]; at: number } | null = null;

async function catalogRows(db: Firestore): Promise<AuditCatalogRow[]> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.rows;
  const rows = await loadAuditCatalog(db);
  catalogCache = { rows, at: Date.now() };
  return rows;
}

function signature(r: BoxAuditRecord): string {
  return JSON.stringify([r.problems, r.sections, r.open, r.committed, r.email, r.test, r.kids, r.people]);
}

export type WriteResult = 'written' | 'unchanged' | 'deleted' | 'absent';

type StoredAudit = Record<string, unknown> | undefined;

/**
 * Store a box's audit (or remove it when the box is gone), skipping writes that change nothing.
 * Pass `existing` when the stored doc is already in hand (the sweep).
 */
export async function writeBoxAudit(
  db: Firestore,
  path: string,
  record: BoxAuditRecord | null,
  opts: { existing?: StoredAudit; warnNewlyOpen?: boolean } = {}
): Promise<WriteResult> {
  const ref = db.collection(BOX_AUDITS).doc(boxAuditId(path));
  const existing = 'existing' in opts ? opts.existing : (await ref.get()).data();
  if (!record) {
    if (!existing) return 'absent';
    await ref.delete();
    return 'deleted';
  }
  const sig = signature(record);
  if (existing?.signature === sig) return 'unchanged';
  const now = new Date().toISOString();
  const openSince = record.open > 0 ? (typeof existing?.openSince === 'string' ? existing.openSince : now) : null;
  await ref.set(withoutUndefined({ ...record, signature: sig, auditedAt: now, openSince }));
  if (opts.warnNewlyOpen && !record.test && record.open > 0 && !(Number(existing?.open ?? 0) > 0)) {
    logger.warn('boxAudit: box has new included-items problems', {
      path,
      kind: record.kind,
      committed: record.committed,
      problems: record.problems.filter(isOpenProblem).map((p) => `${p.section}:${p.code} ${p.detail}`),
    });
  }
  return 'written';
}

async function writeRef(db: Firestore, path: string, box: BoxRef | null): Promise<WriteResult> {
  return writeBoxAudit(db, path, box ? auditBoxRef(box, await catalogRows(db)) : null, { warnNewlyOpen: true });
}

/** After an account draft's lines change. */
export async function refreshAccountBoxAudit(
  db: Firestore,
  householdId: string,
  path: string,
  data: Record<string, unknown> | undefined
): Promise<WriteResult> {
  return writeRef(db, path, await accountBoxRef(db, householdId, path, data));
}

/** After a guestSessions doc's box or gift lines change. */
export async function refreshGuestBoxAudits(
  db: Firestore,
  path: string,
  data: Record<string, unknown> | undefined
): Promise<void> {
  const { guest, gift } = guestBoxRefs(path, data);
  await writeRef(db, path, guest);
  await writeRef(db, `${path}#gift`, gift);
}

export type BoxAuditSweep = {
  boxes: number;
  real: number;
  open: number;
  openCommitted: number;
  written: number;
  deleted: number;
  /** Real boxes whose open problems appeared since the last sweep or write. */
  newlyOpen: string[];
};

/** Audit every box, store changed results, drop audits of boxes that no longer exist. */
export async function runBoxAuditSweep(db: Firestore): Promise<BoxAuditSweep> {
  const { boxes, catalog } = await loadBoxes(db, { includeSecuredDrafts: true });
  const existing = await db.collection(BOX_AUDITS).get();
  const previous = new Map(existing.docs.map((d) => [d.id, d.data()]));
  const seen = new Set<string>();
  const result: BoxAuditSweep = { boxes: boxes.length, real: 0, open: 0, openCommitted: 0, written: 0, deleted: 0, newlyOpen: [] };

  for (const box of boxes) {
    const id = boxAuditId(box.path);
    seen.add(id);
    const record = auditBoxRef(box, catalog);
    if (!box.test) {
      result.real += 1;
      if (record.open > 0) {
        result.open += 1;
        if (record.committed) result.openCommitted += 1;
        if (!(Number(previous.get(id)?.open ?? 0) > 0)) result.newlyOpen.push(box.path);
      }
    }
    if ((await writeBoxAudit(db, box.path, record, { existing: previous.get(id) })) === 'written') result.written += 1;
  }

  for (const doc of existing.docs) {
    if (seen.has(doc.id)) continue;
    await doc.ref.delete();
    result.deleted += 1;
  }

  await db
    .collection(BOX_AUDIT_RUNS)
    .doc(new Date().toISOString().slice(0, 10))
    .set({ ...result, newlyOpen: result.newlyOpen.slice(0, 50), at: new Date().toISOString() });
  return result;
}

export const scheduledBoxAudit = onSchedule(
  { schedule: 'every day 06:00', timeZone: 'America/New_York', memory: '1GiB', timeoutSeconds: 540 },
  async () => {
    const result = await runBoxAuditSweep(getFirestore());
    logger.info('scheduledBoxAudit', result);
    if (result.newlyOpen.length) {
      logger.warn('scheduledBoxAudit: boxes with new included-items problems', { paths: result.newlyOpen });
    }
  }
);
