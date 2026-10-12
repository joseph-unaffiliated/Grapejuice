/**
 * Run: npx tsx src/services/account/householdReadCache.test.ts
 */
import assert from 'node:assert/strict';
import { createHouseholdReadCache } from './householdReadCache';

async function main() {
  let calls = 0;
  let release: (rows: string[]) => void = () => {};
  const cache = createHouseholdReadCache<string[]>(
    () =>
      new Promise((resolve) => {
        calls += 1;
        release = resolve;
      })
  );

  const first = cache.load('hh');
  const second = cache.load('hh');
  assert.equal(first, second, 'concurrent loads share one request');
  assert.equal(calls, 1);
  assert.equal(cache.peek('hh'), null);

  release(['a']);
  assert.deepEqual(await first, ['a']);
  assert.deepEqual(cache.peek('hh'), ['a']);

  const again = cache.load('hh');
  assert.notEqual(again, first, 'a finished read does not block the next refresh');
  assert.equal(calls, 2);
  assert.deepEqual(cache.peek('hh'), ['a'], 'previous result stays available while refreshing');
  release(['a', 'b']);
  assert.deepEqual(await again, ['a', 'b']);
  assert.equal(cache.peek('other'), null);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
