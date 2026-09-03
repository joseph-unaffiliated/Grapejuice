import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { AgeGroup, BoxLineItem, GiftInvite } from '../../types/pilot';
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
  giftInviteId: string;
  giftKind: 'credit' | 'box';
  giftCreditCents: number;
  giverName?: string;
  message?: string;
  hasGiverDraft: boolean;
};

export async function listMyReceivedGifts(): Promise<import('../../types/pilot').ReceivedGift[]> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<Record<string, never>, { gifts: import('../../types/pilot').ReceivedGift[] }>(
    functions,
    'listMyReceivedGifts'
  );
  const { data } = await callable({});
  return data.gifts ?? [];
}

export async function markReceivedGiftViewed(giftInviteId: string): Promise<{ ok: boolean }> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<{ giftInviteId: string }, { ok: boolean }>(
    functions,
    'markReceivedGiftViewed'
  );
  const { data } = await callable({ giftInviteId });
  return data;
}

export async function updateReceivedGiftLineItems(
  giftInviteId: string,
  lineItems: BoxLineItem[]
): Promise<{ ok: boolean; lineItems: BoxLineItem[] }> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<
    { giftInviteId: string; lineItems: BoxLineItem[] },
    { ok: boolean; lineItems: BoxLineItem[] }
  >(functions, 'updateReceivedGiftLineItems');
  const { data } = await callable({ giftInviteId, lineItems });
  return data;
}

export type CreateReceivedGiftCheckoutResult = {
  clientSecret: string | null;
  orderId: string;
  totalCents: number;
  status: 'pending' | 'confirmed';
};

export async function createReceivedGiftCheckout(
  giftInviteId: string,
  shippingAddress: import('../../types/pilot').ShippingAddress,
  lineItems: BoxLineItem[],
  options?: { skipShipStation?: boolean }
): Promise<CreateReceivedGiftCheckoutResult> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const address = {
    name: shippingAddress.name.trim(),
    line1: shippingAddress.line1.trim(),
    city: shippingAddress.city.trim(),
    stateProvince: shippingAddress.stateProvince.trim(),
    postalCode: shippingAddress.postalCode.trim(),
    country: shippingAddress.country || ('US' as const),
    ...(shippingAddress.line2?.trim() ? { line2: shippingAddress.line2.trim() } : {}),
  };
  const callable = httpsCallable<
    {
      giftInviteId: string;
      shippingAddress: typeof address;
      lineItems: BoxLineItem[];
      skipShipStation?: boolean;
    },
    CreateReceivedGiftCheckoutResult
  >(functions, 'createReceivedGiftCheckout');
  const { data } = await callable({
    giftInviteId,
    shippingAddress: address,
    lineItems,
    skipShipStation: options?.skipShipStation,
  });
  return data;
}

export async function convertReceivedGiftToCredit(
  giftInviteId: string
): Promise<{ ok: boolean; creditCentsAdded: number }> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<
    { giftInviteId: string },
    { ok: boolean; creditCentsAdded: number }
  >(functions, 'convertReceivedGiftToCredit');
  const { data } = await callable({ giftInviteId });
  return data;
}

export async function acceptReceivedGiftBox(giftInviteId: string): Promise<{ ok: boolean }> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<{ giftInviteId: string }, { ok: boolean }>(
    functions,
    'acceptReceivedGiftBox'
  );
  const { data } = await callable({ giftInviteId });
  return data;
}

export async function reopenReceivedGiftBox(giftInviteId: string): Promise<{ ok: boolean }> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<{ giftInviteId: string }, { ok: boolean }>(
    functions,
    'reopenReceivedGiftBox'
  );
  const { data } = await callable({ giftInviteId });
  return data;
}

export async function listMyGiftInvites(): Promise<GiftInvite[]> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<Record<string, never>, { invites: GiftInvite[] }>(
    functions,
    'listMyGiftInvites'
  );
  const { data } = await callable({});
  return data.invites ?? [];
}

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

export type PeekGiftInviteResult =
  | { status: 'not_found' }
  | { status: 'claimed'; giverName?: string; creditCents?: number; giftKind?: 'credit' | 'box' }
  | { status: 'unpaid'; giverName?: string }
  | {
      status: 'claimable';
      giverName?: string;
      creditCents?: number;
      hasGiverDraft: boolean;
      giftKind: 'credit' | 'box';
    };

/** Public — no auth. Validate a claim link before showing signup. */
export async function peekGiftInvite(token: string): Promise<PeekGiftInviteResult> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<{ token: string }, PeekGiftInviteResult>(functions, 'peekGiftInvite');
  const { data } = await callable({ token });
  return data;
}

export async function claimGiftInvite(token: string): Promise<ClaimGiftResult> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<{ token: string }, ClaimGiftResult>(functions, 'claimGiftInvite');
  const { data } = await callable({ token });
  return data;
}
