import type { CatalogItem } from '../../types/pilot';

/**
 * "Featured" order for the Books aisle: popularity first — units held in
 * committed and gifted boxes (`boxAllocatedQty` from the inventory counters) —
 * then price low to high. Books being wound down for delisting
 * (`holdInventory`) sink below the rest, and sold-out books go to the very
 * bottom, below even the delist group.
 */
export function sortBooksFeatured(
  items: CatalogItem[],
  popularityById: Record<string, number> | Map<string, number>
): CatalogItem[] {
  const pop = (id: string) =>
    popularityById instanceof Map
      ? popularityById.get(id) ?? 0
      : popularityById[id] ?? 0;
  // 0 = available, 1 = winding down, 2 = sold out, 3 = sold out + winding down.
  const bottomRank = (item: CatalogItem) => {
    const left =
      typeof item.boxStockLeft === 'number' && Number.isFinite(item.boxStockLeft)
        ? item.boxStockLeft
        : typeof item.inventory === 'number' && Number.isFinite(item.inventory)
          ? item.inventory
          : null;
    const soldOut = left != null && left <= 0;
    const delist = item.holdInventory === true;
    return (soldOut ? 2 : 0) + (delist ? 1 : 0);
  };
  return [...items].sort(
    (a, b) =>
      bottomRank(a) - bottomRank(b) ||
      pop(b.id) - pop(a.id) ||
      a.dollarCostCents - b.dollarCostCents ||
      a.name.localeCompare(b.name)
  );
}
