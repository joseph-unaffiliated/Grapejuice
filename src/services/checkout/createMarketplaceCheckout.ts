import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { BoxLineItem, ShippingAddress } from '../../types/pilot';

export type CreateMarketplaceCheckoutResult = {
  clientSecret: string | null;
  orderId: string;
  totalCents: number;
  intent?: 'setup' | null;
  status: 'pending' | 'committed' | 'confirmed';
};

export async function createMarketplaceCheckout(
  householdId: string | null,
  shippingAddress: ShippingAddress,
  lineItems: Pick<BoxLineItem, 'itemId' | 'quantity'>[],
  options?: { skipShipStation?: boolean; email?: string }
): Promise<CreateMarketplaceCheckoutResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  // Firestore / callables reject undefined — omit empty optional line2.
  const address: ShippingAddress = {
    name: shippingAddress.name.trim(),
    line1: shippingAddress.line1.trim(),
    city: shippingAddress.city.trim(),
    stateProvince: shippingAddress.stateProvince.trim(),
    postalCode: shippingAddress.postalCode.trim(),
    country: shippingAddress.country || 'US',
  };
  const line2 = shippingAddress.line2?.trim();
  if (line2) address.line2 = line2;

  const callable = httpsCallable<
    {
      householdId?: string;
      email?: string;
      shippingAddress: ShippingAddress;
      lineItems: Pick<BoxLineItem, 'itemId' | 'quantity'>[];
      skipShipStation?: boolean;
    },
    CreateMarketplaceCheckoutResult
  >(functions, 'createMarketplaceCheckout');
  const { data } = await callable({
    ...(householdId ? { householdId } : {}),
    ...(options?.email ? { email: options.email } : {}),
    shippingAddress: address,
    lineItems,
    skipShipStation: options?.skipShipStation,
  });
  return data;
}
