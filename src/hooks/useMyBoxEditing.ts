/**
 * Everything My Box needs to edit a box: the draft, the catalog, the lock state, the
 * payment gate, swap / add / remove / quantity / donate handlers, kid gift and book
 * pickers, the product modal state, order revert, and the derived maps. Moved out of
 * MyBoxScreen with no behavior change so the desktop layout and the mobile layout run
 * on the same logic.
 *
 * The caller owns navigation and the scroll container; both come in through `deps`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../hooks/useSession';
import { useActiveProfile } from '../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY } from '../constants/pilotFeatures';
import { useAuthStore } from '../stores/authStore';
import { useBoxDraft } from '../hooks/useBoxDraft';
import { useGuestBoxFlow } from '../hooks/useGuestBoxFlow';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { getHanukkahConfig } from '../services/firestore/config';
import { useEffectiveBoxLocked, usePreviewNow } from '../hooks/useUserStatePreview';
import type { MainStackParamList } from '../navigation/types';
import { startOwnBoxBuild } from '../navigation/boxEntry';
import { useCatalog } from '../hooks/useCatalog';
import { mergeSwapNotices } from '../services/box/soldOutReconcile';
import { usePublishRavSurface } from '../hooks/usePublishRavSurface';
import {
  catalogSlotId,
  householdPracticeQty,
  isHouseholdPracticeCatalogItem,
  repairExtraPerKidPricing,
  repairWoodDreidelIncluded,
  repairZeroExtraUnits,
} from '../services/box/buildDefaultBox';
import { listBoxCentsForKids } from '../services/box/boxRules';
import { findSwapSourceLine } from '../services/box/findSwapSourceLine';
import {
  resolveSectionUpsellItems,
  resolveSwapOptionsForItem,
  resolveFreeSwapUnitCents,
  resolveFreeSlotAddOptions,
  resolveIncludedGiftOptions,
  kidPlannerAges,
  filterBooksForKidAges,
} from '../services/box/sectionUpsells';
import { boxAddOnUnitCents, extraUnitCents, EXTRA_FLAT_CENTS } from '../services/box/pricing';
import type { BoxLineItem, CatalogItem, InventorySwapNotice } from '../types/pilot';
import {
  assignKidBookLines,
  assignKidGiftLines,
  coalesceLinesByItemId,
  donatedItemQuantities,
  withCashDonationCents,
  isGiftSlotLine,
  isWrapControlSlot,
  isWrappingPaperItem,
  removeCoalescedGroup,
  cancelDonatedGiftOnClaim,
  transferIncludedBaselineOnSwap,
  setLiveIncludedBaselines,
  includedPracticeSlotVacant,
  uniqueSlotForFreeSectionAdd,
  promotePaidSiblingToIncludedPractice,
  wrappableLinesInBox,
  wrapControlLines,
} from '../components/box/boxLineDisplay';
import {
  BOX_DISPLAY_SECTIONS,
  groupLineItemsByDisplaySection,
  nonEmptyDisplaySectionIds,
  displaySectionForCatalogItem,
  displaySectionForLineItem,
  type BoxDisplaySectionId,
} from '../constants/boxDisplaySections';
import { defaultIsSurprise } from '../constants/boxPracticeGroups';
import {
  buildVoter,
  isVotablePerKidSlot,
  isWrappableSlot,
  toggleSlotVote,
} from '../services/box/slotVotes';
import { usePaymentGate } from '../hooks/usePaymentGate';
import { updatePilotBoxOrder } from '../services/checkout/updatePilotBoxOrder';

/**
 * Slot suffix for paid "extra" units added beyond a card's included baseline via the
 * quantity counter. Kept off the `extra-` prefix so the unit still displays/coalesces
 * onto its source card (grouping skips `extra-` lines).
 */
export const EXTRA_UNIT_SUFFIX = '::x';

/** Stable compare of draft vs committed order lines (swaps / qty / wrap). */
export function lineItemsFingerprint(items: BoxLineItem[]): string {
  return [...items]
    .map(
      (li) =>
        `${li.slotId}\0${li.itemId}\0${li.quantity}\0${li.unitCents}\0${li.isSurprise ? 1 : 0}\0${li.childId ?? ''}\0${li.displaySectionId ?? ''}`
    )
    .sort()
    .join('\n');
}

export function notifyUser(title: string, body: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${body}`);
    return;
  }
  Alert.alert(title, body);
}

export function formatCallableError(e: unknown): string {
  const code =
    e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code ?? '') : '';
  const message = e instanceof Error ? e.message : 'Try again in a moment.';
  if (
    code.includes('not-found') ||
    /not-found|NOT_FOUND|does not exist/i.test(message)
  ) {
    return 'The update function isn’t on the server yet. Deploy Cloud Functions (updatePilotBoxOrder), then try again.';
  }
  return message;
}

export function slotIdAfterSwap(currentSlotId: string, newItem: CatalogItem): string {
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

export type MyBoxEditingDeps = {
  navigation: StackNavigationProp<MainStackParamList>;
  /** Scrolls the detail list to a section; My Box wires its useBoxDetailScroll here. */
  scrollToSection: (sectionId: BoxDisplaySectionId) => void;
};

export function useMyBoxEditing(deps: MyBoxEditingDeps) {
  const { loading: sessionLoading, profile, household, refresh } = useSession();
  const user = useAuthStore((s) => s.user);
  const { isChildProfile, isParentProfile, activeChild } = useActiveProfile();
  const showKidBoxUi = isChildProfile && !PILOT_PARENT_ONLY;
  const { lineItems, slotVotes, sealedSectionIds, wrapSelectedItemIds, children, loading: draftLoading, error: draftError, persist, persistSlotVotes, persistWrapSelection, refresh: refreshDraft, swapNotices, dismissSwapNotices } =
    useBoxDraft();
  /** Shown for this visit only — stored notices clear as soon as they appear. */
  const [shownSwapNotices, setShownSwapNotices] = useState<InventorySwapNotice[]>([]);
  useEffect(() => {
    if (!swapNotices.length || isChildProfile) return;
    setShownSwapNotices((prev) => mergeSwapNotices(prev, swapNotices));
    dismissSwapNotices().catch((e) => console.warn('[box] failed to clear swap notices', e));
  }, [swapNotices, isChildProfile, dismissSwapNotices]);
  const { guestNeedsOnboarding, guestViewOnly, requireAuthToCustomize } = useGuestBoxFlow();
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);

  usePublishRavSurface({ type: 'box', id: 'hanukkah-2026', label: 'Hanukkah 2026 Box' });

  const { items: catalog } = useCatalog();
  const [loading, setLoading] = useState(true);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [estimatedDeliveryBy, setEstimatedDeliveryBy] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  /** Fingerprint of the committed order when this screen first loaded it — for session revert. */
  const [sessionBaselineFp, setSessionBaselineFp] = useState<string | null>(null);
  const sessionBaselineItemsRef = useRef<BoxLineItem[]>([]);
  const sessionOrderIdRef = useRef<string | null>(null);
  const [productModalItem, setProductModalItem] = useState<CatalogItem | null>(null);
  const [productModalSection, setProductModalSection] = useState<BoxDisplaySectionId | null>(
    null
  );
  const [swapPicker, setSwapPicker] = useState<{
    slotIds: string[];
    options: CatalogItem[];
    title?: string;
  } | null>(null);
  const [donationsOpen, setDonationsOpen] = useState(false);
  /** “Swap something else in” for a donated item — picker replaces it with another option. */
  const [donatedSwap, setDonatedSwap] = useState<{
    itemId: string;
    options: CatalogItem[];
  } | null>(null);
  const now = usePreviewNow();
  const locked = useEffectiveBoxLocked(lockAt);
  const { cardOnFile, openOrder, ordersLoading, guardMutation, refreshOrders } = usePaymentGate();

  /** Flat $80 box (+ $10/extra kid list framing where applicable). */
  const boxPriceCents = useMemo(
    () => listBoxCentsForKids(Math.max(1, children.length)),
    [children.length]
  );

  const wrapSelectedIds = useMemo(
    () => new Set(wrapSelectedItemIds),
    [wrapSelectedItemIds]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const config = await getHanukkahConfig();
    setLockAt(config.lockAt);
    setStartsOn(config.startsOn);
    setEstimatedDeliveryBy(config.estimatedDeliveryBy);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Guest landed on My Box without a reveal — kick into the questionnaire.
    // RootRoutes flips to Onboarding when buildBoxPath is set; spinner is only
    // the handoff frame (not a permanent gate).
    if (guestNeedsOnboarding) {
      startBuildBox();
    }
  }, [guestNeedsOnboarding, startBuildBox]);

  // A box emptied on this screen (abandon / start fresh / removing everything) is not
  // "arrived without a box" — those flows navigate themselves.
  const hadBoxThisVisitRef = useRef(false);
  if (lineItems.length > 0 || openOrder) hadBoxThisVisitRef.current = true;

  // Signed-in with no box draft and no open box order (deep link, reload, Back, gift-only
  // account) — same handoff: start the build instead of showing an empty My Box.
  const signedInWithoutBox =
    !hadBoxThisVisitRef.current &&
    !!user &&
    !guestViewOnly &&
    !sessionLoading &&
    !draftLoading &&
    !draftError &&
    !ordersLoading &&
    lineItems.length === 0 &&
    !openOrder;
  const startedOwnBuildRef = useRef(false);
  useEffect(() => {
    if (!signedInWithoutBox || startedOwnBuildRef.current) return;
    startedOwnBuildRef.current = true;
    void startOwnBoxBuild(refresh);
  }, [signedInWithoutBox, refresh]);

  /** Re-price books/gifts that slipped in as free Add-more extras; keep wood included. */
  useEffect(() => {
    if (draftLoading || locked || !catalog.length || !lineItems.length) return;
    let next = lineItems;
    let dirty = false;
    const books = repairExtraPerKidPricing(next, catalog);
    if (books.dirty) {
      next = books.lineItems;
      dirty = true;
    }
    const wood = repairWoodDreidelIncluded(next, catalog);
    if (wood.dirty) {
      next = wood.lineItems;
      dirty = true;
    }
    const extraUnits = repairZeroExtraUnits(next, catalog);
    if (extraUnits.dirty) {
      next = extraUnits.lineItems;
      dirty = true;
    }
    if (dirty) void persist(next);
  }, [catalog, lineItems, draftLoading, locked, persist]);

  const grouped = useMemo(
    () => groupLineItemsByDisplaySection(lineItems, catalog),
    [lineItems, catalog]
  );

  const hasPresentsChecklist = useMemo(() => {
    if (isChildProfile) return false;
    return (
      wrappableLinesInBox(lineItems, catalog).length > 0 ||
      wrapControlLines(lineItems).length > 0
    );
  }, [lineItems, catalog, isChildProfile]);

  const visibleSectionIds = useMemo(() => {
    if (isChildProfile) {
      // Kid gifts may live under dreidel/candles/etc. — follow real section homes.
      return nonEmptyDisplaySectionIds(grouped);
    }
    // Parent view: always show every section, even empty ones — an empty section
    // renders a "add these for free" placeholder instead of disappearing.
    return BOX_DISPLAY_SECTIONS.map((section) => section.id);
  }, [isChildProfile]);


  /** Recompute when catalog/lines change — never cache empty results across loads. */
  const swapOptionsBySlot = useMemo(() => {
    if (!catalog.length || !lineItems.length) return {} as Record<string, CatalogItem[]>;
    const next: Record<string, CatalogItem[]> = {};
    for (const li of lineItems) {
      const current = catalog.find((c) => c.id === li.itemId);
      if (!current) {
        next[li.slotId] = [];
        continue;
      }
      // Per-kid gift lines swap among the included gift set (not their catalog
      // section's peers) — e.g. an airdry-dreidel gift offers other gifts, not dreidels.
      next[li.slotId] = isGiftSlotLine(li)
        ? resolveIncludedGiftOptions(catalog, li.itemId, 6)
        : resolveSwapOptionsForItem(current, catalog, 6);
    }
    return next;
  }, [lineItems, catalog]);

  const applySwap = async (slotIds: string[], newItem: CatalogItem) => {
    if (locked) return;
    const idSet = new Set(slotIds);
    // Free-swap policy is keyed off whatever is currently in that slot — resolve it so
    // `'included'` targets (e.g. airdry dreidel, MYO candles) stay $0 even when the
    // catalog's own pricing tier says otherwise.
    const sourceLine = lineItems.find((li) => idSet.has(li.slotId));
    const sourceItem = sourceLine ? catalog.find((c) => c.id === sourceLine.itemId) : undefined;
    const sectionId = sourceItem ? displaySectionForCatalogItem(sourceItem) : undefined;
    // Per-kid gift swaps stay free regardless of the target's catalog tier.
    const nextUnit = sourceLine && isGiftSlotLine(sourceLine)
      ? 0
      : (sectionId ? resolveFreeSwapUnitCents(sourceItem, newItem, sectionId) : undefined) ??
        boxAddOnUnitCents(newItem);
    // Guests edit the local draft (“Sign up to save”); payment gate is for signed-in paid extras.
    if (!guestViewOnly && nextUnit > 0 && !guardMutation()) return;
    const swappedQty = lineItems
      .filter((li) => idSet.has(li.slotId))
      .reduce((s, li) => s + Math.max(1, li.quantity ?? 1), 0);
    if (sourceLine?.itemId) {
      // Swaps replace included allotment — do not count the old SKU as Donated.
      transferIncludedBaselineOnSwap(
        includedBaselineByItemId.current,
        sourceLine.itemId,
        newItem.id,
        swappedQty,
        nextUnit
      );
    }
    const next = lineItems.map((li) =>
      idSet.has(li.slotId)
        ? {
            ...li,
            slotId: slotIdAfterSwap(li.slotId, newItem),
            itemId: newItem.id,
            unitCents: nextUnit,
            label: newItem.name,
            // Household sets (wood/gelt) keep qty/includedQty — never peel one unit.
            // Fresh swap drops any prior curation note.
            curationNote: undefined,
          }
        : li
    );
    await persist(next);
  };

  const includedBaselineByItemId = useRef<Map<string, number>>(new Map());
  /** Free lines as they were when donated — so Restore puts them back in the same slot. */
  const donatedLineSnapshots = useRef<Map<string, BoxLineItem[]>>(new Map());
  useEffect(() => {
    setLiveIncludedBaselines(includedBaselineByItemId.current);
    return () => setLiveIncludedBaselines(null);
  }, []);
  const lineItemsRef = useRef(lineItems);
  lineItemsRef.current = lineItems;

  const swapToPreWrap = async (slotIds: string[]) => {
    if (locked) return;
    const idSet = new Set(slotIds);
    // Drop wrapping paper entirely — pre-wrap is a mode (checklist shows Included),
    // and paper reappears first in Add More when it's not in the box.
    // While presents are marked to wrap, dropping paper is not a donation.
    if (wrapSelectedIds.size > 0) {
      for (const li of lineItems) {
        if (idSet.has(li.slotId) || isWrapControlSlot(li.slotId)) {
          if (isWrappingPaperItem(li.itemId, catalog, li)) {
            includedBaselineByItemId.current.delete(li.itemId);
          }
        }
      }
    }
    const next = lineItems.filter(
      (li) => !idSet.has(li.slotId) && !isWrapControlSlot(li.slotId)
    );
    await persist(next);
  };

  const removeCoalesced = async (
    group: ReturnType<typeof coalesceLinesByItemId>[number]
  ) => {
    if (locked) return;
    // Remember included baseline only for SKUs that were part of the included allotment.
    // Removing a paid à-la-carte add (or a newly added free extra) must not create Donated.
    // Wrapping paper while items are marked to wrap is pre-wrap / included — not a donation.
    const removingWrapPaper = isWrappingPaperItem(group.itemId, catalog, group.primary);
    const havingItemsToWrap = wrapSelectedIds.size > 0;
    const freeQty = group.lines
      .filter((li) => !li.slotId.endsWith(EXTRA_UNIT_SUFFIX) && (li.unitCents ?? 0) === 0)
      .reduce((s, li) => s + Math.max(1, li.quantity ?? 1), 0);
    const persistedBaseline = group.lines
      .filter((li) => !li.slotId.endsWith(EXTRA_UNIT_SUFFIX) && (li.unitCents ?? 0) === 0)
      .reduce((s, li) => s + Math.max(0, li.includedQty ?? 0), 0);
    const baselines = includedBaselineByItemId.current;
    if (removingWrapPaper && havingItemsToWrap) {
      baselines.delete(group.itemId);
    } else if (freeQty > 0 && (baselines.has(group.itemId) || persistedBaseline > 0)) {
      baselines.set(
        group.itemId,
        Math.max(baselines.get(group.itemId) ?? 0, persistedBaseline, freeQty)
      );
      donatedLineSnapshots.current.set(
        group.itemId,
        group.lines.filter(
          (li) => !li.slotId.endsWith(EXTRA_UNIT_SUFFIX) && (li.unitCents ?? 0) === 0
        )
      );
    }
    let next = removeCoalescedGroup(lineItems, group);
    const removedItem = catalog.find((c) => c.id === group.itemId);
    const sectionId =
      (removedItem ? displaySectionForCatalogItem(removedItem) : undefined) ??
      group.primary.displaySectionId;
    if (sectionId) {
      const before = next;
      next = promotePaidSiblingToIncludedPractice(
        next,
        sectionId,
        catalog,
        displaySectionForLineItem
      );
      if (next !== before) {
        for (const li of next) {
          if ((li.unitCents ?? 0) !== 0 || isGiftSlotLine(li)) continue;
          const wasPaid = before.some(
            (b) => b.itemId === li.itemId && (b.unitCents ?? 0) > 0
          );
          if (wasPaid) {
            baselines.set(li.itemId, Math.max(baselines.get(li.itemId) ?? 0, li.includedQty ?? 1));
          }
        }
      }
    }
    await persist(next);
  };

  /**
   * Quantity counter for a box card. Units up to the included baseline stay at $0
   * (so 4→3→4 gelt never charges the 4th). Only units *beyond* that baseline are
   * charged at the member/à-la-carte price on a `${slot}${EXTRA_UNIT_SUFFIX}` line.
   * Decrement removes paid extras first, then trims included qty; at quantity 1 it
   * donates/removes the item.
   */
  const changeBoxQuantity = async (
    group: ReturnType<typeof coalesceLinesByItemId>[number],
    delta: 1 | -1,
    sectionId: BoxDisplaySectionId
  ) => {
    if (locked) return;
    const item = catalog.find((c) => c.id === group.itemId);
    const freeLines = lineItems.filter(
      (li) =>
        li.itemId === group.itemId &&
        !li.slotId.endsWith(EXTRA_UNIT_SUFFIX) &&
        (li.unitCents ?? 0) === 0
    );
    const freeQty = freeLines.reduce((s, li) => s + Math.max(1, li.quantity ?? 1), 0);
    const persistedBaseline = freeLines.reduce(
      (s, li) => s + Math.max(0, li.includedQty ?? 0),
      0
    );
    const baselines = includedBaselineByItemId.current;
    const prevBaseline = Math.max(baselines.get(group.itemId) ?? 0, persistedBaseline);
    // Only lock / raise baseline for included allotments — not paid extras or new free adds.
    const hasIncludedAllotment = baselines.has(group.itemId) || persistedBaseline > 0;
    if (hasIncludedAllotment) {
      if (freeQty > prevBaseline) baselines.set(group.itemId, freeQty);
      else if (prevBaseline > 0) baselines.set(group.itemId, prevBaseline);
    }
    const baseline = hasIncludedAllotment
      ? (baselines.get(group.itemId) ?? freeQty)
      : freeQty;

    if (delta === 1) {
      if (!item) return;
      // Restore free units first when below the included baseline.
      if (freeQty < baseline) {
        const multi = freeLines[0];
        if (!multi) return;
        await persist(
          lineItems.map((li) =>
            li.slotId === multi.slotId
              ? {
                  ...li,
                  quantity: (li.quantity ?? 1) + 1,
                  includedQty: li.includedQty ?? baseline,
                }
              : li
          )
        );
        return;
      }
      const price = extraUnitCents(item);
      if (!guestViewOnly && !guardMutation()) return;
      const extra = lineItems.find(
        (li) => li.itemId === group.itemId && li.slotId.endsWith(EXTRA_UNIT_SUFFIX)
      );
      const next = extra
        ? lineItems.map((li) =>
            li.slotId === extra.slotId ? { ...li, quantity: li.quantity + 1 } : li
          )
        : [
            ...lineItems,
            {
              slotId: `${group.primary.slotId}${EXTRA_UNIT_SUFFIX}`,
              itemId: group.itemId,
              quantity: 1,
              unitCents: price,
              label: group.primary.label,
              displaySectionId: sectionId,
              ...(group.primary.childId ? { childId: group.primary.childId } : null),
            } as BoxLineItem,
          ];
      await persist(next);
      return;
    }

    // delta === -1
    if (group.quantity <= 1) {
      await removeCoalesced(group);
      return;
    }
    // 1) Remove a paid extra unit first.
    const extra = lineItems.find(
      (li) => li.itemId === group.itemId && li.slotId.endsWith(EXTRA_UNIT_SUFFIX) && li.quantity > 0
    );
    if (extra) {
      const next =
        extra.quantity > 1
          ? lineItems.map((li) =>
              li.slotId === extra.slotId ? { ...li, quantity: li.quantity - 1 } : li
            )
          : lineItems.filter((li) => li.slotId !== extra.slotId);
      await persist(next);
      return;
    }
    // 2) Trim an included line that carries multiple units (e.g. gelt ×4).
    const multi = freeLines.find((li) => (li.quantity ?? 1) > 1);
    if (multi) {
      const beforeQty = multi.quantity ?? 1;
      await persist(
        lineItems.map((li) =>
          li.slotId === multi.slotId
            ? {
                ...li,
                quantity: beforeQty - 1,
                includedQty: li.includedQty ?? beforeQty,
              }
            : li
        )
      );
      return;
    }
    // 3) Otherwise drop one per-kid included line from the group.
    const dropSlot = freeLines[freeLines.length - 1]?.slotId;
    const keep = freeLines[0];
    if (dropSlot && keep && dropSlot !== keep.slotId) {
      // Preserve baseline on the remaining sibling so 2→1→2 stays free.
      await persist(
        lineItems
          .filter((li) => li.slotId !== dropSlot)
          .map((li) =>
            li.slotId === keep.slotId
              ? { ...li, includedQty: li.includedQty ?? baseline }
              : li
          )
      );
      return;
    }
    if (dropSlot) await persist(lineItems.filter((li) => li.slotId !== dropSlot));
  };

  const toggleSurprise = async (slotId: string) => {
    if (locked) return;
    const next = lineItems.map((li) =>
      li.slotId === slotId ? { ...li, isSurprise: !(li.isSurprise ?? defaultIsSurprise(li.slotId)) } : li
    );
    await persist(next);
  };

  const currentVoterId =
    isChildProfile && activeChild ? activeChild.id : user?.uid ?? 'guest';

  const handleToggleVote = async (slotId: string, itemId: string) => {
    const voter = buildVoter(
      isChildProfile && activeChild
        ? { type: 'child', childId: activeChild.id }
        : { type: 'parent' },
      user?.uid ?? 'guest',
      profile?.displayName ?? 'Grown-up',
      activeChild?.id,
      activeChild?.name
    );
    if (!voter) return;
    const next = toggleSlotVote(slotVotes, slotId, itemId, voter);
    await persistSlotVotes(next);
  };

  const voteOptionsFor = (li: BoxLineItem): CatalogItem[] => {
    const current = catalog.find((c) => c.id === li.itemId);
    const alts = swapOptionsBySlot[li.slotId] ?? [];
    const merged = [current, ...alts].filter(Boolean) as CatalogItem[];
    return merged.filter((opt, idx, arr) => arr.findIndex((o) => o.id === opt.id) === idx);
  };

  const kidVotableSlots = useMemo(() => {
    if (!isChildProfile || !activeChild?.id) return [];
    return lineItems.filter((li) => {
      if (li.childId !== activeChild.id) return false;
      if (!isVotablePerKidSlot(li.slotId)) return false;
      const wrapped =
        isWrappableSlot(li.slotId) && !!(li.isSurprise ?? defaultIsSurprise(li.slotId));
      return !wrapped;
    });
  }, [isChildProfile, activeChild?.id, lineItems]);

  const kidAllWrapped = useMemo(() => {
    if (!isChildProfile || !activeChild?.id) return false;
    const kidSlots = lineItems.filter(
      (li) => li.childId === activeChild.id && isVotablePerKidSlot(li.slotId)
    );
    if (kidSlots.length === 0) return false;
    return kidSlots.every(
      (li) =>
        isWrappableSlot(li.slotId) && !!(li.isSurprise ?? defaultIsSurprise(li.slotId))
    );
  }, [isChildProfile, activeChild?.id, lineItems]);

  const setKeepOrToss = async (slotId: string, value: 'keep' | 'toss') => {
    if (locked) return;
    const next = lineItems.map((li) => (li.slotId === slotId ? { ...li, keepOrToss: value } : li));
    await persist(next);
  };

  const goToCheckout = () => {
    if (guestViewOnly) {
      requireAuthToCustomize('signup');
      return;
    }
    if (openOrder) {
      deps.navigation.navigate('Orders');
      return;
    }
    deps.navigation.navigate('Checkout');
  };

  const canUpdateCommittedOrder =
    !!openOrder &&
    (openOrder.status === 'committed' || openOrder.status === 'pending') &&
    !locked;

  // Capture order contents once per order id so Revert undoes this session's edits.
  useEffect(() => {
    if (!openOrder?.id) {
      sessionOrderIdRef.current = null;
      sessionBaselineItemsRef.current = [];
      setSessionBaselineFp(null);
      return;
    }
    if (sessionOrderIdRef.current === openOrder.id) return;
    sessionOrderIdRef.current = openOrder.id;
    const baseline = (openOrder.lineItems ?? []).map((li) => ({
      ...li,
      quantity: li.quantity ?? 1,
    }));
    sessionBaselineItemsRef.current = baseline;
    setSessionBaselineFp(lineItemsFingerprint(baseline));
  }, [openOrder]);

  const orderDirty = useMemo(() => {
    if (!canUpdateCommittedOrder || !openOrder) return false;
    return lineItemsFingerprint(lineItems) !== lineItemsFingerprint(openOrder.lineItems ?? []);
  }, [canUpdateCommittedOrder, openOrder, lineItems]);

  const hasSessionEdits = useMemo(() => {
    if (!canUpdateCommittedOrder || sessionBaselineFp == null) return false;
    return lineItemsFingerprint(lineItems) !== sessionBaselineFp;
  }, [canUpdateCommittedOrder, sessionBaselineFp, lineItems]);

  const saveOrderUpdates = async () => {
    if (savingOrder) return;
    if (!household?.id) {
      notifyUser('Couldn’t update order', 'Your account isn’t linked to a household yet. Refresh and try again.');
      return;
    }
    if (!openOrder || !orderDirty) return;
    setSavingOrder(true);
    try {
      await updatePilotBoxOrder(household.id, openOrder.id);
      await refreshOrders();
    } catch (e) {
      console.error('updatePilotBoxOrder failed', e);
      notifyUser('Couldn’t update order', formatCallableError(e));
    } finally {
      setSavingOrder(false);
    }
  };

  const discardOrderChanges = async () => {
    if (!openOrder || !hasSessionEdits || savingOrder) return;
    const baseline = sessionBaselineItemsRef.current;
    await persist(
      baseline.map((li) => ({
        ...li,
        quantity: li.quantity ?? 1,
      }))
    );
  };

  // Committed / pending orders: push swaps to the server automatically.
  useEffect(() => {
    if (!canUpdateCommittedOrder || !orderDirty || locked || savingOrder) return;
    const handle = setTimeout(() => {
      void saveOrderUpdates();
    }, 700);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save when dirty fingerprint changes
  }, [canUpdateCommittedOrder, orderDirty, lineItems, locked, savingOrder]);

  const openProduct = (itemId: string, fromSection?: BoxDisplaySectionId) => {
    const found = catalog.find((c) => c.id === itemId);
    if (found) {
      setProductModalSection(fromSection ?? null);
      setProductModalItem(found);
    }
  };

  const onUpsellPress = (item: CatalogItem, fromSection: BoxDisplaySectionId) => {
    if (guestViewOnly) {
      requireAuthToCustomize('signup');
      return;
    }
    setProductModalSection(fromSection);
    setProductModalItem(item);
  };

  const modalAddToBox = async (item: CatalogItem) => {
    if (locked) return;
    const sectionId = productModalSection ?? displaySectionForCatalogItem(item);
    // Donated included practice (e.g. candles) — restoring beeswax/MYO/electric is $0.
    const freeRestoreIds = new Set(
      (freeAddOptionsBySection[sectionId] ?? []).map((i) => i.id)
    );
    if (
      freeRestoreIds.has(item.id) &&
      includedPracticeSlotVacant(sectionId, lineItems)
    ) {
      await addFreeItemToEmptySlot(sectionId, item);
      return;
    }
    let nextUnit = boxAddOnUnitCents(item);
    const isPaper =
      item.defaultSlot === 'wrapping-paper' ||
      item.slotId === 'wrapping-paper' ||
      /wrapping.?paper/i.test(`${item.id} ${item.name}`);
    // After “pre-wrap instead”: re-adding paper with nothing marked to wrap restores the
    // included paper (inverse of that swap). Paper on top of an active wrap list is +$extra.
    if (nextUnit === 0 && isPaper && wrapSelectedIds.size > 0) {
      nextUnit = EXTRA_FLAT_CENTS;
    }
    if (!guestViewOnly && nextUnit > 0 && !guardMutation()) return;
    if (lineItems.some((li) => li.itemId === item.id)) return;
    // Never reuse an occupied practice slot — "Add" means in addition to what's
    // already there (e.g. Roll Your Own candles next to Beeswax), not a silent no-op
    // or overwrite when slotIds collide. Also avoid catalog `extra-*` slots.
    const rawSlot = (item.slotId || 'addon').trim() || 'addon';
    const baseSlot = rawSlot.startsWith('extra-') ? `addon-${item.id}` : rawSlot;
    const slotTaken = lineItems.some((li) => li.slotId === baseSlot);
    const slotId = isPaper
      ? 'wrapping-paper'
      : slotTaken || nextUnit > 0 || rawSlot.startsWith('extra-')
        ? `addon-${item.id}`
        : baseSlot;
    if (isPaper && nextUnit === 0) {
      includedBaselineByItemId.current.set(
        item.id,
        Math.max(includedBaselineByItemId.current.get(item.id) ?? 0, 1)
      );
    }
    await persist([
      ...lineItems,
      {
        slotId,
        itemId: item.id,
        quantity: 1,
        unitCents: nextUnit,
        includedQty: nextUnit === 0 ? 1 : 0,
        label: item.name,
        displaySectionId: sectionId,
      },
    ]);
  };

  const modalSwapIntoBox = async (item: CatalogItem, source: BoxLineItem) => {
    if (locked) return;
    const sourceItem = catalog.find((c) => c.id === source.itemId);
    const sectionId = productModalSection ?? (sourceItem ? displaySectionForCatalogItem(sourceItem) : undefined);
    const nextUnit = isGiftSlotLine(source)
      ? 0
      : (sectionId ? resolveFreeSwapUnitCents(sourceItem, item, sectionId) : undefined) ??
        boxAddOnUnitCents(item);
    if (!guestViewOnly && nextUnit > 0 && !guardMutation()) return;
    transferIncludedBaselineOnSwap(
      includedBaselineByItemId.current,
      source.itemId,
      item.id,
      Math.max(1, source.quantity ?? 1),
      nextUnit
    );
    const next = lineItems.map((li) =>
      li.slotId === source.slotId
        ? {
            ...li,
            slotId: slotIdAfterSwap(li.slotId, item),
            itemId: item.id,
            unitCents: nextUnit,
            label: item.name,
            ...(productModalSection ? { displaySectionId: productModalSection } : null),
          }
        : li
    );
    await persist(next);
  };

  const modalRemoveFromBox = async (item: CatalogItem) => {
    if (locked) return;
    await persist(lineItems.filter((li) => li.itemId !== item.id));
  };

  /** Empty-section / donated-practice restore — insert a fresh line at $0. */
  const addFreeItemToEmptySlot = async (sectionId: BoxDisplaySectionId, item: CatalogItem) => {
    if (locked) return;
    // Claiming the included practice again — drop Donated baselines for this section’s
    // free options (e.g. donated beeswax, then restore MYO should clear Donated).
    if (includedPracticeSlotVacant(sectionId, lineItems)) {
      for (const opt of freeAddOptionsBySection[sectionId] ?? []) {
        includedBaselineByItemId.current.delete(opt.id);
      }
    }
    const householdQty =
      (sectionId === 'dreidel' || sectionId === 'food') &&
      isHouseholdPracticeCatalogItem(item)
        ? Math.max(1, householdPracticeQty(children, undefined, lineItems))
        : 1;
    // This claim is the included allotment for the section — track so a later donate counts.
    const markIncludedBaseline = () => {
      includedBaselineByItemId.current.set(
        item.id,
        Math.max(includedBaselineByItemId.current.get(item.id) ?? 0, householdQty)
      );
    };
    // Same SKU already filling this section — re-home legacy `extra-*` catalog
    // slots so the line shows; otherwise nothing to do.
    const existingInSection = lineItems.find(
      (li) =>
        li.itemId === item.id &&
        !isGiftSlotLine(li) &&
        displaySectionForLineItem(li, item) === sectionId
    );
    if (existingInSection) {
      if (existingInSection.slotId.startsWith('extra-')) {
        const nextSlot = uniqueSlotForFreeSectionAdd(
          sectionId,
          item,
          lineItems.filter((x) => x.slotId !== existingInSection.slotId)
        );
        markIncludedBaseline();
        await persist(
          lineItems.map((li) =>
            li.slotId === existingInSection.slotId
              ? { ...li, slotId: nextSlot, unitCents: 0, displaySectionId: sectionId }
              : li
          )
        );
      }
      return;
    }

    // Prefer converting a paid copy rather than duplicating.
    const paid = lineItems.find(
      (li) => li.itemId === item.id && (li.unitCents ?? 0) > 0 && !isGiftSlotLine(li)
    );
    if (paid) {
      const qty = paid.quantity ?? 1;
      markIncludedBaseline();
      if (qty <= 1) {
        await persist(
          lineItems.map((li) =>
            li.slotId === paid.slotId
              ? {
                  ...li,
                  unitCents: 0,
                  quantity: householdQty,
                  includedQty: householdQty,
                  displaySectionId: sectionId,
                  slotId: uniqueSlotForFreeSectionAdd(
                    sectionId,
                    item,
                    lineItems.filter((x) => x.slotId !== paid.slotId)
                  ),
                }
              : li
          )
        );
      } else {
        await persist([
          ...lineItems.map((li) =>
            li.slotId === paid.slotId ? { ...li, quantity: qty - 1 } : li
          ),
          {
            slotId: uniqueSlotForFreeSectionAdd(sectionId, item, lineItems),
            itemId: item.id,
            quantity: householdQty,
            includedQty: householdQty,
            unitCents: 0,
            label: item.name,
            displaySectionId: sectionId,
          },
        ]);
      }
      return;
    }

    // Allow adding even when the SKU exists as a gift elsewhere (gift SKUs can
    // also fill the candles/dreidel practice). Never leave slotId empty.
    markIncludedBaseline();
    await persist([
      ...lineItems,
      {
        slotId: uniqueSlotForFreeSectionAdd(sectionId, item, lineItems),
        itemId: item.id,
        quantity: householdQty,
        includedQty: householdQty,
        unitCents: 0,
        label: item.name,
        displaySectionId: sectionId,
      },
    ]);
  };

  const boxItemIds = useMemo(
    () => new Set(lineItems.map((li) => li.itemId)),
    [lineItems]
  );

  const upsellsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, CatalogItem[]>;
    const ages = kidPlannerAges(children);
    for (const section of BOX_DISPLAY_SECTIONS) {
      const limit = section.id === 'story' ? 48 : section.id === 'dreidel' ? 12 : 8;
      const raw = resolveSectionUpsellItems(section.id, catalog, boxItemIds, limit);
      map[section.id] =
        section.id === 'story' ? filterBooksForKidAges(raw, ages, 8) : raw;
    }
    return map;
  }, [catalog, boxItemIds, children]);

  /** Free ('included' policy) items offered on an empty section's placeholder. */
  const freeAddOptionsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, CatalogItem[]>;
    const ages = kidPlannerAges(children);
    for (const section of BOX_DISPLAY_SECTIONS) {
      const limit = section.id === 'story' ? 48 : section.id === 'dreidel' ? 12 : 8;
      const raw = resolveFreeSlotAddOptions(section.id, catalog, limit);
      map[section.id] =
        section.id === 'story' ? filterBooksForKidAges(raw, ages, 8) : raw;
    }
    return map;
  }, [catalog, children]);

  /** Included-policy swap targets that can actually replace a line in this box. */
  const swapEligibleIdsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, Set<string>>;
    for (const section of BOX_DISPLAY_SECTIONS) {
      const candidates = resolveFreeSlotAddOptions(section.id, catalog, 64);
      const eligible = new Set<string>();
      for (const item of candidates) {
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

  /** Fixed included per-kid gift set (toy menorah, dreidels, stuffie, book, DIY candles). */
  const includedGiftOptions = useMemo(
    () => resolveIncludedGiftOptions(catalog, undefined, 8),
    [catalog]
  );
  const includedGiftIds = useMemo(
    () => new Set(includedGiftOptions.map((i) => i.id)),
    [includedGiftOptions]
  );

  /** Set (re-point or create) a kid's single gift line at $0; convert paid SKUs in place. */
  const setKidGift = async (
    childId: string,
    item: CatalogItem,
    opts?: { reveal?: boolean }
  ) => {
    if (locked) return;
    const isThisKidsGift = (li: BoxLineItem) =>
      isGiftSlotLine(li) && (li.childId === childId || li.slotId === `gift-${childId}`);
    let snapshotHint: string | undefined;
    for (const [itemId, lines] of donatedLineSnapshots.current) {
      if (lines.some(isThisKidsGift)) {
        snapshotHint = itemId;
        break;
      }
    }
    const cancelled = cancelDonatedGiftOnClaim(
      includedBaselineByItemId.current,
      lineItems,
      catalog,
      childId,
      item.id,
      includedGiftIds,
      snapshotHint
    );
    if (cancelled) {
      const rest = (donatedLineSnapshots.current.get(cancelled) ?? []).filter(
        (li) => !isThisKidsGift(li)
      );
      if (rest.length) donatedLineSnapshots.current.set(cancelled, rest);
      else donatedLineSnapshots.current.delete(cancelled);
    }
    await persist(assignKidGiftLines(lineItems, childId, item));
    if (!opts?.reveal) return;
    const target = displaySectionForCatalogItem(item);
    // From “Add a gift for …” picker — scroll to where the gift landed.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => deps.scrollToSection(target));
    });
  };

  /** Add / convert a kid's book line at $0. */
  const setKidBook = async (
    childId: string,
    item: CatalogItem,
    opts?: { reveal?: boolean }
  ) => {
    if (locked) return;
    await persist(assignKidBookLines(lineItems, childId, item));
    if (!opts?.reveal) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => deps.scrollToSection('story'));
    });
  };


  const setCashDonation = async (cents: number) => {
    if (locked || guestViewOnly) return;
    if (cents > 0 && !guardMutation()) return;
    await persist(withCashDonationCents(lineItems, cents));
  };
  const donatedItems = donatedItemQuantities(
    lineItems,
    catalog,
    includedBaselineByItemId.current,
    { wrapSelectedCount: wrapSelectedIds.size }
  );
  const donatedSwapOptions = (itemId: string): CatalogItem[] => {
    const item = catalog.find((c) => c.id === itemId);
    if (!item) return [];
    const snapshot = donatedLineSnapshots.current.get(itemId)?.[0];
    const options =
      snapshot && isGiftSlotLine(snapshot)
        ? resolveIncludedGiftOptions(catalog, itemId, 6)
        : resolveSwapOptionsForItem(item, catalog, 6);
    return options.filter((opt) => opt.id !== itemId);
  };
  /**
   * Put a donated item back (or `replacement` in its place). Prefers the exact lines
   * that were removed so gift/kid slots come back where they were.
   */
  const restoreDonated = async (itemId: string, replacement?: CatalogItem) => {
    if (locked) return;
    const item = catalog.find((c) => c.id === itemId);
    if (!item) return;
    const missing =
      donatedItems.find((d) => d.item.id === itemId)?.missing ?? 0;
    if (missing <= 0) return;
    const freeLines = lineItems.filter(
      (li) =>
        li.itemId === itemId &&
        !li.slotId.endsWith(EXTRA_UNIT_SUFFIX) &&
        (li.unitCents ?? 0) === 0
    );
    const sectionId = displaySectionForCatalogItem(item);
    if (!replacement && freeLines[0]) {
      const target = freeLines[0];
      await persist(
        lineItems.map((li) =>
          li.slotId === target.slotId
            ? {
                ...li,
                quantity: (li.quantity ?? 1) + missing,
                includedQty: li.includedQty ?? (li.quantity ?? 1) + missing,
              }
            : li
        )
      );
      return;
    }
    const snapshot = donatedLineSnapshots.current.get(itemId) ?? [];
    if (!replacement && !snapshot.length) {
      await addFreeItemToEmptySlot(sectionId, item);
      return;
    }
    const target = replacement ?? item;
    const giftSwap = snapshot[0] ? isGiftSlotLine(snapshot[0]) : false;
    const unit = !replacement || giftSwap
      ? 0
      : resolveFreeSwapUnitCents(item, replacement, sectionId) ?? boxAddOnUnitCents(replacement);
    if (!guestViewOnly && unit > 0 && !guardMutation()) return;
    const targetSection = displaySectionForCatalogItem(target);
    let next = lineItems;
    const snapshotQty = snapshot.reduce((s, li) => s + Math.max(1, li.quantity ?? 1), 0);
    const templates: BoxLineItem[] = snapshot.length
      ? snapshot.map((li, i) =>
          i === 0 && snapshotQty < missing
            ? { ...li, quantity: (li.quantity ?? 1) + (missing - snapshotQty) }
            : li
        )
      : [
          {
            slotId: '',
            itemId,
            quantity: missing,
            includedQty: missing,
            unitCents: 0,
            label: item.name,
            displaySectionId: sectionId,
          } as BoxLineItem,
        ];
    for (const li of templates) {
      let slotId = replacement && li.slotId ? slotIdAfterSwap(li.slotId, target) : li.slotId;
      if (!slotId || next.some((x) => x.slotId === slotId)) {
        slotId = uniqueSlotForFreeSectionAdd(targetSection, target, next);
      }
      next = [
        ...next,
        {
          ...li,
          slotId,
          itemId: target.id,
          label: target.name,
          unitCents: unit,
          curationNote: undefined,
          ...(replacement ? { displaySectionId: giftSwap ? li.displaySectionId : targetSection } : null),
        },
      ];
    }
    if (replacement) {
      transferIncludedBaselineOnSwap(
        includedBaselineByItemId.current,
        itemId,
        replacement.id,
        missing,
        unit
      );
    }
    donatedLineSnapshots.current.delete(itemId);
    await persist(next);
  };

  return {
    activeChild,
    addFreeItemToEmptySlot,
    applySwap,
    boxPriceCents,
    canUpdateCommittedOrder,
    cardOnFile,
    catalog,
    changeBoxQuantity,
    children,
    currentVoterId,
    discardOrderChanges,
    donatedItems,
    donatedLineSnapshots,
    donatedSwap,
    donatedSwapOptions,
    donationsOpen,
    draftError,
    draftLoading,
    estimatedDeliveryBy,
    freeAddOptionsBySection,
    goToCheckout,
    grouped,
    guestNeedsOnboarding,
    guestViewOnly,
    handleToggleVote,
    hasPresentsChecklist,
    hasSessionEdits,
    includedBaselineByItemId,
    includedGiftIds,
    includedGiftOptions,
    isChildProfile,
    isParentProfile,
    kidAllWrapped,
    kidVotableSlots,
    lineItems,
    lineItemsRef,
    load,
    loading,
    lockAt,
    locked,
    modalAddToBox,
    modalRemoveFromBox,
    modalSwapIntoBox,
    now,
    onUpsellPress,
    openOrder,
    openProduct,
    orderDirty,
    ordersLoading,
    persist,
    persistWrapSelection,
    productModalItem,
    productModalSection,
    refreshDraft,
    removeCoalesced,
    requireAuthToCustomize,
    restoreDonated,
    saveOrderUpdates,
    savingOrder,
    sealedSectionIds,
    sessionLoading,
    setCashDonation,
    setDonatedSwap,
    setDonationsOpen,
    setKeepOrToss,
    setKidBook,
    setKidGift,
    setProductModalItem,
    setProductModalSection,
    setShownSwapNotices,
    setSwapPicker,
    showKidBoxUi,
    shownSwapNotices,
    signedInWithoutBox,
    slotVotes,
    startsOn,
    swapEligibleIdsBySection,
    swapOptionsBySlot,
    swapPicker,
    swapToPreWrap,
    toggleSurprise,
    upsellsBySection,
    user,
    visibleSectionIds,
    voteOptionsFor,
    wrapSelectedIds,
  };
}
