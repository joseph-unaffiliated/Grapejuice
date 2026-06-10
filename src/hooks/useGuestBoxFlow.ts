import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useAuthFlowStore } from '../stores/authFlowStore';

/** Guest box build + view-only customize rules for the Hanukkah box flow. */
export function useGuestBoxFlow() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);

  const startAuth = useAuthFlowStore((s) => s.startAuthFromGuest);

  const isGuest = !isAuthenticated;
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
