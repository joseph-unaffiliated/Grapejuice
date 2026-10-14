import { Platform } from 'react-native';

/**
 * Query params that must survive every in-app URL rewrite (webBrowserHistory.ts):
 * - `vge` / `aid`: Retention's installer test opens `?vge=true&aid=<account>`; ge.js reads both
 *   from location.href whenever it finishes loading and reports them in its script beacon.
 * - `gjv`: the guest visitor id set by public/index.html. Retention's lead webhook keeps the
 *   full landing_page_url, so this is how a lead gets linked back to a saved guest box.
 *
 * Kept dependency-free so services can import it without pulling in navigation/auth.
 */
const STICKY_QUERY = new Map<string, string>();

/**
 * Campaign / ad-click params from the landing URL. GA loads deferred and reads them from
 * location.href, so they ride along until public/index.html flags `__gjGaReady`.
 */
const LANDING_AD_QUERY = new Map<string, string>();
const AD_CLICK_IDS = new Set(['fbclid', 'gclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid']);

export const VISITOR_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

function gaHasReadLanding(): boolean {
  return (window as { __gjGaReady?: unknown }).__gjGaReady === true;
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const landing = new URLSearchParams(window.location.search);
  for (const [key, value] of landing) {
    if ((key.startsWith('utm_') || AD_CLICK_IDS.has(key)) && value) LANDING_AD_QUERY.set(key, value);
  }
  if (landing.get('vge') === 'true') {
    STICKY_QUERY.set('vge', 'true');
    const aid = landing.get('aid');
    if (aid) STICKY_QUERY.set('aid', aid);
  }
  const bootVid = (window as { __gjVisitorId?: unknown }).__gjVisitorId;
  const gjv = typeof bootVid === 'string' ? bootVid : landing.get('gjv');
  if (gjv && VISITOR_ID_RE.test(gjv)) STICKY_QUERY.set('gjv', gjv);
}

/** Current guest visitor id carried in the URL (null off-web or when index.html skipped it). */
export function stickyVisitorId(): string | null {
  return STICKY_QUERY.get('gjv') ?? null;
}

/**
 * Point the URL at a different visitor id (resume link restored someone's saved box) and
 * rewrite the address bar now so Retention's next page call sees it.
 */
export function setStickyVisitorId(id: string): void {
  if (!VISITOR_ID_RE.test(id)) return;
  STICKY_QUERY.set('gjv', id);
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('gjv', id);
  window.history.replaceState(window.history.state, '', url.toString());
}

/** Append any sticky params the path does not already carry. */
export function withStickyQuery(path: string): string {
  const carryAdQuery = LANDING_AD_QUERY.size > 0 && Platform.OS === 'web' && typeof window !== 'undefined' && !gaHasReadLanding();
  if (STICKY_QUERY.size === 0 && !carryAdQuery) return path;
  let next = path;
  const entries = carryAdQuery ? [...STICKY_QUERY, ...LANDING_AD_QUERY] : [...STICKY_QUERY];
  for (const [key, value] of entries) {
    if (new RegExp(`[?&]${key}=`).test(next)) continue;
    next = `${next}${next.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
  }
  return next;
}
