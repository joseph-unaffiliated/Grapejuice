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

const taken = (...ids: string[]) => new Set(ids);
assert.equal(
  resolveBookForAge(catalog, 10, taken('book-latke-screaming'))?.id,
  'book-hershel',
  'a sibling of the same age gets the next nearest default'
);
assert.equal(
  resolveBookForAge(catalog, 11, taken('book-dragon', 'book-hershel', 'book-latke-screaming', 'book-festival-16'))?.id,
  'book-swap-only',
  'no defaults left: another book for the age band'
);
const withCandle: BoxRulesCatalogRow[] = [
  { id: 'candles', name: 'Candles', slotId: 'candles', ageGroups: ['3-5'], defaultFor: ['3-5'] },
  book('book-dragon', [4], '3-5'),
];
assert.equal(
  resolveBookForAge(withCandle, 4, taken('book-dragon'))?.id,
  'book-dragon',
  'never falls through to a non-book; repeats the book only when every book is taken'
);

// Second book: the cheapest default within a year of the kid's age; the kid's own default always first.
{
  const priced = (id: string, age: number, cents: number) => ({ ...book(id, [age], '3-5'), memberPriceCents: cents });
  const shelf = [
    priced('book-hippity-hop', 2, 1100),
    priced('book-hanukkah-hop', 3, 1300),
    priced('book-dragon', 4, 1899),
    priced('book-charlie-seymour', 5, 2000),
    priced('book-bear', 7, 800),
  ];
  assert.equal(resolveBookForAge(shelf, 4, taken('book-bear'))?.id, 'book-dragon');
  assert.equal(resolveBookForAge(shelf, 4, taken('book-dragon'))?.id, 'book-hanukkah-hop');
  assert.equal(resolveBookForAge(shelf, 5, taken('book-charlie-seymour'))?.id, 'book-dragon', 'the $8 age-7 book is too far');
  assert.equal(
    resolveBookForAge(shelf, 4, taken('book-dragon', 'book-hanukkah-hop', 'book-charlie-seymour'))?.id,
    'book-hippity-hop',
    'nothing within a year: the nearest ones'
  );
}

console.log('boxRules books ok');
