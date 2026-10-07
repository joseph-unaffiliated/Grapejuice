import { Platform } from 'react-native';
import { readUtmFromWindow } from '../../stores/entryContextStore';

/**
 * Report a landing from an Unaffiliated newsletter link (`?userID=`, captured and stripped by
 * public/index.html) to magic.unaffiliated.co. Magic records the reader's location on the
 * Unaffiliated side, flags them as Jewish-interested, and forwards email + location to
 * functions/src/unaffiliated.ts for the Untraditional Customer.io workspace.
 */

const SITE_VISIT_URL = 'https://magic.unaffiliated.co/api/site-visit';

declare global {
  interface Window {
    __gjUnaffiliatedUserId?: string | null;
  }
}

let reported = false;

export function reportUnaffiliatedVisit(): void {
  if (reported || Platform.OS !== 'web' || typeof window === 'undefined') return;
  reported = true;
  const userID = window.__gjUnaffiliatedUserId;
  if (!userID) return;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return;
  try {
    void fetch(SITE_VISIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site: 'grapejuice',
        userID,
        utm: readUtmFromWindow(),
        path: window.location.pathname.slice(0, 200),
      }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  } catch {
    // reporting must never break boot
  }
}
