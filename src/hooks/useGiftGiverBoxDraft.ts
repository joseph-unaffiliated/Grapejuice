import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalogService } from '../services/firestore/catalog';
import {
  buildDefaultLineItems,
  catalogSlotId,
  householdFreeQtyForItem,
  isHouseholdPracticeCatalogItem,
} from '../services/box/buildDefaultBox';
import { resolveSwapOptionsForItem, resolveIncludedGiftOptions } from '../services/box/sectionUpsells';
import { addOnTopUnitCents, swapOptionsForLine, swapUnitCents } from '../services/box/swapPricing';
import { EXTRA_FLAT_CENTS, extraUnitCents } from '../services/box/pricing';
import { geltCeilingForPeople, geltSizeOf, geltSwapQuantity } from '../services/box/boxRules';
import {
  displaySectionForCatalogItem,
  displaySectionForLineItem,
} from '../constants/boxDisplaySections';
import {
  assignKidBookLines,
  assignKidGiftLines,
  childIdFromSlot,
  fillOpenKidSlot,
  isGiftSlotLine,
  isWrapControlSlot,
  includedPracticeSlotVacant,
  openKidSlotFor,
  promotePaidSiblingToIncludedPractice,
  uniqueSlotForFreeSectionAdd,
  removeCoalescedGroup,
  syncWrappingPaperUnitCentsForWrapSelection,
  transferLiveIncludedBaselineOnSwap,
  withCashDonationCents,
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
  initialLineItems?: BoxLineItem[],
  adults = 1
) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lineItems, setLineItems] = useState<BoxLineItem[]>(() => initialLineItems ?? []);
  const [wrapSelectedItemIds, setWrapSelectedItemIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const keepInitialRef = useRef(Boolean(initialLineItems?.length));

  const children = useMemo(() => giftChildrenToProfiles(childDrafts), [childDrafts]);
  const people = children.length + adults;
  const geltCeiling = geltCeilingForPeople(people);

  const load = useCallback(async () => {
    setLoading(true);
    const items = await catalogService.getAll();
    setCatalog(items);
    setLineItems((prev) => {
      if (keepInitialRef.current && prev.length > 0) {
        keepInitialRef.current = false;
        return prev;
      }
      return buildDefaultLineItems(items, children, [], adults);
    });
    setLoading(false);
  }, [children, adults]);

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
      const options = (limit: number) =>
        isGiftSlotLine(li)
          ? resolveIncludedGiftOptions(catalog, li.itemId, limit)
          : resolveSwapOptionsForItem(current, catalog, limit, { geltCeiling });
      const shown = options(6).length;
      next[li.slotId] = swapOptionsForLine(li, current, options(Math.max(24, shown)), { catalog, geltCeiling }).slice(
        0,
        shown
      );
    }
    return next;
  }, [lineItems, catalog, geltCeiling]);

  /** Always append as an add-on (modal “Add to gift”), except wrapping paper with
   * an empty wrap list restores included paper (inverse of pre-wrap). */
  const addItem = useCallback(
    (
      item: CatalogItem,
      opts?: { displaySectionId?: BoxLineItem['displaySectionId'] }
    ) => {
      setLineItems((prev) => {
        if (prev.some((li) => li.itemId === item.id)) return prev;
        const unitCents = addOnTopUnitCents(item, displaySectionForCatalogItem(item), {
          catalog,
          lineItems: prev,
          people,
          wrapSelectedCount: wrapSelectedItemIds.length,
        });
        const isPaper =
          item.defaultSlot === 'wrapping-paper' ||
          item.slotId === 'wrapping-paper' ||
          /wrapping.?paper/i.test(`${item.id} ${item.name}`);
        return [
          ...prev,
          {
            slotId: isPaper ? 'wrapping-paper' : uniqueAddSlotId(item, prev),
            itemId: item.id,
            quantity: 1,
            unitCents,
            includedQty: unitCents === 0 ? 1 : 0,
            label: item.name,
            ...(opts?.displaySectionId ? { displaySectionId: opts.displaySectionId } : null),
          },
        ];
      });
    },
    [wrapSelectedItemIds, catalog, people]
  );

  /** What `addItem` would charge right now — the number "+$X" labels show. */
  const addOnTopCents = useCallback(
    (item: CatalogItem) =>
      addOnTopUnitCents(item, displaySectionForCatalogItem(item), {
        catalog,
        lineItems,
        people,
        wrapSelectedCount: wrapSelectedItemIds.length,
      }),
    [catalog, lineItems, people, wrapSelectedItemIds]
  );

  const applySwap = useCallback(
    (
      slotIds: string[],
      newItem: CatalogItem,
      opts?: { displaySectionId?: BoxLineItem['displaySectionId'] }
    ) => {
      const idSet = new Set(slotIds);
      const ctx = { catalog, geltCeiling };
      const current = lineItems.find((li) => idSet.has(li.slotId));
      const currentItem = current ? catalog.find((c) => c.id === current.itemId) : undefined;
      // An included slot never swaps to something it doesn't include — that's an add-on on top.
      if (current && swapUnitCents(current, currentItem, newItem, ctx) === undefined) {
        addItem(newItem, opts);
        return;
      }
      setLineItems((prev) => {
        const sourceLine = prev.find((li) => idSet.has(li.slotId));
        const sourceItem = sourceLine ? catalog.find((c) => c.id === sourceLine.itemId) : undefined;
        // Gelt for gelt keeps the same chocolate (Big Bag → three Little Bags).
        const fromGelt = sourceItem ? geltSizeOf(sourceItem) : null;
        const toGelt = geltSizeOf(newItem);
        const geltQty = (qty: number) =>
          fromGelt && toGelt ? geltSwapQuantity(fromGelt, toGelt, qty, people) : qty;
        const nextUnit =
          (sourceLine ? swapUnitCents(sourceLine, sourceItem, newItem, ctx) : undefined) ?? extraUnitCents(newItem);
        if (sourceLine?.itemId) {
          const swappedQty = prev
            .filter((li) => idSet.has(li.slotId))
            .reduce((s, li) => s + geltQty(Math.max(1, li.quantity ?? 1)), 0);
          transferLiveIncludedBaselineOnSwap(
            sourceLine.itemId,
            newItem.id,
            swappedQty,
            nextUnit
          );
        }
        return prev.map((li) =>
          idSet.has(li.slotId)
            ? {
                ...li,
                slotId: slotIdAfterSwap(li.slotId, newItem),
                itemId: newItem.id,
                unitCents: nextUnit,
                label: newItem.name,
                ...(fromGelt && toGelt
                  ? {
                      quantity: geltQty(Math.max(1, li.quantity ?? 1)),
                      ...(li.includedQty ? { includedQty: geltQty(li.includedQty) } : {}),
                    }
                  : null),
                ...(opts?.displaySectionId
                  ? { displaySectionId: opts.displaySectionId }
                  : null),
              }
            : li
        );
      });
    },
    [catalog, people, geltCeiling, lineItems, addItem]
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

  const removeCoalesced = useCallback(
    (group: CoalescedBoxLine) => {
      setLineItems((prev) => {
        let next = removeCoalescedGroup(prev, group);
        const removedItem = catalog.find((c) => c.id === group.itemId);
        const sectionId =
          (removedItem ? displaySectionForCatalogItem(removedItem) : undefined) ??
          group.primary.displaySectionId;
        if (sectionId) {
          next = promotePaidSiblingToIncludedPractice(
            next,
            sectionId,
            catalog,
            displaySectionForLineItem
          );
        }
        return next;
      });
    },
    [catalog]
  );

  /** Insert a fresh line at $0 for an empty section's "add these for free" placeholder. */
  const addFreeItem = useCallback(
    (
      item: CatalogItem,
      opts?: { displaySectionId?: BoxLineItem['displaySectionId'] }
    ) => {
      setLineItems((prev) => {
        // Eat & Drink lines keep food slot ids so the two included slots count them.
        const addSlot = (lines: BoxLineItem[]) =>
          opts?.displaySectionId === 'food'
            ? uniqueSlotForFreeSectionAdd('food', item, lines)
            : uniqueAddSlotId(item, lines);
        const kidSlot = opts?.displaySectionId
          ? openKidSlotFor(item, opts.displaySectionId, prev, children.map((c) => c.id), catalog)
          : null;
        if (kidSlot) return fillOpenKidSlot(prev, kidSlot, item);
        const householdQty = isHouseholdPracticeCatalogItem(item)
          ? householdFreeQtyForItem(item, children, adults, prev)
          : 1;
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
                    quantity: householdQty,
                    includedQty: householdQty,
                    ...(opts?.displaySectionId
                      ? { displaySectionId: opts.displaySectionId }
                      : null),
                    slotId: addSlot(prev.filter((x) => x.slotId !== paid.slotId)),
                  }
                : li
            );
          }
          return [
            ...prev.map((li) =>
              li.slotId === paid.slotId ? { ...li, quantity: qty - 1 } : li
            ),
            {
              slotId: addSlot(prev),
              itemId: item.id,
              quantity: householdQty,
              includedQty: householdQty,
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
        const foodOpen = opts?.displaySectionId === 'food' && includedPracticeSlotVacant('food', prev);
        if (existingPractice && !foodOpen) {
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
                    quantity: householdQty,
                    includedQty: householdQty,
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
            slotId: addSlot(prev),
            itemId: item.id,
            quantity: householdQty,
            includedQty: householdQty,
            unitCents: 0,
            label: item.name,
            ...(opts?.displaySectionId ? { displaySectionId: opts.displaySectionId } : null),
          },
        ];
      });
    },
    [children, adults, catalog]
  );

  /** Set (re-point or create) a kid's single gift line at $0; convert paid SKUs in place. */
  const setKidGift = useCallback((childId: string, item: CatalogItem) => {
    setLineItems((prev) => assignKidGiftLines(prev, childId, item));
  }, []);

  /** Add / convert a kid's book line at $0. */
  const setKidBook = useCallback((childId: string, item: CatalogItem) => {
    setLineItems((prev) => assignKidBookLines(prev, childId, item));
  }, []);

  const persistWrapSelection = useCallback(
    (itemIds: string[]) => {
      setWrapSelectedItemIds(itemIds);
      setLineItems((prev) =>
        syncWrappingPaperUnitCentsForWrapSelection(
          prev,
          catalog,
          itemIds.length,
          EXTRA_FLAT_CENTS
        )
      );
    },
    [catalog]
  );

  const setCashDonation = useCallback((cents: number) => {
    setLineItems((prev) => withCashDonationCents(prev, cents));
  }, []);

  /** Phone stepper: + adds a paid extra unit; − drops an extra first, then an included unit, then the line. */
  const changeQuantity = useCallback(
    (group: CoalescedBoxLine, delta: 1 | -1) => {
      const item = catalog.find((c) => c.id === group.itemId);
      if (delta === 1) {
        if (!item) return;
        setLineItems((prev) => {
          const extra = prev.find((li) => li.itemId === group.itemId && li.slotId.endsWith('::x'));
          if (extra) return prev.map((li) => (li.slotId === extra.slotId ? { ...li, quantity: (li.quantity ?? 1) + 1 } : li));
          return [
            ...prev,
            {
              slotId: `${group.primary.slotId}::x`,
              itemId: group.itemId,
              quantity: 1,
              unitCents: extraUnitCents(item),
              label: group.primary.label ?? item.name,
              ...(group.primary.displaySectionId ? { displaySectionId: group.primary.displaySectionId } : null),
              ...(group.primary.childId ? { childId: group.primary.childId } : null),
            } as BoxLineItem,
          ];
        });
        return;
      }
      if (group.quantity <= 1) {
        removeCoalesced(group);
        return;
      }
      setLineItems((prev) => {
        const extra = prev.find((li) => li.itemId === group.itemId && li.slotId.endsWith('::x'));
        const target = extra ?? prev.find((li) => group.lines.some((g) => g.slotId === li.slotId) && (li.quantity ?? 1) > 1);
        if (!target) return removeCoalescedGroup(prev, group);
        if ((target.quantity ?? 1) <= 1) return prev.filter((li) => li.slotId !== target.slotId);
        return prev.map((li) => (li.slotId === target.slotId ? { ...li, quantity: (li.quantity ?? 1) - 1 } : li));
      });
    },
    [catalog, removeCoalesced]
  );

  const swapOptionsFor = useCallback(
    (li: BoxLineItem): CatalogItem[] => swapOptionsBySlot[li.slotId] ?? [],
    [swapOptionsBySlot]
  );

  return {
    catalog,
    lineItems,
    children,
    people,
    geltCeiling,
    loading,
    wrapSelectedItemIds,
    applySwap,
    swapToPreWrap,
    swapOptionsFor,
    swapOptionsBySlot,
    removeCoalesced,
    changeQuantity,
    updateLines: setLineItems,
    addItem,
    addOnTopCents,
    addFreeItem,
    setKidGift,
    setKidBook,
    persistWrapSelection,
    setCashDonation,
  };
}
