import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { GuestSessionSnapshot } from '../guest/guestSessionSync';
import type { MetaServerContext } from '../analytics/metaPixel';

/**
 * Passwordless account flows (functions/src/loginLinks.ts).
 * - `created`: a brand-new account; sign in with `customToken`.
 * - `existing`: the email already has an account. We emailed a login link that saves this box
 *   to it; no token is ever returned for an existing account.
 */
export type RevealBoxWithEmailResult =
  | { status: 'created'; customToken: string }
  | { status: 'existing' };

export async function revealBoxWithEmail(params: {
  email: string;
  visitorId: string | null;
  name?: string;
  meta?: MetaServerContext;
}): Promise<RevealBoxWithEmailResult> {
  const callable = httpsCallable<typeof params, RevealBoxWithEmailResult>(functions, 'revealBoxWithEmail');
  const { data } = await callable(params);
  return data;
}

export async function requestLoginLink(params: { email: string; next?: string }): Promise<void> {
  const callable = httpsCallable<typeof params, { ok: true }>(functions, 'requestLoginLink');
  await callable(params);
}

export type RedeemLoginLinkResult =
  | {
      status: 'ok';
      customToken: string;
      next: string | null;
      snapshot: GuestSessionSnapshot | null;
    }
  | { status: 'invalid' | 'expired' | 'used' };

export async function redeemLoginLink(token: string): Promise<RedeemLoginLinkResult> {
  const callable = httpsCallable<{ token: string }, RedeemLoginLinkResult>(functions, 'redeemLoginLink');
  const { data } = await callable({ token });
  return data;
}
