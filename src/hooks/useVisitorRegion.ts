import { useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';

const notedThisSession = new Set<string>();

/**
 * Once per app session per signed-in account, let the server record an approximate region from
 * the request IP (functions/src/guestSessions.ts `noteVisitorRegion`) for the admin dashboard.
 */
export function useVisitorRegion(): void {
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  useEffect(() => {
    if (!uid || notedThisSession.has(uid)) return;
    notedThisSession.add(uid);
    httpsCallable(functions, 'noteVisitorRegion')().catch(() => undefined);
  }, [uid]);
}

/** Mount once near the navigation root. */
export function VisitorRegionEffect(): null {
  useVisitorRegion();
  return null;
}
