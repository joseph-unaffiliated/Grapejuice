import { purchasePilotGift, finalizePilotGiftPayment } from '../../services/gift/giftFlow';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { trackMeta } from '../../services/analytics/metaPixel';
import type { AgeGroup, BoxLineItem } from '../../types/pilot';
import type { GiftGiveFormValues } from './giftGiveTypes';

export type GiftPurchaseInput = {
  form: GiftGiveFormValues;
  customize: boolean;
  lineItems?: BoxLineItem[];
  childAgeGroups?: AgeGroup[];
  /** Charged amount — defaults to flat box price for credit-only gifts. */
  amountCents?: number;
};

export type GiftPurchaseResult = {
  giftInviteId: string;
  clientSecret: string;
  /** Server's publishable key — must be used with clientSecret when present. */
  publishableKey: string | null;
  claimUrl: string;
};

export type GiftFinalizeResult = {
  claimUrl: string;
  alreadyFinalized: boolean;
};

export async function startGiftPurchase(input: GiftPurchaseInput): Promise<GiftPurchaseResult> {
  const creditCents =
    typeof input.amountCents === 'number' && input.amountCents > 0
      ? input.amountCents
      : DEFAULT_BOX_PRICE_CENTS;
  trackMeta('InitiateCheckout', {
    value: creditCents / 100,
    currency: 'USD',
    content_name: input.customize ? 'Gift box' : 'Gift credit',
    content_type: 'product',
  });
  const result = await purchasePilotGift({
    recipientEmail: input.form.recipientEmail.trim(),
    giverName: input.form.giverName.trim() || 'Someone who loves you',
    message: input.form.message.trim() || undefined,
    creditCents,
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
    publishableKey: result.publishableKey?.trim() || null,
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
