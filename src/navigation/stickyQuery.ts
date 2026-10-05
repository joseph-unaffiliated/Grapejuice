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

export const VISITOR_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const landing = new URLSearchParams(window.location.search);
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
  if (STICKY_QUERY.size === 0) return path;
  let next = path;
  for (const [key, value] of STICKY_QUERY) {
    if (new RegExp(`[?&]${key}=`).test(next)) continue;
    next = `${next}${next.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
  }
  return next;
}
