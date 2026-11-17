/**
 * Box problem tracking is shut off. Boxes are locked, so nothing is audited anymore.
 * The exports stay so the box triggers, the daily job, and the admin dashboard keep deploying;
 * each one now does nothing and reports no problems.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { onSchedule } from './sentry';
import type { BoxFixLogEntry } from './boxProblemFixes';

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

/** One box with included-items problems, for Admin "Box problems". */
export type DashBoxProblem = {
  id: string;
  kind: string;
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
    slotId: string | null;
    childKey: string | null;
    approved: string | null;
    grandfathered: boolean;
    likelyDonation: boolean;
    decision: 'approve' | 'donation' | 'follow-up' | 'emailed' | null;
    decisionNote: string | null;
    decidedAt: string | null;
    fixes: unknown[];
  }>;
};

export type DashBoxAuditRun = Omit<BoxAuditSweep, 'newlyOpen'> & { at: string };

/** Box problems are no longer tracked. Boxes are locked. */
export async function refreshAccountBoxAudit(
  _db: Firestore,
  _householdId: string,
  _path: string,
  _data: Record<string, unknown> | undefined
): Promise<void> {}

/** Box problems are no longer tracked. Boxes are locked. */
export async function refreshGuestBoxAudits(
  _db: Firestore,
  _path: string,
  _data: Record<string, unknown> | undefined
): Promise<void> {}

/** Box problems are no longer tracked. Boxes are locked. */
export async function runBoxAuditSweep(_db: Firestore): Promise<BoxAuditSweep> {
  return { boxes: 0, real: 0, open: 0, openCommitted: 0, written: 0, deleted: 0, newlyOpen: [] };
}

/** Box problems are no longer tracked. Boxes are locked. */
export async function loadBoxProblems(_db: Firestore): Promise<{
  boxProblems: DashBoxProblem[];
  boxAuditRun: DashBoxAuditRun | null;
  fixLog: BoxFixLogEntry[];
}> {
  return { boxProblems: [], boxAuditRun: null, fixLog: [] };
}

export const scheduledBoxAudit = onSchedule(
  { schedule: 'every day 06:00', timeZone: 'America/New_York', memory: '256MiB', timeoutSeconds: 60 },
  async () => {}
);
