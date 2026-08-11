/** Placeholder lock date for the 2026 Hanukkah box (pilot). */
export const HANUKKAH_BOX_LOCK_DATE = new Date('2026-11-04T23:59:59-05:00');

export const HANUKKAH_BOX_LOCK_YEAR_LABEL = '2026 Hanukkah Box';

export const MY_HANUKKAH_BOX_LABEL = 'My Hanukkah box';

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

function parseIsoDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

/** Whole days until estimated delivery (0 once past / same day). */
export function daysToShip(estimatedDeliveryBy: string | null, now: Date = new Date()): number | null {
  if (!estimatedDeliveryBy?.trim()) return null;
  const target = parseIsoDate(estimatedDeliveryBy.trim());
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/** Chip for locked boxes: days-to-ship when known, otherwise Locked. */
export function lockedBoxChipLabel(
  estimatedDeliveryBy: string | null,
  now: Date = new Date()
): string {
  const days = daysToShip(estimatedDeliveryBy, now);
  if (days == null) return 'Locked';
  if (days === 0) return 'Shipping soon';
  return `${days}d to ship`;
}
