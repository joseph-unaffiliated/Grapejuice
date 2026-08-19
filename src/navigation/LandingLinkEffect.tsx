import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useEntryContextStore, readUtmFromWindow } from '../stores/entryContextStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { navigationRef } from './navigationRef';
import { readMarketingLandingFromWindow } from './landingLink';

function navigateToDynamicLanding(landingId: string): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', {
    screen: 'DynamicLanding',
    params: { landingId },
  });
}

/**
 * Web: any marketing landing path (code seeds + CMS-only slugs) → DynamicLanding.
 * Gift (`/gift`, `?path=`) stays on GiftLandingLinkEffect.
 */
export function LandingLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const capture = useEntryContextStore((s) => s.capture);
  const pending = useRef<{ landingId: string } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const target = await readMarketingLandingFromWindow();
      if (cancelled) return;
      if (!target) {
        pending.current = null;
        return;
      }

      pending.current = { landingId: target.audience.id };
      capture({
        audienceId: target.audience.id,
        sourcePath: target.audience.path,
        utm: readUtmFromWindow(),
      });

      if (
        !useAuthStore.getState().isAuthenticated &&
        !useGuestSessionStore.getState().exploreStarted &&
        !useGuestSessionStore.getState().onboardingComplete &&
        !useGuestSessionStore.getState().boxRevealComplete
      ) {
        useGuestSessionStore.getState().startExplore();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [capture]);

  useEffect(() => {
    const id = setInterval(() => {
      // undefined = still resolving URL; null = not a marketing landing.
      if (pending.current === undefined) return;
      if (pending.current === null) {
        clearInterval(id);
        return;
      }
      if (!navigationRef.isReady()) return;
      if (useGuestSessionStore.getState().buildBoxPath) return;
      if (useAuthFlowStore.getState().pendingReturn === 'MyBox') {
        pending.current = null;
        clearInterval(id);
        return;
      }

      if (
        !useAuthStore.getState().isAuthenticated &&
        !useGuestSessionStore.getState().exploreStarted &&
        !useGuestSessionStore.getState().onboardingComplete &&
        !useGuestSessionStore.getState().boxRevealComplete
      ) {
        useGuestSessionStore.getState().startExplore();
      }

      const landingId = pending.current.landingId;
      pending.current = null;
      clearInterval(id);
      navigateToDynamicLanding(landingId);
    }, 50);
    return () => clearInterval(id);
  }, [
    isAuthenticated,
    exploreStarted,
    guestOnboardingComplete,
    guestBoxRevealComplete,
  ]);

  return null;
}
