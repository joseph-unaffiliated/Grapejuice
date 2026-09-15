import type { CatalogItem } from '../types/pilot';

/**
 * Body copy under the product title: product-level Description
 * (what it’s for / how to use it). Category educational blurbs no longer override.
 */
export function pdpBodyCopyForItem(item: CatalogItem): string | undefined {
  const desc = item.description?.trim();
  // Avoid showing a stub that merely repeats the product name.
  if (!desc || desc === item.name.trim()) return undefined;
  return desc;
}
