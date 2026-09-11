import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { getBootLocation } from './bootLocation';

export const BOX_PATH = '/box';

function isBoxPathname(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === BOX_PATH || path === '/my-box';
}

/** Read `/box` from the current location (web only). */
export function readBoxPathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return isBoxPathname(window.location.pathname);
}

/**
 * Same as `readBoxPathFromWindow`, but against the pre-rewrite boot URL.
 * Default StorefrontHome sync rewrites `/box` → `/store` before link effects mount.
 */
export function readBoxPathFromBoot(): boolean {
  if (Platform.OS !== 'web') return false;
  const boot = getBootLocation();
  if (!boot) return false;
  return isBoxPathname(boot.pathname);
}

/** Keep `/box` in the address bar until My Box mounts (one-shot). */
let preserveInboundBoxUrl = true;

export function shouldPreserveInboundBoxUrl(): boolean {
  return preserveInboundBoxUrl && readBoxPathFromBoot();
}

export function consumeInboundBoxUrlPreserve(): void {
  preserveInboundBoxUrl = false;
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
