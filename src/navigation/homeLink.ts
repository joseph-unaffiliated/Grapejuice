import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

export const HOME_PATH = '/home';

/** Read `/home` from the current location (web only). */
export function readHomePathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === HOME_PATH;
}

/** True when the active leaf is a MainTabs screen (Home / Rav / Account / Box). */
export function mainAppShellFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (
      route.name === 'Home' ||
      route.name === 'Rav' ||
      route.name === 'Account' ||
      route.name === 'Box'
    ) {
      return true;
    }
    current = route.state;
  }
  return false;
}
