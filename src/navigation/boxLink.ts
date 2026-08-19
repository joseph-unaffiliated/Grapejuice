import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

export const BOX_PATH = '/box';

/** Read `/box` from the current location (web only). */
export function readBoxPathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === BOX_PATH || path === '/my-box';
}

/** True when the active leaf is My Box. */
export function myBoxFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'MyBox') return true;
    current = route.state;
  }
  return false;
}
