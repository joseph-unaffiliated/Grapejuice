/**
 * Run: npx tsx src/services/guest/kidDrafts.test.ts
 *
 * A child whose name matches the account stays a child. Signup used to save the
 * adult into the kids list; the load-time cleanup that deleted that child is gone.
 */
import assert from 'node:assert/strict';
import { kidDraftsOnly } from './kidDrafts';

const kept = kidDraftsOnly([
  { role: 'adult', name: 'M', ageGroup: '9-12' },
  { role: 'kid', name: 'M', ageGroup: '6-8' },
  { role: 'kid', name: 'A', ageGroup: '6-8' },
  { role: 'adult', name: 'D', ageGroup: '9-12' },
]);
assert.deepEqual(kept.map((d) => d.name), ['M', 'A']);

console.log('kidDrafts: ok');
