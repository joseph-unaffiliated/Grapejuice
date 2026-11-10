/**
 * Unlisted friends-and-family order link: /d/order/<token>
 * Visiting stores the token in this browser. The public site, emails, and ads never mention it.
 * The server accepts the token only when it matches config/hanukkah-2026.familyOrderToken.
 *
 * Clear this browser’s unlock: /d/clear-family (also /d/remove-friends-and-family).
 */

const STORAGE_KEY = 'gj.familyOrder';

/** Paths that drop the local F&F unlock (mobile-friendly; no admin panel needed). */
const CLEAR_FAMILY_PATH =
  /^\/d\/(clear-family|remove-friends-and-family|remove-family-order)\/?$/i;

export function familyOrderToken(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function familyOrderOpen(): boolean {
  return familyOrderToken().length >= 16;
}

export function rememberFamilyOrderToken(token: string): void {
  if (typeof localStorage === 'undefined') return;
  const value = token.trim();
  if (value.length < 16) return;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode */
  }
}

/** Drop the F&F unlock so this browser matches normal post-lock shoppers again. */
export function clearFamilyOrderToken(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

/** Read /d/order/<token> once, store it, and drop it from the address bar. */
export function captureFamilyOrderFromLocation(): void {
  if (typeof window === 'undefined') return;
  const match = window.location.pathname.match(/^\/d\/order\/([A-Za-z0-9_-]{16,})\/?$/);
  if (!match) return;
  rememberFamilyOrderToken(match[1]);
  const search = window.location.search;
  window.history.replaceState({}, '', `/${search === '?' ? '' : search}`);
}

/** True when this path (or boot path) is a clear-family deep link. */
export function isClearFamilyPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return CLEAR_FAMILY_PATH.test(pathname);
}

/**
 * /d/clear-family — remove gj.familyOrder from this device and go home as a normal shopper.
 * Safe to open on mobile Safari where the admin panel is awkward.
 *
 * Must run from boot (before React Navigation rewrites the address bar to `/`),
 * otherwise the clear path is gone and the unlock stays in localStorage.
 */
export function clearFamilyOrderFromLocation(pathname?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const path = pathname ?? window.location.pathname;
  if (!isClearFamilyPath(path)) return false;
  clearFamilyOrderToken();
  const search = window.location.search;
  const home = `/${search === '?' ? '' : search}`;
  // Hard navigate — more reliable than replaceState + reload on mobile Safari.
  window.location.replace(home);
  return true;
}
