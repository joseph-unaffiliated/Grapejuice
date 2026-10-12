/**
 * Run: npx tsx src/constants/hanukkahBoxLock.lockLabel.test.ts
 *
 * Firestore config/hanukkah-2026.lockAt is 11:59pm Eastern (2026-11-08T04:59:59Z).
 * Checkout phone copy uses lockShortLabel, which must read "Nov 7".
 */
import assert from 'node:assert/strict';
import { HANUKKAH_BOX_LOCK_DATE, lockShortLabel } from './hanukkahBoxLock';

const FIRESTORE_LOCK_AT = '2026-11-08T04:59:59.000Z';

assert.equal(lockShortLabel(FIRESTORE_LOCK_AT), 'Nov 7');
assert.equal(lockShortLabel(HANUKKAH_BOX_LOCK_DATE.toISOString()), 'Nov 7');
assert.equal(lockShortLabel(null), 'the lock date');
assert.equal(
  `Keep editing your box until ${lockShortLabel(FIRESTORE_LOCK_AT)}`,
  'Keep editing your box until Nov 7'
);
