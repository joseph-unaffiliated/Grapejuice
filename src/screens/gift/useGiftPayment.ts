import { purchasePilotGift, finalizePilotGiftPayment } from '../../services/gift/giftFlow';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import type { AgeGroup, BoxLineItem } from '../../types/pilot';
import type { GiftGiveFormValues } from './giftGiveTypes';

export type GiftPurchaseInput = {
  form: GiftGiveFormValues;
  customize: boolean;
  lineItems?: BoxLineItem[];
  childAgeGroups?: AgeGroup[];
};

export type GiftPurchaseResult = {
  giftInviteId: string;
  clientSecret: string;
  claimUrl: string;
};

export type GiftFinalizeResult = {
  claimUrl: string;
  alreadyFinalized: boolean;
};

export async function startGiftPurchase(input: GiftPurchaseInput): Promise<GiftPurchaseResult> {
  const result = await purchasePilotGift({
    recipientEmail: input.form.recipientEmail.trim(),
    giverName: input.form.giverName.trim() || 'Someone who loves you',
    message: input.form.message.trim() || undefined,
    creditCents: DEFAULT_BOX_PRICE_CENTS,
    customize: input.customize,
    lineItems: input.customize ? input.lineItems : undefined,
    childAgeGroups: input.customize ? input.childAgeGroups : undefined,
  });

  if (!result.clientSecret) {
    throw new Error('No payment secret returned.');
  }

  return {
    giftInviteId: result.giftInviteId,
    clientSecret: result.clientSecret,
    claimUrl: result.claimUrl,
  };
}

/** Finalize Stripe payment on the invite — no UI; caller navigates to confirmation. */
export async function completeGiftPurchase(giftInviteId: string): Promise<GiftFinalizeResult> {
  const result = await finalizePilotGiftPayment(giftInviteId);
  return {
    claimUrl: result.claimUrl,
    alreadyFinalized: result.alreadyFinalized,
  };
}
