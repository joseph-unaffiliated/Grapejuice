import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { STORE_PATH_PREFIX, storefrontFromState } from './storeLink';
import { BOX_PATH, myBoxFromState } from './boxLink';
import { ACCOUNT_PATH, accountFromState } from './accountLink';
import { ORDERS_PATH, ordersFromState } from './ordersLink';
import {
  MY_GIFTS_PATH,
  myGiftsFromState,
  giftBoxFromState,
  giftRevealFromState,
  giftBoxPath,
  giftRevealPath,
} from './myGiftsLink';
import { CHECKOUT_PATH, checkoutFromState } from './checkoutLink';
import { GIFT_LANDING_PATH, giftLandingFromState } from './giftLandingLink';
import {
  GIFT_CUSTOMIZE_PATH,
  GIFT_GIVE_PATH,
  giftCustomizeFromState,
  giftGiveFromState,
} from './giftFlowLink';
import {
  dynamicLandingPathFromState,
  shouldPreserveMarketingPath,
} from './landingLink';
import { CULTURAL_LANDING_PATH, isCulturalLandingPath } from './culturalLandingLink';
import {
  getBootLocation,
  shouldPreserveInboundLandingUrl,
} from './bootLocation';
import { normalizeLandingPath } from '../constants/landingPaths';

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

  if (giftCustomizeFromState(state)) {
    if (search.includes('preview=')) {
      return `${GIFT_CUSTOMIZE_PATH}${search}`;
    }
    return GIFT_CUSTOMIZE_PATH;
  }

  if (giftGiveFromState(state)) {
    if (search.includes('preview=')) {
      return `${GIFT_GIVE_PATH}${search}`;
    }
    return GIFT_GIVE_PATH;
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

  if (checkoutFromState(state)) {
    // Preserve in-checkout payment step so history sync doesn't wipe ?step=payment.
    if (search.includes('preview=')) {
      return `${CHECKOUT_PATH}${search}`;
    }
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('step') === 'payment'
    ) {
      return `${CHECKOUT_PATH}?step=payment`;
    }
    return CHECKOUT_PATH;
  }

  if (ordersFromState(state)) {
    if (search.includes('preview=')) {
      return `${ORDERS_PATH}${search}`;
    }
    return ORDERS_PATH;
  }

  const giftBox = giftBoxFromState(state);
  if (giftBox) {
    const path = giftBoxPath(giftBox.giftInviteId);
    if (search.includes('preview=')) {
      return `${path}${search}`;
    }
    return path;
  }

  const giftReveal = giftRevealFromState(state);
  if (giftReveal) {
    const path = giftRevealPath(giftReveal.giftInviteId);
    if (search.includes('preview=')) {
      return `${path}${search}`;
    }
    return path;
  }

  if (myGiftsFromState(state)) {
    if (search.includes('preview=')) {
      return `${MY_GIFTS_PATH}${search}`;
    }
    return MY_GIFTS_PATH;
  }

  if (accountFromState(state)) {
    if (search.includes('preview=')) {
      return `${ACCOUNT_PATH}${search}`;
    }
    return ACCOUNT_PATH;
  }

  const store = storefrontFromState(state);
  if (store) {
    // Default web route is StorefrontHome. Don't let that rewrite an inbound
    // marketing landing URL to `/store` before the landing screen mounts.
    if (shouldPreserveInboundLandingUrl()) {
      const inbound = getBootLocation()?.pathname ?? currentPath;
      if (shouldPreserveMarketingPath(inbound) || isCulturalLandingPath(inbound)) {
        const path = isCulturalLandingPath(inbound)
          ? CULTURAL_LANDING_PATH
          : normalizeLandingPath(inbound);
        const inboundSearch = getBootLocation()?.search ?? search;
        return path + inboundSearch;
      }
    }
    if (search.includes('preview=')) {
      return `${store.path}${search}`;
    }
    return store.path;
  }

  if (currentPath === '/home') {
    return STORE_PATH_PREFIX + search;
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
  if (currentPath === ACCOUNT_PATH) {
    return currentPath + search;
  }
  if (currentPath === ORDERS_PATH) {
    return currentPath + search;
  }
  if (currentPath === MY_GIFTS_PATH) {
    return currentPath + search;
  }
  if (currentPath.startsWith(`${MY_GIFTS_PATH}/box/`) || currentPath.startsWith(`${MY_GIFTS_PATH}/reveal/`)) {
    return currentPath + search;
  }
  if (currentPath === BOX_PATH || currentPath === '/my-box') {
    return BOX_PATH + search;
  }
  if (currentPath === CHECKOUT_PATH) {
    return currentPath + search;
  }
  if (currentPath === GIFT_LANDING_PATH) {
    return currentPath + search;
  }
  if (currentPath === GIFT_GIVE_PATH || currentPath === GIFT_CUSTOMIZE_PATH) {
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
    return `${STORE_PATH_PREFIX}${search}`;
  }

  // Other Main stack screens — stay off `/` so grapejuice.co keeps landing on store.
  return STORE_PATH_PREFIX;
}
