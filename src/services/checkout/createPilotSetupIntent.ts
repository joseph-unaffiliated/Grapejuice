import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { metaServerContext, type MetaServerContext } from '../analytics/metaPixel';
import { readSessionEntry, type AttributionTouch } from '../../stores/entryContextStore';

export type CreatePilotSetupIntentResult = {
  clientSecret: string;
  customerId: string;
};

export async function createPilotSetupIntent(householdId: string): Promise<CreatePilotSetupIntentResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  const callable = httpsCallable<
    { householdId: string; meta?: MetaServerContext; session?: AttributionTouch },
    CreatePilotSetupIntentResult
  >(functions, 'createPilotSetupIntent');
  const session = readSessionEntry();
  const { data } = await callable({ householdId, meta: metaServerContext(), ...(session ? { session } : {}) });
  return data;
}
