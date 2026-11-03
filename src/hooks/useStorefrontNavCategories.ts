import { useEffect, useMemo, useState } from 'react';
import {
  STOREFRONT_CATEGORIES,
  type StorefrontCategoryDef,
} from '../constants/storefrontCategories';
import { useCatalog } from './useCatalog';
import { useCatalogAvailabilityMap } from './useCatalogAvailabilityMap';
import { useStorefrontHomeMode } from './useStorefrontHomeMode';
import { categoryHasBuyableItems } from '../services/catalog/shopMerch';
import { getHanukkahConfig, peekHanukkahConfig } from '../services/firestore/config';

/**
 * Primary nav categories. After lock (shop mode), hide categories with zero
 * buyable (in-stock FBA) items. Family-link browsers keep the full nav.
 */
export function useStorefrontNavCategories(): StorefrontCategoryDef[] {
  const { items } = useCatalog();
  const { byId: availability } = useCatalogAvailabilityMap();
  const [lockAt, setLockAt] = useState<string | null>(() => peekHanukkahConfig()?.lockAt ?? null);
  const [startsOn, setStartsOn] = useState<string | null>(
    () => peekHanukkahConfig()?.startsOn ?? null
  );
  const requireBuyable = useStorefrontHomeMode(lockAt, startsOn) === 'shop';

  useEffect(() => {
    let cancelled = false;
    void getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLockAt(config.lockAt);
      setStartsOn(config.startsOn);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    if (!requireBuyable) return STOREFRONT_CATEGORIES;
    return STOREFRONT_CATEGORIES.filter((c) => {
      if (c.slug === 'collection' || c.slug === 'favorites') return true;
      return categoryHasBuyableItems(items, c.match, availability, true);
    });
  }, [items, availability, requireBuyable]);
}
