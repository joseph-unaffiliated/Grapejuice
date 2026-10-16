import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { useBoxPresenceStore } from '../stores/boxPresenceStore';

/** Guest box build + view-only customize rules for the Hanukkah box flow. */
export function useGuestBoxFlow() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const wasAuthenticated = useBoxPresenceStore((s) => s.wasAuthenticated);
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);

  const startAuth = useAuthFlowStore((s) => s.startAuthFromGuest);

  // Cold load: don't treat a restoring signed-in session as a guest (avoids onboarding flash).
  const isGuest = !isAuthenticated && !(authLoading && wasAuthenticated);
  const guestNeedsOnboarding = isGuest && !guestBoxRevealComplete;
  const guestViewOnly = isGuest && guestBoxRevealComplete;

  /** Returns true when onboarding was started (caller should not open My Box). */
  const beginBoxBuild = useCallback(() => {
    if (!guestNeedsOnboarding) return false;
    startBuildBox();
    return true;
  }, [guestNeedsOnboarding, startBuildBox]);

  const requireAuthToCustomize = useCallback(
    (entry: 'signup' | 'signin' = 'signup') => {
      startAuth('MyBox', entry, entry === 'signin' ? 'SignInEmail' : 'SignUp');
    },
    [startAuth]
  );

  return {
    isGuest,
    guestNeedsOnboarding,
    guestViewOnly,
    beginBoxBuild,
    requireAuthToCustomize,
  };
}
