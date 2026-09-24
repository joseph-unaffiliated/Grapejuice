import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { navigationRef } from './navigationRef';
import { readContentRouteFromWindow, type StorefrontContentRoute } from './contentLink';

function navigateToContent(route: StorefrontContentRoute): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: route });
}

/**
 * Web: `/story`, `/passover`, `/how-to/play-dreidel`, `/how-to/light-candles`
 * → storefront content screens. Cold guests enter explore so MainGate can mount.
 */
export function ContentLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const pending = useRef(readContentRouteFromWindow());

  useEffect(() => {
    const route = pending.current;
    if (!route) return;

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
      pending.current = null;
      navigateToContent(route);
    }, 50);
    return () => clearInterval(id);
  }, [isAuthenticated, exploreStarted, guestOnboardingComplete, guestBoxRevealComplete]);

  return null;
}
