import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

/** Orders and Inventory. `/admin/boxes` (its old URL) still opens it and is rewritten to this. */
export const ADMIN_ORDERS_PATH = '/admin/orders';
export const ADMIN_BOXES_PATH = '/admin/boxes';
export const ADMIN_PROMOTIONS_PATH = '/admin/promotions';

/** Admin dashboards with their own web URL. */
export type AdminPathScreen = 'AdminBoxes' | 'AdminPromotions';

const ADMIN_SCREEN_PATHS: Record<AdminPathScreen, string> = {
  AdminBoxes: ADMIN_ORDERS_PATH,
  AdminPromotions: ADMIN_PROMOTIONS_PATH,
};

const LEGACY_ADMIN_PATHS: Record<string, AdminPathScreen> = {
  [ADMIN_BOXES_PATH]: 'AdminBoxes',
};

export function adminScreenForPath(path: string): AdminPathScreen | null {
  const match = (Object.keys(ADMIN_SCREEN_PATHS) as AdminPathScreen[]).find((s) => ADMIN_SCREEN_PATHS[s] === path);
  return match ?? LEGACY_ADMIN_PATHS[path] ?? null;
}

export function readAdminScreenFromWindow(): AdminPathScreen | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return adminScreenForPath(path);
}

/** URL for the focused admin dashboard, or null when none is focused. */
export function adminPathFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): string | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name in ADMIN_SCREEN_PATHS) return ADMIN_SCREEN_PATHS[route.name as AdminPathScreen];
    current = route.state;
  }
  return null;
}
