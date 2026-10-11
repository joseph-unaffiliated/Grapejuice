import { useEffect, useMemo, useRef, useState } from 'react';
import type { useGiftGiverBoxDraft } from '../../hooks/useGiftGiverBoxDraft';
import { useLockAt } from '../../hooks/useBoxLockDay';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import { findSwapSourceLine } from '../../services/box/findSwapSourceLine';
import {
  filterBooksForKidAges,
  kidPlannerAges,
  resolveFreeSlotAddOptions,
  resolveFreeSwapUnitCents,
  resolveSectionUpsellItems,
} from '../../services/box/sectionUpsells';
import {
  BOX_DISPLAY_SECTIONS,
  displaySectionForCatalogItem,
  groupLineItemsByDisplaySection,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import {
  coalesceLinesByItemId,
  donatedItemQuantities,
  isWrappingPaperItem,
  seedIncludedBaselines,
  setLiveIncludedBaselines,
  type CoalescedBoxLine,
} from '../../components/box/boxLineDisplay';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import type { MobileBoxEditing } from '../mobile/MyBoxMobile';

type GiftDraft = ReturnType<typeof useGiftGiverBoxDraft>;

/** Maps the giver's in-memory gift draft onto the editor shape the phone box renders. */
export function useGiftMobileBoxEditing(draft: GiftDraft, onNext: () => void): MobileBoxEditing {
  const { catalog, lineItems, children } = draft;
  const lockAt = useLockAt();
  const [productModalSection, setProductModalSection] = useState<BoxDisplaySectionId | null>(null);
  const donatedLineSnapshots = useRef<Map<string, BoxLineItem[]>>(new Map());
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

  const restoreDonated = async (itemId: string) => {
    const item = catalog.find((c) => c.id === itemId);
    const missing = latest.current.donatedItems.find((d) => d.item.id === itemId)?.missing ?? 0;
    if (!item || missing <= 0) return;
    const isFree = (li: BoxLineItem) => li.itemId === itemId && !li.slotId.endsWith('::x') && (li.unitCents ?? 0) === 0;
    const snapshot = donatedLineSnapshots.current.get(itemId) ?? [];
    donatedLineSnapshots.current.delete(itemId);
    if (!latest.current.lineItems.some(isFree) && !snapshot.length) {
      draft.addFreeItem(item, { displaySectionId: displaySectionForCatalogItem(item) });
      return;
    }
    draft.updateLines((prev) => {
      const free = prev.find(isFree);
      if (free) return prev.map((li) => (li.slotId === free.slotId ? { ...li, quantity: (li.quantity ?? 1) + missing } : li));
      const used = new Set(prev.map((li) => li.slotId));
      return [...prev, ...snapshot.filter((li) => !used.has(li.slotId))];
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
        if (resolveFreeSwapUnitCents(sourceItem, item, section.id) === undefined) continue;
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
    swapToPreWrap: async (slotIds) => draft.swapToPreWrap(slotIds),
    modalAddToBox: async (item) =>
      draft.addItem(item, { displaySectionId: productModalSection ?? displaySectionForCatalogItem(item) }),
    modalRemoveFromBox: async (item) => {
      const group = coalesceLinesByItemId(lineItems.filter((li) => li.itemId === item.id))[0];
      if (!group) return;
      trackRemoval(group);
      draft.removeCoalesced(group);
    },
    changeBoxQuantity: async (group, delta) => {
      if (delta === -1 && group.quantity <= 1) trackRemoval(group);
      draft.changeQuantity(group, delta);
    },
    addFreeItemToEmptySlot: async (sectionId, item) => draft.addFreeItem(item, { displaySectionId: sectionId }),
  };
}
