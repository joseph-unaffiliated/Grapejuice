import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

export const STORY_PATH = '/story';
export const PASSOVER_PATH = '/passover';
export const HOW_TO_PLAY_DREIDEL_PATH = '/how-to/play-dreidel';
export const HOW_TO_LIGHT_CANDLES_PATH = '/how-to/light-candles';

export type StorefrontContentRoute =
  | 'StorefrontOurStory'
  | 'StorefrontPassover'
  | 'StorefrontHowToPlayDreidel'
  | 'StorefrontHowToLightCandles';

const PATH_BY_ROUTE: Record<StorefrontContentRoute, string> = {
  StorefrontOurStory: STORY_PATH,
  StorefrontPassover: PASSOVER_PATH,
  StorefrontHowToPlayDreidel: HOW_TO_PLAY_DREIDEL_PATH,
  StorefrontHowToLightCandles: HOW_TO_LIGHT_CANDLES_PATH,
};

const ROUTE_BY_PATH: Record<string, StorefrontContentRoute> = {
  [STORY_PATH]: 'StorefrontOurStory',
  [PASSOVER_PATH]: 'StorefrontPassover',
  [HOW_TO_PLAY_DREIDEL_PATH]: 'StorefrontHowToPlayDreidel',
  [HOW_TO_LIGHT_CANDLES_PATH]: 'StorefrontHowToLightCandles',
};

export function contentPathForRoute(route: StorefrontContentRoute): string {
  return PATH_BY_ROUTE[route];
}

export function contentRouteFromPath(pathname: string): StorefrontContentRoute | null {
  const path = pathname.replace(/\/$/, '') || '/';
  return ROUTE_BY_PATH[path] ?? null;
}

export function readContentRouteFromWindow(): StorefrontContentRoute | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return contentRouteFromPath(window.location.pathname);
}

export function contentFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): StorefrontContentRoute | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name in PATH_BY_ROUTE) {
      return route.name as StorefrontContentRoute;
    }
    current = route.state;
  }
  return null;
}
