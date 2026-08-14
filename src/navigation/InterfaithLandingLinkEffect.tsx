import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useEntryContextStore, readUtmFromWindow } from '../stores/entryContextStore';
import { navigationRef } from './navigationRef';
import { readInterfaithLandingFromWindow } from './interfaithLandingLink';

function navigateToInterfaithLanding(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', {
    screen: 'InterfaithLanding',
  });
}

/**
 * Web: `/interfaith` → InterfaithLanding screen.
 * Captures session entry context; guests are put into explore so Main can mount.
 */
export function InterfaithLandingLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const capture = useEntryContextStore((s) => s.capture);
  const pending = useRef(readInterfaithLandingFromWindow());

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
      navigateToInterfaithLanding();
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
