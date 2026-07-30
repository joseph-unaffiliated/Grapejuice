import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { DEFAULT_STOREFRONT_CATEGORY } from '../constants/storefrontCategories';

export const STORE_PATH_PREFIX = '/store';

export function storePathHome(): string {
  return STORE_PATH_PREFIX;
}

export function storePathForCategory(category: string): string {
  const clean = category.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!clean) return STORE_PATH_PREFIX;
  return `${STORE_PATH_PREFIX}/${encodeURIComponent(clean)}`;
}

/** Read `/store` or `/store/:category` from the current location (web only).
 *  Bare `/` also counts as the storefront landing (canonicalized to `/store`).
 */
export function readStorePathFromWindow():
  | { kind: 'home' }
  | { kind: 'category'; category: string }
  | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/' || path === STORE_PATH_PREFIX) return { kind: 'home' };
  if (!path.startsWith(`${STORE_PATH_PREFIX}/`)) return null;
  const raw = path.slice(STORE_PATH_PREFIX.length + 1).split('/')[0] ?? '';
  try {
    const category = decodeURIComponent(raw).trim().toLowerCase();
    return category ? { kind: 'category', category } : { kind: 'home' };
  } catch {
    const category = raw.trim().toLowerCase();
    return category ? { kind: 'category', category } : { kind: 'home' };
  }
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
    if (route.name === 'StorefrontCategory') {
      const params = route.params as { category?: string } | undefined;
      const category = params?.category?.trim().toLowerCase() || DEFAULT_STOREFRONT_CATEGORY;
      return { path: storePathForCategory(category), category };
    }
    current = route.state;
  }
  return null;
}
