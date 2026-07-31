import type { CatalogItem } from '../types/pilot';
import { storefrontCategoryForItem } from './storefrontCategories';

/**
 * Category-level educational blurbs for the PDP buy column.
 * Prefer these over product-specific `description` taglines (e.g. "Stone arch menorah").
 */
export const PDP_CATEGORY_BLURBS: Record<string, string> = {
  menorahs:
    'A hanukkiah — often called a menorah — is the candelabra families light for Hanukkah. It marks the holiday’s story of rededication and the oil that lasted eight nights. A Hanukkah menorah has nine branches: one for each night, plus the shamash, the helper candle used to light the others. Each evening, you light one more candle than the night before.',
  dreidels:
    'A dreidel is a four-sided spinning top played during Hanukkah, often with chocolate gelt as the pot. Each side carries a Hebrew letter; where it lands decides who wins that round.',
  candles:
    'Hanukkah candles are for the eight nights of the festival. They’re placed in the hanukkiah and lit one more each night, using the shamash as the lighter.',
};

/**
 * Body copy under the product title: category blurb when we have one,
 * otherwise the catalog description (if useful).
 */
export function pdpBodyCopyForItem(item: CatalogItem): string | undefined {
  const aisle = storefrontCategoryForItem(item);
  if (aisle?.slug && PDP_CATEGORY_BLURBS[aisle.slug]) {
    return PDP_CATEGORY_BLURBS[aisle.slug];
  }
  const desc = item.description?.trim();
  return desc || undefined;
}
