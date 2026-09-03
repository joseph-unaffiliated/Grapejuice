import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export type UpdatePilotBoxOrderResult = {
  orderId: string;
  totalCents: number;
  previousTotalCents: number;
  deltaCents: number;
  status: 'committed' | 'pending';
};

/** Push the current box draft onto a pre-ship committed order. */
export async function updatePilotBoxOrder(
  householdId: string,
  orderId: string
): Promise<UpdatePilotBoxOrderResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  const callable = httpsCallable<
    { householdId: string; orderId: string },
    UpdatePilotBoxOrderResult
  >(functions, 'updatePilotBoxOrder');
  const { data } = await callable({ householdId, orderId });
  return data;
}
