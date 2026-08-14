import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import {
  CULTURAL_LANDING,
  landingAudienceFromPath,
  landingAudienceFromUtmCampaign,
  type LandingAudienceConfig,
} from '../constants/landingAudiences';
import { readUtmFromWindow } from '../stores/entryContextStore';

export const CULTURAL_LANDING_PATH = CULTURAL_LANDING.path;

export function isCulturalLandingPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === CULTURAL_LANDING_PATH) return true;
  return Boolean(CULTURAL_LANDING.legacyPaths?.includes(path));
}

export function readCulturalLandingFromWindow(): {
  audience: LandingAudienceConfig;
} | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const fromPath = landingAudienceFromPath(path);
  const utm = readUtmFromWindow();
  const fromUtm = landingAudienceFromUtmCampaign(utm?.campaign);
  const audience = fromPath ?? fromUtm;
  if (!audience || audience.id !== 'cultural') return null;
  // Path-only for now (UTM on /store is later work), including legacy `/unaffiliated`.
  if (!fromPath) return null;
  return { audience };
}

export function culturalLandingFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): string | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'CulturalLanding') return CULTURAL_LANDING_PATH;
    current = route.state;
  }
  return null;
}
