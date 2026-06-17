const HANUKKAH_NIGHTS = 8;
const MS_PER_DAY = 86_400_000;

/** First day of Hanukkah 2026 — Dec 5 (Hebcal); used when Firestore config has no startsOn. */
const HANUKKAH_2026_START = '2026-12-05';

export type HanukkahPhase = 'before' | 'during' | 'after';

export type HanukkahStatus = {
  phase: HanukkahPhase;
  startDate: Date;
  endDate: Date;
  night: number | null;
  daysUntilStart: number | null;
  daysUntilEnd: number | null;
};

function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / MS_PER_DAY);
}

/** Fallback first-candle date when config is missing (no Hebcal on web — breaks Metro). */
export function getHebcalHanukkahStart(year: number): Date | null {
  if (year === 2026) return parseDateOnly(HANUKKAH_2026_START);
  return null;
}

export function getHanukkahWindow(startsOn: string | null, year = 2026): { startDate: Date; endDate: Date } {
  const startDate = startsOn ? parseDateOnly(startsOn) : getHebcalHanukkahStart(year) ?? parseDateOnly(`${year}-12-05`);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + HANUKKAH_NIGHTS - 1);
  return { startDate, endDate };
}

export function getHanukkahStatus(startsOn: string | null, now = new Date()): HanukkahStatus {
  const { startDate, endDate } = getHanukkahWindow(startsOn);
  const today = startOfLocalDay(now);

  if (today < startDate) {
    return {
      phase: 'before',
      startDate,
      endDate,
      night: null,
      daysUntilStart: dayDiff(today, startDate),
      daysUntilEnd: null,
    };
  }

  if (today <= endDate) {
    const night = Math.min(HANUKKAH_NIGHTS, dayDiff(startDate, today) + 1);
    return {
      phase: 'during',
      startDate,
      endDate,
      night,
      daysUntilStart: null,
      daysUntilEnd: dayDiff(today, endDate),
    };
  }

  return {
    phase: 'after',
    startDate,
    endDate,
    night: null,
    daysUntilStart: null,
    daysUntilEnd: null,
  };
}

export function formatCountdown(targetIso: string | null, now = new Date()): string | null {
  if (!targetIso) return null;
  const target = new Date(targetIso);
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return null;
  const days = Math.floor(diff / MS_PER_DAY);
  const hours = Math.floor((diff % MS_PER_DAY) / 3_600_000);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}, ${hours} hour${hours === 1 ? '' : 's'}`;
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'}, ${minutes} min`;
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Welcome / Rav subtext — Hanukkah countdown, never Passover. */
export function formatHanukkahWelcomeSubtext(startsOn: string | null, now = new Date()): string {
  const status = getHanukkahStatus(startsOn, now);
  if (status.phase === 'during') {
    return status.night ? `Night ${status.night} of Hanukkah` : 'Hanukkah is here';
  }
  if (status.phase === 'after') {
    return 'Hanukkah 2026 — reflect or plan ahead';
  }
  const days = status.daysUntilStart;
  if (days == null) return 'Hanukkah help, box swaps, low-pressure practice';
  if (days <= 1) return 'Hanukkah starts tomorrow';
  if (days < 14) return `Hanukkah is in ${days} day${days === 1 ? '' : 's'}`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? 'Hanukkah is in 1 week' : `Hanukkah is in ${weeks} weeks`;
}

/** Relative time for chat footers, e.g. "2 minutes ago". */
export function formatRelativeTime(from: Date, now = new Date()): string {
  const diffMs = now.getTime() - from.getTime();
  if (diffMs < 60_000) return 'Just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Thread list dates — "Today", "3 weeks ago", "2 months ago". */
export function formatThreadListDate(iso: string, now = new Date()): string {
  const from = new Date(iso);
  const today = startOfLocalDay(now);
  const then = startOfLocalDay(from);
  const days = dayDiff(then, today);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
