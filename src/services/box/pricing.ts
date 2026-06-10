import type { BoxLineItem, CatalogItem } from '../../types/pilot';

/** Flat add-on fee for optional extras (extra gelt, extra candles, etc.). */
export const EXTRA_FLAT_CENTS = 500;

/** Pilot flat-rate shipping (US). */
export const SHIPPING_FLAT_CENTS = 1299;

/** Default Hanukkah curated box price when config has no override. */
export const DEFAULT_BOX_PRICE_CENTS = 9900;

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
