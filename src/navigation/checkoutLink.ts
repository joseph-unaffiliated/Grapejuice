import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

export const CHECKOUT_PATH = '/checkout';
/** Query flag for the payment-method step after shipping. */
export const CHECKOUT_PAYMENT_STEP = 'payment';

export function checkoutPath(step?: 'payment' | null): string {
  return step === 'payment' ? `${CHECKOUT_PATH}?step=${CHECKOUT_PAYMENT_STEP}` : CHECKOUT_PATH;
}

export function readCheckoutPaymentStepFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('step') === CHECKOUT_PAYMENT_STEP;
}

export function readCheckoutPathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === CHECKOUT_PATH;
}

export function checkoutFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'Checkout') return true;
    current = route.state;
  }
  return false;
}
