import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

export const ORDERS_PATH = '/orders';

export function readOrdersPathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === ORDERS_PATH;
}

export function ordersFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'Orders') return true;
    current = route.state;
  }
  return false;
}
