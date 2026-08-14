import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import {
  CONVENIENCE_LANDING,
  landingAudienceFromPath,
  landingAudienceFromUtmCampaign,
  type LandingAudienceConfig,
} from '../constants/landingAudiences';
import { readUtmFromWindow } from '../stores/entryContextStore';

export const CONVENIENCE_LANDING_PATH = CONVENIENCE_LANDING.path;

export function isConvenienceLandingPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === CONVENIENCE_LANDING_PATH;
}

export function readConvenienceLandingFromWindow(): {
  audience: LandingAudienceConfig;
} | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const fromPath = landingAudienceFromPath(path);
  const utm = readUtmFromWindow();
  const fromUtm = landingAudienceFromUtmCampaign(utm?.campaign);
  const audience = fromPath ?? fromUtm;
  if (!audience || audience.id !== 'convenience') return null;
  if (!fromPath) return null;
  return { audience };
}

export function convenienceLandingFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): string | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'ConvenienceLanding') return CONVENIENCE_LANDING_PATH;
    current = route.state;
  }
  return null;
}
