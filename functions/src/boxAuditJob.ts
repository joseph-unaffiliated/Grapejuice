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
  isLikelyDonation,
  isOpenProblem,
  loadAuditCatalog,
  loadBoxes,
  type BoxAuditProblem,
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
  if (!box) return writeBoxAudit(db, path, null, { warnNewlyOpen: true });
  const { exceptionsWithDecisions, loadBoxAuditDecisions } = await import('./boxAuditDecisions');
  const decisions = await loadBoxAuditDecisions(db);
  const exceptions = exceptionsWithDecisions(decisions, box.path, box.email);
  return writeBoxAudit(db, path, auditBoxRef(box, await catalogRows(db), exceptions), { warnNewlyOpen: true });
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
  const { exceptionsWithDecisions, loadBoxAuditDecisions } = await import('./boxAuditDecisions');
  const [{ boxes, catalog }, decisions] = await Promise.all([
    loadBoxes(db, { includeSecuredDrafts: true }),
    loadBoxAuditDecisions(db),
  ]);
  const existing = await db.collection(BOX_AUDITS).get();
  const previous = new Map(existing.docs.map((d) => [d.id, d.data()]));
  const seen = new Set<string>();
  const result: BoxAuditSweep = { boxes: boxes.length, real: 0, open: 0, openCommitted: 0, written: 0, deleted: 0, newlyOpen: [] };

  for (const box of boxes) {
    const id = boxAuditId(box.path);
    seen.add(id);
    const record = auditBoxRef(box, catalog, exceptionsWithDecisions(decisions, box.path, box.email));
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

/** One box with included-items problems, for Admin "Box problems". */
export type DashBoxProblem = {
  id: string;
  kind: BoxAuditRecord['kind'];
  path: string;
  householdId: string | null;
  email: string | null;
  test: boolean;
  committed: boolean;
  kids: number;
  people: number;
  open: number;
  openSince: string | null;
  auditedAt: string | null;
  problems: Array<{
    section: string;
    code: string;
    direction: string;
    detail: string;
    itemId: string | null;
    childKey: string | null;
    approved: string | null;
    grandfathered: boolean;
    likelyDonation: boolean;
    decision: 'approve' | 'donation' | 'follow-up' | 'emailed' | null;
    decisionNote: string | null;
    decidedAt: string | null;
  }>;
};

export type DashBoxAuditRun = Omit<BoxAuditSweep, 'newlyOpen'> & { at: string };

/** Every stored audit with at least one problem (open or not), plus the latest sweep's totals. */
export async function loadBoxProblems(db: Firestore): Promise<{ boxProblems: DashBoxProblem[]; boxAuditRun: DashBoxAuditRun | null }> {
  const [{ applyDecisionsToProblems, isOpenAfterDecision, loadBoxAuditDecisions }, audits, runs] = await Promise.all([
    import('./boxAuditDecisions'),
    db.collection(BOX_AUDITS).get(),
    db.collection(BOX_AUDIT_RUNS).orderBy('at', 'desc').limit(1).get(),
  ]);
  const decisions = await loadBoxAuditDecisions(db);
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const boxProblems: DashBoxProblem[] = [];
  for (const d of audits.docs) {
    const x = d.data();
    const problems = Array.isArray(x.problems) ? (x.problems as BoxAuditProblem[]) : [];
    if (!problems.length) continue;
    const path = String(x.path ?? '');
    const viewed = applyDecisionsToProblems(
      path,
      problems.map((p) => ({
        section: p.section,
        code: p.code,
        direction: p.direction,
        detail: p.detail,
        itemId: p.itemId ?? null,
        childKey: p.childKey ?? null,
        approved: p.approved ?? null,
        grandfathered: p.grandfathered === true,
        likelyDonation: isLikelyDonation(p),
      })),
      decisions
    );
    const open = viewed.filter(isOpenAfterDecision).length;
    boxProblems.push({
      id: d.id,
      kind: x.kind,
      path,
      householdId: path.match(/^households\/([^/]+)\//)?.[1] ?? null,
      email: text(x.email),
      test: x.test === true,
      committed: x.committed === true,
      kids: Number(x.kids ?? 0),
      people: Number(x.people ?? 0),
      open,
      openSince: text(x.openSince),
      auditedAt: text(x.auditedAt),
      problems: viewed,
    });
  }
  const run = runs.docs[0]?.data();
  const boxAuditRun = run
    ? {
        boxes: Number(run.boxes ?? 0),
        real: Number(run.real ?? 0),
        open: Number(run.open ?? 0),
        openCommitted: Number(run.openCommitted ?? 0),
        written: Number(run.written ?? 0),
        deleted: Number(run.deleted ?? 0),
        at: String(run.at ?? ''),
      }
    : null;
  return { boxProblems, boxAuditRun };
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
