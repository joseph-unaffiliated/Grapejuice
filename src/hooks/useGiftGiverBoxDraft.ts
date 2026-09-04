import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalogService } from '../services/firestore/catalog';
import {
  buildDefaultLineItems,
  catalogSlotId,
} from '../services/box/buildDefaultBox';
import { resolveByDefaultSlot, WRAP_POLICY } from '../services/box/boxRules';
import { resolveSwapOptionsForItem } from '../services/box/sectionUpsells';
import { boxAddOnUnitCents } from '../services/box/pricing';
import { isWrapControlSlot, removeCoalescedGroup, type CoalescedBoxLine } from '../components/box/boxLineDisplay';
import type { BoxLineItem, CatalogItem } from '../types/pilot';
import type { GiftChildDraft } from '../screens/gift/giftGiveTypes';
import { giftChildrenToProfiles } from '../screens/gift/giftGiveTypes';

function slotIdAfterSwap(currentSlotId: string, newItem: CatalogItem): string {
  if (isWrapControlSlot(currentSlotId)) {
    const next =
      newItem.defaultSlot?.trim() ||
      catalogSlotId(newItem.slotId) ||
      newItem.slotId ||
      currentSlotId;
    return next;
  }
  return currentSlotId;
}

function uniqueAddSlotId(item: CatalogItem, existing: BoxLineItem[]): string {
  const base = catalogSlotId(item.slotId) || item.slotId || item.id;
  const used = new Set(existing.map((li) => li.slotId));
  if (!used.has(base)) return base;
  let n = 1;
  while (used.has(`${base}-extra-${n}`)) n += 1;
  return `${base}-extra-${n}`;
}

/** Local in-memory box draft for giver customization before purchase. */
export function useGiftGiverBoxDraft(
  childDrafts: GiftChildDraft[],
  initialLineItems?: BoxLineItem[]
) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lineItems, setLineItems] = useState<BoxLineItem[]>(() => initialLineItems ?? []);
  const [wrapSelectedItemIds, setWrapSelectedItemIds] = useState<string[]>([]);
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
    setLoading(false);
  }, [children]);

  useEffect(() => {
    void load();
  }, [load]);

  const swapOptionsBySlot = useMemo(() => {
    if (!catalog.length || !lineItems.length) return {} as Record<string, CatalogItem[]>;
    const next: Record<string, CatalogItem[]> = {};
    for (const li of lineItems) {
      const current = catalog.find((c) => c.id === li.itemId);
      next[li.slotId] = current ? resolveSwapOptionsForItem(current, catalog, 6) : [];
    }
    return next;
  }, [lineItems, catalog]);

  const applySwap = useCallback(
    (
      slotIds: string[],
      newItem: CatalogItem,
      opts?: { displaySectionId?: BoxLineItem['displaySectionId'] }
    ) => {
      const nextUnit = boxAddOnUnitCents(newItem);
      const idSet = new Set(slotIds);
      setLineItems((prev) =>
        prev.map((li) =>
          idSet.has(li.slotId)
            ? {
                ...li,
                slotId: slotIdAfterSwap(li.slotId, newItem),
                itemId: newItem.id,
                unitCents: nextUnit,
                label: newItem.name,
                ...(opts?.displaySectionId
                  ? { displaySectionId: opts.displaySectionId }
                  : null),
              }
            : li
        )
      );
    },
    []
  );

  const swapToPreWrap = useCallback(
    (slotIds: string[]) => {
      const row = resolveByDefaultSlot(catalog, WRAP_POLICY.preWrapSlot);
      const preWrap =
        (row ? catalog.find((c) => c.id === row.id) : undefined) ??
        catalog.find(
          (c) =>
            catalogSlotId(c.slotId) === 'pre-wrap' ||
            c.defaultSlot === 'pre-wrap' ||
            /pre.?wrap/i.test(`${c.id} ${c.name}`)
        );
      if (!preWrap) return;
      applySwap(slotIds, preWrap);
    },
    [catalog, applySwap]
  );

  const removeCoalesced = useCallback((group: CoalescedBoxLine) => {
    setLineItems((prev) => removeCoalescedGroup(prev, group));
  }, []);

  /** Always append as an add-on (modal “Add to gift”). */
  const addItem = useCallback(
    (
      item: CatalogItem,
      opts?: { displaySectionId?: BoxLineItem['displaySectionId'] }
    ) => {
      setLineItems((prev) => {
        if (prev.some((li) => li.itemId === item.id)) return prev;
        return [
          ...prev,
          {
            slotId: uniqueAddSlotId(item, prev),
            itemId: item.id,
            quantity: 1,
            unitCents: boxAddOnUnitCents(item),
            label: item.name,
            ...(opts?.displaySectionId ? { displaySectionId: opts.displaySectionId } : null),
          },
        ];
      });
    },
    []
  );

  const persistWrapSelection = useCallback((itemIds: string[]) => {
    setWrapSelectedItemIds(itemIds);
  }, []);

  const swapOptionsFor = useCallback(
    (li: BoxLineItem): CatalogItem[] => swapOptionsBySlot[li.slotId] ?? [],
    [swapOptionsBySlot]
  );

  return {
    catalog,
    lineItems,
    children,
    loading,
    wrapSelectedItemIds,
    applySwap,
    swapToPreWrap,
    swapOptionsFor,
    swapOptionsBySlot,
    removeCoalesced,
    addItem,
    persistWrapSelection,
  };
}
