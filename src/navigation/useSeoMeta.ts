import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect, useRoute, type NavigationState } from '@react-navigation/native';
import {
  canonicalUrl,
  clampDescription,
  DEFAULT_SEO_DESCRIPTION,
  isPrivatePath,
  staticSeoForPath,
} from '../constants/seo';

/** Screen-provided descriptions (product pages), keyed by route key. */
const descriptionOverrides = new Map<string, string>();
let focusedRouteKey: string | null = null;

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  if (el.content !== content) el.content = content;
}

function upsertCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  if (el.href !== href) el.href = href;
}

function deepestRouteKey(state: NavigationState | undefined): string | null {
  let current: NavigationState | undefined = state;
  let key: string | null = null;
  while (current) {
    const route = current.routes[current.index ?? 0];
    if (!route) break;
    key = route.key;
    current = route.state as NavigationState | undefined;
  }
  return key;
}

/** Description, canonical and robots for the current URL (web only). */
export function applySeoMeta(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const path = window.location.pathname;
  const description =
    (focusedRouteKey && descriptionOverrides.get(focusedRouteKey)) ||
    staticSeoForPath(path)?.description ||
    DEFAULT_SEO_DESCRIPTION;
  const url = canonicalUrl(path);
  upsertMeta('name', 'description', description);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('name', 'robots', isPrivatePath(path) ? 'noindex, nofollow' : 'index, follow');
  upsertCanonical(url);
}

/** Call after the browser URL sync on every navigation state change. */
export function onSeoNavigationStateChange(state: NavigationState | undefined): void {
  focusedRouteKey = deepestRouteKey(state);
  applySeoMeta();
}

/** Lets a screen supply its own meta description (e.g. a product's copy) while focused. */
export function useSeoMeta({ description }: { description?: string | null }): void {
  const route = useRoute();
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || !description?.trim()) return undefined;
      descriptionOverrides.set(route.key, clampDescription(description));
      focusedRouteKey = route.key;
      applySeoMeta();
      return () => {
        descriptionOverrides.delete(route.key);
      };
    }, [description, route.key])
  );
}
