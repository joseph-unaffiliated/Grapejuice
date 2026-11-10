/**
 * Unlisted friends-and-family order link: /d/order/<token>
 * Visiting stores the token in this browser. The public site, emails, and ads never mention it.
 * The server accepts the token only when it matches config/hanukkah-2026.familyOrderToken.
 */

const STORAGE_KEY = 'gj.familyOrder';

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
