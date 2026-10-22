/**
 * After the box, not during the conversion window. Enrolled pilots hear their deferred charge
 * and the three free items. They get no debrief reward (neither the $80 credit nor the January gift card option).
 * Stays quiet until Monday Dec 14 2026 (the 8th night is Dec 12) and until the `survey` piece is approved.
 */
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';
import { sendEmail } from './email';
import { appOrigin } from './guestSessions';
import { enabledStageSet } from './program/config';
import { etDate } from './program/time';

const START = '2026-12-14';

export async function runPilotSurveyReminders(db: Firestore, now = new Date()): Promise<{ sent: number }> {
  if (etDate(now.toISOString()) < START) {
    await db.doc('programJobs/pilotSurvey').set({ at: now.toISOString(), ok: true, skipped: 'before_dec_14' });
    return { sent: 0 };
  }
  const enabled = await enabledStageSet(db);
  if (!enabled.has('survey')) {
    await db.doc('programJobs/pilotSurvey').set({ at: now.toISOString(), ok: true, skipped: 'not_approved' });
    return { sent: 0 };
  }
  const [enrollments, users] = await Promise.all([
    db.collection('pilotEnrollments').get(),
    db.collection('users').select('email', 'householdId').get(),
  ]);
  const emailByHousehold = new Map<string, string>();
  for (const u of users.docs) {
    const hid = u.data().householdId;
    const email = u.data().email;
    if (typeof hid === 'string' && typeof email === 'string') emailByHousehold.set(hid, email.trim().toLowerCase());
  }
  let sent = 0;
  for (const e of enrollments.docs) {
    const status = e.data().status;
    if (status !== 'enrolled') continue;
    if (e.data().debriefCompletedAt) continue;
    const attempts = typeof e.data().surveyReminderAttempts === 'number' ? e.data().surveyReminderAttempts : 0;
    if (attempts >= 3) continue;
    const last = typeof e.data().surveyReminderAt === 'string' ? Date.parse(e.data().surveyReminderAt) : 0;
    if (last && now.getTime() - last < 5 * 86_400_000) continue;
    const email = emailByHousehold.get(e.id);
    if (!email?.includes('@')) continue;
    const deferred = typeof e.data().deferredChargeCents === 'number' ? e.data().deferredChargeCents : null;
    const statusSend = await sendEmail({
      to: email,
      template: 'program-survey',
      data: {
        cta_url: `${appOrigin()}/debrief?utm_source=lifecycle&utm_medium=email&utm_campaign=pilot_survey`,
        deferred_cents: deferred,
        credit_cents: 0,
        attempt: attempts + 1,
      },
    });
    if (statusSend !== 'sent') continue;
    sent += 1;
    await e.ref.set(
      { surveyReminderAttempts: attempts + 1, surveyReminderAt: now.toISOString() },
      { merge: true }
    );
  }
  await db.doc('programJobs/pilotSurvey').set({ at: now.toISOString(), ok: true, sent });
  return { sent };
}

export const scheduledPilotSurveyReminders = onSchedule(
  { schedule: 'every day 10:30', timeZone: 'America/New_York', memory: '512MiB' },
  async () => {
    try {
      await runPilotSurveyReminders(getFirestore());
    } catch (err) {
      logger.error('pilotSurvey failed', err instanceof Error ? err : new Error(String(err)));
      await getFirestore().doc('programJobs/pilotSurvey').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 300) });
    }
  }
);
