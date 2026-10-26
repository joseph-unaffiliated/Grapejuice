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
import { LAST_SIGNED_IN_KEY, useBoxPresenceStore } from '../stores/boxPresenceStore';
import { getHanukkahConfig } from '../services/firestore/config';
import { useBoxEditingLocked, usePreviewNow } from '../hooks/useUserStatePreview';
import type { MainStackParamList } from '../navigation/types';
import { startOwnBoxBuild } from '../navigation/boxEntry';
import { useCatalog } from '../hooks/useCatalog';
import { mergeSwapNotices } from '../services/box/soldOutReconcile';
import { isPilotLine } from '../services/box/pilotLines';
import { usePublishRavSurface } from '../hooks/usePublishRavSurface';
import {
  catalogSlotId,
  householdFreeQtyForItem,
  isHouseholdPracticeCatalogItem,
  repairExtraPerKidPricing,
  repairWoodDreidelIncluded,
  repairZeroExtraUnits,
  woodDreidelCatalogItem,
} from '../services/box/buildDefaultBox';
import { foodSlotQuantity, geltBagOf, isFoodSlotLine, topUpDreidelLines } from '../services/box/includedAudit';
import { geltCeilingForPeople, geltSizeOf, listBoxCentsForKids } from '../services/box/boxRules';
import { findSwapSourceLine } from '../services/box/findSwapSourceLine';
import {
  addOnTopUnitCents,
  geltAddFitsAllowance,
  isIncludedSwap,
  swapOptionsForLine,
  swapCandidatesForLine,
  swappedQuantity,
  swapQuantities,
  swapUnitCents,
  type AddPricingContext,
} from '../services/box/swapPricing';
import {
  resolveSectionUpsellItems,
  resolveSwapOptionsForItem,
  resolveFreeSlotAddOptions,
  resolveIncludedGiftOptions,
  isStuffieCatalogItem,
  kidPlannerAges,
  filterBooksForKidAges,
} from '../services/box/sectionUpsells';
import { extraUnitCents } from '../services/box/pricing';
import type { BoxLineItem, CatalogItem, InventorySwapNotice } from '../types/pilot';
import {
  assignKidBookLines,
  assignKidGiftLines,
  coalesceLinesByItemId,
  defaultPreWrapSelection,
  donatedItemQuantities,
  withCashDonationCents,
  isGiftSlotLine,
  isWrapControlSlot,
  isWrappingPaperItem,
  removeCoalescedGroup,
  restoreIncludedUnit,
  cancelDonatedGiftOnClaim,
  transferIncludedBaselineOnSwap,
  setLiveIncludedBaselines,
  includedPracticeSlotVacant,
  includedClaimAlreadyTaken,
  includedClaimBlockedUnitCents,
  childIdFromSlot,
  openKidSlotFor,
  uniqueSlotForFreeSectionAdd,
  promotePaidSiblingToIncludedPractice,
  paidSiblingForIncludedPromotion,
  notePromotedIncludedSwap,
  takePromotedIncludedUndo,
  revertPromotedIncludedSwap,
  type IncludedPromotionUndo,
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

/** The free line a donated item held — its own slot when we still have it. */
function donatedSwapLine(item: CatalogItem, snapshot?: BoxLineItem): BoxLineItem {
  return snapshot
    ? { ...snapshot, unitCents: 0 }
    : { slotId: '', itemId: item.id, quantity: 1, unitCents: 0, label: item.name };
}

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
  const { lineItems, slotVotes, sealedSectionIds, wrapSelectedItemIds, children, adults, people, loading: draftLoading, error: draftError, persist, persistSlotVotes, persistWrapSelection, refresh: refreshDraft, swapNotices, dismissSwapNotices } =
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
  const { cardOnFile, openOrder, ordersLoading, guardMutation, refreshOrders, totalCreditCents } = usePaymentGate();
  const locked = useBoxEditingLocked(lockAt, openOrder);
  /** What lock settles against: credit checkout reserved on the order plus the account balance. */
  const boxCreditCents =
    totalCreditCents + (openOrder?.giftCreditAppliedCents ?? 0) + (openOrder?.platformCreditAppliedCents ?? 0);

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

  const authLoading = useAuthStore((s) => s.isLoading);
  const rememberedHadBox = useBoxPresenceStore((s) => s.byKey[LAST_SIGNED_IN_KEY]);
  // Signed-in with no box draft and no open box order (deep link, reload, Back, gift-only
  // account) — same handoff: start the build instead of showing an empty My Box.
  // Don't fire during auth/draft cold load, or when we remember they had a box (reload race).
  const signedInWithoutBox =
    !hadBoxThisVisitRef.current &&
    !!user &&
    !guestViewOnly &&
    !authLoading &&
    !sessionLoading &&
    !draftLoading &&
    !draftError &&
    !ordersLoading &&
    rememberedHadBox !== true &&
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
  const geltCeiling = geltCeilingForPeople(people);
  const kidAgeById = useMemo(() => {
    const ages = kidPlannerAges(children);
    return new Map(children.map((c, i) => [c.id, ages[i]]));
  }, [children]);
  const swapOptionsBySlot = useMemo(() => {
    if (!catalog.length || !lineItems.length) return {} as Record<string, CatalogItem[]>;
    const next: Record<string, CatalogItem[]> = {};
    for (const li of lineItems) {
      const current = catalog.find((c) => c.id === li.itemId);
      if (!current) {
        next[li.slotId] = [];
        continue;
      }
      const options = (limit: number) =>
        swapCandidatesForLine(li, current, catalog, limit, {
          geltCeiling,
          kidAge: li.childId ? kidAgeById.get(li.childId) : undefined,
        });
      const shown = options(6).length;
      next[li.slotId] = swapOptionsForLine(li, current, options(Math.max(24, shown)), { catalog, geltCeiling }).slice(
        0,
        shown
      );
    }
    return next;
  }, [lineItems, catalog, geltCeiling, kidAgeById]);

  /** How many of `option` a swap into these slots gives (e.g. three Little Bags), when more than one. */
  const swapQuantityFor = (slotIds: string[], option: CatalogItem): number | undefined => {
    const total = swappedQuantity(lineItems, slotIds, option, catalog, people);
    return total > 1 ? total : undefined;
  };

  const applySwap = async (slotIds: string[], newItem: CatalogItem) => {
    if (locked) return;
    const idSet = new Set(slotIds);
    if (lineItems.some((li) => idSet.has(li.slotId) && isPilotLine(li))) return;
    // Free-swap policy is keyed off whatever is currently in that slot — resolve it so
    // `'included'` targets (e.g. airdry dreidel, MYO candles) stay $0 even when the
    // catalog's own pricing tier says otherwise.
    const sourceLine = lineItems.find((li) => idSet.has(li.slotId));
    const sourceItem = sourceLine ? catalog.find((c) => c.id === sourceLine.itemId) : undefined;
    const priced = sourceLine ? swapUnitCents(sourceLine, sourceItem, newItem, { catalog, geltCeiling }) : undefined;
    // An included slot never swaps to something it doesn't include — that's an add-on on top.
    if (priced === undefined) return modalAddToBox(newItem);
    const nextUnit = priced;
    // Guests edit the local draft (“Sign up to save”); payment gate is for signed-in paid extras.
    if (!guestViewOnly && nextUnit > 0 && !guardMutation()) return;
    // Gelt keeps the same chocolate (Big Bag → three Little Bags); a food slot holds one kit,
    // one Big Bag or three Little Bags. Other household sets (wood dreidels) keep their count.
    const quantitiesFor = (li: BoxLineItem) => swapQuantities(li, sourceItem, newItem, people);
    const swapped = lineItems.filter((li) => idSet.has(li.slotId));
    const leavingQty = swapped.reduce((s, li) => s + Math.max(1, li.quantity ?? 1), 0);
    const swappedQty = swapped.reduce((s, li) => s + (quantitiesFor(li)?.quantity ?? Math.max(1, li.quantity ?? 1)), 0);
    if (sourceLine?.itemId) {
      // Swaps replace included allotment — do not count the old SKU as Donated.
      transferIncludedBaselineOnSwap(
        includedBaselineByItemId.current,
        sourceLine.itemId,
        newItem.id,
        leavingQty,
        nextUnit,
        swappedQty
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
            ...quantitiesFor(li),
            // Fresh swap drops any prior curation note.
            curationNote: undefined,
          }
        : li
    );
    await persist(next);
  };

  const includedBaselineByItemId = useRef<Map<string, number>>(new Map());
  /** Per-kid free line that − dropped, by itemId, so + can put it back in the same slot. */
  const droppedIncludedLine = useRef<Map<string, BoxLineItem>>(new Map());
  /** Free lines as they were when donated — so Restore puts them back in the same slot. */
  const donatedLineSnapshots = useRef<Map<string, BoxLineItem[]>>(new Map());
  /** Included removal that promoted a paid extra — Undo restores both, it is not a donation. */
  const promotionUndos = useRef<Map<string, IncludedPromotionUndo>>(new Map());
  useEffect(() => {
    setLiveIncludedBaselines(includedBaselineByItemId.current);
    return () => setLiveIncludedBaselines(null);
  }, []);
  const lineItemsRef = useRef(lineItems);
  lineItemsRef.current = lineItems;

  const swapToPreWrap = async (slotIds: string[]) => {
    if (locked) return;
    const idSet = new Set(slotIds);
    // Pre-wrap replaces the paper. It is not a donation: the presents come wrapped,
    // and the paper can be swapped back in.
    for (const li of lineItems) {
      if (idSet.has(li.slotId) || isWrapControlSlot(li.slotId)) {
        if (isWrappingPaperItem(li.itemId, catalog, li)) {
          includedBaselineByItemId.current.delete(li.itemId);
          donatedLineSnapshots.current.delete(li.itemId);
        }
      }
    }
    const next = lineItems.filter(
      (li) => !idSet.has(li.slotId) && !isWrapControlSlot(li.slotId)
    );
    await persist(next);
    if (wrapSelectedIds.size === 0) {
      const picks = defaultPreWrapSelection(next, catalog);
      if (picks.length) await persistWrapSelection(picks);
    }
  };

  /** Undo pre-wrap: the paper comes back as the included choice, so the wrap list clears first. */
  const swapBackToPaper = async (paper: CatalogItem) => {
    if (locked) return;
    await persistWrapSelection([]);
    await modalAddToBox(paper, { includedPaper: true });
  };

  const removeCoalesced = async (
    group: ReturnType<typeof coalesceLinesByItemId>[number]
  ) => {
    if (locked || group.lines.some(isPilotLine)) return;
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
    let promotedItemId: string | undefined;
    if (sectionId) {
      const before = next;
      const promotedBefore = paidSiblingForIncludedPromotion(
        before,
        sectionId,
        catalog,
        displaySectionForLineItem
      );
      next = promotePaidSiblingToIncludedPractice(
        next,
        sectionId,
        catalog,
        displaySectionForLineItem
      );
      if (promotedBefore && next !== before) {
        // The paid extra took the included slot — move the baseline, don't donate.
        const removedFree = group.lines.filter(
          (li) => !li.slotId.endsWith(EXTRA_UNIT_SUFFIX) && (li.unitCents ?? 0) === 0
        );
        notePromotedIncludedSwap(
          baselines,
          donatedLineSnapshots.current,
          promotionUndos.current,
          group.itemId,
          removedFree,
          promotedBefore
        );
        promotedItemId = promotedBefore.itemId;
      }
    }
    await persist(next);
    return promotedItemId;
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
    if (locked || group.lines.some(isPilotLine)) return;
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
        const restored = restoreIncludedUnit(lineItems, group.itemId, droppedIncludedLine.current.get(group.itemId));
        droppedIncludedLine.current.delete(group.itemId);
        if (restored) {
          await persist(restored);
          return;
        }
        // The kid's present slot was filled since: this copy is an add-on.
        baselines.set(group.itemId, freeQty);
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
      const promotedItemId = await removeCoalesced(group);
      return promotedItemId ? { promotedItemId } : undefined;
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
      // + puts this line back in its own slot (2→1→2 stays free).
      const dropped = freeLines[freeLines.length - 1];
      if (dropped) droppedIncludedLine.current.set(group.itemId, dropped);
      await persist(lineItems.filter((li) => li.slotId !== dropSlot));
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

  const addPricingContext = (): AddPricingContext => ({
    catalog,
    lineItems,
    people,
    wrapSelectedCount: wrapSelectedIds.size,
  });

  /** Adding `item` fills an empty included slot: a kid's book or present, or a donated practice item. */
  const addClaimsIncludedSlot = (item: CatalogItem, sectionId: BoxDisplaySectionId) => {
    if (openKidSlotFor(item, sectionId, lineItems, children.map((c) => c.id), catalog)) return true;
    if (!(freeAddOptionsBySection[sectionId] ?? []).some((i) => i.id === item.id)) return false;
    if (!includedPracticeSlotVacant(sectionId, lineItems)) return false;
    return !geltSizeOf(item) || geltAddFitsAllowance(item, addPricingContext());
  };

  /** What `modalAddToBox` charges right now — the number "+$X" labels show. */
  const addOnTopCents = (item: CatalogItem, sectionId: BoxDisplaySectionId) =>
    addClaimsIncludedSlot(item, sectionId) ? 0 : addOnTopUnitCents(item, sectionId, addPricingContext());

  const modalAddToBox = async (
    item: CatalogItem,
    opts?: { includedPaper?: boolean; sectionId?: BoxDisplaySectionId }
  ) => {
    if (locked) return;
    const sectionId = opts?.sectionId ?? productModalSection ?? displaySectionForCatalogItem(item);
    // Donated included practice (e.g. candles) — restoring beeswax/MYO/electric is $0.
    if (addClaimsIncludedSlot(item, sectionId)) {
      await addFreeItemToEmptySlot(sectionId, item);
      return;
    }
    const nextUnit = addOnTopUnitCents(item, sectionId, { ...addPricingContext(), includedPaper: opts?.includedPaper });
    const isPaper =
      item.defaultSlot === 'wrapping-paper' ||
      item.slotId === 'wrapping-paper' ||
      /wrapping.?paper/i.test(`${item.id} ${item.name}`);
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
    if (locked || isPilotLine(source)) return;
    const sourceItem = catalog.find((c) => c.id === source.itemId);
    if (swapQuantities(source, sourceItem, item, people)) return applySwap([source.slotId], item);
    const priced = swapUnitCents(source, sourceItem, item, { catalog, geltCeiling });
    if (priced === undefined) return modalAddToBox(item);
    const nextUnit = priced;
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
    await persist(lineItems.filter((li) => li.itemId !== item.id || isPilotLine(li)));
  };

  /** Empty-section / donated-practice restore — insert a fresh line at $0. */
  const addFreeItemToEmptySlot = async (sectionId: BoxDisplaySectionId, item: CatalogItem) => {
    if (locked) return;
    const kidSlot = openKidSlotFor(item, sectionId, lineItems, children.map((c) => c.id), catalog);
    if (kidSlot) {
      await (kidSlot.kind === 'story' ? setKidBook : setKidGift)(kidSlot.kidId, item);
      return;
    }
    // A full gift or book slot is not an empty practice slot. Falling through
    // used to write the catalog catch-all (a stuffie on `decor`) at $0.
    // A stuffie is included only as a kid's present, never as dreidel, food, or candles.
    if (sectionId === 'presents' || sectionId === 'story' || isStuffieCatalogItem(item)) return;
    // Claiming the included practice again — drop Donated baselines for this section’s
    // free options (e.g. donated beeswax, then restore MYO should clear Donated).
    if (includedPracticeSlotVacant(sectionId, lineItems)) {
      for (const opt of freeAddOptionsBySection[sectionId] ?? []) {
        includedBaselineByItemId.current.delete(opt.id);
      }
    }
    const householdQty =
      sectionId === 'food'
        ? foodSlotQuantity(item)
        : sectionId === 'dreidel' && isHouseholdPracticeCatalogItem(item)
          ? householdFreeQtyForItem(item, children, adults, lineItems)
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
    // A paid copy falls through to the conversion below; Eat & Drink may hold the same kit twice.
    const existingInSection = lineItems.find(
      (li) =>
        li.itemId === item.id &&
        (li.unitCents ?? 0) === 0 &&
        !isGiftSlotLine(li) &&
        displaySectionForLineItem(li, item) === sectionId
    );
    if (existingInSection && !(sectionId === 'food' && includedPracticeSlotVacant('food', lineItems))) {
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

  const sectionUpsells = useMemo(() => {
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
        const source = findSwapSourceLine(item, lineItems, catalog, section.id, { geltCeiling });
        if (!source) continue;
        const sourceItem = catalog.find((c) => c.id === source.itemId);
        if (!isIncludedSwap(source, sourceItem, item, { catalog, geltCeiling })) continue;
        eligible.add(item.id);
      }
      map[section.id] = eligible;
    }
    return map;
  }, [catalog, lineItems, geltCeiling]);

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
    const isThisKidsBook = (li: BoxLineItem) =>
      catalogSlotId(li.slotId) === 'story' && (li.childId || childIdFromSlot(li.slotId)) === childId;
    for (const [goneId, lines] of donatedLineSnapshots.current) {
      if (!lines.some(isThisKidsBook)) continue;
      transferIncludedBaselineOnSwap(includedBaselineByItemId.current, goneId, item.id, 1, 0);
      const rest = lines.filter((li) => !isThisKidsBook(li));
      if (rest.length) donatedLineSnapshots.current.set(goneId, rest);
      else donatedLineSnapshots.current.delete(goneId);
      break;
    }
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
  /** No paper card and the paper wasn't donated: the presents come wrapped. */
  const preWrap =
    lineItems.length > 0 &&
    wrapControlLines(lineItems).length === 0 &&
    !donatedItems.some((d) => isWrappingPaperItem(d.item.id, catalog));
  /** While pre-wrapped, paper comes back free through "Send me wrapping paper instead", not as a paid add. */
  const upsellsBySection = useMemo(() => {
    if (!preWrap) return sectionUpsells;
    const map = {} as Record<BoxDisplaySectionId, CatalogItem[]>;
    for (const section of BOX_DISPLAY_SECTIONS) {
      map[section.id] = sectionUpsells[section.id].filter((item) => !isWrappingPaperItem(item.id, catalog));
    }
    return map;
  }, [sectionUpsells, preWrap, catalog]);
  const donatedSwapOptions = (itemId: string): CatalogItem[] => {
    const item = catalog.find((c) => c.id === itemId);
    if (!item) return [];
    const snapshot = donatedLineSnapshots.current.get(itemId)?.[0];
    const options =
      snapshot && isGiftSlotLine(snapshot)
        ? resolveIncludedGiftOptions(catalog, itemId, 6, snapshot.childId ? kidAgeById.get(snapshot.childId) : undefined)
        : resolveSwapOptionsForItem(item, catalog, 6, { geltCeiling });
    return swapOptionsForLine(donatedSwapLine(item, snapshot), item, options, { catalog, geltCeiling }).filter(
      (opt) => opt.id !== itemId
    );
  };

  /** "Add back" on an empty dreidel slot: free dreidels back up to one per person. */
  const topUpIncludedDreidels = async () => {
    if (locked) return;
    const wood = woodDreidelCatalogItem(catalog);
    if (!wood) return;
    const next = topUpDreidelLines(lineItems, people, wood);
    if (next === lineItems) return;
    const woodQty = next.filter((li) => li.itemId === wood.id && (li.unitCents ?? 0) === 0).reduce((n, li) => n + li.quantity, 0);
    includedBaselineByItemId.current.set(wood.id, Math.max(includedBaselineByItemId.current.get(wood.id) ?? 0, woodQty));
    await persist(next);
  };

  /**
   * Put a donated item back (or `replacement` in its place). Prefers the exact lines
   * that were removed so gift/kid slots come back where they were.
   */
  const restoreDonated = async (itemId: string, replacement?: CatalogItem) => {
    if (locked) return;
    const item = catalog.find((c) => c.id === itemId);
    if (!item) return;
    const promotionUndo = !replacement
      ? takePromotedIncludedUndo(promotionUndos.current, itemId, lineItems)
      : undefined;
    if (promotionUndo) {
      transferIncludedBaselineOnSwap(
        includedBaselineByItemId.current,
        promotionUndo.promotedBefore.itemId,
        itemId,
        promotionUndo.movedQty,
        0
      );
      donatedLineSnapshots.current.delete(itemId);
      await persist(revertPromotedIncludedSwap(lineItems, promotionUndo));
      return;
    }
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
    const kidOf = (li: BoxLineItem | undefined) =>
      li && (isGiftSlotLine(li) || catalogSlotId(li.slotId) === 'story')
        ? li.childId || childIdFromSlot(li.slotId)
        : undefined;
    // A kid's book or present comes back in that kid's slot, never stacked on a sibling's copy.
    if (!replacement && freeLines[0] && !kidOf(freeLines[0])) {
      const target = freeLines[0];
      // Food-slot kits / cookie cutters hold quantity 1 — never stack "missing" onto them.
      // (Gelt in a food slot may be up to 3 Little Bags; household gelt may grow.)
      const foodKit =
        isFoodSlotLine(target) && !geltBagOf(target.itemId, target.label ?? '');
      if (!foodKit) {
        await persist(
          lineItems.map((li) =>
            li.slotId === target.slotId
              ? {
                  ...li,
                  quantity: (li.quantity ?? 1) + missing,
                  includedQty: Math.max(li.includedQty ?? 0, (li.quantity ?? 1) + missing),
                }
              : li
          )
        );
        return;
      }
    }
    const snapshot = donatedLineSnapshots.current.get(itemId) ?? [];
    const kidIds = children.map((c) => c.id);
    const claimTaken = !replacement && includedClaimAlreadyTaken(item, snapshot, lineItems, catalog, kidIds);
    const snapKid = kidOf(snapshot[0]);
    if (!replacement && !claimTaken && snapKid && kidIds.includes(snapKid)) {
      await (isGiftSlotLine(snapshot[0]!) ? setKidGift : setKidBook)(snapKid, item);
      donatedLineSnapshots.current.delete(itemId);
      return;
    }
    if (!replacement && !snapshot.length && !claimTaken) {
      await addFreeItemToEmptySlot(sectionId, item);
      return;
    }
    const target = replacement ?? item;
    const replacementUnit = replacement
      ? swapUnitCents(donatedSwapLine(item, snapshot[0]), item, replacement, { catalog, geltCeiling })
      : 0;
    if (replacementUnit === undefined) return modalAddToBox(replacement!);
    let unit = replacementUnit;
    if (claimTaken) unit = includedClaimBlockedUnitCents(target);
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
          ...(unit > 0 ? { includedQty: 0 } : null),
          curationNote: undefined,
          ...(replacement
            ? { displaySectionId: snapshot[0] && isGiftSlotLine(snapshot[0]) ? li.displaySectionId : targetSection }
            : null),
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
    boxCreditCents,
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
    geltCeiling,
    goToCheckout,
    grouped,
    guestNeedsOnboarding,
    guestViewOnly,
    handleToggleVote,
    hasPresentsChecklist,
    hasSessionEdits,
    people,
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
    addOnTopCents,
    topUpIncludedDreidels,
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
    preWrap,
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
    swapQuantityFor,
    swapToPreWrap,
    swapBackToPaper,
    toggleSurprise,
    upsellsBySection,
    user,
    visibleSectionIds,
    voteOptionsFor,
    wrapSelectedIds,
  };
}
