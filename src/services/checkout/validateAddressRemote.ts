import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { ShippingAddress } from '../../types/pilot';

export type SuggestedAddress = {
  line1: string;
  line2?: string;
  city: string;
  stateProvince: string;
  postalCode: string;
};

export type RemoteAddressCheck =
  | { status: 'ok' }
  | { status: 'unavailable' }
  | { status: 'non_us' | 'invalid'; message: string; field?: 'stateProvince' | 'postalCode' | 'line1' }
  | { status: 'suggest'; suggestion: SuggestedAddress };

/** Google Address Validation via functions; any failure is `unavailable` (format check decides). */
export async function validateAddressRemote(address: ShippingAddress): Promise<RemoteAddressCheck> {
  if (!functions) return { status: 'unavailable' };
  try {
    const callable = httpsCallable<
      Pick<ShippingAddress, 'line1' | 'line2' | 'city' | 'stateProvince' | 'postalCode' | 'country'>,
      RemoteAddressCheck
    >(functions, 'validateShippingAddress', { timeout: 8000 });
    const { data } = await callable({
      line1: address.line1,
      ...(address.line2 ? { line2: address.line2 } : {}),
      city: address.city,
      stateProvince: address.stateProvince,
      postalCode: address.postalCode,
      country: address.country,
    });
    return data ?? { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
