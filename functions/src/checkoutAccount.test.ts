import assert from 'node:assert/strict';
import {
  CHECKOUT_CLAIM_TTL_MS,
  checkoutClaimStatus,
  guestHouseholdId,
  mintCheckoutClaim,
  savedCardChargeDenial,
  type SavedCardChargeInput,
} from './checkoutAccount';

// Saved card: only an explicit choice, from a signed-in member, on the household's own customer.
const allowed: SavedCardChargeInput = {
  authedUid: 'u1',
  useSavedCard: true,
  householdMemberIds: ['u1', 'u2'],
  householdCustomerId: 'cus_1',
  householdPaymentMethodId: 'pm_1',
  paymentMethodCustomerId: 'cus_1',
  paymentIntentCustomerId: 'cus_1',
};
assert.equal(savedCardChargeDenial(allowed), null);
assert.equal(savedCardChargeDenial({ ...allowed, authedUid: 'u2' }), null);

assert.notEqual(savedCardChargeDenial({ ...allowed, useSavedCard: undefined }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, useSavedCard: 'true' }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, useSavedCard: false }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, authedUid: null }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, authedUid: undefined }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, authedUid: 'stranger' }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, householdMemberIds: undefined }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, householdCustomerId: '' }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, householdPaymentMethodId: undefined }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, paymentMethodCustomerId: 'cus_other' }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, paymentMethodCustomerId: null }), null);
// A signed-out PaymentIntent carries no customer, so the saved card can never be attached to it.
assert.notEqual(savedCardChargeDenial({ ...allowed, paymentIntentCustomerId: null }), null);
assert.notEqual(savedCardChargeDenial({ ...allowed, paymentIntentCustomerId: 'cus_other' }), null);

// Checkout claim: single use, short-lived, hash-only.
const NOW = Date.parse('2026-11-01T12:00:00Z');
const minted = mintCheckoutClaim(NOW);
assert.ok(minted.claim.length >= 40);
assert.match(minted.hash, /^[0-9a-f]{64}$/);
assert.notEqual(minted.hash, minted.claim);
assert.equal(Date.parse(minted.expiresAt), NOW + CHECKOUT_CLAIM_TTL_MS);
assert.notEqual(mintCheckoutClaim(NOW).claim, minted.claim);

const order = { checkoutClaimHash: minted.hash, checkoutClaimExpiresAt: minted.expiresAt };
assert.equal(checkoutClaimStatus(order, minted.claim, NOW), 'ok');
assert.equal(checkoutClaimStatus(order, minted.claim, NOW + CHECKOUT_CLAIM_TTL_MS - 1), 'ok');
assert.equal(checkoutClaimStatus(order, minted.claim, NOW + CHECKOUT_CLAIM_TTL_MS + 1), 'expired');
assert.equal(checkoutClaimStatus({ ...order, checkoutClaimUsedAt: 'x' }, minted.claim, NOW), 'used');
assert.equal(checkoutClaimStatus(order, mintCheckoutClaim(NOW).claim, NOW), 'invalid');
assert.equal(checkoutClaimStatus(order, minted.hash, NOW), 'invalid');
assert.equal(checkoutClaimStatus(order, undefined, NOW), 'invalid');
assert.equal(checkoutClaimStatus(order, 'short', NOW), 'invalid');
// Existing-account orders never store a claim, so nothing can redeem one.
assert.equal(checkoutClaimStatus({}, minted.claim, NOW), 'invalid');
assert.equal(checkoutClaimStatus({ checkoutClaimHash: 'zz' }, minted.claim, NOW), 'invalid');
assert.equal(checkoutClaimStatus({ checkoutClaimHash: minted.hash }, minted.claim, NOW), 'expired');

assert.equal(guestHouseholdId('Joseph+Test010@Unaffiliated.co'), 'guest_joseph_test010_unaffiliated_co');

console.log('checkoutAccount tests passed');
