import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { navigationRef } from './navigationRef';
import { readHomePathFromWindow } from './homeLink';
import { storePathHome } from './storeLink';

function navigateToStorefront(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'StorefrontHome' });
  if (typeof window !== 'undefined' && window.history.replaceState) {
    const search = window.location.search;
    window.history.replaceState({}, '', `${storePathHome()}${search === '?' ? '' : search}`);
  }
}

/**
 * Web: legacy `/home` deep link → redirect to storefront home (`/`).
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
    if (authLoading) return;

    if (guestBoxRevealComplete) {
      pending.current = null;
      return;
    }

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
      navigateToStorefront();
    }, 50);
    return () => clearInterval(id);
  }, [authLoading, isAuthenticated, exploreStarted, guestOnboardingComplete, guestBoxRevealComplete]);

  return null;
}
