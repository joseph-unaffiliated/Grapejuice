import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

export const ACCOUNT_PATH = '/account';

export function readAccountPathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === ACCOUNT_PATH;
}

export function accountFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'MainTabs') {
      const tabState = route.state;
      const tabIndex = tabState?.index ?? 0;
      const tabRoute = tabState?.routes?.[tabIndex];
      if (tabRoute?.name === 'Account') return true;
    }
    current = route.state;
  }
  return false;
}
