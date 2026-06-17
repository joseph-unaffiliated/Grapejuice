"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDebriefReminderBatch = runDebriefReminderBatch;
const logger = require("firebase-functions/logger");
const email_1 = require("./email");
const sms_1 = require("./sms");
const HOLIDAY_ID = 'hanukkah-2026';
const APP_BASE = (_a = process.env.PILOT_APP_BASE_URL) !== null && _a !== void 0 ? _a : 'https://app.grapejuice.co';
const MAX_ATTEMPTS = 3;
/** Minimum days between reminder attempts 1→2 and 2→3. */
const ATTEMPT_GAP_DAYS = 7;
const AMAZON_FALLBACK_GAP_DAYS = 14;
function daysSince(iso) {
    return (Date.now() - new Date(iso).getTime()) / 86400000;
}
/** Post-Hanukkah debrief outreach — up to 2 email (+ optional SMS) attempts per user. */
async function runDebriefReminderBatch(db) {
    var _a, _b;
    const usersSnap = await db.collection('users').where('debriefReminderEligible', '==', true).get();
    let sent = 0;
    let skipped = 0;
    for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const user = userDoc.data();
        const attempts = (_a = user.debriefReminderAttempts) !== null && _a !== void 0 ? _a : 0;
        if (attempts >= MAX_ATTEMPTS) {
            skipped += 1;
            continue;
        }
        const reflectionSnap = await db.doc(`users/${uid}/reflection/${HOLIDAY_ID}`).get();
        if (reflectionSnap.exists) {
            await userDoc.ref.update({
                debriefReminderEligible: false,
                updatedAt: new Date().toISOString(),
            });
            skipped += 1;
            continue;
        }
        if (user.debriefReminderLastSentAt) {
            const gap = attempts === 2 ? AMAZON_FALLBACK_GAP_DAYS : ATTEMPT_GAP_DAYS;
            if (daysSince(user.debriefReminderLastSentAt) < gap) {
                skipped += 1;
                continue;
            }
        }
        const attempt = (attempts + 1);
        const claimUrl = `${APP_BASE}/?preview=debrief`;
        const email = (_b = user.email) === null || _b === void 0 ? void 0 : _b.trim();
        if (!(email === null || email === void 0 ? void 0 : email.includes('@'))) {
            skipped += 1;
            continue;
        }
        try {
            if (attempt === 3) {
                await (0, email_1.sendDebriefAmazonFallbackEmail)({ to: email, claimUrl });
            }
            else {
                await (0, email_1.sendDebriefReminderEmail)({ to: email, attempt, claimUrl });
                if (user.smsOptIn && user.phone) {
                    await (0, sms_1.sendDebriefReminderSms)({ to: user.phone, attempt, claimUrl }).catch((err) => logger.warn('Debrief SMS failed', { uid, err }));
                }
            }
            await userDoc.ref.update(Object.assign(Object.assign({ debriefReminderAttempts: attempt, debriefReminderLastSentAt: new Date().toISOString() }, (attempt >= MAX_ATTEMPTS ? { debriefReminderEligible: false } : {})), { updatedAt: new Date().toISOString() }));
            sent += 1;
        }
        catch (err) {
            logger.error('Debrief reminder failed', { uid, err });
            skipped += 1;
        }
    }
    logger.info('Debrief reminder batch complete', { sent, skipped });
    return { sent, skipped };
}
//# sourceMappingURL=debriefReminders.js.map