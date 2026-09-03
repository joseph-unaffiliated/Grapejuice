import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { navigationRef } from './navigationRef';
import { readOrdersPathFromWindow } from './ordersLink';

function navigateToOrders(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'Orders' });
}

/** Web: `/orders` deep link → Orders screen. */
export function OrdersLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const pending = useRef(readOrdersPathFromWindow());

  useEffect(() => {
    if (!pending.current) return;
    if (authLoading) return;

    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      clearInterval(id);
      pending.current = null;
      if (!isAuthenticated) {
        startAuthFromGuest('Orders', 'signin', 'SignInEmail');
        return;
      }
      navigateToOrders();
    }, 50);
    return () => clearInterval(id);
  }, [authLoading, isAuthenticated, startAuthFromGuest]);

  return null;
}
