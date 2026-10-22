/**
 * Run: npx tsx src/constants/hanukkahBoxLock.lockLabel.test.ts
 *
 * Firestore config/hanukkah-2026.lockAt is 11:59pm Eastern (2026-11-08T04:59:59Z).
 * Checkout phone copy uses lockShortLabel, which must read "Nov 7".
 */
import assert from 'node:assert/strict';
import {
  HANUKKAH_BOX_LOCK_DATE,
  checkoutChargeLine,
  isHouseholdBoxFrozen,
  isImmediateChargeWindow,
  lockShortLabel,
} from './hanukkahBoxLock';

const FIRESTORE_LOCK_AT = '2026-11-08T04:59:59.000Z';

assert.equal(lockShortLabel(FIRESTORE_LOCK_AT), 'Nov 7');
assert.equal(lockShortLabel(HANUKKAH_BOX_LOCK_DATE.toISOString()), 'Nov 7');
assert.equal(lockShortLabel(null), 'the lock date');
assert.equal(
  `Keep editing your box until ${lockShortLabel(FIRESTORE_LOCK_AT)}`,
  'Keep editing your box until Nov 7'
);

assert.equal(isImmediateChargeWindow(new Date('2026-11-09T16:59:59.999Z')), false);
assert.equal(isImmediateChargeWindow(new Date('2026-11-09T17:00:00.000Z')), true);
assert.equal(isImmediateChargeWindow(new Date('2026-11-10T16:59:59.999Z')), true);
assert.equal(isImmediateChargeWindow(new Date('2026-11-10T17:00:00.000Z')), false);
assert.match(
  checkoutChargeLine('Nov 10', new Date('2026-11-09T17:00:00.000Z')),
  /charged when you place this order/i
);

const committed = { status: 'committed', lockAt: FIRESTORE_LOCK_AT };
assert.equal(isHouseholdBoxFrozen(committed, new Date('2026-11-08T04:59:58.999Z')), false);
assert.equal(isHouseholdBoxFrozen(committed, new Date('2026-11-08T04:59:59.000Z')), true);
assert.equal(
  isHouseholdBoxFrozen({ status: 'cancelled', lockAt: FIRESTORE_LOCK_AT }, new Date('2026-11-09T17:00:00.000Z')),
  false
);
