import * as logger from 'firebase-functions/logger';
import type { Firestore } from 'firebase-admin/firestore';
import { sendLockReminderEmail } from './email';
import { sendLockReminderSms } from './sms';

const HOLIDAY_ID = 'hanukkah-2026';
const APP_BASE = process.env.PILOT_APP_BASE_URL ?? 'https://app.grapejuice.co';
const MAX_ATTEMPTS = 2;
/** Days before lock when we send attempt 1 and 2. */
const REMINDER_DAYS_BEFORE_LOCK = [7, 3] as const;

type UserReminderState = {
  email?: string;
  phone?: string;
  smsOptIn?: boolean;
  householdId?: string;
  lockReminderEligible?: boolean;
  lockReminderAttempts?: number;
  lockReminderLastSentAt?: string;
};

function daysUntil(isoLock: string): number {
  return (new Date(isoLock).getTime() - Date.now()) / 86_400_000;
}

async function householdHasCommittedOrder(db: Firestore, householdId: string): Promise<boolean> {
  const snap = await db
    .collection(`households/${householdId}/orders`)
    .where('holidayId', '==', HOLIDAY_ID)
    .where('status', '==', 'committed')
    .limit(1)
    .get();
  return !snap.empty;
}

/** Lock countdown reminders — up to 2 email (+ optional SMS) attempts before box lock. */
export async function runLockReminderBatch(db: Firestore, lockAt: string): Promise<{ sent: number; skipped: number }> {
  const daysLeft = daysUntil(lockAt);
  const usersSnap = await db.collection('users').where('lockReminderEligible', '==', true).get();
  let sent = 0;
  let skipped = 0;

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const user = userDoc.data() as UserReminderState;
    const attempts = user.lockReminderAttempts ?? 0;
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

    const nextAttempt = (attempts + 1) as 1 | 2;
    const targetDays = REMINDER_DAYS_BEFORE_LOCK[nextAttempt - 1];
    if (daysLeft > targetDays || daysLeft < 0) {
      skipped += 1;
      continue;
    }

    const email = user.email?.trim();
    if (!email?.includes('@')) {
      skipped += 1;
      continue;
    }

    const daysRemaining = Math.max(1, Math.ceil(daysLeft));
    const myBoxUrl = `${APP_BASE}/?preview=my-box`;

    try {
      await sendLockReminderEmail({ to: email, attempt: nextAttempt, daysRemaining, myBoxUrl });
      if (user.smsOptIn && user.phone) {
        await sendLockReminderSms({ to: user.phone, attempt: nextAttempt, daysRemaining, myBoxUrl }).catch((err) =>
          logger.warn('Lock SMS failed', { uid, err })
        );
      }
      await userDoc.ref.update({
        lockReminderAttempts: nextAttempt,
        lockReminderLastSentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      sent += 1;
    } catch (err) {
      logger.error('Lock reminder failed', { uid, err });
      skipped += 1;
    }
  }

  logger.info('Lock reminder batch complete', { sent, skipped, daysLeft });
  return { sent, skipped };
}
