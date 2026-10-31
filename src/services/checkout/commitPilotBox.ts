import { httpsCallable } from 'firebase/functions';
import { familyOrderToken } from '../../constants/familyOrder';
import { functions } from '../../lib/firebase';
import type { ShippingAddress } from '../../types/pilot';
import {
  attributionForServer,
  metaServerContext,
  type MetaServerContext,
} from '../analytics/metaPixel';
import { readSessionEntry, type AttributionSnapshot, type AttributionTouch } from '../../stores/entryContextStore';
import { promoForServer, type PromoRequest } from '../promo/promoSession';

export type CommitPilotBoxResult = {
  orderId: string;
  totalCents: number;
  discountCents?: number;
  status: 'committed';
};

const inflightCommits = new Map<string, Promise<CommitPilotBoxResult>>();

export async function commitPilotBox(
  householdId: string,
  shippingAddress: ShippingAddress,
  options?: {
    expeditedShipping?: boolean;
    contactPhone?: string;
    smsOptIn?: boolean;
    skipShipStation?: boolean;
  }
): Promise<CommitPilotBoxResult> {
  const running = inflightCommits.get(householdId);
  if (running) return running;
  const promise = commitPilotBoxOnce(householdId, shippingAddress, options).finally(() => {
    if (inflightCommits.get(householdId) === promise) inflightCommits.delete(householdId);
  });
  inflightCommits.set(householdId, promise);
  return promise;
}

async function commitPilotBoxOnce(
  householdId: string,
  shippingAddress: ShippingAddress,
  options?: {
    expeditedShipping?: boolean;
    contactPhone?: string;
    smsOptIn?: boolean;
    skipShipStation?: boolean;
  }
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
      skipShipStation?: boolean;
      familyOrderToken?: string;
      meta?: MetaServerContext;
      attribution?: AttributionSnapshot;
      promo?: PromoRequest;
      session?: AttributionTouch;
    },
    CommitPilotBoxResult
  >(functions, 'commitPilotBox');
  const promo = promoForServer();
  const session = readSessionEntry();
  const familyToken = familyOrderToken();
  const { data } = await callable({
    householdId,
    shippingAddress,
    expeditedShipping: options?.expeditedShipping,
    contactPhone: options?.contactPhone,
    smsOptIn: options?.smsOptIn,
    skipShipStation: options?.skipShipStation,
    ...(familyToken ? { familyOrderToken: familyToken } : {}),
    meta: metaServerContext(),
    attribution: attributionForServer(),
    ...(promo ? { promo } : {}),
    ...(session ? { session } : {}),
  });
  return data;
}
