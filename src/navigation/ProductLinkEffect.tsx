import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { navigationRef } from './navigationRef';
import { readProductSlugFromWindow } from './productLink';

function navigateToProduct(slug: string): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', {
    screen: 'CatalogProduct',
    params: { slug },
  });
}

/**
 * Web: `/product/:slug` deep link → CatalogProduct.
 * Guests who land cold are put into explore so MainGate can mount.
 */
export function ProductLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);

  useEffect(() => {
    const slug = readProductSlugFromWindow();
    if (!slug) return;

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
      navigateToProduct(slug);
    }, 50);
    return () => clearInterval(id);
  }, [isAuthenticated, exploreStarted, guestOnboardingComplete, guestBoxRevealComplete]);

  return null;
}
