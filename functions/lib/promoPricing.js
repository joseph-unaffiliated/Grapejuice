"use strict";
/**
 * Discount codes, influencer links and commissions: the pure rules, no Firestore.
 * src/services/promo/promoPricing.ts mirrors discountCentsForTerms for checkout previews.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTED_ORDER_STATUSES = exports.REFERRAL_WINDOW_MS = void 0;
exports.normalizeCode = normalizeCode;
exports.normalizeSlug = normalizeSlug;
exports.randomCode = randomCode;
exports.hasDiscount = hasDiscount;
exports.discountCentsForTerms = discountCentsForTerms;
exports.termsLabel = termsLabel;
exports.parseTermsInput = parseTermsInput;
exports.parseIsoInput = parseIsoInput;
exports.checkDiscountCode = checkDiscountCode;
exports.codeStatus = codeStatus;
exports.referralStillValid = referralStillValid;
exports.pickDiscount = pickDiscount;
exports.orderPromoSnapshot = orderPromoSnapshot;
exports.isCountedOrder = isCountedOrder;
exports.orderNetCents = orderNetCents;
exports.isCountedGift = isCountedGift;
exports.giftAmountDueCents = giftAmountDueCents;
exports.giftNetCents = giftNetCents;
exports.commissionCents = commissionCents;
exports.parseCommissionPercent = parseCommissionPercent;
/** Visitors who arrive through an influencer link stay attributed for this long (last click wins). */
exports.REFERRAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Orders in these states count as completed purchases (card saved for a box, or paid). */
exports.COUNTED_ORDER_STATUSES = new Set(['committed', 'confirmed', 'shipped', 'delivered']);
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const RANDOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function normalizeCode(raw) {
    if (typeof raw !== 'string')
        return null;
    const code = raw.trim().toUpperCase();
    return CODE_RE.test(code) ? code : null;
}
function normalizeSlug(raw) {
    if (typeof raw !== 'string')
        return null;
    const slug = raw.trim().toLowerCase();
    return SLUG_RE.test(slug) ? slug : null;
}
/** Unambiguous characters only (no 0/O, 1/I) so codes survive being read aloud. */
function randomCode(length = 8, random = Math.random) {
    let out = '';
    for (let i = 0; i < length; i += 1) {
        out += RANDOM_CODE_ALPHABET[Math.floor(random() * RANDOM_CODE_ALPHABET.length)];
    }
    return out;
}
function hasDiscount(terms) {
    var _a, _b;
    return Boolean(terms && (((_a = terms.percentOff) !== null && _a !== void 0 ? _a : 0) > 0 || ((_b = terms.amountOffCents) !== null && _b !== void 0 ? _b : 0) > 0));
}
/** Cents off `eligibleCents` (merchandise before credit, shipping and tax). Never more than eligible. */
function discountCentsForTerms(terms, eligibleCents) {
    var _a, _b;
    const eligible = Math.max(0, Math.round(eligibleCents));
    if (!terms || eligible === 0)
        return 0;
    const pct = Number((_a = terms.percentOff) !== null && _a !== void 0 ? _a : 0);
    if (Number.isFinite(pct) && pct > 0) {
        return Math.min(eligible, Math.round((eligible * Math.min(100, pct)) / 100));
    }
    const amount = Number((_b = terms.amountOffCents) !== null && _b !== void 0 ? _b : 0);
    if (Number.isFinite(amount) && amount > 0)
        return Math.min(eligible, Math.round(amount));
    return 0;
}
function termsLabel(terms) {
    var _a, _b, _c;
    if (!terms)
        return '';
    if (((_a = terms.percentOff) !== null && _a !== void 0 ? _a : 0) > 0)
        return `${terms.percentOff}% off`;
    if (((_b = terms.amountOffCents) !== null && _b !== void 0 ? _b : 0) > 0) {
        const d = ((_c = terms.amountOffCents) !== null && _c !== void 0 ? _c : 0) / 100;
        return `$${d % 1 ? d.toFixed(2) : d} off`;
    }
    return '';
}
/**
 * Admin input → terms. Exactly one of percentOff (1–100, may be fractional to 2 places) or
 * amountOffCents (> 0). `allowNone` lets an influencer link carry no discount.
 */
function parseTermsInput(raw, allowNone) {
    const pct = raw.percentOff == null || raw.percentOff === '' ? null : Number(raw.percentOff);
    const amt = raw.amountOffCents == null || raw.amountOffCents === '' ? null : Number(raw.amountOffCents);
    const hasPct = pct != null && pct !== 0;
    const hasAmt = amt != null && amt !== 0;
    if (hasPct && hasAmt)
        return { error: 'Choose percent off or dollars off, not both.' };
    if (hasPct) {
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100)
            return { error: 'Percent off must be between 1 and 100.' };
        return { percentOff: Math.round(pct * 100) / 100, amountOffCents: null };
    }
    if (hasAmt) {
        if (!Number.isFinite(amt) || amt <= 0 || amt > 1000000)
            return { error: 'Dollars off must be more than $0.' };
        return { percentOff: null, amountOffCents: Math.round(amt) };
    }
    if (allowNone)
        return { percentOff: null, amountOffCents: null };
    return { error: 'Enter a percent off or a dollar amount off.' };
}
/** ISO string or null; throws away anything Date can't parse. */
function parseIsoInput(raw) {
    if (raw == null || raw === '')
        return null;
    if (typeof raw !== 'string')
        return { error: 'Dates must be text.' };
    const ms = Date.parse(raw);
    if (Number.isNaN(ms))
        return { error: `Not a date: ${raw}` };
    return new Date(ms).toISOString();
}
/** Whether a code can go on a new order right now. `usage` counts completed purchases only. */
function checkDiscountCode(record, nowMs, usage) {
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
function codeStatus(record, nowMs, used) {
    if (!record.active)
        return 'inactive';
    if (record.startsAt && nowMs < Date.parse(record.startsAt))
        return 'scheduled';
    if (record.endsAt && nowMs > Date.parse(record.endsAt))
        return 'expired';
    if (record.maxRedemptions != null && used >= record.maxRedemptions)
        return 'used up';
    return 'active';
}
/** Last click wins for 30 days; a missing timestamp counts as "now" (it was just captured). */
function referralStillValid(refAt, nowMs, windowMs = exports.REFERRAL_WINDOW_MS) {
    if (refAt == null || refAt === '')
        return true;
    if (typeof refAt !== 'string')
        return false;
    const at = Date.parse(refAt);
    if (Number.isNaN(at))
        return false;
    return nowMs - at <= windowMs && at - nowMs <= 5 * 60 * 1000;
}
/**
 * One discount per order: an entered code and an influencer link's discount don't stack;
 * whichever saves the shopper more applies. The influencer keeps the attribution either way.
 */
function pickDiscount(eligibleCents, code, influencer) {
    const codeCents = code ? discountCentsForTerms(code.terms, eligibleCents) : 0;
    const infCents = influencer && hasDiscount(influencer.terms) ? discountCentsForTerms(influencer.terms, eligibleCents) : 0;
    if (code && codeCents >= infCents)
        return { source: 'code', terms: code.terms, discountCents: codeCents };
    if (influencer && hasDiscount(influencer.terms)) {
        return { source: 'influencer', terms: influencer.terms, discountCents: infCents };
    }
    if (code)
        return { source: 'code', terms: code.terms, discountCents: codeCents };
    return { source: null, terms: null, discountCents: 0 };
}
/** Order snapshot from a pick; null when there's neither a discount nor an influencer. */
function orderPromoSnapshot(input) {
    var _a, _b, _c, _d;
    const { pick } = input;
    if (!pick.source && !input.influencerSlug)
        return null;
    return Object.assign({ source: pick.source, code: pick.source === 'code' ? input.code : null, influencerSlug: input.influencerSlug, percentOff: (_b = (_a = pick.terms) === null || _a === void 0 ? void 0 : _a.percentOff) !== null && _b !== void 0 ? _b : null, amountOffCents: (_d = (_c = pick.terms) === null || _c === void 0 ? void 0 : _c.amountOffCents) !== null && _d !== void 0 ? _d : null }, (input.selfReferral ? { selfReferral: true } : {}));
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/** Card saved (box / lock-charged add-ons) or paid, not cancelled, not a playthrough, not fully refunded. */
function isCountedOrder(order) {
    var _a;
    if (order.playthrough === true)
        return false;
    if (!exports.COUNTED_ORDER_STATUSES.has(String((_a = order.status) !== null && _a !== void 0 ? _a : '')))
        return false;
    const total = num(order.totalCents);
    const refunded = num(order.refundedCents);
    return !(refunded > 0 && refunded >= total);
}
/**
 * What the shopper paid (or will pay at lock) for the goods: total after discount and credit,
 * minus tax and shipping, scaled down by any partial refund.
 */
function orderNetCents(order) {
    const total = num(order.totalCents);
    const net = Math.max(0, total - num(order.taxCents) - num(order.shippingCents));
    const refunded = Math.min(total, num(order.refundedCents));
    if (refunded <= 0 || total <= 0)
        return net;
    return Math.max(0, Math.round((net * (total - refunded)) / total));
}
function isCountedGift(gift) {
    const paid = gift.paymentStatus === 'paid' || Boolean(gift.claimEmailSentAt);
    if (!paid)
        return false;
    const due = giftAmountDueCents(gift);
    const refunded = num(gift.refundedCents);
    return !(refunded > 0 && refunded >= due);
}
function giftAmountDueCents(gift) {
    if (typeof gift.amountDueCents === 'number')
        return Math.max(0, gift.amountDueCents);
    return Math.max(0, num(gift.creditCents) - num(gift.discountCents));
}
function giftNetCents(gift) {
    return Math.max(0, giftAmountDueCents(gift) - num(gift.refundedCents));
}
function commissionCents(commissionPercent, netCents) {
    if (!Number.isFinite(commissionPercent) || commissionPercent <= 0)
        return 0;
    return Math.round((Math.max(0, netCents) * Math.min(100, commissionPercent)) / 100);
}
function parseCommissionPercent(raw) {
    const n = raw == null || raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100)
        return { error: 'Commission must be between 0 and 100%.' };
    return Math.round(n * 100) / 100;
}
//# sourceMappingURL=promoPricing.js.map