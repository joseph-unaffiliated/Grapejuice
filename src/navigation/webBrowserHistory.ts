import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { browserPathForNavigationState } from './productLink';

let suppressHistoryPush = false;
const navHistory: string[] = [];

function stateFingerprint(state: NavigationState | PartialState<NavigationState>): string {
  const parts: string[] = [];
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    parts.push(`${route.name}:${index}`);
    if (route.name === 'CatalogProduct') {
      const params = route.params as { slug?: string; itemId?: string } | undefined;
      parts.push(params?.slug ?? params?.itemId ?? '');
    }
    current = route.state;
  }
  return parts.join('/');
}

function syncBrowserUrl(state: NavigationState, mode: 'push' | 'replace'): void {
  const nextPath = browserPathForNavigationState(state);
  const current = window.location.pathname + window.location.search;
  if (current === nextPath) return;
  if (mode === 'replace') {
    window.history.replaceState({ gjNav: true }, '', nextPath);
  } else {
    window.history.pushState({ gjNav: true }, '', nextPath);
  }
}

/** Push a browser history entry when in-app navigation moves forward. */
export function onWebNavigationStateChange(state?: NavigationState): void {
  if (Platform.OS !== 'web' || !state || suppressHistoryPush) return;

  const fingerprint = stateFingerprint(state);
  const previousIndex = navHistory.indexOf(fingerprint);

  if (navHistory.length === 0) {
    navHistory.push(fingerprint);
    syncBrowserUrl(state, 'replace');
    return;
  }

  if (previousIndex === -1) {
    navHistory.push(fingerprint);
    syncBrowserUrl(state, 'push');
    return;
  }

  if (previousIndex < navHistory.length - 1) {
    navHistory.splice(previousIndex + 1);
  }
  syncBrowserUrl(state, 'replace');
}

/** Wire browser Back to React Navigation goBack(). */
export function installWebBrowserHistory(): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};

  const onPopState = () => {
    if (!navigationRef.isReady() || !navigationRef.canGoBack()) return;
    suppressHistoryPush = true;
    navigationRef.goBack();
    suppressHistoryPush = false;
  };

  window.addEventListener('popstate', onPopState);
  return () => window.removeEventListener('popstate', onPopState);
}
