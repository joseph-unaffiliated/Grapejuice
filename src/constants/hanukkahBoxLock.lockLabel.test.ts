/**
 * Run: npx tsx src/constants/hanukkahBoxLock.lockLabel.test.ts
 *
 * Firestore config/hanukkah-2026.lockAt is 11:59pm Eastern (2026-11-08T04:59:59Z).
 * Two or more days out, checkout copy reads "Nov 7".
 * The day before and the day of, it reads a relative moment in Eastern time.
 */
import assert from 'node:assert/strict';
import {
  HANUKKAH_BOX_LOCK_DATE,
  boxLockChipLabel,
  checkoutChargeLine,
  guestBoxSecurePromoLine,
  isHouseholdBoxFrozen,
  draftsRetired,
  isImmediateChargeWindow,
  lockShortLabel,
} from './hanukkahBoxLock';

const FIRESTORE_LOCK_AT = '2026-11-08T04:59:59.000Z';
const NOON_LOCK = '2026-11-09T17:00:00.000Z';
const daysOut = new Date('2026-11-05T16:00:00.000Z');
const dayBeforeMidnight = new Date('2026-11-07T02:00:00.000Z');
const nightOf = new Date('2026-11-08T02:40:00.000Z');
const dayBeforeNoon = new Date('2026-11-08T18:00:00.000Z');
const dayOfNoon = new Date('2026-11-09T15:00:00.000Z');

assert.equal(lockShortLabel(FIRESTORE_LOCK_AT, daysOut), 'Nov 7');
assert.equal(lockShortLabel(HANUKKAH_BOX_LOCK_DATE.toISOString(), daysOut), 'Nov 7');
assert.equal(lockShortLabel(FIRESTORE_LOCK_AT, dayBeforeMidnight), 'tomorrow at midnight ET');
assert.equal(lockShortLabel(FIRESTORE_LOCK_AT, nightOf), 'tonight at midnight ET');
assert.equal(lockShortLabel(NOON_LOCK, dayBeforeNoon), 'tomorrow at noon ET');
assert.equal(lockShortLabel(NOON_LOCK, dayOfNoon), 'today at noon ET');
assert.equal(lockShortLabel(NOON_LOCK, nightOf), 'Nov 9');
assert.equal(lockShortLabel(null, nightOf), 'the lock date');
assert.equal(
  `Keep editing your box until ${lockShortLabel(FIRESTORE_LOCK_AT, nightOf)}`,
  'Keep editing your box until tonight at midnight ET'
);
assert.equal(boxLockChipLabel(nightOf, FIRESTORE_LOCK_AT), 'Locks tonight at midnight ET');
assert.equal(boxLockChipLabel(dayOfNoon, NOON_LOCK), 'Locks today at noon ET');
assert.match(guestBoxSecurePromoLine(FIRESTORE_LOCK_AT, nightOf), /Box locks tonight at midnight ET$/);
assert.match(guestBoxSecurePromoLine(FIRESTORE_LOCK_AT, daysOut), /Box locks on Nov 7 \(/);

assert.equal(isImmediateChargeWindow(new Date('2026-11-08T10:59:59.999Z')), false);
assert.equal(isImmediateChargeWindow(new Date('2026-11-08T11:00:00.000Z')), true);
assert.equal(isImmediateChargeWindow(new Date('2026-11-09T16:59:59.999Z')), true);
assert.equal(isImmediateChargeWindow(new Date('2026-11-09T17:00:00.000Z')), false);
assert.equal(isImmediateChargeWindow(new Date('2026-11-07T16:00:00.000Z'), true), false);
assert.equal(isImmediateChargeWindow(new Date('2026-11-08T05:00:00.000Z'), true), true);
assert.equal(isImmediateChargeWindow(new Date('2026-11-10T15:00:00.000Z'), true), true);
assert.match(
  checkoutChargeLine('Nov 9', new Date('2026-11-08T11:00:00.000Z')),
  /charged when you place this order/i
);

const committed = { status: 'committed', lockAt: FIRESTORE_LOCK_AT };
assert.equal(isHouseholdBoxFrozen(committed, new Date('2026-11-08T04:59:58.999Z')), false);
assert.equal(isHouseholdBoxFrozen(committed, new Date('2026-11-08T04:59:59.000Z')), true);
assert.equal(
  isHouseholdBoxFrozen({ status: 'cancelled', lockAt: FIRESTORE_LOCK_AT }, new Date('2026-11-09T17:00:00.000Z')),
  false
);

assert.equal(draftsRetired(nightOf), false);
assert.equal(draftsRetired(new Date('2026-11-08T11:00:00.000Z')), false);
assert.equal(draftsRetired(new Date('2026-11-09T16:59:59.000Z')), false);
assert.equal(draftsRetired(new Date('2026-11-09T17:00:00.000Z')), true);
