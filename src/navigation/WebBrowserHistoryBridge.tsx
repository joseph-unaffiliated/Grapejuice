import { useEffect } from 'react';
import { installWebBrowserHistory } from './webBrowserHistory';

/** Mount once inside NavigationContainer to sync browser Back with in-app navigation. */
export function WebBrowserHistoryBridge() {
  useEffect(() => installWebBrowserHistory(), []);
  return null;
}
