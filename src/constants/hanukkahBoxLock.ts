/** Fallback lock when Firestore `config/hanukkah-2026.lockAt` is unavailable. */
export const HANUKKAH_BOX_LOCK_DATE = new Date('2026-11-07T23:59:59-05:00');

/**
 * Keep these instants in sync with functions/src/program/lockWindow.ts.
 * 11:59pm ET Nov 7. A committed box stays frozen after this even if the public lock moves.
 */
export const COMMITTED_FREEZE_AT = '2026-11-08T04:59:59.000Z';
/** Noon ET Nov 9 through noon ET Nov 10. Checkout charges the card immediately. */
const EXTENSION_START_MS = Date.parse('2026-11-09T17:00:00.000Z');
const EXTENSION_END_MS = Date.parse('2026-11-10T17:00:00.000Z');

const FROZEN_ORDER = new Set(['committed', 'pending', 'confirmed', 'shipped', 'delivered']);

export function isImmediateChargeWindow(now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= EXTENSION_START_MS && t < EXTENSION_END_MS;
}

export function checkoutChargeLine(lockShort: string, now: Date = new Date()): string {
  if (isImmediateChargeWindow(now)) {
    return 'Your card is charged when you place this order. The box locks as soon as it goes through.';
  }
  return `$0 today. Charged after ${lockShort}. Cancel free before then.`;
}

export function checkoutChargeBar(lockShort: string, now: Date = new Date()): string {
  if (isImmediateChargeWindow(now)) return 'Charged today · locks when you place it';
  return `$0 today · charged after ${lockShort} · cancel free before then`;
}

/** A household that already locked a box does not see the extra day as a reopening. */
export function isHouseholdBoxFrozen(
  order: { status?: string | null; lockAt?: string | null } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!order) return false;
  if (!FROZEN_ORDER.has(order.status ?? '')) return false;
  if (order.lockAt) {
    const lock = Date.parse(order.lockAt);
    if (!Number.isNaN(lock) && now.getTime() >= lock) return true;
  }
  return now.getTime() >= Date.parse(COMMITTED_FREEZE_AT);
}

/** Fallback estimated delivery day (display) when config is unavailable. */
export const HANUKKAH_DELIVERY_FALLBACK_ISO = '2026-11-21';

/** Fallback first night when Firestore `startsOn` is unavailable. */
export const HANUKKAH_STARTS_FALLBACK_ISO = '2026-12-05';

export const HANUKKAH_BOX_LOCK_YEAR_LABEL = '2026 Hanukkah Box';

export const MY_HANUKKAH_BOX_LABEL = 'My Hanukkah box';

function parseIsoDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function lockTargetDate(lockAt?: string | null): Date {
  if (lockAt?.trim()) {
    const d = parseIsoDate(lockAt.trim());
    if (!Number.isNaN(d.getTime())) return d;
  }
  return HANUKKAH_BOX_LOCK_DATE;
}

/**
 * Whole calendar days remaining until lock (0 once past / same day).
 * Uses local start-of-day so promo + timeline stay in sync mid-day.
 */
export function daysToBoxLock(now: Date = new Date(), lockAt?: string | null): number {
  const ms =
    startOfLocalDay(lockTargetDate(lockAt)).getTime() - startOfLocalDay(now).getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * Short lock day in Eastern time, e.g. `Nov 7`.
 * Lock is 11:59pm ET (`2026-11-08T04:59:59Z`), so UTC or a local format shows Nov 8.
 */
export function lockShortLabel(lockAt: string | null): string {
  if (!lockAt) return 'the lock date';
  return new Date(lockAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** Account line for a credit balance. A box that's already checked out takes it when charged at lock. */
export function creditBalanceLine(creditLabel: string, placedBox: { lockAt?: string | null } | null | undefined): string {
  return placedBox
    ? `You have ${creditLabel} in credit. It comes off your Hanukkah box when it’s charged after ${lockShortLabel(placedBox.lockAt ?? null)}.`
    : `You have ${creditLabel} in credit. It comes off your next box, order or gift at checkout.`;
}

/** e.g. `Nov 7` — the lock day in the viewer's time zone. */
export function boxLockDayLabel(lockAt?: string | null): string {
  const lock = lockTargetDate(lockAt);
  return `${MONTH_SHORT[lock.getMonth()]} ${lock.getDate()}`;
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
  if (days === 0) {
    const arrival = startOfLocalDay(parseIsoDate(estimatedDeliveryBy!.trim())).getTime();
    return arrival < startOfLocalDay(now).getTime() ? 'Arrived' : 'Arrives today';
  }
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
    'Nov 21';
  return `Arrives by ${day}`;
}

/** e.g. `Hanukkah starts sundown Dec 4` from Firestore `startsOn`. */
export function hanukkahStartsSundownLabel(startsOn?: string | null): string | null {
  if (!startsOn?.trim()) return null;
  const d = parseIsoDate(startsOn.trim());
  if (Number.isNaN(d.getTime())) return null;
  return `Hanukkah starts sundown ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Promo starts clause (no “sundown”): `Hanukkah starts Dec 5`. */
export function hanukkahStartsPromoLabel(startsOn?: string | null): string {
  const iso = startsOn?.trim() || HANUKKAH_STARTS_FALLBACK_ISO;
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime())) {
    return 'Hanukkah starts Dec 5';
  }
  return `Hanukkah starts ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Promo delivery clause: `Boxes arrive by Nov 21`. */
export function boxesArriveByPromoLabel(estimatedDeliveryBy?: string | null): string {
  const day =
    formatShortMonthDay(estimatedDeliveryBy) ??
    formatShortMonthDay(HANUKKAH_DELIVERY_FALLBACK_ISO) ??
    'Nov 21';
  return `Boxes arrive by ${day}`;
}

/**
 * Acquisition promo (fits one line on mobile):
 * `Hanukkah starts Dec 5 • Boxes arrive by Nov 21 • Free shipping`
 */
export function freeShippingPromoLine(
  estimatedDeliveryBy?: string | null,
  startsOn?: string | null
): string {
  const starts = hanukkahStartsPromoLabel(startsOn);
  const arrives = boxesArriveByPromoLabel(estimatedDeliveryBy);
  return `${starts} • ${arrives} • Free shipping`;
}

/**
 * Guest-with-started-box promo: account CTA + lock timing.
 * e.g. `Create an account to secure the items in your box • Box locks on Nov 7 (45 days from today)`
 */
export function guestBoxSecurePromoLine(
  lockAt?: string | null,
  now: Date = new Date()
): string {
  const lock = lockTargetDate(lockAt);
  const day = `${MONTH_SHORT[lock.getMonth()]} ${lock.getDate()}`;
  const days = daysToBoxLock(now, lockAt);
  const relative =
    days === 0
      ? 'today'
      : `${days} day${days === 1 ? '' : 's'} from today`;
  return `Create an account to secure the items in your box • Box locks on ${day} (${relative})`;
}

/**
 * À la carte wait: `Arrives by Nov 21, about 6 weeks from now.`
 * Drops the wait once the day is close or past.
 */
export function arrivesByWithWaitLabel(
  estimatedDeliveryBy?: string | null,
  now: Date = new Date()
): string {
  const iso = estimatedDeliveryBy?.trim() || HANUKKAH_DELIVERY_FALLBACK_ISO;
  const day = formatShortMonthDay(iso) ?? 'Nov 21';
  const days = daysToShip(iso, now) ?? 0;
  const weeks = Math.round(days / 7);
  if (weeks >= 2) return `Arrives by ${day}, about ${weeks} weeks from now.`;
  if (days >= 2) return `Arrives by ${day}, ${days} days from now.`;
  return `Arrives by ${day}.`;
}

/**
 * Short ship window for PDP (“Arrives in time for Hanukkah (est. …)”).
 * Prefer a single day from config; fall back to the arrives-by day.
 */
export function shipWindowLabel(estimatedDeliveryBy?: string | null): string {
  return (
    formatShortMonthDay(estimatedDeliveryBy) ??
    formatShortMonthDay(HANUKKAH_DELIVERY_FALLBACK_ISO) ??
    'Nov 21'
  );
}
