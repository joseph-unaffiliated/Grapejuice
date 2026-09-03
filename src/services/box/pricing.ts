import type { BoxLineItem, CatalogItem } from '../../types/pilot';

/** Flat add-on fee for optional extras (extra gelt, extra candles, etc.). */
export const EXTRA_FLAT_CENTS = 500;

/** Standard shipping — free for pilot (expedited tier adds fee later). */
export const SHIPPING_FLAT_CENTS = 0;

/** List price shown in catalog / My Box order summary / marketing copy. */
export const LIST_BOX_PRICE_CENTS = 8000;

/** Stated à-la-carte catalog value of a full Hanukkah box (PDP marketing). */
export const LIST_BOX_VALUE_CENTS = 25000;

/**
 * Checkout / gift-credit fallback when config has no override.
 * Flat $80 box — same as {@link LIST_BOX_PRICE_CENTS}.
 */
export const DEFAULT_BOX_PRICE_CENTS = 8000;

/** Display window for “arrives in time for Hanukkah” (inclusive). */
export const HANUKKAH_SHIP_WINDOW_LABEL = 'Nov 15–20';

/** Awarded on Hanukkah debrief completion (panel Jun 10). */
export const DEBRIEF_PLATFORM_CREDIT_CENTS = 8000;

/** Flat expedited shipping add-on (Build 3). */
export const EXPEDITED_SHIPPING_CENTS = 1500;

/** À la carte items never ship in the default box. */
export const ALA_CARTE_SLOT_IDS = new Set(['keepsake-dreidel', 'family-hanukkiah', 'ala-dreidel', 'ala-hanukkiah']);

export type CatalogPricingTier = 'included' | 'perKid' | 'extra' | 'alaCarte';

export function inferPricingTier(item: CatalogItem): CatalogPricingTier {
  if (item.pricingTier) return item.pricingTier;
  if (ALA_CARTE_SLOT_IDS.has(item.slotId) || item.id.includes('ala-')) return 'alaCarte';
  if (item.slotId.startsWith('extra-') || item.id.startsWith('extra-')) return 'extra';
  if (item.slot === 'story' || item.slot === 'gift') return 'perKid';
  return 'included';
}

export function unitCentsForTier(tier: CatalogPricingTier, catalogCents: number): number {
  if (tier === 'extra') return EXTRA_FLAT_CENTS;
  if (tier === 'alaCarte') return catalogCents;
  return 0;
}

export function isSwappable(item: CatalogItem, tier: CatalogPricingTier): boolean {
  return tier === 'perKid' || (tier === 'included' && item.swapOptions.length > 0);
}

export function chargeableLineTotal(lineItems: BoxLineItem[]): number {
  return lineItems.reduce((sum, li) => sum + li.unitCents * li.quantity, 0);
}

export function orderSubtotalCents(lineItems: BoxLineItem[], boxPriceCents = DEFAULT_BOX_PRICE_CENTS): number {
  const hasIncluded = lineItems.some((li) => li.unitCents === 0 || li.slotId);
  const base = hasIncluded ? boxPriceCents : 0;
  return base + chargeableLineTotal(lineItems);
}

export function orderTotalCents(
  lineItems: BoxLineItem[],
  boxPriceCents = DEFAULT_BOX_PRICE_CENTS,
  includeShipping = true
): number {
  const subtotal = orderSubtotalCents(lineItems, boxPriceCents);
  return subtotal + (includeShipping ? SHIPPING_FLAT_CENTS : 0);
}

/** Resolve member / à la carte display prices from catalog fields. */
export function resolveCatalogDisplayPrices(item: CatalogItem): {
  memberCents: number;
  nonMemberCents: number;
  savingsCents: number;
} {
  const fallback = Math.max(0, Math.round(item.dollarCostCents ?? 0));
  const memberCents =
    item.memberPriceCents != null && Number.isFinite(item.memberPriceCents)
      ? Math.max(0, Math.round(item.memberPriceCents))
      : fallback;
  const nonMemberCents =
    item.nonMemberPriceCents != null && Number.isFinite(item.nonMemberPriceCents)
      ? Math.max(0, Math.round(item.nonMemberPriceCents))
      : fallback;
  const savingsCents = Math.max(0, nonMemberCents - memberCents);
  return { memberCents, nonMemberCents, savingsCents };
}

/** Percent discount from retail → member (rounded). */
export function catalogPercentOff(nonMemberCents: number, memberCents: number): number | null {
  if (nonMemberCents <= 0 || memberCents >= nonMemberCents) return null;
  return Math.round(((nonMemberCents - memberCents) / nonMemberCents) * 100);
}

/**
 * Storefront member offer copy, e.g. "$18 (74% off) for subscribers".
 * Pass preformatted dollar strings from `formatCatalogDollars`.
 */
export function formatSubscriberOfferLine(
  memberPriceLabel: string,
  nonMemberCents: number,
  memberCents: number
): string {
  const off = catalogPercentOff(nonMemberCents, memberCents);
  return off
    ? `${memberPriceLabel} (${off}% off) for subscribers`
    : `${memberPriceLabel} for subscribers`;
}
