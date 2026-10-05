import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useGiftIntentStore } from '../stores/giftIntentStore';
import { metaTrackingSuppressed } from '../services/analytics/metaPixel';
import { getVisitorId } from '../services/guest/visitorId';
import {
  beaconGuestSession,
  buildGuestSnapshot,
  guestSessionSyncEnabled,
  saveGuestSessionRemote,
} from '../services/guest/guestSessionSync';

const DEBOUNCE_MS = 3_000;

/**
 * Mirror a signed-out visitor's box to `guestSessions/{visitorId}` so a Retention lead can be
 * emailed a link that restores it (functions/src/retentionLead.ts).
 *
 * - Web, signed-out only. Internal sessions (localhost, previews, mock flows) never save.
 * - Debounced 3s after any guest/gift store change; skips unchanged snapshots.
 * - `pagehide` flushes the last unsaved edit through `sendBeacon`.
 * - Kill switch: `config/features.guestSessionSync = false` stops saving without a deploy.
 */
export function useGuestSessionSync(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (authLoading || isAuthenticated) return;
    if (metaTrackingSuppressed()) return;
    const visitorId = getVisitorId();
    if (!visitorId) return;

    let enabled = false;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSavedJson = '';
    let pendingJson = '';

    const flush = async () => {
      timer = null;
      if (!enabled || disposed || !pendingJson) return;
      const json = pendingJson;
      pendingJson = '';
      try {
        await saveGuestSessionRemote(visitorId, JSON.parse(json));
        lastSavedJson = json;
      } catch {
        // Next change re-queues; recovery is best effort.
      }
    };

    const schedule = () => {
      if (!enabled || disposed) return;
      const snapshot = buildGuestSnapshot();
      if (!snapshot) return;
      const json = JSON.stringify(snapshot);
      if (json === lastSavedJson) return;
      pendingJson = json;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), DEBOUNCE_MS);
    };

    const onPageHide = () => {
      if (!enabled || !pendingJson) return;
      if (beaconGuestSession(visitorId, pendingJson)) {
        lastSavedJson = pendingJson;
        pendingJson = '';
      }
    };

    const unsubGuest = useGuestSessionStore.subscribe(schedule);
    const unsubGift = useGiftIntentStore.subscribe(schedule);
    window.addEventListener('pagehide', onPageHide);

    void guestSessionSyncEnabled().then((on) => {
      if (disposed) return;
      enabled = on;
      schedule();
    });

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubGuest();
      unsubGift();
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [authLoading, isAuthenticated]);
}

/** Mount once near the navigation root. */
export function GuestSessionSyncEffect(): null {
  useGuestSessionSync();
  return null;
}
