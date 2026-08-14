import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import {
  INTERFAITH_LANDING,
  landingAudienceFromPath,
  landingAudienceFromUtmCampaign,
  type LandingAudienceConfig,
} from '../constants/landingAudiences';
import { readUtmFromWindow } from '../stores/entryContextStore';

export const INTERFAITH_LANDING_PATH = INTERFAITH_LANDING.path;

export function isInterfaithLandingPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === INTERFAITH_LANDING_PATH;
}

export function readInterfaithLandingFromWindow(): {
  audience: LandingAudienceConfig;
} | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const fromPath = landingAudienceFromPath(path);
  const utm = readUtmFromWindow();
  const fromUtm = landingAudienceFromUtmCampaign(utm?.campaign);
  const audience = fromPath ?? fromUtm;
  if (!audience || audience.id !== 'interfaith') return null;
  if (!fromPath) return null;
  return { audience };
}

export function interfaithLandingFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): string | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'InterfaithLanding') return INTERFAITH_LANDING_PATH;
    current = route.state;
  }
  return null;
}
