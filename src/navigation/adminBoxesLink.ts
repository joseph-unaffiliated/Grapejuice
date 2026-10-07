import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

export const ADMIN_BOXES_PATH = '/admin/boxes';

export function readAdminBoxesPathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === ADMIN_BOXES_PATH;
}

export function adminBoxesFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'AdminBoxes') return true;
    current = route.state;
  }
  return false;
}
