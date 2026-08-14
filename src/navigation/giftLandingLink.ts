import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import type { GiftPath } from '../screens/gift/giftGiveTypes';
import {
  GIFT_LANDING,
  landingAudienceFromPath,
  landingAudienceFromUtmCampaign,
  type LandingAudienceConfig,
} from '../constants/landingAudiences';
import { readUtmFromWindow } from '../stores/entryContextStore';

export const GIFT_LANDING_PATH = GIFT_LANDING.path;

/** True for `/gift` only — not `/gift/claim`. */
export function isGiftLandingPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === GIFT_LANDING_PATH;
}

export function readGiftLandingFromWindow(): {
  audience: LandingAudienceConfig;
  preferredGiftPath: GiftPath | null;
} | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path.endsWith('/gift/claim')) return null;

  const fromPath = landingAudienceFromPath(path);
  const utm = readUtmFromWindow();
  const fromUtm = landingAudienceFromUtmCampaign(utm?.campaign);
  const audience = fromPath ?? fromUtm;
  if (!audience || audience.id !== 'gift') return null;
  // Only treat as a gift-landing deep link when path is /gift (UTM on /store is later work).
  if (!fromPath) return null;

  const q = new URLSearchParams(window.location.search);
  const pathParam = (q.get('path') ?? '').trim().toLowerCase();
  let preferredGiftPath: GiftPath | null = null;
  if (pathParam === 'credit' || pathParam === 'credit_only') preferredGiftPath = 'credit_only';
  if (pathParam === 'customize' || pathParam === 'pick') preferredGiftPath = 'customize';

  return { audience, preferredGiftPath };
}

export function giftLandingFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): string | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'GiftLanding') return GIFT_LANDING_PATH;
    current = route.state;
  }
  return null;
}
