import { formatDollars } from '../services/box/buildDefaultBox';

/** Spendable balance from a credit-only gift — store or Hanukkah box. */
export const GIFT_CREDIT_LABEL = 'Gift credit';

/** Giver-picked items shipped as a separate received gift. */
export const CURATED_GIFT_BOX_LABEL = 'Curated gift box';

/** Short hint wherever gift credit spend rules matter. */
export const GIFT_CREDIT_SPEND_HINT =
  'Spend it on anything in the store, or put it toward your own Hanukkah box.';

export function giftCreditProductLabel(cents: number): string {
  return `${formatDollars(cents)} gift credit`;
}

export function giftCreditClaimTitle(cents: number): string {
  return `${formatDollars(cents)} gift credit`;
}

export function isCuratedGiftInvite(invite: { lineItems?: unknown[] | null }): boolean {
  return Array.isArray(invite.lineItems) && invite.lineItems.length > 0;
}

export function giftInviteOrderTitle(invite: { creditCents: number; lineItems?: unknown[] | null }): string {
  return isCuratedGiftInvite(invite) ? CURATED_GIFT_BOX_LABEL : giftCreditProductLabel(invite.creditCents);
}
