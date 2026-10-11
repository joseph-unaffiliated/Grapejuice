/**
 * Run: npx tsx functions/src/loginCodeRules.test.ts
 */
import assert from 'node:assert/strict';
import {
  checkLoginCode,
  clientStatusFor,
  generateLoginCode,
  hashLoginCode,
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_TTL_MS,
  normalizeLoginCode,
  spacedLoginCode,
} from './loginCodeRules';

// Codes are six digits, always, including ones that start with zeros.
for (let i = 0; i < 200; i++) assert.match(generateLoginCode(), /^\d{6}$/);
assert.equal(normalizeLoginCode('412 839'), '412839');
assert.equal(normalizeLoginCode('412-839'), '412839');
assert.equal(normalizeLoginCode(412839), '412839');
assert.equal(normalizeLoginCode('41283'), null);
assert.equal(normalizeLoginCode('4128391'), null);
assert.equal(normalizeLoginCode(''), null);
assert.equal(normalizeLoginCode(null), null);
assert.equal(spacedLoginCode('412839'), '412 839');

// The hash is salted per email: same code, different person, different hash.
assert.notEqual(hashLoginCode('412839', 'a'), hashLoginCode('412839', 'b'));
assert.equal(hashLoginCode('412839', 'a'), hashLoginCode('412839', 'a'));

const now = 1_700_000_000_000;
const emailHash = 'e1';
const right = hashLoginCode('412839', emailHash);
const wrong = hashLoginCode('000000', emailHash);
const fresh = () => ({ codeHash: right, uid: 'u1', expiresAt: now + LOGIN_CODE_TTL_MS, attempts: 0 });

// Right code: ok, marked used.
{
  const r = checkLoginCode(fresh(), right, now + 1000);
  assert.equal(r.status, 'ok');
  assert.equal(r.next?.usedAt, now + 1000);
}
// Wrong code: mismatch, attempts go up by one, nothing else changes.
{
  const r = checkLoginCode(fresh(), wrong, now + 1000);
  assert.equal(r.status, 'mismatch');
  assert.deepEqual(r.next, { attempts: 1 });
}
// Fifth wrong guess still counts; the sixth is locked even with the right code.
{
  const doc = { ...fresh(), attempts: LOGIN_CODE_MAX_ATTEMPTS - 1 };
  assert.equal(checkLoginCode(doc, wrong, now).status, 'mismatch');
  const locked = { ...fresh(), attempts: LOGIN_CODE_MAX_ATTEMPTS };
  assert.equal(checkLoginCode(locked, right, now).status, 'locked');
}
// Expired, used, missing.
assert.equal(checkLoginCode(fresh(), right, now + LOGIN_CODE_TTL_MS + 1).status, 'expired');
assert.equal(checkLoginCode({ ...fresh(), usedAt: now }, right, now + 1).status, 'used');
assert.equal(checkLoginCode(undefined, right, now).status, 'invalid');
assert.equal(checkLoginCode({ uid: 'u1' }, right, now).status, 'invalid');
// A Firestore Timestamp-like expiresAt works too.
assert.equal(checkLoginCode({ ...fresh(), expiresAt: { toMillis: () => now + 5000 } }, right, now).status, 'ok');

// Client-facing statuses never distinguish "wrong code" from "no such email".
assert.equal(clientStatusFor('mismatch'), 'invalid');
assert.equal(clientStatusFor('invalid'), 'invalid');
assert.equal(clientStatusFor('used'), 'expired');
assert.equal(clientStatusFor('expired'), 'expired');
assert.equal(clientStatusFor('locked'), 'locked');
assert.equal(clientStatusFor('ok'), 'ok');

console.log('loginCodeRules: ok');
