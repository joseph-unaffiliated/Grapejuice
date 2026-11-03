import type { CatalogAvailability, CatalogItem } from '../../types/pilot';
import { availabilityAllowsDirectPurchase } from './availability';

/** Prefer in-stock post-lock (or any buyable) items; boost favorites. */
export function sortShopRailItems(
  items: CatalogItem[],
  availabilityById: Record<string, CatalogAvailability | undefined>,
  favoriteIds: ReadonlySet<string> | readonly string[] = []
): CatalogItem[] {
  const fav = favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds);
  return [...items].sort((a, b) => {
    const aBuy = availabilityAllowsDirectPurchase(availabilityById[a.id] ?? { status: 'sold_out' });
    const bBuy = availabilityAllowsDirectPurchase(availabilityById[b.id] ?? { status: 'sold_out' });
    if (aBuy !== bBuy) return aBuy ? -1 : 1;
    const aFav = fav.has(a.id);
    const bFav = fav.has(b.id);
    if (aFav !== bFav) return aFav ? -1 : 1;
    const ar = a.storefrontRank ?? Number.POSITIVE_INFINITY;
    const br = b.storefrontRank ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });
}

/** Home rails omit sold-out / non-buyable SKUs after lock (still on PLP/PDP). */
export function filterShopRailInStock(
  items: CatalogItem[],
  availabilityById: Record<string, CatalogAvailability | undefined>,
  /** When false (pre-lock), keep all curated rail items. */
  shopMode: boolean
): CatalogItem[] {
  if (!shopMode) return items;
  return items.filter((it) =>
    availabilityAllowsDirectPurchase(availabilityById[it.id] ?? { status: 'sold_out' })
  );
}

export function categoryHasBuyableItems(
  items: CatalogItem[],
  match: (item: CatalogItem) => boolean,
  availabilityById: Record<string, CatalogAvailability | undefined>,
  /** After lock, only count buyable (FBA in-stock) items. */
  requireBuyable: boolean
): boolean {
  for (const it of items) {
    if (!match(it)) continue;
    if (!requireBuyable) return true;
    if (availabilityAllowsDirectPurchase(availabilityById[it.id] ?? { status: 'sold_out' })) {
      return true;
    }
  }
  return false;
}
