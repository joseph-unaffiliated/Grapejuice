import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { STORE_PATH_PREFIX, storefrontFromState } from './storeLink';
import { HOME_PATH, mainAppShellFromState } from './homeLink';
import { BOX_PATH, myBoxFromState } from './boxLink';
import { GIFT_LANDING_PATH, giftLandingFromState } from './giftLandingLink';
import {
  dynamicLandingPathFromState,
  shouldPreserveMarketingPath,
} from './landingLink';
import { CULTURAL_LANDING_PATH, isCulturalLandingPath } from './culturalLandingLink';

export const PRODUCT_PATH_PREFIX = '/product';

/** Browser path for a catalog product (`/product/arch-menorah`). */
export function productPathForSlug(slug: string): string {
  const clean = slug.trim().replace(/^\/+|\/+$/g, '');
  if (!clean) return STORE_PATH_PREFIX;
  return `${PRODUCT_PATH_PREFIX}/${encodeURIComponent(clean)}`;
}

/** Read `/product/:slug` from the current location (web only). */
export function readProductSlugFromWindow(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const prefix = PRODUCT_PATH_PREFIX;
  if (path === prefix) return null;
  if (!path.startsWith(`${prefix}/`)) return null;
  const raw = path.slice(prefix.length + 1).split('/')[0] ?? '';
  try {
    const slug = decodeURIComponent(raw).trim();
    return slug || null;
  } catch {
    return raw.trim() || null;
  }
}

/** Walk the nav tree for an active CatalogProduct slug. */
export function catalogProductSlugFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): string | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'CatalogProduct') {
      const params = route.params as { slug?: string; itemId?: string } | undefined;
      const slug = params?.slug?.trim() || params?.itemId?.trim();
      return slug || null;
    }
    current = route.state;
  }
  return null;
}

/** Path that should appear in the address bar for this navigation state. */
export function browserPathForNavigationState(
  state: NavigationState | PartialState<NavigationState> | undefined
): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return STORE_PATH_PREFIX;

  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  const search = window.location.search;

  if (currentPath.endsWith('/gift/claim')) {
    return window.location.pathname + search;
  }

  const giftLanding = giftLandingFromState(state);
  if (giftLanding) {
    if (search.includes('preview=')) {
      return `${giftLanding}${search}`;
    }
    // Keep UTM / path query while on the landing.
    if (currentPath === GIFT_LANDING_PATH && search) {
      return `${giftLanding}${search}`;
    }
    return giftLanding;
  }

  const marketingLanding = dynamicLandingPathFromState(state);
  if (marketingLanding) {
    if (search.includes('preview=')) {
      return `${marketingLanding}${search}`;
    }
    if (
      (currentPath === marketingLanding || isCulturalLandingPath(currentPath)) &&
      search
    ) {
      // Canonicalize legacy `/unaffiliated` → `/your-way` when that landing is active.
      const path =
        isCulturalLandingPath(currentPath) && marketingLanding === CULTURAL_LANDING_PATH
          ? CULTURAL_LANDING_PATH
          : marketingLanding;
      return `${path}${search}`;
    }
    return marketingLanding;
  }

  const slug = catalogProductSlugFromState(state);
  if (slug) return productPathForSlug(slug);

  if (myBoxFromState(state)) {
    if (search.includes('preview=')) {
      return `${BOX_PATH}${search}`;
    }
    return BOX_PATH;
  }

  const store = storefrontFromState(state);
  if (store) {
    if (search.includes('preview=')) {
      return `${store.path}${search}`;
    }
    return store.path;
  }

  if (mainAppShellFromState(state)) {
    if (search.includes('preview=')) {
      return `${HOME_PATH}${search}`;
    }
    return HOME_PATH;
  }

  /**
   * Preserve deep-link URLs until the matching screen mounts.
   * Otherwise MainTabs' first sync rewrites `/store` or `/product/…` away
   * and the link effect loses its target.
   */
  if (
    currentPath === '/' ||
    currentPath === STORE_PATH_PREFIX ||
    currentPath.startsWith(`${STORE_PATH_PREFIX}/`)
  ) {
    // Canonicalize bare `/` to `/store` while the storefront mounts.
    const path = currentPath === '/' ? STORE_PATH_PREFIX : currentPath;
    return path + search;
  }
  if (currentPath === HOME_PATH) {
    return currentPath + search;
  }
  if (currentPath === BOX_PATH || currentPath === '/my-box') {
    return BOX_PATH + search;
  }
  if (currentPath === GIFT_LANDING_PATH) {
    return currentPath + search;
  }
  if (shouldPreserveMarketingPath(currentPath) || isCulturalLandingPath(currentPath)) {
    // Canonicalize legacy cultural path while DynamicLanding mounts.
    if (isCulturalLandingPath(currentPath)) {
      return CULTURAL_LANDING_PATH + search;
    }
    return currentPath + search;
  }
  if (currentPath.startsWith(`${PRODUCT_PATH_PREFIX}/`)) {
    return currentPath + search;
  }

  if (search.includes('preview=')) {
    return `${HOME_PATH}${search}`;
  }

  // Other MainTabs (Rav, Account, …) — stay off `/` so grapejuice.co keeps landing on store.
  return HOME_PATH;
}
