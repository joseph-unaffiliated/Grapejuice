import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useEntryContextStore, readUtmFromWindow } from '../stores/entryContextStore';
import { navigationRef } from './navigationRef';
import { readForYourHomeLandingFromWindow } from './forYourHomeLandingLink';

function navigateToForYourHomeLanding(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'ForYourHomeLanding' });
}

/** Web: `/for-your-home` → ForYourHomeLanding. */
export function ForYourHomeLandingLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const capture = useEntryContextStore((s) => s.capture);
  const pending = useRef(readForYourHomeLandingFromWindow());

  useEffect(() => {
    const target = pending.current;
    if (!target) return;

    capture({
      audienceId: target.audience.id,
      sourcePath: target.audience.path,
      utm: readUtmFromWindow(),
    });

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
      pending.current = null;
      navigateToForYourHomeLanding();
    }, 50);
    return () => clearInterval(id);
  }, [
    isAuthenticated,
    exploreStarted,
    guestOnboardingComplete,
    guestBoxRevealComplete,
    capture,
  ]);

  return null;
}
