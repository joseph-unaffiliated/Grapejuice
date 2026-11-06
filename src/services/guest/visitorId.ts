import { Platform } from 'react-native';
import { setStickyVisitorId, stickyVisitorId, VISITOR_ID_RE } from '../../navigation/stickyQuery';

/**
 * Guest visitor id (`gj.vid`). Minted by public/index.html before anything else runs so the
 * landing URL already carries `?gjv=<id>` when Retention's ge.js reads it. This module is the
 * in-app view of that id: read it, or adopt a different one after a resume link.
 */

const STORAGE_KEY = 'gj.vid';
const COOKIE_NAME = 'gj_vid';
const COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;
export { VISITOR_ID_RE };

declare global {
  interface Window {
    __gjVisitorId?: string | null;
    /** Set by public/index.html when this load minted a brand-new id (no cookie or localStorage id). */
    __gjVisitorMinted?: boolean;
  }
}

function readCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([A-Za-z0-9_-]{16,64})(?:;|$)`));
  return m ? m[1] : null;
}

function cookieDomain(): string {
  const host = window.location.hostname;
  return host === 'grapejuice.co' || host.endsWith('.grapejuice.co') ? '; domain=.grapejuice.co' : '';
}

/** Current visitor id, or null off-web / on localhost (index.html skips it there). */
export function getVisitorId(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const fromBoot = window.__gjVisitorId;
  if (typeof fromBoot === 'string' && VISITOR_ID_RE.test(fromBoot)) return fromBoot;
  const sticky = stickyVisitorId();
  if (sticky) return sticky;
  const cookie = readCookie();
  if (cookie) return cookie;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VISITOR_ID_RE.test(stored)) return stored;
  } catch {
    /* private mode */
  }
  return null;
}

/**
 * Adopt a visitor id (resume link restored that visitor's box) so further edits keep saving
 * to the same server record and the URL Retention sees points at it.
 */
export function adoptVisitorId(id: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!VISITOR_ID_RE.test(id)) return;
  window.__gjVisitorId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode */
  }
  try {
    document.cookie = `${COOKIE_NAME}=${id}; max-age=${COOKIE_MAX_AGE_S}; path=/; SameSite=Lax${cookieDomain()}`;
  } catch {
    /* ignore */
  }
  setStickyVisitorId(id);
}

/**
 * A brand-new id was minted on this load (the cookie and localStorage id were both gone), but the
 * saved guest box still names the visitor it was saved under. Keep that id so one browser keeps one
 * `guestSessions` record. Otherwise the gate and later saves split across two ids, and the copy has
 * the box steps with no email gate on it.
 */
export function reconcileMintedVisitorId(storedId: string | null | undefined): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!window.__gjVisitorMinted) return;
  window.__gjVisitorMinted = false;
  if (typeof storedId !== 'string' || !VISITOR_ID_RE.test(storedId)) return;
  if (storedId === getVisitorId()) return;
  adoptVisitorId(storedId);
}
