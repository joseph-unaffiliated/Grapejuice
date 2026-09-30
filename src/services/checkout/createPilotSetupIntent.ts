import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { metaServerContext, type MetaServerContext } from '../analytics/metaPixel';

export type CreatePilotSetupIntentResult = {
  clientSecret: string;
  customerId: string;
};

export async function createPilotSetupIntent(householdId: string): Promise<CreatePilotSetupIntentResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  const callable = httpsCallable<
    { householdId: string; meta?: MetaServerContext },
    CreatePilotSetupIntentResult
  >(functions, 'createPilotSetupIntent');
  const { data } = await callable({ householdId, meta: metaServerContext() });
  return data;
}
