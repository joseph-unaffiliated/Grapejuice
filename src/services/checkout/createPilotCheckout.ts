import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { ShippingAddress } from '../../types/pilot';

export type CreatePilotCheckoutResult = {
  clientSecret: string;
  orderId: string;
  totalCents: number;
};

export async function createPilotCheckout(
  householdId: string,
  shippingAddress: ShippingAddress
): Promise<CreatePilotCheckoutResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  const callable = httpsCallable<
    { householdId: string; shippingAddress: ShippingAddress },
    CreatePilotCheckoutResult
  >(functions, 'createPilotCheckout');
  const { data } = await callable({ householdId, shippingAddress });
  return data;
}
