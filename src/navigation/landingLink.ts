import type { NavigationState, PartialState } from '@react-navigation/native';
import { getBootLocation } from './bootLocation';
import {
  landingFromMergedById,
  landingFromMergedByPath,
  loadMergedLandings,
} from '../services/landingCatalog';
import type { LandingAudienceConfig } from '../constants/landingAudiences';
import { isReservedLandingPath, normalizeLandingPath } from '../constants/landingPaths';

/**
 * Snapshot the entry path as the bundle first evaluated it.
 *
 * Resolving a landing needs a CMS fetch, and the first nav-state sync rewrites
 * the address bar to `/store` (the web default route) long before that lands —
 * so the URL has to be captured at boot, not read after the await or on remount.
 */
export function captureLandingPathFromWindow(): string | null {
  return getBootLocation()?.pathname ?? null;
}

/**
 * Resolve a non-gift marketing landing from a captured path.
 * Awaits `loadMergedLandings()` so CMS-only slugs resolve.
 */
export async function readMarketingLandingFromPath(pathname: string | null): Promise<{
  audience: LandingAudienceConfig;
} | null> {
  if (pathname == null) return null;
  await loadMergedLandings();

  const path = normalizeLandingPath(pathname);
  if (!path) return null;
  if (path === '/gift/claim' || path.startsWith('/gift/claim/')) return null;
  // Gift keeps its own link effect (?path=).
  if (path === '/gift') return null;
  if (
    path === '/store' ||
    path.startsWith('/store/') ||
    path === '/home' ||
    path === '/orders' ||
    path === '/box' ||
    path === '/my-box' ||
    path === '/product' ||
    path.startsWith('/product/')
  ) {
    return null;
  }

  const audience = landingFromMergedByPath(path);
  if (!audience || audience.id === 'gift') return null;
  return { audience };
}

export function dynamicLandingPathFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): string | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'DynamicLanding') {
      const landingId =
        route.params &&
        typeof route.params === 'object' &&
        'landingId' in route.params
          ? String((route.params as { landingId?: string }).landingId ?? '')
          : '';
      if (!landingId) return null;
      return landingFromMergedById(landingId)?.path ?? null;
    }
    // Legacy named screens (still registered) — map back to seed paths.
    if (route.name === 'CulturalLanding') {
      return landingFromMergedById('cultural')?.path ?? '/your-way';
    }
    if (route.name === 'InterfaithLanding') {
      return landingFromMergedById('interfaith')?.path ?? '/interfaith';
    }
    if (route.name === 'ConvenienceLanding') {
      return landingFromMergedById('convenience')?.path ?? '/convenience';
    }
    if (route.name === 'LastMinuteLanding') {
      return landingFromMergedById('last_minute')?.path ?? '/last-minute';
    }
    if (route.name === 'ForYourHomeLanding') {
      return landingFromMergedById('for_your_home')?.path ?? '/for-your-home';
    }
    current = route.state;
  }
  return null;
}

/** True if this looks like a marketing slug we should preserve until DynamicLanding mounts. */
export function shouldPreserveMarketingPath(pathname: string): boolean {
  const path = normalizeLandingPath(pathname);
  if (!path || path === '/') return false;
  if (path === '/gift' || path === '/gift/claim' || path.startsWith('/gift/claim/')) return false;
  if (
    path === '/store' ||
    path.startsWith('/store/') ||
    path === '/home' ||
    path === '/orders' ||
    path === '/box' ||
    path === '/my-box' ||
    path === '/product' ||
    path.startsWith('/product/')
  ) {
    return false;
  }
  if (isReservedLandingPath(path)) return false;
  // Single-segment /kebab paths, or known seed multi-legacy
  const slug = path.slice(1);
  if (!slug.includes('/') && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return true;
  // Known multi? we only allow single segment for new pages; seeds are single segment too.
  return Boolean(landingFromMergedByPath(path));
}
