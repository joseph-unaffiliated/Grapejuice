/**
 * Run: npx tsx src/services/box/boxRules.books.test.ts
 */
import assert from 'node:assert/strict';
import { resolveBookForAge, type BoxRulesCatalogRow } from './boxRules';

const book = (id: string, ages: number[], band: string): BoxRulesCatalogRow => ({
  id,
  name: id,
  slotId: 'story',
  defaultBookAges: ages,
  defaultFor: ages.length ? [band] : [],
  ageGroups: [band],
});

const catalog = [
  book('book-hershel', [9], '9-12'),
  book('book-latke-screaming', [10], '9-12'),
  book('book-festival-16', [12], '9-12'),
  book('book-dragon', [4], '3-5'),
  book('book-swap-only', [], '9-12'),
];

assert.equal(resolveBookForAge(catalog, 10)?.id, 'book-latke-screaming');
assert.equal(resolveBookForAge(catalog, 15)?.id, 'book-festival-16', '13+ takes the nearest default age');
assert.equal(resolveBookForAge(catalog, 18)?.id, 'book-festival-16');
assert.equal(resolveBookForAge(catalog, 4)?.id, 'book-dragon');

const bandOnly = catalog.map((r) => ({ ...r, defaultBookAges: [] }));
assert.equal(resolveBookForAge(bandOnly, 15)?.id, 'book-hershel', 'band fallback when no default ages exist');

console.log('boxRules books ok');
