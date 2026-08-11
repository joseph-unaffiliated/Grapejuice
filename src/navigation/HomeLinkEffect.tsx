import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { navigationRef } from './navigationRef';
import { readHomePathFromWindow } from './homeLink';

function navigateToAppHome(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'MainTabs', params: { screen: 'Home' } });
}

/**
 * Web: `/home` deep link → MainTabs Home (family box homepage).
 * Guests who land cold are put into explore so MainGate can mount.
 */
export function HomeLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const pending = useRef(readHomePathFromWindow());

  useEffect(() => {
    if (!pending.current) return;
    // Wait for redirect / onAuthStateChanged so a Google return to /home is not
    // forced into guest explore before the session is applied.
    if (authLoading) return;

    if (
      !isAuthenticated &&
      !exploreStarted &&
      !guestOnboardingComplete &&
      !guestBoxRevealComplete
    ) {
      useGuestSessionStore.getState().startExplore();
    }

    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      clearInterval(id);
      navigateToAppHome();
    }, 50);
    return () => clearInterval(id);
  }, [authLoading, isAuthenticated, exploreStarted, guestOnboardingComplete, guestBoxRevealComplete]);

  return null;
}
