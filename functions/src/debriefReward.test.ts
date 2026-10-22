import assert from 'node:assert/strict';
import { debriefRewardOptions, isDebriefComplete } from './debriefReward';

assert.deepEqual(debriefRewardOptions('2026-12-13'), ['credit']);
assert.deepEqual(debriefRewardOptions('2026-12-31'), ['credit']);
assert.deepEqual(debriefRewardOptions('2027-01-01'), ['credit', 'gift_card']);
assert.deepEqual(debriefRewardOptions('2027-01-31'), ['credit', 'gift_card']);
assert.deepEqual(debriefRewardOptions('2027-02-01'), []);

const full = { wins: 'Latkes night\nNights: 1, 3', hardMoments: 'Bedtime', favoriteNight: 'Cozy', nextYearShift: 'yes' };
assert.equal(isDebriefComplete(full), true);
assert.equal(isDebriefComplete({ ...full, wins: 'Latkes night\nNights: none' }), true);
assert.equal(isDebriefComplete({ ...full, wins: '\nNights: 1, 3' }), false);
assert.equal(isDebriefComplete({ ...full, hardMoments: '  ' }), false);
assert.equal(isDebriefComplete({ ...full, favoriteNight: '' }), false);
assert.equal(isDebriefComplete({ ...full, nextYearShift: undefined }), false);
assert.equal(isDebriefComplete(undefined), false);

console.log('debriefReward tests passed');
