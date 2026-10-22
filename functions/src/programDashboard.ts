/**
 * Admin Program tab. Read-only impact monitoring plus person lookup
 * and the explicit pilot-to-coupon override.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from './sentry';
import { isAdminToken, emailHash } from './guestSessions';
import { metaAdsAccessToken, metaStatsByAd } from './metaAdsInsights';
import { enabledStageSet } from './program/config';
import { decideNext } from './program/decideNext';
import { loadProgramPeople } from './program/loadPeople';
import { etDate } from './program/time';

const LAUNCH = '2026-10-21T04:00:00.000Z';
const TARGET = 50;
const LOCK = '2026-11-07';

function millis(v: unknown): number {
  if (typeof v === 'string') return Date.parse(v);
  if (v && typeof v === 'object' && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  if (v && typeof v === 'object' && typeof (v as { _seconds?: number })._seconds === 'number') {
    return (v as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

export async function buildProgramDashboard(db: Firestore) {
  const since = Date.parse(LAUNCH);
  const [orders, jobs, alerts, snapshots, funnels, enrollments, enabled, meta] = await Promise.all([
    db.collectionGroup('orders').select('status', 'holidayId', 'createdAt', 'promo', 'totalCents').get(),
    db.collection('programJobs').get(),
    db.collection('programAlerts').where('open', '==', true).limit(20).get().catch(() => null),
    db.collection('programSnapshots').orderBy('date', 'desc').limit(21).get().catch(() => null),
    db.collection('checkoutFunnel').limit(500).get(),
    db.collection('pilotEnrollments').select('status', 'enrolledAt').get(),
    enabledStageSet(db),
    metaStatsByAd().catch(() => null),
  ]);

  const byCode: Record<string, number> = { pilot: 0, FIFTEENOFF: 0, otherCode: 0, none: 0 };
  let commits = 0;
  let revenueCents = 0;
  for (const o of orders.docs) {
    const d = o.data();
    if (d.holidayId !== 'hanukkah-2026' || d.status !== 'committed') continue;
    if (millis(d.createdAt) < since) continue;
    commits += 1;
    revenueCents += typeof d.totalCents === 'number' ? d.totalCents : 0;
    const code = typeof d.promo?.code === 'string' ? d.promo.code : '';
    if (code === 'FIFTEENOFF') byCode.FIFTEENOFF += 1;
    else if (code) byCode.otherCode += 1;
    else byCode.none += 1;
  }
  for (const e of enrollments.docs) {
    if (e.data().status === 'enrolled' && millis(e.data().enrolledAt) >= since) byCode.pilot += 1;
  }

  const today = etDate(new Date().toISOString());
  const daysLeft = Math.max(0, Math.round((Date.parse(`${LOCK}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000));
  const elapsed = Math.max(1, 17 - daysLeft);
  const pace = Math.round((TARGET / 17) * elapsed);

  const steps = { view: 0, payment: 0, card: 0, purchased: 0 };
  const errors: Record<string, number> = {};
  for (const f of funnels.docs) {
    const s = f.data().steps;
    if (s && typeof s === 'object') {
      for (const key of Object.keys(steps)) if (key in (s as object)) steps[key as keyof typeof steps] += 1;
    }
    const err = f.data().errors;
    if (err && typeof err === 'object') {
      for (const [stage, row] of Object.entries(err as Record<string, { count?: number }>)) {
        errors[stage] = (errors[stage] ?? 0) + (typeof row?.count === 'number' ? row.count : 1);
      }
    }
  }

  let spend = 0;
  let purchases = 0;
  if (meta) {
    for (const row of Object.values(meta)) {
      spend += row.spend;
      purchases += row.purchases;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    scoreboard: {
      commits,
      target: TARGET,
      pace,
      daysLeft,
      revenueCents,
      byCode,
      blendedCpp: commits > 0 && spend > 0 ? Math.round((spend / commits) * 100) / 100 : null,
      metaSpend: Math.round(spend * 100) / 100,
      metaPurchases: purchases,
    },
    checkout: { steps, errors },
    jobs: jobs.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
    alerts: (alerts?.docs ?? []).map((d) => ({ id: d.id, ...d.data() })),
    enabledStages: [...enabled],
    snapshots: (snapshots?.docs ?? []).map((d) => d.data()),
  };
}

function requireAdmin(auth: { uid?: string; token?: Record<string, unknown> } | undefined): void {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  if (!isAdminToken(auth.token as { admin?: boolean; email?: string; email_verified?: boolean })) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
}

export function createAdminProgramDashboard(db: Firestore) {
  const dashboard = onCall({ secrets: [metaAdsAccessToken] }, async (request) => {
    requireAdmin(request.auth);
    return buildProgramDashboard(db);
  });

  const person = onCall(async (request) => {
    requireAdmin(request.auth);
    const email = typeof request.data?.email === 'string' ? request.data.email.trim().toLowerCase() : '';
    if (!email.includes('@')) throw new HttpsError('invalid-argument', 'Enter an email.');
    const key = emailHash(email);
    const [log, override, people] = await Promise.all([
      db.doc(`messageLog/${key}`).get(),
      db.doc(`programOverrides/${key}`).get(),
      loadProgramPeople(db, new Date()).catch(() => []),
    ]);
    const found = people.find((p) => p.personKey === key) ?? null;
    const next = found ? decideNext(found) : null;
    return {
      email,
      log: log.data() ?? null,
      override: override.data() ?? null,
      person: found,
      next,
    };
  });

  const override = onCall(async (request) => {
    requireAdmin(request.auth);
    const email = typeof request.data?.email === 'string' ? request.data.email.trim().toLowerCase() : '';
    const reason = typeof request.data?.reason === 'string' ? request.data.reason.trim().slice(0, 280) : '';
    if (!email.includes('@') || reason.length < 3) throw new HttpsError('invalid-argument', 'Email and a reason are required.');
    const key = emailHash(email);
    await db.doc(`programOverrides/${key}`).set({
      email,
      trackOverride: 'coupon',
      reason,
      at: new Date().toISOString(),
      by: request.auth?.token.email ?? request.auth?.uid,
    });
    return { ok: true };
  });

  return { getAdminProgramDashboard: dashboard, adminProgramPerson: person, adminProgramTrackOverride: override };
}
