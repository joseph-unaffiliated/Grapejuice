/** Placeholder lock date for the 2026 Hanukkah box (pilot). */
export const HANUKKAH_BOX_LOCK_DATE = new Date('2026-11-04T23:59:59-05:00');

export const HANUKKAH_BOX_LOCK_YEAR_LABEL = '2026 Hanukkah Box';

/** Whole days remaining until lock (0 once past). */
export function daysToBoxLock(now: Date = new Date()): number {
  const ms = HANUKKAH_BOX_LOCK_DATE.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function boxLockChipLabel(now: Date = new Date()): string {
  const days = daysToBoxLock(now);
  if (days === 0) return 'Locks today';
  return `${days}d to lock`;
}
