import { useMemo } from 'react';
import {
  STOREFRONT_CATEGORIES,
  type StorefrontCategoryDef,
} from '../constants/storefrontCategories';
import { useCatalog } from './useCatalog';
import { useCatalogAvailabilityMap } from './useCatalogAvailabilityMap';
import { useBoxLockPassed } from './useBoxLockDay';
import { categoryHasBuyableItems } from '../services/catalog/shopMerch';
import { familyOrderOpen } from '../constants/familyOrder';

/**
 * Primary nav categories. After lock (shop mode), hide categories with zero
 * buyable (in-stock FBA) items. Family-link browsers keep the full nav.
 */
export function useStorefrontNavCategories(): StorefrontCategoryDef[] {
  const { items } = useCatalog();
  const { byId: availability } = useCatalogAvailabilityMap();
  const lockPassed = useBoxLockPassed();
  const requireBuyable = lockPassed && !familyOrderOpen();

  return useMemo(() => {
    if (!requireBuyable) return STOREFRONT_CATEGORIES;
    return STOREFRONT_CATEGORIES.filter((c) => {
      if (c.slug === 'collection' || c.slug === 'favorites') return true;
      return categoryHasBuyableItems(items, c.match, availability, true);
    });
  }, [items, availability, requireBuyable]);
}
