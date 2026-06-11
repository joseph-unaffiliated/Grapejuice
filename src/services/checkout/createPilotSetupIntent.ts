import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export type CreatePilotSetupIntentResult = {
  clientSecret: string;
  customerId: string;
};

export async function createPilotSetupIntent(householdId: string): Promise<CreatePilotSetupIntentResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  const callable = httpsCallable<{ householdId: string }, CreatePilotSetupIntentResult>(
    functions,
    'createPilotSetupIntent'
  );
  const { data } = await callable({ householdId });
  return data;
}
