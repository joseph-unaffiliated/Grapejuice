import { getFirestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';
import { metaAdsAccessToken } from './metaAdsInsights';
import { buildProgramDashboard } from './programDashboard';
import { etDate } from './program/time';

/** 7:30am ET. The Program tab reads these for the day-by-day line. */
export const scheduledProgramSnapshots = onSchedule(
  { schedule: '30 7 * * *', timeZone: 'America/New_York', secrets: [metaAdsAccessToken], memory: '1GiB', timeoutSeconds: 300 },
  async () => {
    const db = getFirestore();
    try {
      const dash = await buildProgramDashboard(db);
      const date = etDate(new Date().toISOString());
      await db.doc(`programSnapshots/${date}`).set({
        date,
        scoreboard: dash.scoreboard,
        checkout: dash.checkout,
        at: dash.generatedAt,
      });
      await db.doc('programJobs/snapshots').set({ at: dash.generatedAt, ok: true, date });
    } catch (err) {
      logger.error('programSnapshots failed', err instanceof Error ? err : new Error(String(err)));
      await db.doc('programJobs/snapshots').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 400) });
      await db.collection('programAlerts').add({ at: new Date().toISOString(), kind: 'job_error', job: 'snapshots', open: true });
    }
  }
);
