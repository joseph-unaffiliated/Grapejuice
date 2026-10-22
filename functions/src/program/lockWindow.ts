/**
 * Lock, extension, and code dates. ET is EST (UTC-5) after Nov 1 2026.
 * Client copy lives in src/constants/hanukkahBoxLock.ts — keep the instants in sync.
 */

/** 11:59pm ET Nov 4. FIFTEENOFF stops applying at checkout after this. */
export const FIFTEENOFF_ENDS_AT = '2026-11-05T04:59:59.000Z';

/** Last ET calendar day the 15% email and the 15% ads may run. */
export const OFFER_LAST_DAY = '2026-11-04';

/** 11:59pm ET Nov 7. A box committed before this stays frozen even if the public lock moves. */
export const COMMITTED_FREEZE_AT = '2026-11-08T04:59:59.000Z';

/** Noon ET Nov 9. The site opens again for people who have not locked a box. */
export const EXTENSION_START = '2026-11-09T17:00:00.000Z';

/** Noon ET Nov 10. The public lock moves here at noon on Nov 9, then passes. */
export const EXTENSION_END = '2026-11-10T17:00:00.000Z';

/** Noon ET Nov 12. A declined card can be fixed until this moment, then the order is cancelled. */
export const CARD_FIX_DEADLINE = '2026-11-12T17:00:00.000Z';

const FROZEN = new Set(['committed', 'pending', 'confirmed', 'shipped', 'delivered']);

export function isExtensionWindow(now: Date): boolean {
  const t = now.getTime();
  return t >= Date.parse(EXTENSION_START) && t < Date.parse(EXTENSION_END);
}

/**
 * Someone who already locked a box stays in the post-lock experience.
 * Before 11:59pm ET Nov 7 their own lockAt is still ahead, so they can edit.
 * After that, a committed order is frozen even when the public lock moves to Nov 10.
 */
export function isHouseholdBoxFrozen(
  order: { status?: string | null; lockAt?: string | null } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!order) return false;
  if (!FROZEN.has(order.status ?? '')) return false;
  if (order.lockAt) {
    const lock = Date.parse(order.lockAt);
    if (!Number.isNaN(lock) && now.getTime() >= lock) return true;
  }
  return now.getTime() >= Date.parse(COMMITTED_FREEZE_AT);
}
