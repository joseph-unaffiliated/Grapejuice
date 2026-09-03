import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { navigationRef } from './navigationRef';
import { readAccountPathFromWindow } from './accountLink';

function navigateToAccount(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', {
    screen: 'MainTabs',
    params: { screen: 'Account' },
  });
}

/** Web: `/account` deep link → Account tab. */
export function AccountLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const pending = useRef(readAccountPathFromWindow());

  useEffect(() => {
    if (!pending.current) return;
    if (authLoading) return;

    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      clearInterval(id);
      pending.current = null;
      if (!isAuthenticated) {
        navigationRef.navigate('Main', { screen: 'StorefrontHome' });
        return;
      }
      navigateToAccount();
    }, 50);
    return () => clearInterval(id);
  }, [authLoading, isAuthenticated]);

  return null;
}
