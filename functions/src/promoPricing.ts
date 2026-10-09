/**
 * Discount codes, influencer links and commissions: the pure rules, no Firestore.
 * src/services/promo/promoPricing.ts mirrors discountCentsForTerms for checkout previews.
 */

/** A discount's shape: percent off OR a fixed amount off (never both). */
export type PromoTerms = {
  percentOff: number | null;
  amountOffCents: number | null;
};

export type DiscountCodeRecord = PromoTerms & {
  code: string;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  onePerAccount: boolean;
  active: boolean;
  note?: string | null;
};

export type InfluencerRecord = PromoTerms & {
  slug: string;
  name: string;
  email: string;
  commissionPercent: number;
  active: boolean;
};

/** Snapshot written on an order / gift invite at checkout; lock-time charges reprice from it. */
export type OrderPromo = PromoTerms & {
  source: 'code' | 'influencer' | null;
  code: string | null;
  influencerSlug: string | null;
  /** Commission is skipped when the buyer is the influencer. */
  selfReferral?: boolean;
};

/** Visitors who arrive through an influencer link stay attributed for this long (last click wins). */
export const REFERRAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Orders in these states count as completed purchases (card saved for a box, or paid). */
export const COUNTED_ORDER_STATUSES = new Set(['committed', 'confirmed', 'shipped', 'delivered']);

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const RANDOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export function normalizeSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const slug = raw.trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

/** Unambiguous characters only (no 0/O, 1/I) so codes survive being read aloud. */
export function randomCode(length = 8, random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += RANDOM_CODE_ALPHABET[Math.floor(random() * RANDOM_CODE_ALPHABET.length)];
  }
  return out;
}

export function hasDiscount(terms: Partial<PromoTerms> | null | undefined): boolean {
  return Boolean(terms && ((terms.percentOff ?? 0) > 0 || (terms.amountOffCents ?? 0) > 0));
}

/** Cents off `eligibleCents` (merchandise before credit, shipping and tax). Never more than eligible. */
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

export function termsLabel(terms: Partial<PromoTerms> | null | undefined): string {
  if (!terms) return '';
  if ((terms.percentOff ?? 0) > 0) return `${terms.percentOff}% off`;
  if ((terms.amountOffCents ?? 0) > 0) {
    const d = (terms.amountOffCents ?? 0) / 100;
    return `$${d % 1 ? d.toFixed(2) : d} off`;
  }
  return '';
}

/**
 * Admin input → terms. Exactly one of percentOff (1–100, may be fractional to 2 places) or
 * amountOffCents (> 0). `allowNone` lets an influencer link carry no discount.
 */
export function parseTermsInput(
  raw: { percentOff?: unknown; amountOffCents?: unknown },
  allowNone: boolean
): PromoTerms | { error: string } {
  const pct = raw.percentOff == null || raw.percentOff === '' ? null : Number(raw.percentOff);
  const amt = raw.amountOffCents == null || raw.amountOffCents === '' ? null : Number(raw.amountOffCents);
  const hasPct = pct != null && pct !== 0;
  const hasAmt = amt != null && amt !== 0;
  if (hasPct && hasAmt) return { error: 'Choose percent off or dollars off, not both.' };
  if (hasPct) {
    if (!Number.isFinite(pct) || pct! <= 0 || pct! > 100) return { error: 'Percent off must be between 1 and 100.' };
    return { percentOff: Math.round(pct! * 100) / 100, amountOffCents: null };
  }
  if (hasAmt) {
    if (!Number.isFinite(amt) || amt! <= 0 || amt! > 1_000_000) return { error: 'Dollars off must be more than $0.' };
    return { percentOff: null, amountOffCents: Math.round(amt!) };
  }
  if (allowNone) return { percentOff: null, amountOffCents: null };
  return { error: 'Enter a percent off or a dollar amount off.' };
}

/** ISO string or null; throws away anything Date can't parse. */
export function parseIsoInput(raw: unknown): string | null | { error: string } {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return { error: 'Dates must be text.' };
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return { error: `Not a date: ${raw}` };
  return new Date(ms).toISOString();
}

export type CodeUsage = { used: number; usedByBuyer: number };

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: 'inactive' | 'not_started' | 'expired' | 'used_up' | 'already_used'; message: string };

/** Whether a code can go on a new order right now. `usage` counts completed purchases only. */
export function checkDiscountCode(record: DiscountCodeRecord, nowMs: number, usage: CodeUsage): CodeCheck {
  if (!record.active) {
    return { ok: false, reason: 'inactive', message: 'That code is no longer active.' };
  }
  if (record.startsAt && nowMs < Date.parse(record.startsAt)) {
    return { ok: false, reason: 'not_started', message: 'That code isn’t active yet.' };
  }
  if (record.endsAt && nowMs > Date.parse(record.endsAt)) {
    return { ok: false, reason: 'expired', message: 'That code has expired.' };
  }
  if (record.maxRedemptions != null && usage.used >= record.maxRedemptions) {
    return { ok: false, reason: 'used_up', message: 'That code has been fully redeemed.' };
  }
  if (record.onePerAccount && usage.usedByBuyer > 0) {
    return { ok: false, reason: 'already_used', message: 'You’ve already used that code.' };
  }
  return { ok: true };
}

export function codeStatus(record: DiscountCodeRecord, nowMs: number, used: number): string {
  if (!record.active) return 'inactive';
  if (record.startsAt && nowMs < Date.parse(record.startsAt)) return 'scheduled';
  if (record.endsAt && nowMs > Date.parse(record.endsAt)) return 'expired';
  if (record.maxRedemptions != null && used >= record.maxRedemptions) return 'used up';
  return 'active';
}

/** Last click wins for 30 days; a missing timestamp counts as "now" (it was just captured). */
export function referralStillValid(refAt: unknown, nowMs: number, windowMs = REFERRAL_WINDOW_MS): boolean {
  if (refAt == null || refAt === '') return true;
  if (typeof refAt !== 'string') return false;
  const at = Date.parse(refAt);
  if (Number.isNaN(at)) return false;
  return nowMs - at <= windowMs && at - nowMs <= 5 * 60 * 1000;
}

/**
 * One discount per order: an entered code and an influencer link's discount don't stack;
 * whichever saves the shopper more applies. The influencer keeps the attribution either way.
 */
export function pickDiscount(
  eligibleCents: number,
  code: { code: string; terms: PromoTerms } | null,
  influencer: { slug: string; terms: PromoTerms } | null
): { source: 'code' | 'influencer' | null; terms: PromoTerms | null; discountCents: number } {
  const codeCents = code ? discountCentsForTerms(code.terms, eligibleCents) : 0;
  const infCents = influencer && hasDiscount(influencer.terms) ? discountCentsForTerms(influencer.terms, eligibleCents) : 0;
  if (code && codeCents >= infCents) return { source: 'code', terms: code.terms, discountCents: codeCents };
  if (influencer && hasDiscount(influencer.terms)) {
    return { source: 'influencer', terms: influencer.terms, discountCents: infCents };
  }
  if (code) return { source: 'code', terms: code.terms, discountCents: codeCents };
  return { source: null, terms: null, discountCents: 0 };
}

/** Order snapshot from a pick; null when there's neither a discount nor an influencer. */
export function orderPromoSnapshot(input: {
  pick: ReturnType<typeof pickDiscount>;
  code: string | null;
  influencerSlug: string | null;
  selfReferral?: boolean;
}): OrderPromo | null {
  const { pick } = input;
  if (!pick.source && !input.influencerSlug) return null;
  return {
    source: pick.source,
    code: pick.source === 'code' ? input.code : null,
    influencerSlug: input.influencerSlug,
    percentOff: pick.terms?.percentOff ?? null,
    amountOffCents: pick.terms?.amountOffCents ?? null,
    ...(input.selfReferral ? { selfReferral: true } : {}),
  };
}

type OrderLike = {
  status?: unknown;
  playthrough?: unknown;
  totalCents?: unknown;
  taxCents?: unknown;
  shippingCents?: unknown;
  refundedCents?: unknown;
};

type GiftLike = {
  paymentStatus?: unknown;
  claimEmailSentAt?: unknown;
  amountDueCents?: unknown;
  creditCents?: unknown;
  discountCents?: unknown;
  refundedCents?: unknown;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Card saved (box / lock-charged add-ons) or paid, not cancelled, not a playthrough, not fully refunded. */
export function isCountedOrder(order: OrderLike): boolean {
  if (order.playthrough === true) return false;
  if (!COUNTED_ORDER_STATUSES.has(String(order.status ?? ''))) return false;
  const total = num(order.totalCents);
  const refunded = num(order.refundedCents);
  return !(refunded > 0 && refunded >= total);
}

/**
 * What the shopper paid (or will pay at lock) for the goods: total after discount and credit,
 * minus tax and shipping, scaled down by any partial refund.
 */
export function orderNetCents(order: OrderLike): number {
  const total = num(order.totalCents);
  const net = Math.max(0, total - num(order.taxCents) - num(order.shippingCents));
  const refunded = Math.min(total, num(order.refundedCents));
  if (refunded <= 0 || total <= 0) return net;
  return Math.max(0, Math.round((net * (total - refunded)) / total));
}

export function isCountedGift(gift: GiftLike): boolean {
  const paid = gift.paymentStatus === 'paid' || Boolean(gift.claimEmailSentAt);
  if (!paid) return false;
  const due = giftAmountDueCents(gift);
  const refunded = num(gift.refundedCents);
  return !(refunded > 0 && refunded >= due);
}

export function giftAmountDueCents(gift: GiftLike): number {
  if (typeof gift.amountDueCents === 'number') return Math.max(0, gift.amountDueCents);
  return Math.max(0, num(gift.creditCents) - num(gift.discountCents));
}

export function giftNetCents(gift: GiftLike): number {
  return Math.max(0, giftAmountDueCents(gift) - num(gift.refundedCents));
}

export function commissionCents(commissionPercent: number, netCents: number): number {
  if (!Number.isFinite(commissionPercent) || commissionPercent <= 0) return 0;
  return Math.round((Math.max(0, netCents) * Math.min(100, commissionPercent)) / 100);
}

export function parseCommissionPercent(raw: unknown): number | { error: string } {
  const n = raw == null || raw === '' ? 0 : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'Commission must be between 0 and 100%.' };
  return Math.round(n * 100) / 100;
}
