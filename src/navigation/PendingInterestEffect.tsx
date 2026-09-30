import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { useSession } from '../hooks/useSession';
import { applyStorefrontInterest } from '../hooks/useStorefrontInterest';

/** Guest tapped pre-register → signed in → mark that interest on their profile. */
export function PendingInterestEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const uid = useAuthStore((s) => s.user?.uid);
  const pendingKey = useAuthFlowStore((s) => s.pendingInterestKey);
  const { profile, loading, refresh } = useSession();
  const applying = useRef(false);

  useEffect(() => {
    // Wait for the profile so we merge into (not overwrite) existing interests.
    if (!pendingKey || !isAuthenticated || !uid || loading || !profile || applying.current) {
      return;
    }
    applying.current = true;
    const current = profile.storefrontInterests ?? [];
    void applyStorefrontInterest(uid, current, pendingKey, true)
      .then(() => refresh({ silent: true }))
      .catch(() => undefined)
      .finally(() => {
        useAuthFlowStore.getState().setPendingInterestKey(null);
        applying.current = false;
      });
  }, [pendingKey, isAuthenticated, uid, loading, profile, refresh]);

  return null;
}
