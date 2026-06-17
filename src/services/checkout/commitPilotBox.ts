import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { ShippingAddress } from '../../types/pilot';

export type CommitPilotBoxResult = {
  orderId: string;
  totalCents: number;
  status: 'committed';
};

export async function commitPilotBox(
  householdId: string,
  shippingAddress: ShippingAddress,
  options?: { expeditedShipping?: boolean; contactPhone?: string; smsOptIn?: boolean }
): Promise<CommitPilotBoxResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  const callable = httpsCallable<
    {
      householdId: string;
      shippingAddress: ShippingAddress;
      expeditedShipping?: boolean;
      contactPhone?: string;
      smsOptIn?: boolean;
    },
    CommitPilotBoxResult
  >(functions, 'commitPilotBox');
  const { data } = await callable({
    householdId,
    shippingAddress,
    expeditedShipping: options?.expeditedShipping,
    contactPhone: options?.contactPhone,
    smsOptIn: options?.smsOptIn,
  });
  return data;
}
