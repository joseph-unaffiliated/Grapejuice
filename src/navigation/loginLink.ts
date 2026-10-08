import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { getBootLocation } from './bootLocation';

/** `/login?token=…&next=…` — emailed by functions/src/loginLinks.ts. */
export const LOGIN_PATH = '/login';
export const SET_PASSWORD_PATH = '/account/set-password';
export const CONNECT_GOOGLE_PATH = '/account/connect-google';

const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

function bootPath(): string | null {
  if (Platform.OS !== 'web') return null;
  const boot = getBootLocation();
  if (!boot) return null;
  return boot.pathname.replace(/\/$/, '') || '/';
}

export type BootLoginLink = { token: string | null; next: string | null };

/** `/login` from the pre-rewrite boot URL; `token` is null for a bare `/login` visit. */
export function readLoginLinkFromBoot(): BootLoginLink | null {
  if (bootPath() !== LOGIN_PATH) return null;
  const params = new URLSearchParams(getBootLocation()?.search ?? '');
  const token = params.get('token');
  const next = params.get('next');
  return {
    token: token && TOKEN_RE.test(token) ? token : null,
    next: next && next.startsWith('/') && !next.startsWith('//') ? next : null,
  };
}

/** `/account/set-password` or `/account/connect-google` opened cold. */
export function readAccountConvertPathFromBoot(): 'SetPassword' | 'ConnectGoogle' | null {
  const path = bootPath();
  if (path === SET_PASSWORD_PATH) return 'SetPassword';
  if (path === CONNECT_GOOGLE_PATH) return 'ConnectGoogle';
  return null;
}

/** Drop the token so a refresh or share never replays it. */
export function scrubLoginUrl(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== LOGIN_PATH) return;
  window.history.replaceState(window.history.state, '', '/');
}

export function accountConvertFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): 'SetPassword' | 'ConnectGoogle' | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'SetPassword' || route.name === 'ConnectGoogle') return route.name;
    current = route.state;
  }
  return null;
}
