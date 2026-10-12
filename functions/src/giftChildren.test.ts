import assert from 'node:assert/strict';
import { sanitizeGiftChildren, sanitizeGiftFamilyName } from './giftPayment';

assert.equal(sanitizeGiftFamilyName('  The Golds  '), 'The Golds');
assert.equal(sanitizeGiftFamilyName('   '), undefined);
assert.equal(sanitizeGiftFamilyName(12), undefined);
assert.equal(sanitizeGiftFamilyName('A'.repeat(80))?.length, 60);

const kids = sanitizeGiftChildren([
  { name: ' Maya ', ageGroup: '3-5', plannerAge: 4 },
  { ageGroup: 'nope', plannerAge: 99 },
  'skip',
]);
assert.deepEqual(kids, [
  { name: 'Maya', ageGroup: '3-5', plannerAge: 4 },
  { ageGroup: '6-8', plannerAge: 17 },
]);
assert.equal(sanitizeGiftChildren('no'), undefined);
