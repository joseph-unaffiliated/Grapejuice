/** Fallback lock when Firestore `config/hanukkah-2026.lockAt` is unavailable. */
export const HANUKKAH_BOX_LOCK_DATE = new Date('2026-11-04T23:59:59-05:00');

/** Fallback estimated delivery day (display) when config is unavailable. */
export const HANUKKAH_DELIVERY_FALLBACK_ISO = '2026-11-24';

export const HANUKKAH_BOX_LOCK_YEAR_LABEL = '2026 Hanukkah Box';

export const MY_HANUKKAH_BOX_LABEL = 'My Hanukkah box';

function parseIsoDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

function lockTargetDate(lockAt?: string | null): Date {
  if (lockAt?.trim()) {
    const d = parseIsoDate(lockAt.trim());
    if (!Number.isNaN(d.getTime())) return d;
  }
  return HANUKKAH_BOX_LOCK_DATE;
}

/** Whole days remaining until lock (0 once past). */
export function daysToBoxLock(now: Date = new Date(), lockAt?: string | null): number {
  const ms = lockTargetDate(lockAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function boxLockChipLabel(now: Date = new Date(), lockAt?: string | null): string {
  const days = daysToBoxLock(now, lockAt);
  if (days === 0) return 'Locks today';
  return `${days}d to lock`;
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

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** e.g. `Nov 24` from an ISO date (date-only or full). */
export function formatShortMonthDay(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = parseIsoDate(iso.trim());
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Promo line delivery half: `Arrives by Nov 24`.
 * Uses Firestore `estimatedDeliveryBy` when present; else fallback day.
 */
export function arrivesByPromoLabel(estimatedDeliveryBy?: string | null): string {
  const day =
    formatShortMonthDay(estimatedDeliveryBy) ??
    formatShortMonthDay(HANUKKAH_DELIVERY_FALLBACK_ISO) ??
    'Nov 24';
  return `Arrives by ${day}`;
}

export function freeShippingPromoLine(estimatedDeliveryBy?: string | null): string {
  return `Free shipping on Hanukkah box orders • ${arrivesByPromoLabel(estimatedDeliveryBy)}`;
}

/**
 * Short ship window for PDP (“Arrives in time for Hanukkah (est. …)”).
 * Prefer a single day from config; fall back to the arrives-by day.
 */
export function shipWindowLabel(estimatedDeliveryBy?: string | null): string {
  return (
    formatShortMonthDay(estimatedDeliveryBy) ??
    formatShortMonthDay(HANUKKAH_DELIVERY_FALLBACK_ISO) ??
    'Nov 24'
  );
}
