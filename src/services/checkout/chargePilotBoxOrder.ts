import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export type ChargePilotBoxResult =
  | { outcome: 'charged'; orderId: string; totalCents: number; paymentIntentId?: string }
  | { outcome: 'confirmed_zero'; orderId: string }
  | { outcome: 'skipped'; orderId: string; reason: string }
  | { outcome: 'failed'; orderId: string; message: string };

/** QA: charge a committed Hanukkah box order (pass force=true before lockAt). */
export async function chargePilotBoxOrder(
  householdId: string,
  orderId: string,
  options?: { force?: boolean }
): Promise<ChargePilotBoxResult> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<
    { householdId: string; orderId: string; force?: boolean },
    ChargePilotBoxResult
  >(functions, 'chargePilotBoxOrder');
  const { data } = await callable({
    householdId,
    orderId,
    force: options?.force,
  });
  return data;
}
