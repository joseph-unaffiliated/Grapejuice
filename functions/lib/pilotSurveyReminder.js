"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledPilotSurveyReminders = void 0;
exports.runPilotSurveyReminders = runPilotSurveyReminders;
/**
 * After the box, not during the conversion window. Enrolled pilots hear their deferred charge
 * and the three free items. They get no debrief reward (neither the $80 credit nor the January gift card option).
 * Stays quiet until Monday Dec 14 2026 (the 8th night is Dec 12) and until the `survey` piece is approved.
 */
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const email_1 = require("./email");
const guestSessions_1 = require("./guestSessions");
const config_1 = require("./program/config");
const time_1 = require("./program/time");
const START = '2026-12-14';
async function runPilotSurveyReminders(db, now = new Date()) {
    if ((0, time_1.etDate)(now.toISOString()) < START) {
        await db.doc('programJobs/pilotSurvey').set({ at: now.toISOString(), ok: true, skipped: 'before_dec_14' });
        return { sent: 0 };
    }
    const enabled = await (0, config_1.enabledStageSet)(db);
    if (!enabled.has('survey')) {
        await db.doc('programJobs/pilotSurvey').set({ at: now.toISOString(), ok: true, skipped: 'not_approved' });
        return { sent: 0 };
    }
    const [enrollments, users] = await Promise.all([
        db.collection('pilotEnrollments').get(),
        db.collection('users').select('email', 'householdId').get(),
    ]);
    const emailByHousehold = new Map();
    for (const u of users.docs) {
        const hid = u.data().householdId;
        const email = u.data().email;
        if (typeof hid === 'string' && typeof email === 'string')
            emailByHousehold.set(hid, email.trim().toLowerCase());
    }
    let sent = 0;
    for (const e of enrollments.docs) {
        const status = e.data().status;
        if (status !== 'enrolled')
            continue;
        if (e.data().debriefCompletedAt)
            continue;
        const attempts = typeof e.data().surveyReminderAttempts === 'number' ? e.data().surveyReminderAttempts : 0;
        if (attempts >= 3)
            continue;
        const last = typeof e.data().surveyReminderAt === 'string' ? Date.parse(e.data().surveyReminderAt) : 0;
        if (last && now.getTime() - last < 5 * 86400000)
            continue;
        const email = emailByHousehold.get(e.id);
        if (!(email === null || email === void 0 ? void 0 : email.includes('@')))
            continue;
        const deferred = typeof e.data().deferredChargeCents === 'number' ? e.data().deferredChargeCents : null;
        const statusSend = await (0, email_1.sendEmail)({
            to: email,
            template: 'program-survey',
            data: {
                cta_url: `${(0, guestSessions_1.appOrigin)()}/debrief?utm_source=lifecycle&utm_medium=email&utm_campaign=pilot_survey`,
                deferred_cents: deferred,
                credit_cents: 0,
                attempt: attempts + 1,
            },
        });
        if (statusSend !== 'sent')
            continue;
        sent += 1;
        await e.ref.set({ surveyReminderAttempts: attempts + 1, surveyReminderAt: now.toISOString() }, { merge: true });
    }
    await db.doc('programJobs/pilotSurvey').set({ at: now.toISOString(), ok: true, sent });
    return { sent };
}
exports.scheduledPilotSurveyReminders = (0, sentry_1.onSchedule)({ schedule: 'every day 10:30', timeZone: 'America/New_York', memory: '512MiB' }, async () => {
    try {
        await runPilotSurveyReminders((0, firestore_1.getFirestore)());
    }
    catch (err) {
        logger.error('pilotSurvey failed', err instanceof Error ? err : new Error(String(err)));
        await (0, firestore_1.getFirestore)().doc('programJobs/pilotSurvey').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 300) });
    }
});
//# sourceMappingURL=pilotSurveyReminder.js.map