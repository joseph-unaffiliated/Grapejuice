"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.firstDebriefSendDayIso = firstDebriefSendDayIso;
exports.isAfterHanukkahSeason = isAfterHanukkahSeason;
exports.runDebriefReminderBatch = runDebriefReminderBatch;
const logger = require("./logger");
const email_1 = require("./email");
const sms_1 = require("./sms");
const debriefReward_1 = require("./debriefReward");
const HOLIDAY_ID = 'hanukkah-2026';
const APP_BASE = (_a = process.env.PILOT_APP_BASE_URL) !== null && _a !== void 0 ? _a : 'https://app.grapejuice.co';
/** December credit reminders. */
const DECEMBER_ATTEMPTS = 2;
/** January choice email plus a last call. */
const MAX_ATTEMPTS = 4;
const LAST_CALL_FROM = '2027-01-25';
/** Minimum days between December reminders. */
const ATTEMPT_GAP_DAYS = 7;
/** Keeps a Dec 31 reminder and the Jan 1 email from landing back to back. */
const MIN_GAP_DAYS = 2;
const HANUKKAH_NIGHTS = 8;
/** Fallback when config/hanukkah-2026.startsOn is missing (matches client). */
const HANUKKAH_2026_START = '2026-12-05';
/** Pilot families are Northeast US — season gate uses Eastern calendar days. */
const SEASON_TZ = 'America/New_York';
function daysSince(iso) {
    return (Date.now() - new Date(iso).getTime()) / 86400000;
}
function calendarDayInTz(date, timeZone) {
    return date.toLocaleDateString('en-CA', { timeZone });
}
/**
 * First calendar day (Eastern) after the last night of Hanukkah.
 * Nights are startsOn … startsOn + 7; outreach starts the day after that.
 */
function firstDebriefSendDayIso(startsOn) {
    const raw = (startsOn !== null && startsOn !== void 0 ? startsOn : '').trim() || HANUKKAH_2026_START;
    const [y, m, d] = raw.split('-').map(Number);
    if (!y || !m || !d) {
        const [fy, fm, fd] = HANUKKAH_2026_START.split('-').map(Number);
        const fallback = new Date(Date.UTC(fy, fm - 1, fd + HANUKKAH_NIGHTS));
        return fallback.toISOString().slice(0, 10);
    }
    // Last night = start + (NIGHTS - 1); first send day = start + NIGHTS.
    const firstSend = new Date(Date.UTC(y, m - 1, d + HANUKKAH_NIGHTS));
    return firstSend.toISOString().slice(0, 10);
}
/** True once the Eastern calendar day is strictly after Hanukkah’s last night. */
function isAfterHanukkahSeason(startsOn, now = new Date()) {
    const todayEt = calendarDayInTz(now, SEASON_TZ);
    return todayEt >= firstDebriefSendDayIso(startsOn);
}
async function loadHanukkahStartsOn(db) {
    var _a;
    const snap = await db.doc(`config/${HOLIDAY_ID}`).get();
    const startsOn = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.startsOn;
    return typeof startsOn === 'string' && startsOn.trim() ? startsOn.trim() : null;
}
/**
 * Post-Hanukkah debrief outreach. December: attempts 1–2 offer the $80 credit for a completed debrief.
 * January: attempt 3 on Jan 1 and a last call (attempt 4) from Jan 25 offer the credit or a $20 gift card.
 * Pilot participants are skipped; they have their own survey reminder and no debrief reward.
 */
async function runDebriefReminderBatch(db) {
    var _a, _b, _c;
    const startsOn = await loadHanukkahStartsOn(db);
    const today = (0, debriefReward_1.etDay)();
    const options = (0, debriefReward_1.debriefRewardOptions)(today);
    if (!options.length) {
        logger.info('Debrief reminder batch skipped — reward window closed', { todayEt: today });
        return { sent: 0, skipped: 0 };
    }
    const january = options.includes('gift_card');
    if (!isAfterHanukkahSeason(startsOn)) {
        const firstSendDay = firstDebriefSendDayIso(startsOn);
        logger.info('Debrief reminder batch skipped — Hanukkah season not over yet', {
            startsOn: startsOn !== null && startsOn !== void 0 ? startsOn : HANUKKAH_2026_START,
            firstSendDay,
            todayEt: calendarDayInTz(new Date(), SEASON_TZ),
        });
        return { sent: 0, skipped: 0 };
    }
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
        if ((0, debriefReward_1.isDebriefComplete)(reflectionSnap.data())) {
            await userDoc.ref.update({
                debriefReminderEligible: false,
                updatedAt: new Date().toISOString(),
            });
            skipped += 1;
            continue;
        }
        const hid = userDoc.data().householdId;
        if (hid) {
            const status = (_b = (await db.doc(`pilotEnrollments/${hid}`).get()).data()) === null || _b === void 0 ? void 0 : _b.status;
            if (status === 'enrolled' || status === 'awaiting_checkout') {
                await userDoc.ref.update({
                    debriefReminderEligible: false,
                    debriefReminderSkipped: 'pilot',
                    updatedAt: new Date().toISOString(),
                });
                skipped += 1;
                continue;
            }
        }
        let attempt;
        if (!january) {
            if (attempts >= DECEMBER_ATTEMPTS) {
                skipped += 1;
                continue;
            }
            attempt = attempts + 1;
        }
        else if (attempts < DECEMBER_ATTEMPTS + 1) {
            attempt = DECEMBER_ATTEMPTS + 1;
        }
        else if (today >= LAST_CALL_FROM) {
            attempt = MAX_ATTEMPTS;
        }
        else {
            skipped += 1;
            continue;
        }
        if (user.debriefReminderLastSentAt && daysSince(user.debriefReminderLastSentAt) < (january ? MIN_GAP_DAYS : ATTEMPT_GAP_DAYS)) {
            skipped += 1;
            continue;
        }
        const claimUrl = `${APP_BASE}/?preview=debrief`;
        const email = (_c = user.email) === null || _c === void 0 ? void 0 : _c.trim();
        if (!(email === null || email === void 0 ? void 0 : email.includes('@'))) {
            skipped += 1;
            continue;
        }
        try {
            let delivered;
            if (january) {
                delivered = await (0, email_1.sendDebriefChoiceEmail)({ to: email, claimUrl, final: attempt === MAX_ATTEMPTS });
            }
            else {
                const decemberAttempt = attempt;
                delivered = await (0, email_1.sendDebriefReminderEmail)({ to: email, attempt: decemberAttempt, claimUrl });
                if (delivered && user.smsOptIn && user.phone) {
                    await (0, sms_1.sendDebriefReminderSms)({ to: user.phone, attempt: decemberAttempt, claimUrl }).catch((err) => logger.warn('Debrief SMS failed', { uid, err }));
                }
            }
            if (!delivered) {
                skipped += 1;
                continue;
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