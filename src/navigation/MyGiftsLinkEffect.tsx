import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { navigationRef } from './navigationRef';
import { readMyGiftsPathFromWindow } from './myGiftsLink';

function navigateToMyGifts(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'MyGifts' });
}

/** Web: `/my-gifts` deep link → My Gifts screen. */
export function MyGiftsLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const pending = useRef(readMyGiftsPathFromWindow());

  useEffect(() => {
    if (!pending.current) return;
    if (authLoading) return;

    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      clearInterval(id);
      pending.current = null;
      if (!isAuthenticated) {
        startAuthFromGuest('MyGifts', 'signin', 'SignInEmail');
        return;
      }
      navigateToMyGifts();
    }, 50);
    return () => clearInterval(id);
  }, [authLoading, isAuthenticated, startAuthFromGuest]);

  return null;
}
