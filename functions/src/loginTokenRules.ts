/** Login-link validity rules, kept free of Firebase imports so they can be unit tested. */

/** "View my order" in confirmation emails: reusable for two weeks. */
export const ORDER_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Kept a month past sign-in expiry so an expired link can still prefill the email. */
export const ORDER_TOKEN_RETAIN_MS = 30 * 24 * 60 * 60 * 1000;
export const ORDER_TOKEN_MAX_USES = 10;

export type LoginTokenStatus = 'ok' | 'invalid' | 'expired' | 'used';

type TimestampLike = { toMillis(): number };

function millis(v: unknown): number {
  return v && typeof (v as TimestampLike).toMillis === 'function' ? (v as TimestampLike).toMillis() : 0;
}

/** Order links are reusable until they expire (capped); every other login link is single use. */
export function loginTokenStatus(tok: Record<string, unknown> | undefined, now: number): LoginTokenStatus {
  if (!tok) return 'invalid';
  if (tok.purpose === 'order') {
    const until = millis(tok.signInUntil);
    if (!until || until < now) return 'expired';
    if ((Number(tok.useCount) || 0) >= ORDER_TOKEN_MAX_USES) return 'used';
    return 'ok';
  }
  if (tok.usedAt) return 'used';
  const expires = millis(tok.expiresAt);
  if (!expires || expires < now) return 'expired';
  return 'ok';
}
