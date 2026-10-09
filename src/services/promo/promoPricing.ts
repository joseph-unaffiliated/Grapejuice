/**
 * Checkout preview of a discount. The server (functions/src/promoPricing.ts) recomputes and is
 * the source of truth; this only has to agree with it for the totals shown before paying.
 */
export type PromoTerms = {
  percentOff: number | null;
  amountOffCents: number | null;
};

export function hasDiscount(terms: Partial<PromoTerms> | null | undefined): boolean {
  return Boolean(terms && ((terms.percentOff ?? 0) > 0 || (terms.amountOffCents ?? 0) > 0));
}

export function discountCentsForTerms(terms: Partial<PromoTerms> | null | undefined, eligibleCents: number): number {
  const eligible = Math.max(0, Math.round(eligibleCents));
  if (!terms || eligible === 0) return 0;
  const pct = Number(terms.percentOff ?? 0);
  if (Number.isFinite(pct) && pct > 0) {
    return Math.min(eligible, Math.round((eligible * Math.min(100, pct)) / 100));
  }
  const amount = Number(terms.amountOffCents ?? 0);
  if (Number.isFinite(amount) && amount > 0) return Math.min(eligible, Math.round(amount));
  return 0;
}

/** One discount per order: whichever of the code or the influencer link saves more. */
export function bestDiscount(
  eligibleCents: number,
  code: Partial<PromoTerms> | null,
  influencer: Partial<PromoTerms> | null
): { source: 'code' | 'influencer' | null; discountCents: number } {
  const codeCents = code ? discountCentsForTerms(code, eligibleCents) : 0;
  const infCents = influencer && hasDiscount(influencer) ? discountCentsForTerms(influencer, eligibleCents) : 0;
  if (code && codeCents >= infCents) return { source: 'code', discountCents: codeCents };
  if (infCents > 0) return { source: 'influencer', discountCents: infCents };
  return { source: code ? 'code' : null, discountCents: codeCents };
}
