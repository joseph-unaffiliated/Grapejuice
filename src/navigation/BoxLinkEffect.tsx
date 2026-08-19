import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { navigationRef } from './navigationRef';
import { readBoxPathFromWindow } from './boxLink';

function navigateToMyBox(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'MyBox' });
}

/**
 * Web: `/box` (and `/my-box`) → My Box.
 * Guests who land cold are put into explore so MainGate can mount.
 */
export function BoxLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const pending = useRef(readBoxPathFromWindow());

  useEffect(() => {
    if (!pending.current) return;
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
      if (useGuestSessionStore.getState().buildBoxPath) return;
      clearInterval(id);
      pending.current = false;
      navigateToMyBox();
    }, 50);
    return () => clearInterval(id);
  }, [
    authLoading,
    isAuthenticated,
    exploreStarted,
    guestOnboardingComplete,
    guestBoxRevealComplete,
  ]);

  return null;
}
