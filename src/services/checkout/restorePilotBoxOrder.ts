import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export type RestorePilotBoxOrderResult =
  | { status: 'committed'; orderId: string; lockAt: string | null }
  | {
      status: 'needs_checkout';
      orderId: string;
      reason: 'no_address' | 'no_card' | 'credit_changed';
      message: string;
    };

export async function restorePilotBoxOrder(
  householdId: string,
  orderId: string
): Promise<RestorePilotBoxOrderResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  const callable = httpsCallable<
    { householdId: string; orderId: string },
    RestorePilotBoxOrderResult
  >(functions, 'restorePilotBoxOrder');
  const { data } = await callable({ householdId, orderId });
  return data;
}
