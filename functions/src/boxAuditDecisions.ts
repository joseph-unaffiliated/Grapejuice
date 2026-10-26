/**
 * Admin decisions on included-items audit problems. Stored in Firestore so the Box
 * problems review sheet can approve, mark a donation, or flag follow-up without a deploy.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from './sentry';
import { isAdminToken } from './guestSessions';
import { BOX_AUDIT_EXCEPTIONS, type BoxAuditException } from './boxAuditExceptions';
import { boxAuditId, isLikelyDonation, type BoxAuditProblem } from './boxAuditLoad';

export const BOX_AUDIT_DECISIONS = 'boxAuditDecisions';
const BOX_AUDITS = 'boxAudits';

export type BoxAuditDecisionKind = 'approve' | 'donation' | 'follow-up' | 'emailed';

export type BoxAuditDecision = {
  id: string;
  path: string;
  email: string | null;
  section: string;
  code: string;
  itemId: string | null;
  childKey: string | null;
  detail: string;
  decision: BoxAuditDecisionKind;
  note: string;
  decidedAt: string;
  decidedBy: string;
};

export type DecideBoxAuditProblemRequest = {
  path: string;
  email?: string | null;
  section: string;
  code: string;
  itemId?: string | null;
  childKey?: string | null;
  detail?: string;
  /** Pass null to clear a prior decision. */
  decision: BoxAuditDecisionKind | null;
  note?: string;
};

function problemKey(p: {
  path: string;
  section: string;
  code: string;
  itemId?: string | null;
  childKey?: string | null;
}): string {
  return [p.path, p.section, p.code, p.itemId ?? '', p.childKey ?? ''].join('|');
}

export function decisionDocId(p: {
  path: string;
  section: string;
  code: string;
  itemId?: string | null;
  childKey?: string | null;
}): string {
  return problemKey(p)
    .replace(/[/#]/g, '__')
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .slice(0, 700);
}

function matchesDecision(
  d: Pick<BoxAuditDecision, 'path' | 'section' | 'code' | 'itemId' | 'childKey'>,
  path: string,
  p: { section: string; code: string; itemId?: string | null; childKey?: string | null }
): boolean {
  return (
    d.path === path &&
    d.section === p.section &&
    d.code === p.code &&
    (d.itemId ?? null) === (p.itemId ?? null) &&
    (d.childKey ?? null) === (p.childKey ?? null)
  );
}

/** Load every live admin decision (small collection). */
export async function loadBoxAuditDecisions(
  db = getFirestore()
): Promise<BoxAuditDecision[]> {
  const snap = await db.collection(BOX_AUDIT_DECISIONS).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      path: String(x.path ?? ''),
      email: typeof x.email === 'string' ? x.email : null,
      section: String(x.section ?? ''),
      code: String(x.code ?? ''),
      itemId: typeof x.itemId === 'string' ? x.itemId : null,
      childKey: typeof x.childKey === 'string' ? x.childKey : null,
      detail: String(x.detail ?? ''),
      decision: x.decision as BoxAuditDecisionKind,
      note: String(x.note ?? ''),
      decidedAt: String(x.decidedAt ?? ''),
      decidedBy: String(x.decidedBy ?? ''),
    };
  });
}

/** Static exceptions plus approve/donation decisions, for auditBoxRef matching. */
export function exceptionsWithDecisions(
  decisions: BoxAuditDecision[],
  path: string,
  email: string | null
): BoxAuditException[] {
  const live: BoxAuditException[] = decisions
    .filter((d) => d.path === path && (d.decision === 'approve' || d.decision === 'donation'))
    .map((d) => ({
      email: d.email || email || '',
      section: d.section,
      code: d.code,
      itemId: d.itemId ?? undefined,
      note:
        d.decision === 'donation'
          ? d.note || 'Donation (admin)'
          : d.note || `Approved (${d.decidedAt.slice(0, 10) || 'admin'})`,
    }));
  return [...BOX_AUDIT_EXCEPTIONS, ...live];
}

export type ProblemDecisionView = {
  decision: BoxAuditDecisionKind | null;
  note: string | null;
  decidedAt: string | null;
};

/** Attach the admin decision (if any) onto each problem for the dashboard. */
export function applyDecisionsToProblems(
  path: string,
  problems: Array<{
    section: string;
    code: string;
    direction: string;
    detail: string;
    itemId: string | null;
    slotId?: string | null;
    childKey: string | null;
    approved: string | null;
    grandfathered: boolean;
    likelyDonation: boolean;
  }>,
  decisions: BoxAuditDecision[]
): Array<
  (typeof problems)[number] & {
    decision: BoxAuditDecisionKind | null;
    decisionNote: string | null;
    decidedAt: string | null;
  }
> {
  return problems.map((p) => {
    const d = decisions.find((x) => matchesDecision(x, path, p));
    let approved = p.approved;
    let likelyDonation = p.likelyDonation;
    if (d?.decision === 'approve' && !approved) approved = d.note || 'Approved (admin)';
    if (d?.decision === 'donation') {
      likelyDonation = true;
      if (!approved) approved = d.note || 'Donation (admin)';
    }
    return {
      ...p,
      approved,
      likelyDonation,
      decision: d?.decision ?? null,
      decisionNote: d?.note ?? null,
      decidedAt: d?.decidedAt ?? null,
    };
  });
}

/** A problem still needs a look after applying static exceptions and live decisions. */
export function isOpenAfterDecision(p: {
  approved: string | null;
  grandfathered: boolean;
  likelyDonation: boolean;
  decision: BoxAuditDecisionKind | null;
}): boolean {
  if (p.grandfathered) return false;
  if (p.decision === 'approve' || p.decision === 'donation') return false;
  if (p.approved) return false;
  if (p.likelyDonation) return false;
  return true;
}

/** Recompute open count on the stored audit after a decision changes. */
async function refreshStoredOpen(db: FirebaseFirestore.Firestore, path: string, decisions: BoxAuditDecision[]) {
  const id = boxAuditId(path);
  const ref = db.collection(BOX_AUDITS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  const x = snap.data()!;
  const raw = (Array.isArray(x.problems) ? x.problems : []) as BoxAuditProblem[];
  const withDecisions = applyDecisionsToProblems(
    path,
    raw.map((p) => ({
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
  const openCount = withDecisions.filter(isOpenAfterDecision).length;
  await ref.set({ open: openCount, ok: openCount === 0 }, { merge: true });
  return openCount;
}

export async function writeBoxAuditDecision(
  db: FirebaseFirestore.Firestore,
  decidedBy: string,
  body: DecideBoxAuditProblemRequest
): Promise<BoxAuditDecision | null> {
  const path = typeof body.path === 'string' ? body.path.trim() : '';
  const section = typeof body.section === 'string' ? body.section.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!path || !section || !code) throw new HttpsError('invalid-argument', 'path, section and code are required.');

  const id = decisionDocId({
    path,
    section,
    code,
    itemId: body.itemId,
    childKey: body.childKey,
  });
  const ref = db.collection(BOX_AUDIT_DECISIONS).doc(id);

  if (body.decision === null) {
    await ref.delete().catch(() => undefined);
    const decisions = await loadBoxAuditDecisions(db);
    await refreshStoredOpen(db, path, decisions);
    return null;
  }

  if (!['approve', 'donation', 'follow-up', 'emailed'].includes(body.decision)) {
    throw new HttpsError('invalid-argument', 'Unknown decision.');
  }

  const noteDefault: Record<BoxAuditDecisionKind, string> = {
    approve: 'Approved as-is (admin)',
    donation: 'Donation (admin)',
    'follow-up': 'Needs a fix',
    emailed: 'Customer emailed',
  };
  const decision: BoxAuditDecision = {
    id,
    path,
    email: typeof body.email === 'string' ? body.email : null,
    section,
    code,
    itemId: typeof body.itemId === 'string' ? body.itemId : null,
    childKey: typeof body.childKey === 'string' ? body.childKey : null,
    detail: typeof body.detail === 'string' ? body.detail : '',
    decision: body.decision,
    note: (typeof body.note === 'string' && body.note.trim()) || noteDefault[body.decision],
    decidedAt: new Date().toISOString(),
    decidedBy,
  };
  await ref.set(decision);
  const decisions = await loadBoxAuditDecisions(db);
  await refreshStoredOpen(db, path, decisions);
  return decision;
}

export const decideBoxAuditProblem = onCall(async (request): Promise<{ ok: true; decision: BoxAuditDecision | null }> => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!isAdminToken(request.auth.token)) throw new HttpsError('permission-denied', 'Admin only.');
  const decision = await writeBoxAuditDecision(getFirestore(), request.auth.uid, (request.data ?? {}) as DecideBoxAuditProblemRequest);
  return { ok: true, decision };
});
