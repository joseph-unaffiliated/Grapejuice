import assert from 'node:assert/strict';
import {
  checkDiscountCode,
  codeStatus,
  commissionCents,
  discountCentsForTerms,
  giftAmountDueCents,
  giftNetCents,
  isCountedGift,
  isCountedOrder,
  normalizeCode,
  normalizeSlug,
  orderNetCents,
  orderPromoSnapshot,
  parseCommissionPercent,
  parseIsoInput,
  parseTermsInput,
  pickDiscount,
  randomCode,
  referralStillValid,
  REFERRAL_WINDOW_MS,
  termsLabel,
  type DiscountCodeRecord,
} from './promoPricing';

// Discount math
assert.equal(discountCentsForTerms({ percentOff: 10, amountOffCents: null }, 10500), 1050);
assert.equal(discountCentsForTerms({ percentOff: 15, amountOffCents: null }, 333), 50);
assert.equal(discountCentsForTerms({ percentOff: 100, amountOffCents: null }, 8000), 8000);
assert.equal(discountCentsForTerms({ percentOff: 150, amountOffCents: null }, 8000), 8000);
assert.equal(discountCentsForTerms({ percentOff: null, amountOffCents: 2000 }, 1500), 1500);
assert.equal(discountCentsForTerms({ percentOff: null, amountOffCents: 2000 }, 9000), 2000);
assert.equal(discountCentsForTerms({ percentOff: null, amountOffCents: null }, 9000), 0);
assert.equal(discountCentsForTerms(null, 9000), 0);
assert.equal(discountCentsForTerms({ percentOff: 10, amountOffCents: null }, -5), 0);
assert.equal(termsLabel({ percentOff: 10, amountOffCents: null }), '10% off');
assert.equal(termsLabel({ percentOff: null, amountOffCents: 2000 }), '$20 off');
assert.equal(termsLabel({ percentOff: null, amountOffCents: 1250 }), '$12.50 off');

// Codes and slugs
assert.equal(normalizeCode(' save10 '), 'SAVE10');
assert.equal(normalizeCode('ab'), null);
assert.equal(normalizeCode('has space'), null);
assert.equal(normalizeCode(42), null);
assert.equal(normalizeSlug('Maya-Cooks'), 'maya-cooks');
assert.equal(normalizeSlug('-bad'), null);
assert.equal(normalizeSlug('no_underscores'), null);
const seq = [0, 0.5, 0.99, 0.1, 0.2, 0.3, 0.4, 0.6];
let i = 0;
const generated = randomCode(8, () => seq[i++ % seq.length]);
assert.equal(generated.length, 8);
assert.equal(normalizeCode(generated), generated);
assert.ok(!/[01OI]/.test(randomCode(64)));

// Admin input parsing
assert.deepEqual(parseTermsInput({ percentOff: '10' }, false), { percentOff: 10, amountOffCents: null });
assert.deepEqual(parseTermsInput({ amountOffCents: 1500 }, false), { percentOff: null, amountOffCents: 1500 });
assert.ok('error' in parseTermsInput({ percentOff: 10, amountOffCents: 500 }, false));
assert.ok('error' in parseTermsInput({}, false));
assert.ok('error' in parseTermsInput({ percentOff: 120 }, false));
assert.deepEqual(parseTermsInput({}, true), { percentOff: null, amountOffCents: null });
assert.equal(parseIsoInput(''), null);
assert.equal(parseIsoInput('2026-11-01T00:00:00Z'), '2026-11-01T00:00:00.000Z');
assert.ok(typeof parseIsoInput('nope') === 'object');
assert.equal(parseCommissionPercent('12.5'), 12.5);
assert.ok(typeof parseCommissionPercent(101) === 'object');

// Code validity
const now = Date.parse('2026-11-01T12:00:00Z');
const base: DiscountCodeRecord = {
  code: 'SAVE10',
  percentOff: 10,
  amountOffCents: null,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  onePerAccount: false,
  active: true,
};
const noUse = { used: 0, usedByBuyer: 0 };
assert.deepEqual(checkDiscountCode(base, now, noUse), { ok: true });
assert.equal(checkDiscountCode({ ...base, active: false }, now, noUse).ok, false);
const notStarted = checkDiscountCode({ ...base, startsAt: '2026-11-02T00:00:00Z' }, now, noUse);
assert.equal(!notStarted.ok && notStarted.reason, 'not_started');
const expired = checkDiscountCode({ ...base, endsAt: '2026-10-31T00:00:00Z' }, now, noUse);
assert.equal(!expired.ok && expired.reason, 'expired');
const usedUp = checkDiscountCode({ ...base, maxRedemptions: 5 }, now, { used: 5, usedByBuyer: 0 });
assert.equal(!usedUp.ok && usedUp.reason, 'used_up');
assert.equal(checkDiscountCode({ ...base, maxRedemptions: 5 }, now, { used: 4, usedByBuyer: 0 }).ok, true);
const again = checkDiscountCode({ ...base, onePerAccount: true }, now, { used: 3, usedByBuyer: 1 });
assert.equal(!again.ok && again.reason, 'already_used');
assert.equal(checkDiscountCode(base, now, { used: 3, usedByBuyer: 1 }).ok, true);
assert.equal(codeStatus(base, now, 0), 'active');
assert.equal(codeStatus({ ...base, maxRedemptions: 1 }, now, 1), 'used up');
assert.equal(codeStatus({ ...base, startsAt: '2026-12-01T00:00:00Z' }, now, 0), 'scheduled');

// Attribution window: 30 days, last click wins (client overwrites refAt on each click)
assert.equal(referralStillValid(new Date(now - 29 * 86400000).toISOString(), now), true);
assert.equal(referralStillValid(new Date(now - REFERRAL_WINDOW_MS - 1000).toISOString(), now), false);
assert.equal(referralStillValid(undefined, now), true);
assert.equal(referralStillValid('garbage', now), false);
assert.equal(referralStillValid(new Date(now + 86400000).toISOString(), now), false);

// One discount per order: the bigger saving wins; the influencer keeps attribution either way
const code10 = { code: 'SAVE10', terms: { percentOff: 10, amountOffCents: null } };
const inf20 = { slug: 'maya', terms: { percentOff: null, amountOffCents: 2000 } };
const infNone = { slug: 'maya', terms: { percentOff: null, amountOffCents: null } };
assert.deepEqual(pickDiscount(10000, code10, inf20), { source: 'influencer', terms: inf20.terms, discountCents: 2000 });
assert.deepEqual(pickDiscount(30000, code10, inf20), { source: 'code', terms: code10.terms, discountCents: 3000 });
assert.deepEqual(pickDiscount(10000, code10, infNone), { source: 'code', terms: code10.terms, discountCents: 1000 });
assert.deepEqual(pickDiscount(10000, null, infNone), { source: null, terms: null, discountCents: 0 });
const snap = orderPromoSnapshot({ pick: pickDiscount(10000, code10, inf20), code: 'SAVE10', influencerSlug: 'maya' });
assert.deepEqual(snap, {
  source: 'influencer',
  code: null,
  influencerSlug: 'maya',
  percentOff: null,
  amountOffCents: 2000,
});
assert.equal(orderPromoSnapshot({ pick: pickDiscount(10000, null, null), code: null, influencerSlug: null }), null);
assert.deepEqual(orderPromoSnapshot({ pick: pickDiscount(10000, null, infNone), code: null, influencerSlug: 'maya' }), {
  source: null,
  code: null,
  influencerSlug: 'maya',
  percentOff: null,
  amountOffCents: null,
});

// Completed purchases: card saved (committed) or paid; not cancelled, playthrough or fully refunded
assert.equal(isCountedOrder({ status: 'committed', totalCents: 9000 }), true);
assert.equal(isCountedOrder({ status: 'confirmed', totalCents: 9000 }), true);
assert.equal(isCountedOrder({ status: 'shipped', totalCents: 9000 }), true);
assert.equal(isCountedOrder({ status: 'pending', totalCents: 9000 }), false);
assert.equal(isCountedOrder({ status: 'cancelled', totalCents: 9000 }), false);
assert.equal(isCountedOrder({ status: 'committed', totalCents: 9000, playthrough: true }), false);
assert.equal(isCountedOrder({ status: 'confirmed', totalCents: 9000, refundedCents: 9000 }), false);
assert.equal(isCountedOrder({ status: 'confirmed', totalCents: 9000, refundedCents: 1000 }), true);
assert.equal(isCountedGift({ paymentStatus: 'paid', creditCents: 8000 }), true);
assert.equal(isCountedGift({ paymentStatus: 'pending', creditCents: 8000 }), false);
assert.equal(isCountedGift({ paymentStatus: 'paid', creditCents: 8000, amountDueCents: 7200, refundedCents: 7200 }), false);

// Commission base: what the buyer pays after discount and credit, without tax or shipping
assert.equal(orderNetCents({ totalCents: 9621, taxCents: 671, shippingCents: 1500 }), 7450);
assert.equal(orderNetCents({ totalCents: 0, taxCents: 0, shippingCents: 0 }), 0);
assert.equal(orderNetCents({ totalCents: 10750, taxCents: 750, shippingCents: 0, refundedCents: 5375 }), 5000);
assert.equal(giftAmountDueCents({ creditCents: 8000, discountCents: 800 }), 7200);
assert.equal(giftAmountDueCents({ creditCents: 8000, amountDueCents: 7000 }), 7000);
assert.equal(giftNetCents({ creditCents: 8000, amountDueCents: 7200, refundedCents: 200 }), 7000);
assert.equal(commissionCents(10, 7450), 745);
assert.equal(commissionCents(12.5, 999), 125);
assert.equal(commissionCents(0, 7450), 0);
assert.equal(commissionCents(10, -5), 0);

console.log('promoPricing tests passed');
