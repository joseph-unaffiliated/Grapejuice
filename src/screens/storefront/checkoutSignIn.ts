import { useAuthStore } from '../../stores/authStore';
import { navigationRef } from '../../navigation/navigationRef';
import { navigateMainStack } from '../../navigation/mainStackNavigation';
import { whenMainSettled } from '../../navigation/whenMainSettled';
import type { MainStackParamList } from '../../navigation/types';
import {
  claimMarketplaceCheckoutSignIn,
  type CheckoutSignIn,
} from '../../services/checkout/createMarketplaceCheckout';

/**
 * After a signed-out checkout that created a new account, sign the buyer in and keep them on
 * their confirmation. Existing accounts are never signed in here; their receipt carries a link.
 */
export async function signInAfterCheckout(
  orderId: string,
  signIn: CheckoutSignIn | null | undefined,
  params: MainStackParamList['OrderConfirmation']
): Promise<void> {
  if (signIn?.kind !== 'token' || useAuthStore.getState().isAuthenticated) return;
  try {
    const token = await claimMarketplaceCheckoutSignIn(signIn.householdId, orderId, signIn.claim);
    if (!token) return;
    await useAuthStore.getState().signInWithToken(token, { stayOnSurface: true });
    await whenMainSettled();
    if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name !== 'OrderConfirmation') {
      navigateMainStack('OrderConfirmation', params);
    }
  } catch (e) {
    console.warn('[checkout] sign-in after checkout skipped', e);
  }
}
