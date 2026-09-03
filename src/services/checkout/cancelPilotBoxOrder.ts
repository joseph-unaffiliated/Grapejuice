import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export type CancelPilotBoxOrderResult = {
  orderId: string;
  status: 'cancelled';
};

export async function cancelPilotBoxOrder(
  householdId: string,
  orderId: string
): Promise<CancelPilotBoxOrderResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  const callable = httpsCallable<
    { householdId: string; orderId: string },
    CancelPilotBoxOrderResult
  >(functions, 'cancelPilotBoxOrder');
  const { data } = await callable({ householdId, orderId });
  return data;
}
