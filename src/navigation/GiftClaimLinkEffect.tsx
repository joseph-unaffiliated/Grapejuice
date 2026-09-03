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

/**
 * Web: `/gift/claim?token=…` → GiftClaim screen.
 * Does not open signup until GiftClaim peeks and confirms the invite is claimable.
 */
export function GiftClaimLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    const fromUrl = readGiftClaimTokenFromWindow();
    const token = fromUrl ?? consumePersistedGiftClaimToken();
    if (!token) return;

    persistGiftClaimToken(token);
    if (fromUrl) scrubGiftClaimUrl();
    useAuthFlowStore.getState().setPendingGiftClaimToken(token);

    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      clearInterval(id);
      navigateToGiftClaim(token);
    }, 50);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  return null;
}
