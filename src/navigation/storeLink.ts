import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { DEFAULT_STOREFRONT_CATEGORY } from '../constants/storefrontCategories';
import { getBootLocation } from './bootLocation';

export const STORE_PATH_PREFIX = '/store';

export const FAVORITES_STORE_PATH = `${STORE_PATH_PREFIX}/favorites`;

/** Canonical storefront home — grapejuice.co (not /store). */
export function storePathHome(): string {
  return '/';
}

export function storePathFavorites(): string {
  return FAVORITES_STORE_PATH;
}

export type StorefrontCategoryPathOpts = {
  q?: string;
  avail?: 'buy-now' | 'box-only' | 'all';
  style?: 'collection' | 'kids' | 'all';
};

/** Build `/store/:category` plus optional filter query string. */
export function storePathForCategory(
  category: string,
  opts?: StorefrontCategoryPathOpts
): string {
  const clean = category.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  const base = !clean
    ? STORE_PATH_PREFIX
    : `${STORE_PATH_PREFIX}/${encodeURIComponent(clean)}`;
  const qs = storefrontCategorySearchParams(opts);
  return qs ? `${base}?${qs}` : base;
}

export function storefrontCategorySearchParams(
  opts?: StorefrontCategoryPathOpts | null
): string {
  if (!opts) return '';
  const params = new URLSearchParams();
  const q = opts.q?.trim();
  if (q) params.set('q', q);
  if (opts.avail && opts.avail !== 'all') params.set('avail', opts.avail);
  if (opts.style && opts.style !== 'all') params.set('style', opts.style);
  return params.toString();
}

export type StorefrontCategoryRouteParams = {
  category: string;
  q?: string;
  avail?: 'buy-now' | 'box-only' | 'all';
  style?: 'collection' | 'kids' | 'all';
};

/** Parse `?q=&avail=&style=` from a search string into route params. */
export function storefrontCategoryParamsFromSearch(
  search: string
): Pick<StorefrontCategoryRouteParams, 'q' | 'avail' | 'style'> {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const out: Pick<StorefrontCategoryRouteParams, 'q' | 'avail' | 'style'> = {};
  const q = params.get('q')?.trim();
  if (q) out.q = q;
  const avail = params.get('avail');
  if (avail === 'buy-now' || avail === 'box-only') out.avail = avail;
  const style = params.get('style');
  if (style === 'collection' || style === 'kids') out.style = style;
  return out;
}

export type StorePathTarget =
  | { kind: 'home' }
  | { kind: 'category'; category: string; q?: string; avail?: StorefrontCategoryRouteParams['avail']; style?: StorefrontCategoryRouteParams['style'] };

/** Parse a pathname (+ optional search) as storefront home or `/store/:category`. */
export function readStorePathFromPathname(
  pathname: string,
  search = ''
): StorePathTarget | null {
  const path = pathname.replace(/\/$/, '') || '/';
  const filters = storefrontCategoryParamsFromSearch(search);

  if (path === '/' || path === STORE_PATH_PREFIX) {
    // Bare `/store` with filters → treat as collection PLP.
    if (path === STORE_PATH_PREFIX && (filters.q || filters.avail || filters.style)) {
      return { kind: 'category', category: DEFAULT_STOREFRONT_CATEGORY, ...filters };
    }
    return { kind: 'home' };
  }
  if (!path.startsWith(`${STORE_PATH_PREFIX}/`)) return null;
  const raw = path.slice(STORE_PATH_PREFIX.length + 1).split('/')[0] ?? '';
  try {
    const category = decodeURIComponent(raw).trim().toLowerCase();
    return category
      ? { kind: 'category', category, ...filters }
      : { kind: 'home' };
  } catch {
    const category = raw.trim().toLowerCase();
    return category
      ? { kind: 'category', category, ...filters }
      : { kind: 'home' };
  }
}

/** Read storefront target from the current location (web only). */
export function readStorePathFromWindow(): StorePathTarget | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return readStorePathFromPathname(window.location.pathname, window.location.search);
}

/** Same as `readStorePathFromWindow`, but against the pre-rewrite boot URL. */
export function readStorePathFromBoot(): StorePathTarget | null {
  if (Platform.OS !== 'web') return null;
  const boot = getBootLocation();
  if (!boot) return null;
  return readStorePathFromPathname(boot.pathname, boot.search ?? '');
}

export function storefrontFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): { path: string; category?: string } | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'StorefrontHome') {
      return { path: storePathHome() };
    }
    if (route.name === 'StorefrontFavorites') {
      return { path: storePathFavorites() };
    }
    if (route.name === 'StorefrontCategory') {
      const params = route.params as StorefrontCategoryRouteParams | undefined;
      const category =
        params?.category?.trim().toLowerCase() || DEFAULT_STOREFRONT_CATEGORY;
      return {
        path: storePathForCategory(category, {
          q: params?.q,
          avail: params?.avail,
          style: params?.style,
        }),
        category,
      };
    }
    current = route.state;
  }
  return null;
}
