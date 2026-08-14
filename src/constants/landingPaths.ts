/**
 * Path / slug helpers for marketing landings CMS.
 */

/** Paths that must never be used as a landing slug. */
export const RESERVED_LANDING_PATHS: readonly string[] = [
  '/',
  '/store',
  '/home',
  '/product',
  '/gift',
  '/gift/claim',
  '/admin',
  '/checkout',
  '/auth',
  '/api',
  '/assets',
  '/box',
  '/my-box',
  '/cart',
  '/account',
  '/rav',
];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Normalize user input to a canonical path like `/my-campaign`. */
export function normalizeLandingPath(input: string): string {
  let raw = input.trim().toLowerCase();
  if (!raw) return '';
  raw = raw.replace(/^https?:\/\/[^/]+/i, '');
  if (!raw.startsWith('/')) raw = `/${raw}`;
  raw = raw.replace(/\/+/g, '/');
  if (raw.length > 1 && raw.endsWith('/')) raw = raw.slice(0, -1);
  return raw;
}

/** Id derived from path (`/my-campaign` → `my-campaign`). */
export function landingIdFromPath(path: string): string {
  const normalized = normalizeLandingPath(path);
  return normalized.replace(/^\//, '').replace(/\//g, '-') || '';
}

export function isReservedLandingPath(path: string): boolean {
  const normalized = normalizeLandingPath(path);
  if (!normalized) return true;
  if (RESERVED_LANDING_PATHS.includes(normalized)) return true;
  if (normalized === '/gift/claim' || normalized.startsWith('/gift/claim/')) return true;
  if (normalized.startsWith('/store/')) return true;
  if (normalized.startsWith('/product/')) return true;
  if (normalized.startsWith('/admin')) return true;
  if (normalized.startsWith('/api/')) return true;
  if (normalized.startsWith('/assets/')) return true;
  return false;
}

/**
 * Validate a new landing path. Returns an error message or null if ok.
 * `takenPaths` should include existing landing paths + legacyPaths.
 */
export function validateNewLandingPath(
  input: string,
  takenPaths: Iterable<string> = []
): string | null {
  const path = normalizeLandingPath(input);
  if (!path || path === '/') {
    return 'Type a path in the field (e.g. /grandparents) — the grey example is only a placeholder';
  }

  const slug = path.replace(/^\//, '');
  if (slug.includes('/')) {
    return 'Use a single-segment path (e.g. /my-campaign)';
  }
  if (!SLUG_RE.test(slug)) {
    return 'Use lowercase letters, numbers, and hyphens only';
  }
  if (isReservedLandingPath(path)) {
    return 'That path is reserved by the app';
  }

  const taken = new Set(
    [...takenPaths].map((p) => normalizeLandingPath(p)).filter(Boolean)
  );
  if (taken.has(path)) {
    return 'That path is already in use';
  }

  return null;
}
