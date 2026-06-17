import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { AgeGroup, BoxLineItem } from '../../types/pilot';
import type { ChildInterestId } from '../../constants/childInterests';

export type PurchaseGiftResult = {
  giftInviteId: string;
  clientSecret: string | null;
  claimToken: string;
  claimUrl: string;
};

export async function purchasePilotGift(input: {
  recipientEmail: string;
  giverName: string;
  message?: string;
  creditCents?: number;
  customize?: boolean;
  lineItems?: BoxLineItem[];
  childInterests?: ChildInterestId[];
  childAgeGroups?: AgeGroup[];
}): Promise<PurchaseGiftResult> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<typeof input, PurchaseGiftResult>(functions, 'purchasePilotGift');
  const { data } = await callable(input);
  return data;
}

export type ClaimGiftResult = {
  householdId: string;
  giftCreditCents: number;
  giverName?: string;
  message?: string;
  hasGiverDraft: boolean;
};

export async function finalizePilotGiftPayment(giftInviteId: string): Promise<{
  ok: boolean;
  claimUrl: string;
  alreadyFinalized: boolean;
}> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<{ giftInviteId: string }, { ok: boolean; claimUrl: string; alreadyFinalized: boolean }>(
    functions,
    'finalizePilotGiftPayment'
  );
  const { data } = await callable({ giftInviteId });
  return data;
}

export async function claimGiftInvite(token: string): Promise<ClaimGiftResult> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<{ token: string }, ClaimGiftResult>(functions, 'claimGiftInvite');
  const { data } = await callable({ token });
  return data;
}
