import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { getBootLocation } from './bootLocation';

export const GIFT_GIVE_PATH = '/gift/give';
export const GIFT_CUSTOMIZE_PATH = '/gift/customize';

export function isGiftGivePath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === GIFT_GIVE_PATH;
}

export function isGiftCustomizePath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === GIFT_CUSTOMIZE_PATH;
}

export function readGiftGivePathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = (getBootLocation()?.pathname ?? window.location.pathname).replace(/\/$/, '') || '/';
  return isGiftGivePath(path);
}

export function readGiftCustomizePathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = (getBootLocation()?.pathname ?? window.location.pathname).replace(/\/$/, '') || '/';
  return isGiftCustomizePath(path);
}

export function giftGiveFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'GiftGive') return true;
    current = route.state;
  }
  return false;
}

export function giftCustomizeFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'GiftGiverCustomize') return true;
    current = route.state;
  }
  return false;
}
