/**
 * Run: npx tsx functions/src/testAccounts.test.ts
 */
import assert from 'node:assert/strict';
import { isPlaythroughTestEmail, isTest } from './testAccounts';

// Automated test checkouts: only the joseph+test-* pattern at unaffiliated.co.
assert.equal(isPlaythroughTestEmail('joseph+test-desktop@unaffiliated.co'), true);
assert.equal(isPlaythroughTestEmail('Joseph+Test-Phone@Unaffiliated.co'), true);
assert.equal(isPlaythroughTestEmail('joseph+test.gift@unaffiliated.co'), true);
// Joseph's real address and other team addresses still ship.
assert.equal(isPlaythroughTestEmail('joseph@unaffiliated.co'), false);
assert.equal(isPlaythroughTestEmail('joseph+orders@unaffiliated.co'), false);
assert.equal(isPlaythroughTestEmail('joseph+test@unaffiliated.co'), false);
assert.equal(isPlaythroughTestEmail('joseph+test-x@gmail.com'), false);
assert.equal(isPlaythroughTestEmail(''), false);
assert.equal(isPlaythroughTestEmail(null), false);
// They are still test accounts for analytics.
assert.equal(isTest('joseph+test-desktop@unaffiliated.co'), true);

console.log('testAccounts: ok');
