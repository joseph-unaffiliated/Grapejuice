import { CommonActions } from '@react-navigation/native';
import type { MainStackParamList, MainTabsParamList } from './types';
import { navigationRef } from './navigationRef';

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

export function currentMainRouteName(): string | undefined {
  if (!navigationRef.isReady()) return undefined;
  return navigationRef.getCurrentRoute()?.name;
}

/** Reset the root stack onto a Main screen. Inner-stack `navigate` is a no-op from Root. */
export function resetRootToMainScreen(
  screen: keyof MainStackParamList,
  params?: object
): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'Main',
          state: {
            index: 0,
            routes: [params ? { name: screen, params } : { name: screen }],
          },
        },
      ],
    })
  );
}
