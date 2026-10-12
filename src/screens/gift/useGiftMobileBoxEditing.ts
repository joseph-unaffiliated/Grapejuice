import { useEffect, useMemo, useRef, useState } from 'react';
import type { useGiftGiverBoxDraft } from '../../hooks/useGiftGiverBoxDraft';
import { useLockAt } from '../../hooks/useBoxLockDay';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import { findSwapSourceLine } from '../../services/box/findSwapSourceLine';
import { boxAddOnUnitCents } from '../../services/box/pricing';
import {
  filterBooksForKidAges,
  kidPlannerAges,
  resolveFreeSlotAddOptions,
  isBookishCatalogItem,
  resolveFreeSwapUnitCents,
  resolveSectionUpsellItems,
} from '../../services/box/sectionUpsells';
import {
  BOX_DISPLAY_SECTIONS,
  displaySectionForCatalogItem,
  displaySectionForLineItem,
  groupLineItemsByDisplaySection,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import {
  coalesceLinesByItemId,
  donatedItemQuantities,
  includedClaimAlreadyTaken,
  includedClaimBlockedUnitCents,
  isGiftSlotLine,
  isWrapControlSlot,
  isWrappingPaperItem,
  notePromotedIncludedSwap,
  paidSiblingForIncludedPromotion,
  removeCoalescedGroup,
  revertPromotedIncludedSwap,
  seedIncludedBaselines,
  setLiveIncludedBaselines,
  takePromotedIncludedUndo,
  transferIncludedBaselineOnSwap,
  type CoalescedBoxLine,
  type IncludedPromotionUndo,
} from '../../components/box/boxLineDisplay';
import { slotIdAfterSwap } from '../../hooks/useMyBoxEditing';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import type { MobileBoxEditing } from '../mobile/MyBoxMobile';

type GiftDraft = ReturnType<typeof useGiftGiverBoxDraft>;

/** Maps the giver's in-memory gift draft onto the editor shape the phone box renders. */
export function useGiftMobileBoxEditing(draft: GiftDraft, onNext: () => void): MobileBoxEditing {
  const { catalog, lineItems, children } = draft;
  const lockAt = useLockAt();
  const [productModalSection, setProductModalSection] = useState<BoxDisplaySectionId | null>(null);
  const donatedLineSnapshots = useRef<Map<string, BoxLineItem[]>>(new Map());
  const promotionUndos = useRef<Map<string, IncludedPromotionUndo>>(new Map());
  const baselines = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    setLiveIncludedBaselines(baselines.current);
    return () => setLiveIncludedBaselines(null);
  }, []);
  seedIncludedBaselines(lineItems, baselines.current);
  const donatedItems = donatedItemQuantities(lineItems, catalog, baselines.current, {
    wrapSelectedCount: draft.wrapSelectedItemIds.length,
  });
  const latest = useRef({ lineItems, donatedItems });
  latest.current = { lineItems, donatedItems };

  /** Removing included units donates them, so remember what was there for Restore. */
  const trackRemoval = (group: CoalescedBoxLine) => {
    const free = group.lines.filter((li) => !li.slotId.endsWith('::x') && (li.unitCents ?? 0) === 0);
    const freeQty = free.reduce((s, li) => s + Math.max(1, li.quantity ?? 1), 0);
    const persisted = free.reduce((s, li) => s + Math.max(0, li.includedQty ?? 0), 0);
    const map = baselines.current;
    if (isWrappingPaperItem(group.itemId, catalog, group.primary) && draft.wrapSelectedItemIds.length) {
      map.delete(group.itemId);
    } else if (freeQty > 0 && (map.has(group.itemId) || persisted > 0)) {
      map.set(group.itemId, Math.max(map.get(group.itemId) ?? 0, persisted, freeQty));
      donatedLineSnapshots.current.set(group.itemId, free);
    }
  };

  /**
   * If a paid same-section extra will be promoted, this removal is a swap:
   * move the included baseline and remember it so Undo can put both back.
   * Returns the promoted item id when that happens.
   */
  const finishRemoval = (group: CoalescedBoxLine): string | undefined => {
    const prev = latest.current.lineItems;
    const removed = removeCoalescedGroup(prev, group);
    const removedItem = catalog.find((c) => c.id === group.itemId);
    const sectionId =
      (removedItem ? displaySectionForCatalogItem(removedItem) : undefined) ??
      group.primary.displaySectionId;
    const promotedBefore = sectionId
      ? paidSiblingForIncludedPromotion(removed, sectionId, catalog, displaySectionForLineItem)
      : undefined;
    if (!promotedBefore) {
      trackRemoval(group);
      return undefined;
    }
    const free = group.lines.filter((li) => !li.slotId.endsWith('::x') && (li.unitCents ?? 0) === 0);
    const freeQty = free.reduce((s, li) => s + Math.max(1, li.quantity ?? 1), 0);
    const persisted = free.reduce((s, li) => s + Math.max(0, li.includedQty ?? 0), 0);
    const map = baselines.current;
    if (freeQty > 0 && (map.has(group.itemId) || persisted > 0)) {
      map.set(group.itemId, Math.max(map.get(group.itemId) ?? 0, persisted, freeQty));
    }
    notePromotedIncludedSwap(
      map,
      donatedLineSnapshots.current,
      promotionUndos.current,
      group.itemId,
      free,
      promotedBefore
    );
    return promotedBefore.itemId;
  };

  const restoreDonated = async (itemId: string, replacement?: CatalogItem) => {
    const item = catalog.find((c) => c.id === itemId);
    if (!item) return;
    const promotionUndo = !replacement
      ? takePromotedIncludedUndo(promotionUndos.current, itemId, latest.current.lineItems)
      : undefined;
    if (promotionUndo) {
      transferIncludedBaselineOnSwap(
        baselines.current,
        promotionUndo.promotedBefore.itemId,
        itemId,
        promotionUndo.movedQty,
        0
      );
      donatedLineSnapshots.current.delete(itemId);
      draft.updateLines((prev) => revertPromotedIncludedSwap(prev, promotionUndo));
      return;
    }
    const missing = latest.current.donatedItems.find((d) => d.item.id === itemId)?.missing ?? 0;
    if (missing <= 0) return;
    if (replacement) {
      const snapshot = donatedLineSnapshots.current.get(itemId) ?? [];
      donatedLineSnapshots.current.delete(itemId);
      const section = displaySectionForCatalogItem(replacement);
      const giftSwap = snapshot[0] ? isGiftSlotLine(snapshot[0]) : false;
      const unit = giftSwap ? 0 : resolveFreeSwapUnitCents(item, replacement, section) ?? boxAddOnUnitCents(replacement);
      const templates: BoxLineItem[] = snapshot.length
        ? snapshot
        : [{ slotId: `addon-${replacement.id}`, itemId, quantity: missing, includedQty: missing, unitCents: 0, label: item.name } as BoxLineItem];
      draft.updateLines((prev) => {
        const used = new Set(prev.map((li) => li.slotId));
        const added = templates.map((li, i) => {
          let slotId = li.slotId ? slotIdAfterSwap(li.slotId, replacement) : '';
          if (!slotId || used.has(slotId)) slotId = `addon-${replacement.id}-${i}`;
          used.add(slotId);
          return {
            ...li,
            slotId,
            itemId: replacement.id,
            label: replacement.name,
            unitCents: unit,
            ...(unit > 0 ? { includedQty: 0 } : null),
            curationNote: undefined,
            displaySectionId: giftSwap ? li.displaySectionId : section,
          };
        });
        return [...prev, ...added];
      });
      transferIncludedBaselineOnSwap(baselines.current, itemId, replacement.id, missing, unit);
      return;
    }
    const isFree = (li: BoxLineItem) => li.itemId === itemId && !li.slotId.endsWith('::x') && (li.unitCents ?? 0) === 0;
    const snapshot = donatedLineSnapshots.current.get(itemId) ?? [];
    donatedLineSnapshots.current.delete(itemId);
    const taken = includedClaimAlreadyTaken(item, snapshot, latest.current.lineItems, catalog);
    if (taken && !snapshot.length) {
      const unit = includedClaimBlockedUnitCents(item);
      draft.updateLines((prev) => [
        ...prev,
        {
          slotId: `addon-${item.id}`,
          itemId: item.id,
          quantity: missing,
          includedQty: 0,
          unitCents: unit,
          label: item.name,
          displaySectionId: displaySectionForCatalogItem(item),
        },
      ]);
      return;
    }
    if (!latest.current.lineItems.some(isFree) && !snapshot.length && !taken) {
      draft.addFreeItem(item, { displaySectionId: displaySectionForCatalogItem(item) });
      return;
    }
    draft.updateLines((prev) => {
      const free = prev.find(isFree);
      if (free && !taken) return prev.map((li) => (li.slotId === free.slotId ? { ...li, quantity: (li.quantity ?? 1) + missing } : li));
      const used = new Set(prev.map((li) => li.slotId));
      const unit = taken ? includedClaimBlockedUnitCents(item) : 0;
      return [
        ...prev,
        ...snapshot
          .filter((li) => taken || !used.has(li.slotId))
          .map((li, i) => {
            if (!taken) return li;
            let slotId = `${li.slotId}::x`;
            if (used.has(slotId)) slotId = `addon-${item.id}-${i}`;
            used.add(slotId);
            return { ...li, slotId, unitCents: unit, includedQty: 0 };
          }),
      ];
    });
  };

  const grouped = useMemo(() => groupLineItemsByDisplaySection(lineItems, catalog), [lineItems, catalog]);
  const boxItemIds = useMemo(() => new Set(lineItems.map((li) => li.itemId)), [lineItems]);

  const upsellsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, CatalogItem[]>;
    const ages = kidPlannerAges(children);
    for (const section of BOX_DISPLAY_SECTIONS) {
      const limit = section.id === 'story' ? 48 : section.id === 'dreidel' ? 12 : 8;
      const raw = resolveSectionUpsellItems(section.id, catalog, boxItemIds, limit);
      map[section.id] = section.id === 'story' ? filterBooksForKidAges(raw, ages, 8) : raw;
    }
    return map;
  }, [catalog, boxItemIds, children]);

  const freeAddOptionsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, CatalogItem[]>;
    const ages = kidPlannerAges(children);
    for (const section of BOX_DISPLAY_SECTIONS) {
      const limit = section.id === 'story' ? 48 : section.id === 'dreidel' ? 12 : 8;
      const raw = resolveFreeSlotAddOptions(section.id, catalog, limit);
      map[section.id] = section.id === 'story' ? filterBooksForKidAges(raw, ages, 8) : raw;
    }
    return map;
  }, [catalog, children]);

  const swapEligibleIdsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, Set<string>>;
    for (const section of BOX_DISPLAY_SECTIONS) {
      const eligible = new Set<string>();
      for (const item of resolveFreeSlotAddOptions(section.id, catalog, 64)) {
        const source = findSwapSourceLine(item, lineItems, catalog, section.id);
        if (!source) continue;
        const sourceItem = catalog.find((c) => c.id === source.itemId);
        const bookSwap = !!sourceItem && isBookishCatalogItem(sourceItem) && isBookishCatalogItem(item);
        if (!bookSwap && resolveFreeSwapUnitCents(sourceItem, item, section.id) === undefined) continue;
        eligible.add(item.id);
      }
      map[section.id] = eligible;
    }
    return map;
  }, [catalog, lineItems]);

  return {
    locked: false,
    lineItems,
    catalog,
    children,
    grouped,
    upsellsBySection,
    freeAddOptionsBySection,
    swapEligibleIdsBySection,
    swapOptionsBySlot: draft.swapOptionsBySlot,
    boxPriceCents: listBoxCentsForKids(Math.max(1, children.length)),
    donatedItems,
    donatedLineSnapshots,
    restoreDonated,
    openOrder: null,
    ordersLoading: false,
    cardOnFile: true,
    guestViewOnly: false,
    hasSessionEdits: false,
    savingOrder: false,
    saveOrderUpdates: async () => {},
    goToCheckout: onNext,
    lockAt,
    startsOn: null,
    estimatedDeliveryBy: null,
    setProductModalSection,
    applySwap: async (slotIds, item) => draft.applySwap(slotIds, item),
    swapToPreWrap: async (slotIds) => {
      const idSet = new Set(slotIds);
      for (const li of latest.current.lineItems) {
        if (idSet.has(li.slotId) || isWrapControlSlot(li.slotId)) {
          if (isWrappingPaperItem(li.itemId, catalog, li)) baselines.current.delete(li.itemId);
        }
      }
      draft.swapToPreWrap(slotIds);
    },
    modalAddToBox: async (item) =>
      draft.addItem(item, { displaySectionId: productModalSection ?? displaySectionForCatalogItem(item) }),
    modalRemoveFromBox: async (item) => {
      const group = coalesceLinesByItemId(lineItems.filter((li) => li.itemId === item.id))[0];
      if (!group) return;
      finishRemoval(group);
      draft.removeCoalesced(group);
    },
    changeBoxQuantity: async (group, delta) => {
      if (delta === -1 && group.quantity <= 1) {
        const promotedItemId = finishRemoval(group);
        draft.changeQuantity(group, delta);
        return promotedItemId ? { promotedItemId } : undefined;
      }
      draft.changeQuantity(group, delta);
    },
    addFreeItemToEmptySlot: async (sectionId, item) => draft.addFreeItem(item, { displaySectionId: sectionId }),
  };
}
