/**
 * Run: npx tsx functions/src/rav/curatePilotBox.test.ts
 */
import assert from 'node:assert/strict';
import { explicitlyAskedFor } from './curatePilotBox';

const lego = { id: 'lego-menorah', name: '"Lego" Menorah' };
const electric = { id: 'electric-candles', name: 'Electric Candles' };
const toddler = { id: 'toddler-play-menorah', name: 'Toddler Play Menorah' };

assert.equal(explicitlyAskedFor(lego, 'Sam is obsessed with LEGO'), true);
assert.equal(explicitlyAskedFor(lego, 'loves legos'), true);
assert.equal(explicitlyAskedFor(lego, 'Sam just likes building things'), false);
assert.equal(explicitlyAskedFor(electric, "We're nervous about open flames with a toddler"), true);
assert.equal(explicitlyAskedFor(electric, 'our building does not allow candles; fire hazard'), true);
assert.equal(explicitlyAskedFor(electric, 'we love lighting candles together'), false);
assert.equal(explicitlyAskedFor(toddler, 'a toddler play menorah would be perfect'), true);
assert.equal(explicitlyAskedFor(toddler, 'she is a toddler'), false);

console.log('curatePilotBox explicit-ask tests passed');
