import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import {
  LAST_MINUTE_LANDING,
  landingAudienceFromPath,
  landingAudienceFromUtmCampaign,
  type LandingAudienceConfig,
} from '../constants/landingAudiences';
import { readUtmFromWindow } from '../stores/entryContextStore';

export const LAST_MINUTE_LANDING_PATH = LAST_MINUTE_LANDING.path;

export function isLastMinuteLandingPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === LAST_MINUTE_LANDING_PATH;
}

export function readLastMinuteLandingFromWindow(): {
  audience: LandingAudienceConfig;
} | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const fromPath = landingAudienceFromPath(path);
  const utm = readUtmFromWindow();
  const fromUtm = landingAudienceFromUtmCampaign(utm?.campaign);
  const audience = fromPath ?? fromUtm;
  if (!audience || audience.id !== 'last_minute') return null;
  if (!fromPath) return null;
  return { audience };
}

export function lastMinuteLandingFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): string | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'LastMinuteLanding') return LAST_MINUTE_LANDING_PATH;
    current = route.state;
  }
  return null;
}
