"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLockReminderBatch = runLockReminderBatch;
const logger = require("./logger");
const email_1 = require("./email");
const emailItems_1 = require("./emailItems");
const guestSessions_1 = require("./guestSessions");
const setupNudge_1 = require("./setupNudge");
const sms_1 = require("./sms");
const HOLIDAY_ID = 'hanukkah-2026';
const UTM = 'utm_source=lifecycle&utm_medium=email&utm_campaign=lock_reminder';
const MAX_ATTEMPTS = 2;
/** Days before lock when we send attempt 1 and 2. */
const REMINDER_DAYS_BEFORE_LOCK = [7, 3];
function daysUntil(isoLock) {
    return (new Date(isoLock).getTime() - Date.now()) / 86400000;
}
async function householdHasCommittedOrder(db, householdId) {
    const snap = await db
        .collection(`households/${householdId}/orders`)
        .where('holidayId', '==', HOLIDAY_ID)
        .where('status', '==', 'committed')
        .limit(1)
        .get();
    return !snap.empty;
}
/** Lock countdown reminders — up to 2 email (+ optional SMS) attempts before box lock. */
async function runLockReminderBatch(db, lockAt) {
    var _a, _b, _c, _d;
    const daysLeft = daysUntil(lockAt);
    const usersSnap = await db.collection('users').where('lockReminderEligible', '==', true).get();
    let sent = 0;
    let skipped = 0;
    for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const user = userDoc.data();
        const attempts = (_a = user.lockReminderAttempts) !== null && _a !== void 0 ? _a : 0;
        if (attempts >= MAX_ATTEMPTS) {
            skipped += 1;
            continue;
        }
        const householdId = user.householdId;
        if (!householdId) {
            skipped += 1;
            continue;
        }
        if (await householdHasCommittedOrder(db, householdId)) {
            await userDoc.ref.update({
                lockReminderEligible: false,
                updatedAt: new Date().toISOString(),
            });
            skipped += 1;
            continue;
        }
        const nextAttempt = (attempts + 1);
        const targetDays = REMINDER_DAYS_BEFORE_LOCK[nextAttempt - 1];
        if (daysLeft > targetDays || daysLeft < 0) {
            skipped += 1;
            continue;
        }
        const email = (_b = user.email) === null || _b === void 0 ? void 0 : _b.trim();
        if (!(email === null || email === void 0 ? void 0 : email.includes('@'))) {
            skipped += 1;
            continue;
        }
        const daysRemaining = Math.max(1, Math.ceil(daysLeft));
        const myBoxUrl = `${(0, guestSessions_1.appOrigin)()}/box?${UTM}`;
        const checkoutUrl = `${(0, guestSessions_1.appOrigin)()}/checkout?${UTM}`;
        try {
            const [draftSnap, householdSnap] = await Promise.all([
                db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get(),
                db.doc(`households/${householdId}`).get(),
            ]);
            const { items, more } = await (0, emailItems_1.lineItemsEmailItems)(db, (_c = draftSnap.data()) === null || _c === void 0 ? void 0 : _c.lineItems, myBoxUrl);
            await (0, email_1.sendLockReminderEmail)({
                to: email,
                attempt: nextAttempt,
                daysRemaining,
                myBoxUrl,
                checkoutUrl,
                lockDate: (0, setupNudge_1.lockDateLabel)(lockAt),
                hasCard: Boolean((_d = householdSnap.data()) === null || _d === void 0 ? void 0 : _d.cardOnFileAt),
                items,
                itemsMore: more,
            });
            if (user.smsOptIn && user.phone) {
                await (0, sms_1.sendLockReminderSms)({ to: user.phone, attempt: nextAttempt, daysRemaining, myBoxUrl }).catch((err) => logger.warn('Lock SMS failed', { uid, err }));
            }
            await userDoc.ref.update({
                lockReminderAttempts: nextAttempt,
                lockReminderLastSentAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            sent += 1;
        }
        catch (err) {
            logger.error('Lock reminder failed', { uid, err });
            skipped += 1;
        }
    }
    logger.info('Lock reminder batch complete', { sent, skipped, daysLeft });
    return { sent, skipped };
}
//# sourceMappingURL=lockReminders.js.map