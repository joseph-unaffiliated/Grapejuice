import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { navigationRef } from './navigationRef';
import { readCheckoutPathFromWindow } from './checkoutLink';

function navigateToCheckout(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'Checkout' });
}

/** Web: `/checkout` deep link → box Checkout screen (Stripe return_url safe). */
export function CheckoutLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const pending = useRef(readCheckoutPathFromWindow());

  useEffect(() => {
    if (!pending.current) return;
    if (authLoading) return;

    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      clearInterval(id);
      pending.current = null;
      if (!isAuthenticated) {
        startAuthFromGuest('Checkout', 'signin', 'SignInEmail');
        return;
      }
      navigateToCheckout();
    }, 50);
    return () => clearInterval(id);
  }, [authLoading, isAuthenticated, startAuthFromGuest]);

  return null;
}
