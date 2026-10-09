import assert from 'node:assert/strict';
import { loginTokenStatus, ORDER_TOKEN_MAX_USES, ORDER_TOKEN_TTL_MS } from './loginTokenRules';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const ts = (ms: number) => ({ toMillis: () => ms });

// Order links: reusable for 14 days, capped, then expired (the email prefill comes from the caller).
assert.equal(ORDER_TOKEN_TTL_MS, 14 * 24 * 60 * 60 * 1000);
const order = { purpose: 'order', signInUntil: ts(NOW + ORDER_TOKEN_TTL_MS), useCount: 0, usedAt: null };
assert.equal(loginTokenStatus(order, NOW), 'ok');
assert.equal(loginTokenStatus({ ...order, useCount: 3, usedAt: ts(NOW - 1) }, NOW), 'ok');
assert.equal(loginTokenStatus({ ...order, useCount: ORDER_TOKEN_MAX_USES }, NOW), 'used');
assert.equal(loginTokenStatus(order, NOW + ORDER_TOKEN_TTL_MS + 1), 'expired');
assert.equal(loginTokenStatus({ ...order, signInUntil: undefined }, NOW), 'expired');
// A long purge date must not extend an order link's sign-in window.
assert.equal(
  loginTokenStatus({ ...order, signInUntil: ts(NOW - 1), expiresAt: ts(NOW + 30 * 86400000) }, NOW),
  'expired'
);

// Every other link: single use, then expired.
const login = { purpose: 'login', expiresAt: ts(NOW + 60 * 60 * 1000), usedAt: null };
assert.equal(loginTokenStatus(login, NOW), 'ok');
assert.equal(loginTokenStatus({ ...login, usedAt: ts(NOW - 1) }, NOW), 'used');
assert.equal(loginTokenStatus(login, NOW + 60 * 60 * 1000 + 1), 'expired');
assert.equal(loginTokenStatus({ ...login, expiresAt: 'not a timestamp' }, NOW), 'expired');
assert.equal(loginTokenStatus(undefined, NOW), 'invalid');

console.log('loginTokenRules tests passed');
