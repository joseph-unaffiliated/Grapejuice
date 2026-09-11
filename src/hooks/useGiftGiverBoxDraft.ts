import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalogService } from '../services/firestore/catalog';
import {
  buildDefaultLineItems,
  catalogSlotId,
} from '../services/box/buildDefaultBox';
import {
  resolveSwapOptionsForItem,
  resolveFreeSwapUnitCents,
  resolveIncludedGiftOptions,
} from '../services/box/sectionUpsells';
import { boxAddOnUnitCents, EXTRA_FLAT_CENTS } from '../services/box/pricing';
import { displaySectionForCatalogItem } from '../constants/boxDisplaySections';
import {
  assignKidBookLines,
  assignKidGiftLines,
  childIdFromSlot,
  isGiftSlotLine,
  isWrapControlSlot,
  removeCoalescedGroup,
  type CoalescedBoxLine,
} from '../components/box/boxLineDisplay';
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
  const raw = catalogSlotId(item.slotId) || item.slotId || item.id;
  // Never reuse catalog `extra-*` slots — they used to be hidden from section UI.
  const base =
    raw.startsWith('extra-') || raw === 'gift' || raw === 'story' ? `addon-${item.id}` : raw;
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
      if (!current) {
        next[li.slotId] = [];
        continue;
      }
      // Per-kid gift lines swap among the included gift set, not their section peers.
      next[li.slotId] = isGiftSlotLine(li)
        ? resolveIncludedGiftOptions(catalog, li.itemId, 6)
        : resolveSwapOptionsForItem(current, catalog, 6);
    }
    return next;
  }, [lineItems, catalog]);

  const applySwap = useCallback(
    (
      slotIds: string[],
      newItem: CatalogItem,
      opts?: { displaySectionId?: BoxLineItem['displaySectionId'] }
    ) => {
      const idSet = new Set(slotIds);
      setLineItems((prev) => {
        // Free-swap policy is keyed off whatever is currently in that slot — resolve it
        // so `'included'` targets stay $0 even when the catalog's tier says otherwise.
        const sourceLine = prev.find((li) => idSet.has(li.slotId));
        const sourceItem = sourceLine ? catalog.find((c) => c.id === sourceLine.itemId) : undefined;
        const sectionId = sourceItem ? displaySectionForCatalogItem(sourceItem) : undefined;
        // Per-kid gift swaps stay free regardless of the target's catalog tier.
        const nextUnit = sourceLine && isGiftSlotLine(sourceLine)
          ? 0
          : (sectionId ? resolveFreeSwapUnitCents(sourceItem, newItem, sectionId) : undefined) ??
            boxAddOnUnitCents(newItem);
        return prev.map((li) =>
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
        );
      });
    },
    [catalog]
  );

  const swapToPreWrap = useCallback(
    (slotIds: string[]) => {
      const idSet = new Set(slotIds);
      setLineItems((prev) =>
        prev.filter((li) => !idSet.has(li.slotId) && !isWrapControlSlot(li.slotId))
      );
    },
    []
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
        let unitCents = boxAddOnUnitCents(item);
        const isPaper =
          item.defaultSlot === 'wrapping-paper' ||
          item.slotId === 'wrapping-paper' ||
          /wrapping.?paper/i.test(`${item.id} ${item.name}`);
        if (unitCents === 0 && isPaper) unitCents = EXTRA_FLAT_CENTS;
        return [
          ...prev,
          {
            slotId: isPaper ? 'wrapping-paper' : uniqueAddSlotId(item, prev),
            itemId: item.id,
            quantity: 1,
            unitCents,
            label: item.name,
            ...(opts?.displaySectionId ? { displaySectionId: opts.displaySectionId } : null),
          },
        ];
      });
    },
    []
  );

  /** Insert a fresh line at $0 for an empty section's "add these for free" placeholder. */
  const addFreeItem = useCallback(
    (
      item: CatalogItem,
      opts?: { displaySectionId?: BoxLineItem['displaySectionId'] }
    ) => {
      setLineItems((prev) => {
        // Prefer converting a paid copy rather than silent no-op / duplicate.
        const paid = prev.find(
          (li) => li.itemId === item.id && (li.unitCents ?? 0) > 0 && !isGiftSlotLine(li)
        );
        if (paid) {
          const qty = paid.quantity ?? 1;
          if (qty <= 1) {
            return prev.map((li) =>
              li.slotId === paid.slotId
                ? {
                    ...li,
                    unitCents: 0,
                    ...(opts?.displaySectionId
                      ? { displaySectionId: opts.displaySectionId }
                      : null),
                    slotId: uniqueAddSlotId(
                      item,
                      prev.filter((x) => x.slotId !== paid.slotId)
                    ),
                  }
                : li
            );
          }
          return [
            ...prev.map((li) =>
              li.slotId === paid.slotId ? { ...li, quantity: qty - 1 } : li
            ),
            {
              slotId: uniqueAddSlotId(item, prev),
              itemId: item.id,
              quantity: 1,
              unitCents: 0,
              label: item.name,
              ...(opts?.displaySectionId ? { displaySectionId: opts.displaySectionId } : null),
            },
          ];
        }
        // Allow practice fills even when the SKU exists as a gift elsewhere.
        const existingPractice = prev.find(
          (li) =>
            li.itemId === item.id &&
            !isGiftSlotLine(li) &&
            (opts?.displaySectionId
              ? li.displaySectionId === opts.displaySectionId
              : true)
        );
        if (existingPractice) {
          if (existingPractice.slotId.startsWith('extra-')) {
            return prev.map((li) =>
              li.slotId === existingPractice.slotId
                ? {
                    ...li,
                    slotId: uniqueAddSlotId(
                      item,
                      prev.filter((x) => x.slotId !== existingPractice.slotId)
                    ),
                    unitCents: 0,
                    ...(opts?.displaySectionId
                      ? { displaySectionId: opts.displaySectionId }
                      : null),
                  }
                : li
            );
          }
          return prev;
        }
        return [
          ...prev,
          {
            slotId: uniqueAddSlotId(item, prev),
            itemId: item.id,
            quantity: 1,
            unitCents: 0,
            label: item.name,
            ...(opts?.displaySectionId ? { displaySectionId: opts.displaySectionId } : null),
          },
        ];
      });
    },
    []
  );

  /** Set (re-point or create) a kid's single gift line at $0; convert paid SKUs in place. */
  const setKidGift = useCallback((childId: string, item: CatalogItem) => {
    setLineItems((prev) => assignKidGiftLines(prev, childId, item));
  }, []);

  /** Add / convert a kid's book line at $0. */
  const setKidBook = useCallback((childId: string, item: CatalogItem) => {
    setLineItems((prev) => assignKidBookLines(prev, childId, item));
  }, []);

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
    addFreeItem,
    setKidGift,
    setKidBook,
    persistWrapSelection,
  };
}
