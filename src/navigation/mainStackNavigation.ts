import type { MainTabsParamList, MainStackParamList } from './types';
import { navigationRef } from './navigationRef';
import type { GiftPath } from '../screens/gift/giftGiveTypes';

type TabName = keyof MainTabsParamList;
type StackName = keyof MainStackParamList;

export function navigateMainTab(tab: TabName, params?: MainTabsParamList[TabName]) {
  if (!navigationRef.isReady()) return;
  if (params !== undefined) {
    navigationRef.navigate('Main', { screen: 'MainTabs', params: { screen: tab, params } });
    return;
  }
  navigationRef.navigate('Main', { screen: 'MainTabs', params: { screen: tab } });
}

export function navigateMainStack<S extends StackName>(
  screen: S,
  params?: MainStackParamList[S]
) {
  if (!navigationRef.isReady()) return;
  if (params !== undefined) {
    // React Navigation nested navigate typing is overly strict for optional params.
    (navigationRef.navigate as (name: 'Main', params: object) => void)('Main', {
      screen,
      params,
    });
    return;
  }
  navigationRef.navigate('Main', { screen });
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
