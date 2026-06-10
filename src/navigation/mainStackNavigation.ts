import type { MainTabsParamList, MainStackParamList } from './types';
import { navigationRef } from './navigationRef';

type TabName = keyof MainTabsParamList;
type StackName = keyof MainStackParamList;

export function navigateMainTab(tab: TabName) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'MainTabs', params: { screen: tab } });
}

export function navigateMainStack(screen: StackName) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen });
}
