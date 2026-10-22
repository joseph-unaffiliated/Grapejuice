"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledProgramSnapshots = void 0;
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const metaAdsInsights_1 = require("./metaAdsInsights");
const programDashboard_1 = require("./programDashboard");
const time_1 = require("./program/time");
/** 7:30am ET. The Program tab reads these for the day-by-day line. */
exports.scheduledProgramSnapshots = (0, sentry_1.onSchedule)({ schedule: '30 7 * * *', timeZone: 'America/New_York', secrets: [metaAdsInsights_1.metaAdsAccessToken], memory: '1GiB', timeoutSeconds: 300 }, async () => {
    const db = (0, firestore_1.getFirestore)();
    try {
        const dash = await (0, programDashboard_1.buildProgramDashboard)(db);
        const date = (0, time_1.etDate)(new Date().toISOString());
        await db.doc(`programSnapshots/${date}`).set({
            date,
            scoreboard: dash.scoreboard,
            checkout: dash.checkout,
            at: dash.generatedAt,
        });
        await db.doc('programJobs/snapshots').set({ at: dash.generatedAt, ok: true, date });
    }
    catch (err) {
        logger.error('programSnapshots failed', err instanceof Error ? err : new Error(String(err)));
        await db.doc('programJobs/snapshots').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 400) });
        await db.collection('programAlerts').add({ at: new Date().toISOString(), kind: 'job_error', job: 'snapshots', open: true });
    }
});
//# sourceMappingURL=programSnapshots.js.map