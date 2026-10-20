/**
 * Run: npx tsx src/services/catalog/featuredSort.test.ts
 *
 * Books "Featured": popularity (committed + gifted box units) desc, then price
 * low to high; winding-down (holdInventory) books always last.
 */
import assert from 'node:assert/strict';
import type { CatalogItem } from '../../types/pilot';
import { sortBooksFeatured } from './featuredSort';

const book = (over: Partial<CatalogItem> & { id: string; name: string }): CatalogItem =>
  ({
    description: '',
    slot: 'story',
    slotId: 'story',
    category: 'Book',
    ageGroups: [],
    defaultFor: [],
    swapOptions: [],
    dollarCostCents: 0,
    holiday: 'hanukkah',
    ...over,
  }) as CatalogItem;

const ids = (items: CatalogItem[]) => items.map((b) => b.id);

// Popularity wins over price.
{
  const books = [
    book({ id: 'cheap', name: 'Cheap', dollarCostCents: 500 }),
    book({ id: 'loved', name: 'Loved', dollarCostCents: 2500 }),
  ];
  assert.deepEqual(ids(sortBooksFeatured(books, { loved: 9, cheap: 1 })), ['loved', 'cheap']);
}

// Equal popularity → cheaper first; full tie → A–Z.
{
  const books = [
    book({ id: 'zeta', name: 'Zeta', dollarCostCents: 900 }),
    book({ id: 'beta', name: 'Beta', dollarCostCents: 700 }),
    book({ id: 'alfa', name: 'Alfa', dollarCostCents: 700 }),
  ];
  assert.deepEqual(ids(sortBooksFeatured(books, {})), ['alfa', 'beta', 'zeta']);
}

// A winding-down book sinks below everything, even when it's the most popular.
{
  const books = [
    book({ id: 'gone', name: 'Gone Soon', dollarCostCents: 100, holdInventory: true }),
    book({ id: 'plain', name: 'Plain', dollarCostCents: 3000 }),
  ];
  assert.deepEqual(ids(sortBooksFeatured(books, { gone: 42 })), ['plain', 'gone']);
}

// Within the winding-down group, popularity still orders.
{
  const books = [
    book({ id: 'gone-a', name: 'Gone A', holdInventory: true }),
    book({ id: 'gone-b', name: 'Gone B', holdInventory: true }),
  ];
  assert.deepEqual(ids(sortBooksFeatured(books, { 'gone-b': 5 })), ['gone-b', 'gone-a']);
}

console.log('featuredSort tests passed');
