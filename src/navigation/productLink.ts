import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

export const PRODUCT_PATH_PREFIX = '/product';

/** Browser path for a catalog product (`/product/arch-menorah`). */
export function productPathForSlug(slug: string): string {
  const clean = slug.trim().replace(/^\/+|\/+$/g, '');
  if (!clean) return '/';
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
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '/';

  const giftPath = window.location.pathname.replace(/\/$/, '');
  if (giftPath.endsWith('/gift/claim')) {
    return window.location.pathname + window.location.search;
  }

  const slug = catalogProductSlugFromState(state);
  if (slug) return productPathForSlug(slug);

  // Preserve preview query params on non-product screens.
  const search = window.location.search;
  if (search.includes('preview=')) {
    return `/${search}`;
  }

  return '/';
}
