import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

export const MY_GIFTS_PATH = '/my-gifts';

export function readMyGiftsPathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === MY_GIFTS_PATH;
}

export function myGiftsFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'MyGifts') return true;
    current = route.state;
  }
  return false;
}
