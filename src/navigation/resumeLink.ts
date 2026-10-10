import { Platform } from 'react-native';
import { getBootLocation } from './bootLocation';

export const RESUME_PARAM = 'resume';
const RESUME_NEXT_PARAM = 'next';
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * `?resume=<token>` from the pre-rewrite boot URL (the default storefront route rewrites the
 * address bar before link effects mount). Tokens are minted by functions/src/retentionLead.ts.
 */
export function readResumeTokenFromBoot(): string | null {
  if (Platform.OS !== 'web') return null;
  const boot = getBootLocation();
  if (!boot?.search) return null;
  const token = new URLSearchParams(boot.search).get(RESUME_PARAM);
  return token && TOKEN_RE.test(token) ? token : null;
}

/** `&next=checkout` (inventory emails' "Secure my box"): continue to checkout after restoring. */
export function readResumeNextFromBoot(): 'checkout' | null {
  if (Platform.OS !== 'web') return null;
  const boot = getBootLocation();
  if (!boot?.search) return null;
  return new URLSearchParams(boot.search).get(RESUME_NEXT_PARAM) === 'checkout' ? 'checkout' : null;
}

/** Drop the token from the address bar so a refresh or share does not replay it. */
export function scrubResumeUrl(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(RESUME_PARAM)) return;
  url.searchParams.delete(RESUME_PARAM);
  url.searchParams.delete(RESUME_NEXT_PARAM);
  window.history.replaceState(window.history.state, '', url.toString());
}
