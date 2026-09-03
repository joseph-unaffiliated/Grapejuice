import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { navigationRef } from './navigationRef';
import { DEFAULT_STOREFRONT_CATEGORY, resolveStorefrontCategorySlug } from '../constants/storefrontCategories';
import { readStorePathFromBoot } from './storeLink';
import { readBoxPathFromWindow } from './boxLink';
import { readCheckoutPathFromWindow } from './checkoutLink';
import { readDevPreviewFromWindow } from './devPreview';
import { peekPendingMainNav } from './pendingMainNav';
import { useAuthFlowStore } from '../stores/authFlowStore';

/** Previews that intentionally land on storefront (StorefrontLinkEffect may run). */
const STOREFRONT_PREVIEW_KEYS = new Set([
  'storefront',
  'store',
  'storefront-category',
  'store-category',
]);

function navigateToStore(target: { kind: 'home' } | { kind: 'category'; category: string }): void {
  if (!navigationRef.isReady()) return;
  if (target.kind === 'home') {
    navigationRef.navigate('Main', { screen: 'StorefrontHome' });
    return;
  }
  if (target.category === 'favorites') {
    navigationRef.navigate('Main', { screen: 'StorefrontFavorites' });
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
 * Skips when `?preview=` is a non-storefront design preview (e.g. my-box).
 */
export function StorefrontLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const buildBoxPath = useGuestSessionStore((s) => s.buildBoxPath);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  /** Capture once — history sync must not erase the target mid-boot. */
  const pending = useRef(readStorePathFromBoot());

  useEffect(() => {
    const preview = readDevPreviewFromWindow();
    if (preview && !STOREFRONT_PREVIEW_KEYS.has(preview.key)) {
      return;
    }

    const target = pending.current;
    if (!target) return;

    if (readBoxPathFromWindow() || peekPendingMainNav()?.screen === 'MyBox') {
      pending.current = null;
      return;
    }

    if (readCheckoutPathFromWindow() || peekPendingMainNav()?.screen === 'Checkout') {
      pending.current = null;
      return;
    }

    // After box reveal, Main is handed off to My Box (or already has a box).
    // Do not re-apply the cold /store deep link when reveal flags flip — that
    // was racing the pending MyBox navigation and dumping users on marketplace home.
    if (guestBoxRevealComplete || peekPendingMainNav()?.screen === 'MyBox') {
      pending.current = null;
      return;
    }
    if (
      useAuthFlowStore.getState().pendingReturn === 'MyBox' ||
      useAuthFlowStore.getState().pendingReturn === 'GiftGiverCustomize' ||
      useAuthFlowStore.getState().pendingReturn === 'GiftGive' ||
      peekPendingMainNav()?.screen === 'GiftGiverCustomize' ||
      peekPendingMainNav()?.screen === 'GiftGive'
    ) {
      pending.current = null;
      return;
    }

    // User is in the box-builder — don't yank the root gate to Main/storefront.
    if (buildBoxPath) {
      return;
    }

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
      // Re-check: build may have started while we waited for nav ready.
      if (useGuestSessionStore.getState().buildBoxPath) return;
      clearInterval(id);
      // Consume so later explore/onboarding flag changes don't re-navigate.
      pending.current = null;
      navigateToStore(target);
    }, 50);
    return () => clearInterval(id);
  }, [
    isAuthenticated,
    exploreStarted,
    buildBoxPath,
    guestOnboardingComplete,
    guestBoxRevealComplete,
  ]);

  return null;
}
