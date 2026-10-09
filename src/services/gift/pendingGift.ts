import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export type ResumeGiftPaymentResult =
  | { alreadyPaid: true; giftInviteId: string; claimUrl?: string }
  | {
      alreadyPaid: false;
      giftInviteId: string;
      clientSecret: string;
      publishableKey: string | null;
      claimToken: string;
      recipientEmail: string;
      giverName: string;
      creditCents: number;
      discountCents: number;
      amountDueCents: number;
      customize: boolean;
    };

/** Payment details for a gift the giver started but never paid for. */
export async function resumePilotGiftPayment(giftInviteId: string): Promise<ResumeGiftPaymentResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  const callable = httpsCallable<{ giftInviteId: string }, ResumeGiftPaymentResult>(
    functions,
    'resumePilotGiftPayment'
  );
  const { data } = await callable({ giftInviteId });
  return data;
}

export async function cancelPilotGift(
  giftInviteId: string
): Promise<{ giftInviteId: string; status: 'cancelled' }> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  const callable = httpsCallable<{ giftInviteId: string }, { giftInviteId: string; status: 'cancelled' }>(
    functions,
    'cancelPilotGift'
  );
  const { data } = await callable({ giftInviteId });
  return data;
}
