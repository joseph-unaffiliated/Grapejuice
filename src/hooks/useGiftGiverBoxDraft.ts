import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalogService } from '../services/firestore/catalog';
import { buildDefaultLineItems, catalogSlotId, unitCentsForTier } from '../services/box/buildDefaultBox';
import { inferPricingTier } from '../services/box/pricing';
import type { BoxLineItem, CatalogItem } from '../types/pilot';
import type { GiftChildDraft } from '../screens/gift/giftGiveTypes';
import { giftChildrenToProfiles } from '../screens/gift/giftGiveTypes';

/** Local in-memory box draft for giver customization before purchase. */
export function useGiftGiverBoxDraft(
  childDrafts: GiftChildDraft[],
  initialLineItems?: BoxLineItem[]
) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lineItems, setLineItems] = useState<BoxLineItem[]>(() => initialLineItems ?? []);
  const [swapCache, setSwapCache] = useState<Record<string, CatalogItem[]>>({});
  const [loading, setLoading] = useState(true);
  const keepInitialRef = useRef(Boolean(initialLineItems?.length));

  const children = useMemo(() => giftChildrenToProfiles(childDrafts), [childDrafts]);

  const load = useCallback(async () => {
    setLoading(true);
    const items = await catalogService.getAll();
    setCatalog(items);
    setLineItems((prev) => {
      if (keepInitialRef.current && prev.length > 0) {
        keepInitialRef.current = false;
        return prev;
      }
      return buildDefaultLineItems(items, children);
    });
    setSwapCache({});
    setLoading(false);
  }, [children]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSwapOptions = async (li: BoxLineItem): Promise<CatalogItem[]> => {
    if (swapCache[li.slotId]) return swapCache[li.slotId];
    const current = catalog.find((c) => c.id === li.itemId);
    const ids = current?.swapOptions?.length ? current.swapOptions : [];
    const resolvedSlotId = catalogSlotId(li.slotId);
    const alts = ids.length
      ? await catalogService.getMany(ids)
      : catalog.filter((c) => c.slotId === resolvedSlotId && c.id !== li.itemId);
    const opts = alts.slice(0, 6);
    setSwapCache((c) => ({ ...c, [li.slotId]: opts }));
    return opts;
  };

  useEffect(() => {
    if (!catalog.length || !lineItems.length) return;
    lineItems.forEach((li) => {
      void loadSwapOptions(li);
    });
  }, [lineItems, catalog]);

  const applySwap = (slotId: string, newItem: CatalogItem) => {
    const tier = inferPricingTier(newItem);
    setLineItems((prev) =>
      prev.map((li) =>
        li.slotId === slotId
          ? {
              ...li,
              itemId: newItem.id,
              unitCents: unitCentsForTier(tier, newItem.dollarCostCents),
              label: newItem.name,
            }
          : li
      )
    );
  };

  const swapOptionsFor = (li: BoxLineItem): CatalogItem[] => {
    const current = catalog.find((c) => c.id === li.itemId);
    const alts = swapCache[li.slotId] ?? [];
    const merged = [current, ...alts].filter(Boolean) as CatalogItem[];
    return merged.filter((opt, idx, arr) => arr.findIndex((o) => o.id === opt.id) === idx);
  };

  return {
    catalog,
    lineItems,
    children,
    loading,
    applySwap,
    swapOptionsFor,
  };
}
