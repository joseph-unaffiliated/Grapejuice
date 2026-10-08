import { purchasePilotGift, finalizePilotGiftPayment } from '../../services/gift/giftFlow';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { trackMeta } from '../../services/analytics/metaPixel';
import { useAuthStore } from '../../stores/authStore';
import type { AgeGroup, BoxLineItem } from '../../types/pilot';
import { hasGiverAddress, type GiftGiveFormValues } from './giftGiveTypes';

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
  /** Pass back to completeGiftPurchase — finalizes for signed-out givers. */
  claimToken: string;
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
  const signedIn = useAuthStore.getState().isAuthenticated;
  const result = await purchasePilotGift({
    recipientEmail: input.form.recipientEmail.trim(),
    giverName: input.form.giverName.trim() || 'Someone who loves you',
    giverEmail: signedIn ? undefined : input.form.giverEmail?.trim(),
    message: input.form.message.trim() || undefined,
    creditCents,
    customize: input.customize,
    lineItems: input.customize ? input.lineItems : undefined,
    childAgeGroups: input.customize ? input.childAgeGroups : undefined,
    shippingAddress:
      input.customize && hasGiverAddress(input.form.shippingAddress) ? input.form.shippingAddress : undefined,
  });

  if (!result.clientSecret) {
    throw new Error('No payment secret returned.');
  }

  return {
    giftInviteId: result.giftInviteId,
    clientSecret: result.clientSecret,
    publishableKey: result.publishableKey?.trim() || null,
    claimUrl: result.claimUrl,
    claimToken: result.claimToken,
  };
}

/** Finalize Stripe payment on the invite — no UI; caller navigates to confirmation. */
export async function completeGiftPurchase(
  giftInviteId: string,
  claimToken?: string
): Promise<GiftFinalizeResult> {
  const result = await finalizePilotGiftPayment(giftInviteId, claimToken);
  return {
    claimUrl: result.claimUrl,
    alreadyFinalized: result.alreadyFinalized,
  };
}
