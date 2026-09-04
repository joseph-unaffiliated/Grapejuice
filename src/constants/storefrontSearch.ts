import type { CatalogItem } from '../types/pilot';
import {
  STOREFRONT_CATEGORIES,
  type StorefrontCategoryDef,
} from './storefrontCategories';

/** Case-insensitive keyword match across common catalog fields. */
export function matchesStorefrontSearchQuery(item: CatalogItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const words = needle.split(/\s+/).filter(Boolean);
  const hay = [
    item.name,
    item.description,
    item.category,
    ...(item.categories ?? []),
    item.brand,
    item.id,
    ...(item.curationTags ?? []),
    ...(item.storefrontRails ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * Category filter chips for a search: All + aisles that have at least one hit.
 * Empty query / no hits → full category list (caller may hide chips instead).
 */
export function storefrontCategoriesForSearch(
  items: CatalogItem[],
  q: string
): StorefrontCategoryDef[] {
  const needle = q.trim();
  if (!needle) return STOREFRONT_CATEGORIES;

  const hits = items.filter((item) => matchesStorefrontSearchQuery(item, needle));
  if (hits.length === 0) return STOREFRONT_CATEGORIES;

  const concrete = STOREFRONT_CATEGORIES.filter(
    (c) => c.slug !== 'collection' && hits.some((item) => c.match(item))
  );
  const all = STOREFRONT_CATEGORIES.find((c) => c.slug === 'collection');
  if (!all) return concrete;
  return concrete.length > 0 ? [all, ...concrete] : [all];
}
