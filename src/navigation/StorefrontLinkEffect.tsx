import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { navigationRef } from './navigationRef';
import { DEFAULT_STOREFRONT_CATEGORY, resolveStorefrontCategorySlug } from '../constants/storefrontCategories';
import { readStorePathFromWindow } from './storeLink';

function navigateToStore(target: { kind: 'home' } | { kind: 'category'; category: string }): void {
  if (!navigationRef.isReady()) return;
  if (target.kind === 'home') {
    navigationRef.navigate('Main', { screen: 'StorefrontHome' });
    return;
  }
  navigationRef.navigate('Main', {
    screen: 'StorefrontCategory',
    params: {
      category: resolveStorefrontCategorySlug(
        target.category || DEFAULT_STOREFRONT_CATEGORY
      ),
    },
  });
}

/**
 * Web: `/store`, `/store/:category`, or bare `/` → storefront screens.
 * Guests who land cold are put into explore so MainGate can mount.
 * Bare `/` is canonicalized to `/store` in the address bar.
 */
export function StorefrontLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  /** Capture once — history sync must not erase the target mid-boot. */
  const pending = useRef(readStorePathFromWindow());

  useEffect(() => {
    const target = pending.current;
    if (!target) return;

    if (typeof window !== 'undefined') {
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      if (path === '/') {
        window.history.replaceState({ gjNav: true }, '', '/store' + window.location.search);
      }
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
      navigateToStore(target);
    }, 50);
    return () => clearInterval(id);
  }, [isAuthenticated, exploreStarted, guestOnboardingComplete, guestBoxRevealComplete]);

  return null;
}
