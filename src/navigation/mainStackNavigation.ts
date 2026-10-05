import type { MainTabsParamList, MainStackParamList } from './types';
import { navigationRef } from './navigationRef';
import type { GiftPath } from '../screens/gift/giftGiveTypes';

type TabName = keyof MainTabsParamList;
type StackName = keyof MainStackParamList;

/**
 * React Navigation can only type nested `navigate` for a literal screen name, not
 * a runtime-chosen one (a union of screen/params pairs). The helpers below check
 * the screen/params pairing in their own signatures instead.
 */
function navigateMain(params: object) {
  (navigationRef.navigate as (name: 'Main', params: object) => void)('Main', params);
}

export function navigateMainTab<T extends TabName>(tab: T, params?: MainTabsParamList[T]) {
  if (!navigationRef.isReady()) return;
  if (params !== undefined) {
    navigateMain({ screen: 'MainTabs', params: { screen: tab, params } });
    return;
  }
  navigateMain({ screen: 'MainTabs', params: { screen: tab } });
}

export function navigateMainStack<S extends StackName>(
  screen: S,
  params?: MainStackParamList[S]
) {
  if (!navigationRef.isReady()) return;
  if (params !== undefined) {
    navigateMain({ screen, params });
    return;
  }
  navigateMain({ screen });
}

/** Open a marketing landing (gift keeps its dedicated screen + optional ?path). */
export function navigateToLanding(
  landingId: string,
  opts?: { preferredGiftPath?: GiftPath }
) {
  if (landingId === 'gift') {
    navigateMainStack(
      'GiftLanding',
      opts?.preferredGiftPath ? { preferredGiftPath: opts.preferredGiftPath } : undefined
    );
    return;
  }
  navigateMainStack('DynamicLanding', { landingId });
}
