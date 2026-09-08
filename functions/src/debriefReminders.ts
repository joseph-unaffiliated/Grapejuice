import * as logger from 'firebase-functions/logger';
import type { Firestore } from 'firebase-admin/firestore';
import { sendDebriefReminderEmail, sendDebriefAmazonFallbackEmail } from './email';
import { sendDebriefReminderSms } from './sms';

const HOLIDAY_ID = 'hanukkah-2026';
const APP_BASE = process.env.PILOT_APP_BASE_URL ?? 'https://app.grapejuice.co';
const MAX_ATTEMPTS = 3;
/** Minimum days between reminder attempts 1→2 and 2→3. */
const ATTEMPT_GAP_DAYS = 7;
const AMAZON_FALLBACK_GAP_DAYS = 14;
const HANUKKAH_NIGHTS = 8;
/** Fallback when config/hanukkah-2026.startsOn is missing (matches client). */
const HANUKKAH_2026_START = '2026-12-05';
/** Pilot families are Northeast US — season gate uses Eastern calendar days. */
const SEASON_TZ = 'America/New_York';

type UserReminderState = {
  email?: string;
  phone?: string;
  smsOptIn?: boolean;
  debriefReminderEligible?: boolean;
  debriefReminderAttempts?: number;
  debriefReminderLastSentAt?: string;
};

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function calendarDayInTz(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone });
}

/**
 * First calendar day (Eastern) after the last night of Hanukkah.
 * Nights are startsOn … startsOn + 7; outreach starts the day after that.
 */
export function firstDebriefSendDayIso(startsOn: string | null | undefined): string {
  const raw = (startsOn ?? '').trim() || HANUKKAH_2026_START;
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
export function isAfterHanukkahSeason(
  startsOn: string | null | undefined,
  now = new Date()
): boolean {
  const todayEt = calendarDayInTz(now, SEASON_TZ);
  return todayEt >= firstDebriefSendDayIso(startsOn);
}

async function loadHanukkahStartsOn(db: Firestore): Promise<string | null> {
  const snap = await db.doc(`config/${HOLIDAY_ID}`).get();
  const startsOn = snap.data()?.startsOn;
  return typeof startsOn === 'string' && startsOn.trim() ? startsOn.trim() : null;
}

/** Post-Hanukkah debrief outreach — up to 2 email (+ optional SMS) attempts per user. */
export async function runDebriefReminderBatch(db: Firestore): Promise<{ sent: number; skipped: number }> {
  const startsOn = await loadHanukkahStartsOn(db);
  if (!isAfterHanukkahSeason(startsOn)) {
    const firstSendDay = firstDebriefSendDayIso(startsOn);
    logger.info('Debrief reminder batch skipped — Hanukkah season not over yet', {
      startsOn: startsOn ?? HANUKKAH_2026_START,
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
    const user = userDoc.data() as UserReminderState;
    const attempts = user.debriefReminderAttempts ?? 0;
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

    const attempt = (attempts + 1) as 1 | 2 | 3;
    const claimUrl = `${APP_BASE}/?preview=debrief`;
    const email = user.email?.trim();
    if (!email?.includes('@')) {
      skipped += 1;
      continue;
    }

    try {
      if (attempt === 3) {
        await sendDebriefAmazonFallbackEmail({ to: email, claimUrl });
      } else {
        await sendDebriefReminderEmail({ to: email, attempt, claimUrl });
        if (user.smsOptIn && user.phone) {
          await sendDebriefReminderSms({ to: user.phone, attempt, claimUrl }).catch((err) =>
            logger.warn('Debrief SMS failed', { uid, err })
          );
        }
      }
      await userDoc.ref.update({
        debriefReminderAttempts: attempt,
        debriefReminderLastSentAt: new Date().toISOString(),
        ...(attempt >= MAX_ATTEMPTS ? { debriefReminderEligible: false } : {}),
        updatedAt: new Date().toISOString(),
      });
      sent += 1;
    } catch (err) {
      logger.error('Debrief reminder failed', { uid, err });
      skipped += 1;
    }
  }

  logger.info('Debrief reminder batch complete', { sent, skipped });
  return { sent, skipped };
}
