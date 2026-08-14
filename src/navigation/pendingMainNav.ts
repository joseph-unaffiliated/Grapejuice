import type { MainStackParamList, MainTabsParamList } from './types';

export type PendingMainNav = {
  screen: keyof MainStackParamList;
  params?: MainStackParamList[keyof MainStackParamList];
  tab?: keyof MainTabsParamList;
  tabParams?: MainTabsParamList[keyof MainTabsParamList];
};

let pending: PendingMainNav | null = null;

/** Queue a MainStack destination for after the root gate switches to Main. */
export function queuePendingMainNav(nav: PendingMainNav): void {
  pending = nav;
}

/** Read without clearing — used to choose MainStack initialRouteName. */
export function peekPendingMainNav(): PendingMainNav | null {
  return pending;
}

export function consumePendingMainNav(): PendingMainNav | null {
  const next = pending;
  pending = null;
  return next;
}
