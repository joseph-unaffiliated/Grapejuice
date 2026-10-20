import type { CatalogItem } from '../../types/pilot';

/**
 * "Featured" order for the Books aisle: popularity first — units held in
 * committed and gifted boxes (`boxAllocatedQty` from the inventory counters) —
 * then price low to high. Books being wound down for delisting
 * (`holdInventory`) always sink to the bottom, however popular they are.
 */
export function sortBooksFeatured(
  items: CatalogItem[],
  popularityById: Record<string, number> | Map<string, number>
): CatalogItem[] {
  const pop = (id: string) =>
    popularityById instanceof Map
      ? popularityById.get(id) ?? 0
      : popularityById[id] ?? 0;
  const delistRank = (item: CatalogItem) => (item.holdInventory === true ? 1 : 0);
  return [...items].sort(
    (a, b) =>
      delistRank(a) - delistRank(b) ||
      pop(b.id) - pop(a.id) ||
      a.dollarCostCents - b.dollarCostCents ||
      a.name.localeCompare(b.name)
  );
}
