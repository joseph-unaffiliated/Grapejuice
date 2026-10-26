import assert from 'node:assert/strict';
import { adultsForBoxRepair } from './repairAdults';

const previous = [
  { role: 'adult' },
  { role: 'adult' },
  { role: 'adult' },
  { role: 'kid' },
  { role: 'kid' },
];
const saved = [{ role: 'adult' }, { role: 'kid' }, { role: 'kid' }];

assert.equal(adultsForBoxRepair(saved, 3), 1, 'saved family replaces the count still on screen');
assert.equal(adultsForBoxRepair(previous, 1), 3, 'a larger saved family is kept');
assert.equal(adultsForBoxRepair([], 2), 2, 'no saved adults falls back to the screen');
assert.equal(adultsForBoxRepair(undefined, undefined), undefined);

console.log('repairAdults ok');
