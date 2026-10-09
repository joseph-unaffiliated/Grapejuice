import { useEffect, useRef } from 'react';
import { isOpsAdmin } from '../constants/admin';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { navigationRef } from './navigationRef';
import { readAdminScreenFromWindow } from './adminBoxesLink';

/**
 * Web: `/admin/boxes` → Boxes and gifts, `/admin/promotions` → Promotions, for ops admins;
 * everyone else lands on Account.
 */
export function AdminBoxesLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const pending = useRef(readAdminScreenFromWindow());

  useEffect(() => {
    if (!pending.current) return;
    if (authLoading) return;

    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      clearInterval(id);
      const screen = pending.current;
      pending.current = null;
      if (!screen) return;
      if (!isAuthenticated) {
        startAuthFromGuest('Account', 'signin', 'SignInEmail');
        return;
      }
      if (isOpsAdmin(user)) {
        navigationRef.navigate('Main', { screen });
      } else {
        navigationRef.navigate('Main', { screen: 'MainTabs', params: { screen: 'Account' } });
      }
    }, 50);
    return () => clearInterval(id);
  }, [authLoading, isAuthenticated, user, startAuthFromGuest]);

  return null;
}
