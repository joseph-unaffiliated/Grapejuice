import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { browserPathForNavigationState, PRODUCT_PATH_PREFIX } from './productLink';
import { BOX_PATH } from './boxLink';
import { CHECKOUT_PATH } from './checkoutLink';
import { ACCOUNT_PATH } from './accountLink';
import { ORDERS_PATH } from './ordersLink';
import {
  MY_GIFTS_PATH,
  readGiftBoxIdFromPath,
  readGiftRevealIdFromPath,
} from './myGiftsLink';
import { readStorePathFromPathname } from './storeLink';
import { GIFT_LANDING_PATH } from './giftLandingLink';
import { GIFT_CUSTOMIZE_PATH, GIFT_GIVE_PATH } from './giftFlowLink';
import { contentRouteFromPath } from './contentLink';
import { landingAudienceFromPath } from '../constants/landingAudiences';
import { normalizeLandingPath } from '../constants/landingPaths';
import { DEFAULT_STOREFRONT_CATEGORY, resolveStorefrontCategorySlug } from '../constants/storefrontCategories';
import { navigateMainStack, navigateMainTab, navigateToLanding } from './mainStackNavigation';
import { useGiftIntentStore } from '../stores/giftIntentStore';
import { useAuthStore } from '../stores/authStore';
import { openBoxSurface } from './boxEntry';
import { DEFAULT_GIFT_CHILDREN } from '../screens/gift/giftGiveTypes';
import { retentionPage } from '../services/analytics/retention';
import { metaTrackingSuppressed, trackMeta } from '../services/analytics/metaPixel';
import { setGaDisabled } from '../services/analytics/googleAnalytics';

type GjHistoryState = { gjNav: true; idx: number };

let suppressHistoryPush = false;
/** Mirrors `history.state.idx` for the entry we're currently showing. */
let historyIdx = 0;
const navHistory: string[] = [];

/**
 * Retention's installer test opens `?vge=true&aid=<account>`; ge.js reads both from location.href
 * whenever it finishes loading and reports them in its script beacon, so keep them in the URL.
 */
const RETENTION_TEST_QUERY = ((): string => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  const landing = new URLSearchParams(window.location.search);
  if (landing.get('vge') !== 'true') return '';
  const kept = new URLSearchParams({ vge: 'true' });
  const aid = landing.get('aid');
  if (aid) kept.set('aid', aid);
  return kept.toString();
})();

function withRetentionTest(path: string): string {
  if (!RETENTION_TEST_QUERY || /[?&]vge=true\b/.test(path)) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${RETENTION_TEST_QUERY}`;
}

function stateFingerprint(state: NavigationState | PartialState<NavigationState>): string {
  const parts: string[] = [];
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    parts.push(`${route.name}:${index}`);
    if (route.name === 'CatalogProduct') {
      const params = route.params as { slug?: string; itemId?: string } | undefined;
      parts.push(params?.slug ?? params?.itemId ?? '');
    }
    if (route.name === 'StorefrontCategory') {
      const params = route.params as {
        category?: string;
        q?: string;
        avail?: string;
        style?: string;
      } | undefined;
      parts.push(params?.category ?? '');
      parts.push(params?.q ?? '');
      parts.push(params?.avail ?? '');
      parts.push(params?.style ?? '');
    }
    if (route.name === 'StorefrontFavorites') {
      parts.push('favorites');
    }
    if (route.name === 'MyGifts') {
      parts.push('my-gifts');
    }
    if (route.name === 'GiftBox') {
      const params = route.params as { giftInviteId?: string } | undefined;
      parts.push(`gift-box:${params?.giftInviteId ?? ''}`);
    }
    if (route.name === 'GiftRecipientReveal') {
      const params = route.params as { giftInviteId?: string } | undefined;
      parts.push(`gift-reveal:${params?.giftInviteId ?? ''}`);
    }
    current = route.state;
  }
  return parts.join('/');
}

function syncBrowserUrl(state: NavigationState, mode: 'push' | 'replace'): void {
  const nextPath = withRetentionTest(browserPathForNavigationState(state));
  const current = window.location.pathname + window.location.search;
  if (mode === 'replace') {
    window.history.replaceState({ gjNav: true, idx: historyIdx }, '', nextPath);
    return;
  }
  if (current === nextPath) return;
  historyIdx += 1;
  window.history.pushState({ gjNav: true, idx: historyIdx }, '', nextPath);
}

/** Replace the current history entry (same idx) — e.g. leave a checkout step after success. */
export function replaceBrowserPath(path: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.history.replaceState({ gjNav: true, idx: historyIdx }, '', withRetentionTest(path));
}

/** Push a new history entry — e.g. shipping → payment so Back returns to shipping. */
export function pushBrowserPath(path: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const current = window.location.pathname + window.location.search;
  const nextPath = withRetentionTest(path);
  if (current === nextPath) return;
  historyIdx += 1;
  window.history.pushState({ gjNav: true, idx: historyIdx }, '', nextPath);
}

/**
 * Pathname of the screen React Navigation thinks is active (no query).
 * Used to detect in-screen history (checkout shipping ↔ payment).
 */
function activeScreenPathname(state: NavigationState | undefined): string | null {
  if (!state) return null;
  const full = browserPathForNavigationState(state);
  return full.split('?')[0]?.replace(/\/$/, '') || '/';
}

/**
 * Open the Main screen that owns the current address bar.
 * Used for browser Forward (and popstate entries that lack an idx).
 * `navigate` to an existing stack route pops back to it; otherwise it pushes.
 */
function restoreFromBrowserUrl(): void {
  if (!navigationRef.isReady()) return;
  restoreFromPath(window.location.pathname, window.location.search);
}

/**
 * Open an in-app path the way a deep link would (Rav "navigate", links in chat).
 * `/box` goes through `openBoxSurface` so guests without a box start the builder.
 * Returns false when the path isn't a known screen.
 */
export function navigateToAppPath(rawPath: string): boolean {
  if (!navigationRef.isReady()) return false;
  const [pathPart, query = ''] = rawPath.trim().split('?');
  const path = (pathPart || '/').replace(/\/$/, '') || '/';
  if (path === BOX_PATH || path === '/my-box') {
    openBoxSurface(useAuthStore.getState().isAuthenticated);
    return true;
  }
  return restoreFromPath(path, query ? `?${query}` : '');
}

function restoreFromPath(pathname: string, search: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';

  if (path === CHECKOUT_PATH) {
    navigateMainStack('Checkout');
    return true;
  }
  if (path === BOX_PATH || path === '/my-box') {
    navigateMainStack('MyBox');
    return true;
  }
  if (path === ORDERS_PATH) {
    navigateMainStack('Orders');
    return true;
  }
  if (path === MY_GIFTS_PATH) {
    navigateMainStack('MyGifts');
    return true;
  }
  const giftBoxId = readGiftBoxIdFromPath(path);
  if (giftBoxId) {
    navigateMainStack('GiftBox', { giftInviteId: giftBoxId });
    return true;
  }
  const giftRevealId = readGiftRevealIdFromPath(path);
  if (giftRevealId) {
    // Reveal is transitional — land on the editable gift box.
    navigateMainStack('GiftBox', { giftInviteId: giftRevealId });
    return true;
  }
  if (path === ACCOUNT_PATH) {
    navigateMainTab('Account');
    return true;
  }
  if (path === GIFT_LANDING_PATH) {
    navigateToLanding('gift');
    return true;
  }
  if (path === GIFT_CUSTOMIZE_PATH) {
    const intent = useGiftIntentStore.getState();
    const draft = intent.status === 'incomplete' ? intent.draft : null;
    if (draft?.form && draft.childDrafts?.length) {
      navigateMainStack('GiftGiverCustomize', {
        form: { ...draft.form, giftPath: 'customize' as const },
        childDrafts: draft.childDrafts,
        lineItems: draft.lineItems,
      });
    } else {
      navigateMainStack('GiftGive', {
        form: {
          recipientEmail: '',
          giverName: '',
          message: '',
          giftPath: 'customize' as const,
        },
        childDrafts: DEFAULT_GIFT_CHILDREN,
        initialGiftPath: 'customize' as const,
      });
    }
    return true;
  }
  if (path === GIFT_GIVE_PATH) {
    const intent = useGiftIntentStore.getState();
    const draft = intent.status === 'incomplete' ? intent.draft : null;
    if (draft?.form) {
      navigateMainStack('GiftGive', {
        form: draft.form,
        childDrafts: draft.childDrafts?.length ? draft.childDrafts : DEFAULT_GIFT_CHILDREN,
        initialGiftPath: draft.form.giftPath ?? undefined,
      });
    } else {
      navigateMainStack('GiftGive');
    }
    return true;
  }
  if (path.startsWith(`${PRODUCT_PATH_PREFIX}/`)) {
    const raw = path.slice(PRODUCT_PATH_PREFIX.length + 1).split('/')[0] ?? '';
    let slug = raw;
    try {
      slug = decodeURIComponent(raw).trim();
    } catch {
      slug = raw.trim();
    }
    if (slug) {
      navigateMainStack('CatalogProduct', { slug });
      return true;
    }
  }

  const contentRoute = contentRouteFromPath(path);
  if (contentRoute) {
    navigateMainStack(contentRoute);
    return true;
  }

  const store = readStorePathFromPathname(path, search);
  if (store) {
    if (store.kind === 'home') {
      navigateMainStack('StorefrontHome');
      return true;
    }
    if (store.category === 'favorites') {
      navigateMainStack('StorefrontFavorites');
      return true;
    }
    navigateMainStack('StorefrontCategory', {
      category: resolveStorefrontCategorySlug(store.category || DEFAULT_STOREFRONT_CATEGORY),
      ...(store.q ? { q: store.q } : null),
      ...(store.avail ? { avail: store.avail } : null),
      ...(store.style ? { style: store.style } : null),
    });
    return true;
  }

  const audience = landingAudienceFromPath(normalizeLandingPath(path));
  if (audience) {
    navigateToLanding(audience.id);
    return true;
  }
  return false;
}

/** Push a browser history entry when in-app navigation moves forward. */
export function onWebNavigationStateChange(state?: NavigationState): void {
  if (Platform.OS !== 'web' || !state || suppressHistoryPush) return;
  // GA's automatic page_view fires on the history change below.
  setGaDisabled(metaTrackingSuppressed());

  const fingerprint = stateFingerprint(state);
  const nextPath = withRetentionTest(browserPathForNavigationState(state));
  const current = window.location.pathname + window.location.search;
  const previousIndex = navHistory.indexOf(fingerprint);

  if (navHistory.length === 0) {
    navHistory.push(fingerprint);
    syncBrowserUrl(state, 'replace');
    // index.html already fired the landing PageView.
    lastMetaPageViewPath = window.location.pathname;
    return;
  }

  if (previousIndex === -1) {
    navHistory.push(fingerprint);
    // Always advance the address bar when the path changed (category / filters).
    const mode = current === nextPath ? 'replace' : 'push';
    syncBrowserUrl(state, mode);
    // SPA pageview for Retention (initial load already called geq.page() in index.html).
    if (mode === 'push') retentionPage();
    trackMetaPageViewIfPathChanged();
    return;
  }

  if (previousIndex < navHistory.length - 1) {
    navHistory.splice(previousIndex + 1);
  }
  // Same stack entry revisited (or filter tweak) — keep the URL honest.
  syncBrowserUrl(state, 'replace');
  trackMetaPageViewIfPathChanged();
}

let lastMetaPageViewPath: string | null = null;

/** Meta PageView per distinct pathname (Back/Forward included; filter-only query tweaks skipped). */
function trackMetaPageViewIfPathChanged(): void {
  const path = window.location.pathname;
  if (path === lastMetaPageViewPath) return;
  lastMetaPageViewPath = path;
  trackMeta('PageView');
}

/**
 * Wire browser Back / Forward to in-app navigation.
 *
 * `popstate` fires for both directions. Always calling `goBack()` made Forward
 * from Box→Checkout→Back pop My Box and land on Store. Track an idx so Back
 * still pops and Forward restores the URL's screen.
 */
export function installWebBrowserHistory(): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};

  const onPopState = (event: PopStateEvent) => {
    if (!navigationRef.isReady()) return;
    setGaDisabled(metaTrackingSuppressed());

    const nextIdx =
      event.state && typeof (event.state as GjHistoryState).idx === 'number'
        ? (event.state as GjHistoryState).idx
        : null;

    suppressHistoryPush = true;
    try {
      if (nextIdx == null) {
        restoreFromBrowserUrl();
        return;
      }
      const goingBack = nextIdx < historyIdx;
      historyIdx = nextIdx;
      if (goingBack) {
        // In-screen history (e.g. /checkout?step=payment → /checkout): the screen
        // owns the step via popstate. Do not pop the React Navigation route.
        const browserPath =
          (window.location.pathname.replace(/\/$/, '') || '/');
        const screenPath = activeScreenPathname(navigationRef.getRootState());
        if (screenPath && screenPath === browserPath) {
          return;
        }
        if (navigationRef.canGoBack()) navigationRef.goBack();
        return;
      }
      restoreFromBrowserUrl();
    } finally {
      suppressHistoryPush = false;
      trackMetaPageViewIfPathChanged();
    }
  };

  window.addEventListener('popstate', onPopState);
  return () => window.removeEventListener('popstate', onPopState);
}
