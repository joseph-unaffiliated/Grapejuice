import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { navigationRef } from './navigationRef';
import {
  consumePersistedGiftClaimToken,
  persistGiftClaimToken,
  readGiftClaimTokenFromWindow,
  scrubGiftClaimUrl,
} from './giftClaimLink';

function navigateToGiftClaim(token: string): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'GiftClaim', params: { token } });
}

/** Web: `/gift/claim?token=…` from gift email → GiftClaim screen (auth if needed). */
export function GiftClaimLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    const fromUrl = readGiftClaimTokenFromWindow();
    const token = fromUrl ?? consumePersistedGiftClaimToken();
    if (!token) return;

    persistGiftClaimToken(token);
    if (fromUrl) scrubGiftClaimUrl();

    if (!isAuthenticated) {
      useAuthFlowStore.getState().setPendingGiftClaimToken(token);
      useAuthFlowStore.getState().startAuthFromGuest('GiftClaim', 'signup');
      return;
    }

    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      clearInterval(id);
      navigateToGiftClaim(token);
      useAuthFlowStore.getState().setPendingGiftClaimToken(null);
    }, 50);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  return null;
}
