import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useEntryContextStore, readUtmFromWindow } from '../stores/entryContextStore';
import { navigationRef } from './navigationRef';
import { readGiftLandingFromWindow } from './giftLandingLink';

function navigateToGiftLanding(preferredGiftPath: 'customize' | 'credit_only' | null): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', {
    screen: 'GiftLanding',
    params: preferredGiftPath ? { preferredGiftPath } : undefined,
  });
}

/**
 * Web: `/gift` (not `/gift/claim`) → GiftLanding screen.
 * Captures session entry context; guests are put into explore so Main can mount.
 */
export function GiftLandingLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const capture = useEntryContextStore((s) => s.capture);
  const pending = useRef(readGiftLandingFromWindow());

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
      navigateToGiftLanding(target.preferredGiftPath);
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
