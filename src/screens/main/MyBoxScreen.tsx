import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../../hooks/useSession';
import { useActiveProfile } from '../../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY } from '../../constants/pilotFeatures';
import { useAuthStore } from '../../stores/authStore';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { useGuestBoxFlow } from '../../hooks/useGuestBoxFlow';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { getHanukkahConfig } from '../../services/firestore/config';
import { useEffectiveBoxLocked, usePreviewNow } from '../../hooks/useUserStatePreview';
import type { MainStackParamList } from '../../navigation/types';
import { startOwnBoxBuild } from '../../navigation/boxEntry';
import { useCatalog } from '../../hooks/useCatalog';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import {
  formatCatalogDollars,
  formatDollars,
  totalCents,
  catalogSlotId,
  chargeableLineTotal,
  repairExtraPerKidPricing,
  repairWoodDreidelIncluded,
} from '../../services/box/buildDefaultBox';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import {
  resolveSectionUpsellItems,
  resolveSwapOptionsForItem,
  resolveFreeSwapUnitCents,
  resolveFreeSlotAddOptions,
  resolveIncludedGiftOptions,
  kidPlannerAges,
  filterBooksForKidAges,
  catalogBookFitsKidAge,
} from '../../services/box/sectionUpsells';
import {
  resolveCatalogDisplayPrices,
  boxAddOnUnitCents,
  boxALaCarteRetailValueCents,
  EXTRA_FLAT_CENTS,
} from '../../services/box/pricing';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { BoxItemRow } from '../../components/box/BoxItemRow';
import { BoxProductModal } from '../../components/box/BoxProductModal';
import { BoxSlotVoteRow, WrappedGiftPlaceholder } from '../../components/box/BoxSlotVoteRow';
import { StickySectionNav } from '../../components/box/StickySectionNav';
import { BoxDetailToolbar } from '../../components/box/BoxDetailToolbar';
import { BoxDetailSectionBlock } from '../../components/box/BoxDetailSectionBlock';
import { PresentsWrappableList } from '../../components/box/PresentsWrappableList';
import {
  assignKidBookLines,
  assignKidGiftLines,
  childIdFromSlot,
  childNamesForLines,
  coalesceLinesByItemId,
  donatedMemberValueCents,
  formatBoxItemStatusMeta,
  fullCardLinesForSection,
  bookBadgeLabelForLines,
  giftBadgeLabelForLines,
  oneForBadgeLabelForLines,
  getCashDonationCents,
  withCashDonationCents,
  isGiftSlotLine,
  isWrapControlSlot,
  isWrappingPaperItem,
  kidsNeedingBook,
  kidsNeedingGift,
  removeCoalescedGroup,
  resolveBoxItemAttributionKind,
  seedIncludedBaselines,
  includedPracticeSlotVacant,
  uniqueSlotForFreeSectionAdd,
  wrappableLinesInBox,
  wrapControlLines,
} from '../../components/box/boxLineDisplay';
import { PerKidSlotAddBlock } from '../../components/box/PerKidSlotAddBlock';
import { BoxSummaryDonated } from '../../components/box/BoxSummaryDonated';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import {
  BOX_DISPLAY_SECTIONS,
  groupLineItemsByDisplaySection,
  nonEmptyDisplaySectionIds,
  displaySectionForCatalogItem,
  displaySectionForLineItem,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { GuestBoxAuthBanner } from '../../components/box/GuestBoxAuthBanner';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { defaultIsSurprise } from '../../constants/boxPracticeGroups';
import {
  buildVoter,
  isVotablePerKidSlot,
  isWrappableSlot,
  toggleSlotVote,
  topPickItemId,
} from '../../services/box/slotVotes';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { updatePilotBoxOrder } from '../../services/checkout/updatePilotBoxOrder';
import { useBoxDetailScroll } from '../../hooks/useBoxDetailScroll';
import { createBoxDetailStyles } from '../../components/box/boxDetailLayout';
import {
  spacing,
  typography,
  borderRadius,
  shadows,
  shadowsWeb,
  MOBILE_GUTTER,
  typeface,
} from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

/** Clearance under scroll content for the floating order-summary card. */
const SUMMARY_FLOAT_CLEARANCE = 140;

/**
 * Slot suffix for paid "extra" units added beyond a card's included baseline via the
 * quantity counter. Kept off the `extra-` prefix so the unit still displays/coalesces
 * onto its source card (grouping skips `extra-` lines).
 */
const EXTRA_UNIT_SUFFIX = '::x';

/** Stable compare of draft vs committed order lines (swaps / qty / wrap). */
function lineItemsFingerprint(items: BoxLineItem[]): string {
  return [...items]
    .map(
      (li) =>
        `${li.slotId}\0${li.itemId}\0${li.quantity}\0${li.unitCents}\0${li.isSurprise ? 1 : 0}\0${li.childId ?? ''}\0${li.displaySectionId ?? ''}`
    )
    .sort()
    .join('\n');
}

function notifyUser(title: string, body: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${body}`);
    return;
  }
  Alert.alert(title, body);
}

function formatCallableError(e: unknown): string {
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

export function MyBoxScreen() {
  const { colors } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { isDesktop, widePanelMaxWidth } = useWebLayout();
  const styles = useMemo(() => createMyBoxStyles(colors, isDesktop), [colors, isDesktop]);
  const detailStyles = useMemo(
    () => createBoxDetailStyles(colors, { desktop: isDesktop }),
    [colors, isDesktop],
  );
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { loading: sessionLoading, profile, household, refresh } = useSession();
  const user = useAuthStore((s) => s.user);
  const { isChildProfile, isParentProfile, activeChild } = useActiveProfile();
  const showKidBoxUi = isChildProfile && !PILOT_PARENT_ONLY;
  const { lineItems, slotVotes, sealedSectionIds, wrapSelectedItemIds, children, loading: draftLoading, persist, persistSlotVotes, persistWrapSelection } =
    useBoxDraft();
  const { guestNeedsOnboarding, guestViewOnly, requireAuthToCustomize } = useGuestBoxFlow();
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);

  usePublishRavSurface({ type: 'box', id: 'hanukkah-2026', label: 'Hanukkah 2026 Box' });

  const { items: catalog } = useCatalog();
  const [loading, setLoading] = useState(true);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [estimatedDeliveryBy, setEstimatedDeliveryBy] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [productModalItem, setProductModalItem] = useState<CatalogItem | null>(null);
  const [productModalSection, setProductModalSection] = useState<BoxDisplaySectionId | null>(
    null
  );
  const now = usePreviewNow();
  const locked = useEffectiveBoxLocked(lockAt);
  const { cardOnFile, openOrder, guardMutation, refreshOrders } = usePaymentGate();

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
    if (guestNeedsOnboarding) {
      startBuildBox();
    }
  }, [guestNeedsOnboarding, startBuildBox]);

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

  const { scrollRef, contentRef, activeSection, registerSection, onSectionLayout, onScroll, scrollToSection } =
    useBoxDetailScroll({ visibleSectionIds });

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
    }
    await persist(removeCoalescedGroup(lineItems, group));
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
      const price = resolveCatalogDisplayPrices(item).memberCents;
      if (!guestViewOnly && price > 0 && !guardMutation()) return;
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
      navigation.navigate('Orders');
      return;
    }
    navigation.navigate('Checkout');
  };

  const canUpdateCommittedOrder =
    !!openOrder &&
    (openOrder.status === 'committed' || openOrder.status === 'pending') &&
    !locked;

  const orderDirty = useMemo(() => {
    if (!canUpdateCommittedOrder || !openOrder) return false;
    return lineItemsFingerprint(lineItems) !== lineItemsFingerprint(openOrder.lineItems ?? []);
  }, [canUpdateCommittedOrder, openOrder, lineItems]);

  const committedSubtotalCents = useMemo(() => {
    if (!openOrder) return 0;
    if (typeof openOrder.subtotalCents === 'number') return openOrder.subtotalCents;
    return totalCents(openOrder.lineItems ?? [], boxPriceCents);
  }, [openOrder, boxPriceCents]);

  const orderDeltaCents = useMemo(() => {
    if (!orderDirty) return 0;
    return totalCents(lineItems, boxPriceCents) - committedSubtotalCents;
  }, [orderDirty, lineItems, boxPriceCents, committedSubtotalCents]);

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
    if (!openOrder || !orderDirty || savingOrder) return;
    await persist(
      (openOrder.lineItems ?? []).map((li) => ({
        ...li,
        quantity: li.quantity ?? 1,
      }))
    );
  };

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
    // This claim is the included allotment for the section — track so a later donate counts.
    const markIncludedBaseline = () => {
      includedBaselineByItemId.current.set(
        item.id,
        Math.max(includedBaselineByItemId.current.get(item.id) ?? 0, 1)
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
            quantity: 1,
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
        quantity: 1,
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
      const limit = section.id === 'story' ? 48 : 8;
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
      const limit = section.id === 'story' ? 48 : 8;
      const raw = resolveFreeSlotAddOptions(section.id, catalog, limit);
      map[section.id] =
        section.id === 'story' ? filterBooksForKidAges(raw, ages, 8) : raw;
    }
    return map;
  }, [catalog, children]);

  /** Included-policy swap targets per section — drives “$X or swap” on Add more tiles. */
  const swapEligibleIdsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, Set<string>>;
    for (const section of BOX_DISPLAY_SECTIONS) {
      map[section.id] = new Set(
        resolveFreeSlotAddOptions(section.id, catalog, 64).map((i) => i.id)
      );
    }
    return map;
  }, [catalog]);

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
    await persist(assignKidGiftLines(lineItems, childId, item));
    if (!opts?.reveal) return;
    const target = displaySectionForCatalogItem(item);
    // From “Add a gift for …” picker — scroll to where the gift landed.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToSection(target));
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
      requestAnimationFrame(() => scrollToSection('story'));
    });
  };

  const renderSection = (sectionId: BoxDisplaySectionId, isLast = false) => {
    const rawItems = grouped[sectionId] ?? [];
    const isPresents = sectionId === 'presents';
    const cardItems = fullCardLinesForSection(sectionId, rawItems);
    const coalesced = coalesceLinesByItemId(cardItems);
    const showPresentsChecklist = isPresents && !isChildProfile && hasPresentsChecklist;

    if (isChildProfile && !rawItems.length && sectionId !== 'presents') return null;
    // Parent view: an empty section stays visible with a free-add placeholder
    // instead of disappearing (see `emptySectionAddOptions` below).
    const isEmpty = !coalesced.length && !showPresentsChecklist && !isChildProfile;

    const sectionSealed = sealedSectionIds?.includes(sectionId) ?? false;
    const showUpsells = !isChildProfile && !sectionSealed && !locked;

    // Per-kid "add a gift/book" affordances: gifts in Give Presents, books in Tell the Story.
    const showKidAddCtas = !isChildProfile && !sectionSealed && !locked;
    const kidGiftNeeds =
      showKidAddCtas && sectionId === 'presents' ? kidsNeedingGift(lineItems, children) : [];
    /** Any section: kids missing a gift can claim eligible cards already in the box. */
    const claimGiftNeeds =
      showKidAddCtas && !isChildProfile ? kidsNeedingGift(lineItems, children) : [];
    const kidBookNeeds =
      showKidAddCtas && sectionId === 'story' ? kidsNeedingBook(lineItems, children) : [];
    const kidName = (child: (typeof children)[number]) => child.name?.trim() || 'your kid';
    const kidAddBlocks =
      kidGiftNeeds.length || kidBookNeeds.length ? (
        <View style={styles.kidAddBlocks}>
          {kidGiftNeeds.map(({ child, reason }) => (
            <PerKidSlotAddBlock
              key={`gift-need-${child.id}`}
              title={`Add a gift for ${kidName(child)}`}
              note={
                reason === 'donated'
                  ? `${kidName(child)}’s gift was donated or removed. Add something else at no additional cost.`
                  : `${kidName(child)}’s gift repeats another item — pick something special.`
              }
              items={includedGiftOptions}
              onPressItem={(item) => void setKidGift(child.id, item, { reveal: true })}
            />
          ))}
          {kidBookNeeds.map((child) => (
            <PerKidSlotAddBlock
              key={`book-need-${child.id}`}
              title={`Add a book for ${kidName(child)}`}
              note={`${kidName(child)}’s book was donated — pick one to add it back.`}
              items={(freeAddOptionsBySection.story ?? []).filter((item) =>
                catalogBookFitsKidAge(
                  item,
                  kidPlannerAges([child])[0] ?? 0
                )
              )}
              onPressItem={(item) => void setKidBook(child.id, item, { reveal: true })}
            />
          ))}
        </View>
      ) : null;

    // Empty section OR donated practice slot: included options restore at $0.
    const practiceVacant = includedPracticeSlotVacant(sectionId, lineItems);
    const freeAddOptions =
      isEmpty || practiceVacant ? freeAddOptionsBySection[sectionId] ?? [] : [];
    const freeAddIds = new Set(freeAddOptions.map((i) => i.id));
    const emptyRailItems = isEmpty
      ? [
          ...freeAddOptions,
          ...(upsellsBySection[sectionId] ?? []).filter((i) => !freeAddIds.has(i.id)),
        ]
      : [];

    const handleUpsellPress = (item: CatalogItem) => {
      // Free (included/default) taps restore the donated practice slot at $0.
      if (freeAddIds.has(item.id) && (isEmpty || practiceVacant)) {
        void addFreeItemToEmptySlot(sectionId, item);
        return;
      }
      onUpsellPress(item, sectionId);
    };

    return (
      <BoxDetailSectionBlock
        key={sectionId}
        sectionId={sectionId}
        onLayout={onSectionLayout(sectionId)}
        onSectionRef={registerSection}
        isLast={isLast}
        emptySection={isEmpty}
        showUpsells={showUpsells}
        upsellItems={
          showUpsells ? (isEmpty ? emptyRailItems : upsellsBySection[sectionId]) : undefined
        }
        upsellLabel={isEmpty ? 'Add items' : undefined}
        upsellIncludedItemIds={freeAddIds.size ? freeAddIds : undefined}
        upsellSwapEligibleItemIds={swapEligibleIdsBySection[sectionId]}
        childrenProfiles={children}
        onUpsellPress={showUpsells ? handleUpsellPress : undefined}
        trailing={
          showPresentsChecklist || kidAddBlocks ? (
            <View style={styles.presentsTrailingStack}>
              {kidAddBlocks}
              {showPresentsChecklist ? (
                <PresentsWrappableList
                  lineItems={lineItems}
                  catalog={catalog}
                  childrenProfiles={children}
                  selectedItemIds={wrapSelectedIds}
                  locked={locked}
                  onToggleWrapSelection={
                    locked
                      ? undefined
                      : (itemId) => {
                          const next = new Set(wrapSelectedIds);
                          if (next.has(itemId)) next.delete(itemId);
                          else next.add(itemId);
                          void persistWrapSelection([...next]);
                        }
                  }
                />
              ) : null}
            </View>
          ) : null
        }
      >
        {coalesced.map((group) => {
          const li = group.primary;
          const item = catalog.find((c) => c.id === li.itemId);
          const names = childNamesForLines(group.lines, children);
          const giftBadge = giftBadgeLabelForLines(group.lines, children);
          const bookBadge = bookBadgeLabelForLines(group.lines, children);
          const oneForBadge = oneForBadgeLabelForLines(group.lines, children);
          const imageBadge = giftBadge ?? bookBadge ?? oneForBadge;
          const isGiftGroup = group.lines.some((line) => isGiftSlotLine(line));
          const isPracticeDreidelCard = group.lines.some((line) =>
            ['wood-dreidel', 'blank-dreidel', 'airdry-dreidel'].includes(catalogSlotId(line.slotId))
          );
          const isBookCard =
            group.lines.some((line) => catalogSlotId(line.slotId) === 'story') ||
            item?.category === 'Book' ||
            item?.slotId === 'story';
          // Never claim practice dreidels/candles as a kid's gift — they're practice sets/kits.
          const claimGiftChips =
            !imageBadge &&
            !isGiftGroup &&
            !isPracticeDreidelCard &&
            catalogSlotId(li.slotId) !== 'candles' &&
            item &&
            includedGiftIds.has(item.id) &&
            claimGiftNeeds.length
              ? claimGiftNeeds.map(({ child }) => ({
                  label: `Make this ${kidName(child)}’s included gift`,
                  onPress: () => void setKidGift(child.id, item),
                }))
              : undefined;
          const claimBookChips =
            sectionId === 'story' &&
            !imageBadge &&
            isBookCard &&
            item &&
            kidBookNeeds.length
              ? kidBookNeeds.map((child) => ({
                  label: `Make this ${kidName(child)}’s included book`,
                  onPress: () => void setKidBook(child.id, item),
                }))
              : undefined;
          const claimChips = [...(claimGiftChips ?? []), ...(claimBookChips ?? [])];
          const memberValueCents = item
            ? resolveCatalogDisplayPrices(item).memberCents
            : 0;
          const presentMeta = formatBoxItemStatusMeta(
            group.unitCents,
            names,
            formatCatalogDollars,
            memberValueCents,
            resolveBoxItemAttributionKind(group.lines, item),
            group.quantity,
            group.includedQuantity
          );
          const wrapped =
            isChildProfile &&
            isWrappableSlot(li.slotId) &&
            !!(li.isSurprise ?? defaultIsSurprise(li.slotId));
          const showChildWrapped = wrapped;
          const showVotes =
            !PILOT_PARENT_ONLY &&
            group.lines.some((line) => isVotablePerKidSlot(line.slotId)) &&
            (!showKidBoxUi || group.lines.some((line) => line.childId === activeChild?.id)) &&
            !(showKidBoxUi && showChildWrapped);

          if (isChildProfile && !group.lines.some((line) => line.childId === activeChild?.id)) {
            return null;
          }
          if (
            isChildProfile &&
            !group.lines.some((line) => isVotablePerKidSlot(line.slotId))
          ) {
            return null;
          }

          const voteLine =
            group.lines.find(
              (line) =>
                isVotablePerKidSlot(line.slotId) &&
                (!showKidBoxUi || line.childId === activeChild?.id)
            ) ?? li;

          const isWrappingPaper =
            isWrapControlSlot(li.slotId) &&
            (catalogSlotId(li.slotId) === 'wrapping-paper' ||
              catalogSlotId(li.slotId) === 'wrapping' ||
              /wrapping.?paper/i.test(`${li.itemId} ${li.label ?? ''} ${item?.name ?? ''}`));

          return (
            <View key={group.key}>
              {showChildWrapped ? (
                <WrappedGiftPlaceholder />
              ) : (
                <>
                  {!isChildProfile ? (
                    <BoxItemRow
                      li={li}
                      item={item}
                      meta={presentMeta}
                      note={group.note ?? li.curationNote}
                      imageBadge={imageBadge}
                      claimGiftChips={claimChips.length ? claimChips : undefined}
                      locked={locked || sectionSealed}
                      swapOptions={
                        group.unitCents > 0 ? [] : (swapOptionsBySlot[li.slotId] ?? [])
                      }
                      onSwap={(opt) =>
                        void applySwap(
                          group.lines.map((line) => line.slotId),
                          opt
                        )
                      }
                      swapLabel={isWrappingPaper ? 'pre-wrap presents instead' : undefined}
                      onPrimarySwapAction={
                        isWrappingPaper && group.unitCents === 0
                          ? () =>
                              void swapToPreWrap(group.lines.map((line) => line.slotId))
                          : undefined
                      }
                      onToggleSurprise={
                        !PILOT_PARENT_ONLY && isParentProfile && isWrappableSlot(li.slotId)
                          ? () => void toggleSurprise(li.slotId)
                          : undefined
                      }
                      onSetKeepOrToss={(value) => void setKeepOrToss(li.slotId, value)}
                      quantity={group.quantity}
                      decrementMode={group.unitCents === 0 ? 'donate' : 'remove'}
                      {...(isWrappingPaper
                        ? { onRemove: () => void removeCoalesced(group) }
                        : {
                            onQuantityChange: (delta) =>
                              void changeBoxQuantity(group, delta, sectionId),
                          })}
                      onOpenProduct={() => openProduct(li.itemId, sectionId)}
                      formatPrice={formatDollars}
                    />
                  ) : (
                    <View style={styles.childItemHeader}>
                      <Text style={styles.childItemTitle}>
                        {item?.name ?? li.label ?? 'Your pick'}
                      </Text>
                      {presentMeta ? (
                        <Text style={styles.childItemMeta}>{presentMeta}</Text>
                      ) : null}
                    </View>
                  )}
                  {showVotes ? (
                    <BoxSlotVoteRow
                      slotId={voteLine.slotId}
                      slotVotes={slotVotes}
                      options={voteOptionsFor(voteLine)}
                      currentItemId={voteLine.itemId}
                      currentVoterId={currentVoterId}
                      onToggleVote={(itemId) => void handleToggleVote(voteLine.slotId, itemId)}
                      topPickItemId={
                        isParentProfile ? topPickItemId(slotVotes, voteLine.slotId) : null
                      }
                      topPickItemName={
                        isParentProfile
                          ? catalog.find(
                              (c) => c.id === topPickItemId(slotVotes, voteLine.slotId)
                            )?.name
                          : undefined
                      }
                      onApplyTopPick={
                        isParentProfile && !locked && !guestViewOnly
                          ? () => {
                              const pickId = topPickItemId(slotVotes, voteLine.slotId);
                              const pick = catalog.find((c) => c.id === pickId);
                              if (pick) {
                                void applySwap(
                                  group.lines.map((line) => line.slotId),
                                  pick
                                );
                              }
                            }
                          : undefined
                      }
                    />
                  ) : null}
                </>
              )}
            </View>
          );
        })}
      </BoxDetailSectionBlock>
    );
  };

  if (sessionLoading || loading || draftLoading || guestNeedsOnboarding) {
    return (
      <StorefrontChrome bodyMode="fill" hideServicesNav hideSearchAndRav>
        <View style={styles.centered}>
          <BrandLoadingMark color={colors.brand} />
        </View>
      </StorefrontChrome>
    );
  }

  const hasOwnBox = lineItems.length > 0 || !!openOrder;
  if (user && !guestViewOnly && !hasOwnBox) {
    return (
      <StorefrontChrome bodyMode="fill" hideServicesNav hideSearchAndRav>
        <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
          <View style={[styles.centered, styles.emptyOwnBox]}>
            <Text style={styles.emptyOwnBoxTitle}>You don&apos;t have a box yet</Text>
            <Text style={styles.emptyOwnBoxBody}>
              Gifts you send live under Orders. Start here when you&apos;re ready to build a Hanukkah
              box for your household.
            </Text>
            <TouchableOpacity
              style={styles.emptyOwnBoxCta}
              onPress={() => {
                void startOwnBoxBuild(refresh);
              }}
            >
              <Text style={styles.emptyOwnBoxCtaText}>Build your box</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.emptyOwnBoxLink}
              onPress={() => navigation.navigate('StorefrontHome')}
            >
              <Text style={styles.emptyOwnBoxLinkText}>Browse the store</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.emptyOwnBoxLink} onPress={() => navigation.navigate('Orders')}>
              <Text style={styles.emptyOwnBoxLinkText}>View your orders</Text>
            </TouchableOpacity>
          </View>
        </WebContentPanel>
      </StorefrontChrome>
    );
  }

  const subtotal = totalCents(lineItems, boxPriceCents);
  const kidsCount = Math.max(1, children.length);
  const cashDonationCents = getCashDonationCents(lineItems);
  const chargeableAddOns = Math.max(0, chargeableLineTotal(lineItems) - cashDonationCents);
  // Seed / raise baselines from current free lines, then roll up donated member value.
  seedIncludedBaselines(lineItems, includedBaselineByItemId.current);
  const donatedCents = donatedMemberValueCents(
    lineItems,
    catalog,
    includedBaselineByItemId.current,
    { wrapSelectedCount: wrapSelectedIds.size }
  );
  const retailValueCents = boxALaCarteRetailValueCents(lineItems, catalog);
  const setCashDonation = async (cents: number) => {
    if (locked || guestViewOnly) return;
    if (cents > 0 && !guardMutation()) return;
    await persist(withCashDonationCents(lineItems, cents));
  };
  // Everything paid beyond the base box rolls into one “Add-ons” line.

  const lockBanner = locked && lockAt ? (
    <Text style={[styles.lockBanner, styles.lockBannerClosed]}>
      Customization closed. Contact support to change your box.
    </Text>
  ) : null;

  const parentScrollHeader = (
    <>
      <BoxDetailToolbar
        lockAt={lockAt}
        now={now}
        hideBack
        title="Your Hanukkah Box"
        startsOn={startsOn}
        estimatedDeliveryBy={estimatedDeliveryBy}
        align="center"
        calendarVariant="inlineLink"
      />
      {!guestViewOnly && lockBanner ? (
        <View style={detailStyles.headerExtras}>{lockBanner}</View>
      ) : null}
    </>
  );

  const kidScrollHeader = (
    <View style={styles.pageHeader}>
      <Text style={styles.title}>{`${activeChild?.name?.trim() || 'Your'} picks`}</Text>
      <Text style={styles.headerMeta}>Tap 👍 on what you like — a grown-up picks at checkout</Text>
    </View>
  );

  const scrollHeader = isChildProfile ? kidScrollHeader : parentScrollHeader;

  const sections = visibleSectionIds.map((id, index) =>
    renderSection(id, index === visibleSectionIds.length - 1),
  );

  const showSummaryFloat = !isChildProfile;
  /** Desktop: float above the home indicator. Mobile: flush + 1px overhang to kill hairline seams. */
  const floatBottom = isDesktop ? Math.max(insets.bottom, spacing.md) : -1;
  const summaryBottomPad = isDesktop ? spacing.sm : spacing.sm + insets.bottom + 1;

  const summaryPanel = (
    <View
      style={[
        styles.summaryCard,
        { paddingBottom: summaryBottomPad },
        isDesktop
          ? Platform.OS === 'web'
            ? { boxShadow: shadowsWeb.md }
            : shadows.md
          : null,
      ]}
    >
      <View style={styles.summaryBreakdown}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>
            {kidsCount === 1 ? 'Base box (1 kid)' : `Base box (${kidsCount} kids)`}
          </Text>
          <Text style={styles.summaryValue}>{formatCatalogDollars(boxPriceCents)}</Text>
        </View>
        {chargeableAddOns > 0 ? (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Add-ons</Text>
            <Text style={styles.summaryValue}>{formatCatalogDollars(chargeableAddOns)}</Text>
          </View>
        ) : null}
        {donatedCents > 0 || cashDonationCents > 0 ? (
          <BoxSummaryDonated
            cents={donatedCents}
            cashDonationCents={cashDonationCents}
            onCashDonationChange={
              locked || guestViewOnly ? undefined : (cents) => void setCashDonation(cents)
            }
            labelStyle={styles.summaryLabel}
            valueStyle={styles.summaryDonatedValue}
            itemStyle={styles.summaryItem}
          />
        ) : null}
        <View style={styles.summaryTotalItem}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCatalogDollars(subtotal)}</Text>
          {retailValueCents > 0 ? (
            <Text style={styles.summaryRetailValue}>
              ({formatCatalogDollars(retailValueCents)} value)
            </Text>
          ) : null}
          {guestViewOnly ? <GuestBoxAuthBanner /> : null}
        </View>
        {orderDirty && orderDeltaCents !== 0 ? (
          <Text style={styles.orderDeltaCopy} accessibilityRole="summary">
            {orderDeltaCents > 0
              ? `This update adds ${formatDollars(orderDeltaCents)} to your box. You’ll be charged the new total when it ships.`
              : `This update reduces your box by ${formatDollars(Math.abs(orderDeltaCents))}. You’ll be charged the new total when it ships.`}
          </Text>
        ) : null}
        {guestViewOnly ? (
          <View style={styles.summaryCtaRow}>
            <Pressable
              style={({ pressed, hovered }) => [
                styles.checkoutCta,
                styles.guestPrimaryCta,
                (hovered || pressed) && styles.checkoutCtaHover,
              ]}
              onPress={() => requireAuthToCustomize('signup')}
              accessibilityRole="button"
            >
              {({ pressed, hovered }) => (
                <Text
                  style={[
                    styles.checkoutText,
                    (hovered || pressed) && styles.checkoutTextHover,
                  ]}
                >
                  Sign up
                </Text>
              )}
            </Pressable>
            <TouchableOpacity
              onPress={() => requireAuthToCustomize('signin')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.guestSignIn}>Sign in</Text>
            </TouchableOpacity>
          </View>
        ) : orderDirty ? (
          <View style={styles.summaryCtaRow}>
            <TouchableOpacity
              onPress={() => void discardOrderChanges()}
              disabled={savingOrder}
              accessibilityRole="button"
              accessibilityLabel="Cancel changes"
              hitSlop={8}
            >
              <Text style={[styles.guestSignIn, savingOrder && styles.checkoutCtaDisabled]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <Pressable
              style={({ pressed, hovered }) => [
                styles.checkoutCta,
                styles.guestPrimaryCta,
                (hovered || pressed) && styles.checkoutCtaHover,
                (savingOrder || locked) && styles.checkoutCtaDisabled,
              ]}
              onPress={() => void saveOrderUpdates()}
              disabled={savingOrder || locked}
              accessibilityRole="button"
            >
              {({ pressed, hovered }) => (
                <Text
                  style={[
                    styles.checkoutText,
                    (hovered || pressed) && styles.checkoutTextHover,
                  ]}
                >
                  {savingOrder ? 'Saving…' : 'Save and update box'}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.summaryCtaRow}>
            <Pressable
              style={({ pressed, hovered }) => [
                styles.checkoutCta,
                (hovered || pressed) && styles.checkoutCtaHover,
                !openOrder && locked && styles.checkoutCtaDisabled,
              ]}
              onPress={goToCheckout}
              disabled={openOrder ? false : locked || lineItems.length === 0}
              accessibilityRole="button"
            >
              {({ pressed, hovered }) => (
                <Text
                  style={[
                    styles.checkoutText,
                    (hovered || pressed) && styles.checkoutTextHover,
                  ]}
                >
                  {openOrder
                    ? 'View order status'
                    : cardOnFile
                      ? 'Review shipping'
                      : 'Add payment & shipping'}
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );

  const kidEmptyState =
    isChildProfile && (kidVotableSlots.length === 0 || kidAllWrapped) ? (
      <View style={styles.kidEmptyCard}>
        <Text style={styles.kidEmptyTitle}>
          {kidAllWrapped ? 'All your gifts are wrapped surprises!' : 'Nothing to vote on yet'}
        </Text>
        <Text style={styles.kidEmptyBody}>
          {kidAllWrapped
            ? 'A grown-up wrapped your gifts — you\'ll see them on Hanukkah!'
            : 'Ask a grown-up to add your stories and gifts to the box.'}
        </Text>
      </View>
    ) : null;

  const scrollBody = (
    <>
      {scrollHeader}
      {kidEmptyState}
      {kidEmptyState ? null : sections}
    </>
  );

  // `null` keeps primary services nav and omits the category bar; a node
  // replaces only the black secondary bar with practice section links.
  const servicesSlot =
    !isChildProfile && visibleSectionIds.length > 0 ? (
      <StickySectionNav
        activeSection={activeSection}
        onSelect={scrollToSection}
        sectionIds={visibleSectionIds}
        variant="services"
      />
    ) : null;

  return (
    <StorefrontChrome bodyMode="fill" hideSearchAndRav servicesSlot={servicesSlot}>
      <View style={styles.pageRoot}>
        <WebContentPanel
          flush
          centerDesktop
          omitDesktopTopPadding
          gutter={!isDesktop}
          style={styles.panel}
        >
          <View
            style={[
              styles.scrollHost,
              // Constrain the scrollport (not an inner shell) so the scrollbar sits
              // on the content column edge instead of floating in the side margin.
              isDesktop
                ? { maxWidth: widePanelMaxWidth, width: '100%', alignSelf: 'center' }
                : null,
            ]}
            testID="box-scroll-host"
          >
            <ScrollView
              ref={scrollRef}
              style={[styles.root, isDesktop && styles.desktopRoot]}
              contentContainerStyle={[
                isDesktop ? styles.desktopScrollContent : detailStyles.scrollContent,
                showSummaryFloat
                  ? {
                      paddingBottom:
                        SUMMARY_FLOAT_CLEARANCE +
                        (isDesktop ? floatBottom : insets.bottom),
                    }
                  : null,
              ]}
              onScroll={onScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              {...(Platform.OS === 'web'
                ? ({ className: 'gj-box-scroll', testID: 'box-vertical-scroll' } as object)
                : null)}
            >
              <View
                style={isDesktop ? styles.desktopShell : undefined}
                ref={contentRef}
                collapsable={false}
              >
                {scrollBody}
              </View>
            </ScrollView>
          </View>
        </WebContentPanel>
        {showSummaryFloat ? (
          <View
            style={[styles.summaryFloat, { bottom: floatBottom }]}
            pointerEvents="box-none"
            testID="box-order-summary-float"
          >
            <View style={styles.summaryFloatInner}>
              {summaryPanel}
            </View>
          </View>
        ) : null}
      </View>
      <BoxProductModal
        visible={!!productModalItem}
        item={productModalItem}
        catalog={catalog}
        lineItems={lineItems}
        context="ownBox"
        fromSection={productModalSection}
        locked={locked || guestViewOnly}
        onClose={() => {
          setProductModalItem(null);
          setProductModalSection(null);
        }}
        onSelectItem={setProductModalItem}
        onAdd={modalAddToBox}
        onSwap={modalSwapIntoBox}
        onRemove={modalRemoveFromBox}
      />
    </StorefrontChrome>
  );
}

function createMyBoxStyles(colors: SemanticColors, isDesktop = false) {
  return StyleSheet.create({
  pageRoot: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.bgPrimary,
  },
  root: { flex: 1, flexBasis: 0, minHeight: 0, backgroundColor: colors.bgPrimary },
  panel: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: colors.bgPrimary,
    ...(Platform.OS === 'web' ? ({ overflow: 'hidden' as const } as object) : null),
  },
  scrollHost: {
    flex: 1,
    flexBasis: 0,
    width: '100%',
    minHeight: 0,
    overflow: 'hidden' as const,
    ...(Platform.OS === 'web' ? ({ height: '100%' } as object) : null),
  },
  desktopRoot: {
    flex: 1,
    flexBasis: 0,
    width: '100%',
    minHeight: 0,
    backgroundColor: colors.bgPrimary,
  },
  desktopScrollContent: {
    flexGrow: 1,
    paddingBottom: SUMMARY_FLOAT_CLEARANCE,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
  },
  desktopShell: {
    width: '100%',
    alignSelf: 'center',
    // Title top gap comes from toolbar paddingTop (equal to lock→divider / divider→section).
    paddingTop: 0,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyOwnBox: {
    padding: spacing.lg,
    maxWidth: 420,
    alignSelf: 'center',
  },
  emptyOwnBoxTitle: {
    fontSize: typography.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyOwnBoxBody: {
    marginTop: spacing.sm,
    fontSize: typography.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyOwnBoxCta: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    backgroundColor: colors.logoDark,
  },
  emptyOwnBoxCtaText: {
    color: colors.bgPrimary,
    fontWeight: '700',
    fontSize: typography.md,
  },
  emptyOwnBoxLink: { marginTop: spacing.md },
  emptyOwnBoxLinkText: {
    color: colors.brand,
    fontWeight: '600',
    fontSize: typography.md,
  },
  pageHeader: { alignItems: 'center', marginBottom: spacing.sm },
  title: { fontSize: typography.titleLg, fontWeight: '600', textAlign: 'center' },
  headerMeta: { fontSize: typography.sm, color: colors.goldMuted, marginTop: 4, textAlign: 'center' },
  kidEmptyCard: {
    marginHorizontal: MOBILE_GUTTER,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.bgElevated,
  },
  kidEmptyTitle: { fontSize: typography.xl, fontWeight: '700', color: colors.textPrimary },
  kidEmptyBody: {
    fontSize: typography.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  kidAddBlocks: { width: '100%', gap: spacing.md, marginTop: spacing.lg },
  /** Space between “Add a gift for…” rails and “Wrappable in this box”. */
  presentsTrailingStack: { width: '100%', gap: spacing.xl },
  childItemHeader: { paddingVertical: spacing.sm },
  childItemTitle: { fontSize: typography.lg, fontWeight: '700', color: colors.textPrimary },
  childItemMeta: { fontSize: typography.sm, color: colors.goldMuted, marginTop: 2 },
  lockBanner: {
    backgroundColor: colors.brandLight,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    fontSize: typography.md,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  lockBannerClosed: { color: colors.textPrimary, fontWeight: '600' },
  summaryFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: isDesktop ? spacing.lg : 0,
    zIndex: 30,
  },
  summaryFloatInner: {
    width: '100%',
    maxWidth: isDesktop ? 960 : undefined,
    paddingHorizontal: 0,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: '#000000',
    borderRadius: isDesktop ? 12 : 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    // Mobile: no top hairline — it reads as a seam over scrolling product.
    borderWidth: isDesktop ? StyleSheet.hairlineWidth : 0,
    borderColor: colors.goldMuted,
  },
  summaryBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    // Mobile: center Base/Total as a group; CTA takes the next full-width row.
    justifyContent: isDesktop ? 'flex-start' : 'center',
    gap: spacing.sm,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  summaryLabel: {
    fontSize: typography.sm,
    color: colors.goldMuted,
    ...typeface('medium'),
    letterSpacing: -0.22,
  },
  summaryValue: {
    fontSize: typography.titleLg,
    color: colors.textInverse,
    ...typeface('light'),
    letterSpacing: -0.32,
  },
  summaryDonatedValue: {
    fontSize: typography.titleLg,
    color: colors.brand,
    ...typeface('light'),
    letterSpacing: -0.32,
  },
  summaryTotalItem: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
    // Don’t grow on mobile — keeps Base | Total centered as a compact group.
    flexGrow: 0,
    paddingLeft: spacing.xs,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.goldMuted,
    minWidth: 0,
  },
  totalLabel: {
    fontSize: typography.titleLg,
    color: colors.textInverse,
    ...typeface('light'),
    letterSpacing: -0.32,
  },
  totalValue: {
    fontSize: typography.titleLg,
    color: colors.brand,
    ...typeface('light'),
    letterSpacing: -0.32,
  },
  summaryRetailValue: {
    fontSize: typography.sm,
    color: colors.goldMuted,
    ...typeface('medium'),
    letterSpacing: -0.22,
    opacity: 0.6,
  },
  summaryCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: isDesktop ? 'flex-end' : 'center',
    gap: spacing.sm,
    flexShrink: 0,
    ...(isDesktop
      ? { marginLeft: 'auto' }
      : { width: '100%' as const, marginTop: spacing.xs }),
  },
  orderDeltaCopy: {
    // Full-width note — forces a second row only when this copy is present.
    width: '100%',
    fontSize: typography.sm,
    lineHeight: 18,
    color: colors.goldMuted,
    letterSpacing: -0.22,
    marginTop: spacing.xs,
  },
  guestPrimaryCta: {
    marginLeft: 0,
  },
  guestSignIn: {
    fontSize: typography.sm,
    color: colors.goldMuted,
    ...typeface('medium'),
    letterSpacing: -0.22,
  },
  checkoutCta: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.brand,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          transitionProperty: 'background-color, border-color',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-in-out',
        } as object)
      : null),
  },
  checkoutCtaHover: {
    backgroundColor: colors.brand,
  },
  checkoutCtaDisabled: { opacity: 0.5 },
  checkoutText: {
    ...typeface('light'),
    fontSize: typography.titleLg,
    color: colors.brand,
    letterSpacing: -0.32,
    textAlign: 'center',
    ...(Platform.OS === 'web'
      ? ({
          transitionProperty: 'color',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-in-out',
        } as object)
      : null),
  },
  checkoutTextHover: { color: colors.logoDark },
  });
}
