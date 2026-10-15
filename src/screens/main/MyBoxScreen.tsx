import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { PILOT_PARENT_ONLY } from '../../constants/pilotFeatures';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useSession } from '../../hooks/useSession';
import { prefetchPartnerInvites } from '../../services/account/accountPrefetch';
import { warmBoxCheckout } from '../../services/checkout/checkoutPrefetch';
import { editUntilLockNote } from '../../services/hanukkah/dates';
import type { MainStackParamList } from '../../navigation/types';
import { swapNoticeText } from '../../services/box/soldOutReconcile';
import { resolveByDefaultSlot, WRAP_POLICY } from '../../services/box/boxRules';
import {
  formatCatalogDollars,
  formatDollars,
  totalCents,
  catalogSlotId,
  chargeableLineTotal,
  woodDreidelCatalogItem,
} from '../../services/box/buildDefaultBox';
import { auditIncluded, geltBagOf, includedCountLabel, type SectionCount } from '../../services/box/includedAudit';
import { isPilotLine, PILOT_PICK_META } from '../../services/box/pilotLines';
import { discountCentsForTerms } from '../../services/promo/promoPricing';
import { kidPlannerAges, catalogBookFitsKidAge, orderGiftOptionsForAge } from '../../services/box/sectionUpsells';
import {
  resolveCatalogDisplayPrices,
  boxALaCarteRetailValueCents,
  EXTRA_FLAT_CENTS,
} from '../../services/box/pricing';
import type { CatalogItem } from '../../types/pilot';
import { BoxItemRow } from '../../components/box/BoxItemRow';
import { BoxProductModal } from '../../components/box/BoxProductModal';
import { SwapIntoBoxModal, swapTitleForItem } from '../../components/storefront/SwapIntoBoxModal';
import { BoxSlotVoteRow, WrappedGiftPlaceholder } from '../../components/box/BoxSlotVoteRow';
import { StickySectionNav } from '../../components/box/StickySectionNav';
import { BoxDetailToolbar } from '../../components/box/BoxDetailToolbar';
import { BoxDetailSectionBlock } from '../../components/box/BoxDetailSectionBlock';
import { PresentsWrappableList } from '../../components/box/PresentsWrappableList';
import { BoxSummaryList } from '../../components/box/BoxSummaryList';
import {
  childNamesForLines,
  coalesceLinesByItemId,
  donatedMemberValueCents,
  formatBoxItemStatusMeta,
  fullCardLinesForSection,
  bookBadgeLabelForLines,
  giftBadgeLabelForLines,
  oneForBadgeLabelForLines,
  getCashDonationCents,
  isGiftSlotLine,
  isWrapControlSlot,
  isWrappingPaperItem,
  kidsNeedingBook,
  kidsNeedingGift,
  resolveBoxItemAttributionKind,
  seedIncludedBaselines,
  includedPracticeSlotVacant,
  syncWrappingPaperUnitCentsForWrapSelection,
} from '../../components/box/boxLineDisplay';
import { PerKidSlotAddBlock } from '../../components/box/PerKidSlotAddBlock';
import { BoxSummaryDonated } from '../../components/box/BoxSummaryDonated';
import { DonatedItemsModal } from '../../components/box/DonatedItemsModal';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { SystemChip } from '../../components/layout/SystemPage';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import {
  displaySectionForCatalogItem,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { GuestBoxAuthBanner } from '../../components/box/GuestBoxAuthBanner';
import { PilotReturnBanner } from '../../components/pilot/PilotReturnBanner';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { defaultIsSurprise } from '../../constants/boxPracticeGroups';
import { isVotablePerKidSlot, isWrappableSlot, topPickItemId } from '../../services/box/slotVotes';
import { boxItemDomId, useBoxDetailScroll } from '../../hooks/useBoxDetailScroll';
import {
  createBoxDetailStyles,
  BOX_SUMMARY_SCROLL_INSET,
} from '../../components/box/boxDetailLayout';
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
import { useMyBoxEditing } from '../../hooks/useMyBoxEditing';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { MyBoxMobile } from '../mobile/MyBoxMobile';

/** Clearance under scroll content for the floating order-summary card. */
const SUMMARY_FLOAT_CLEARANCE = 140;

const CHROME_SCROLL_DIR_THRESHOLD = 8;

const CHROME_REVEAL_TOP_Y = 40;

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
  /** Filled once useBoxDetailScroll below exists; the hook's handlers scroll through it. */
  const scrollToSectionRef = useRef<(sectionId: BoxDisplaySectionId) => void>(() => {});
  const editing = useMyBoxEditing({ navigation, scrollToSection: (sectionId) => scrollToSectionRef.current(sectionId) });
  const mobileLayout = useMobileLayout();
  const {
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
    preWrap,
    productModalItem,
    productModalSection,
    refreshDraft,
    removeCoalesced,
    requireAuthToCustomize,
    restoreDonated,
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
    swapBackToPaper,
    toggleSurprise,
    upsellsBySection,
    user,
    visibleSectionIds,
    voteOptionsFor,
    wrapSelectedIds,
  } = editing;
  const { household } = useSession();

  const includedCounts = useMemo((): Partial<Record<BoxDisplaySectionId, SectionCount>> => {
    const { sections } = auditIncluded(
      lineItems,
      catalog,
      { kidKeys: children.map((c) => c.id), adults: Math.max(0, editing.people - children.length) },
      { wrapSelectedItemIds: [...wrapSelectedIds] }
    );
    return { story: sections.story, presents: sections.presents, candles: sections.candles, dreidel: sections.dreidel, food: sections.food };
  }, [lineItems, catalog, children, editing.people, wrapSelectedIds]);

  /** Included units missing from a section and not already listed as donated this session. */
  const includedGap = (sectionId: 'candles' | 'dreidel' | 'food') => {
    const count = includedCounts[sectionId];
    if (!count) return 0;
    const donated = donatedItems
      .filter(
        ({ item }) =>
          displaySectionForCatalogItem(item) === sectionId &&
          !(sectionId === 'dreidel' && geltBagOf(item.id, item.name))
      )
      .reduce((n, d) => n + d.missing, 0);
    return Math.max(0, count.allowed - count.filled - donated);
  };
  const woodDreidel = useMemo(() => woodDreidelCatalogItem(catalog), [catalog]);

  const wrappingPaper = useMemo(() => {
    const row = resolveByDefaultSlot(catalog, WRAP_POLICY.defaultSlot);
    return (
      (row ? catalog.find((c) => c.id === row.id) : undefined) ??
      catalog.find((c) => isWrappingPaperItem(c.id, catalog))
    );
  }, [catalog]);

  useEffect(() => {
    if (!household?.id) return;
    prefetchPartnerInvites(household.id);
  }, [household?.id]);

  // Stripe.js + SetupIntent (or saved card) start while the box is on screen, not when Checkout mounts.
  useEffect(() => {
    if (guestViewOnly || locked || openOrder || !household?.id || !lineItems.length) return;
    warmBoxCheckout({
      householdId: household.id,
      cardOnFile,
      totalCents: boxPriceCents + chargeableLineTotal(lineItems),
      paymentMethodId: household.stripeDefaultPaymentMethodId,
    });
  }, [
    guestViewOnly,
    locked,
    openOrder,
    household?.id,
    household?.stripeDefaultPaymentMethodId,
    cardOnFile,
    boxPriceCents,
    lineItems,
  ]);

  const {
    scrollRef,
    contentRef,
    activeSection,
    registerSection,
    onSectionLayout,
    onScroll,
    scrollToSection,
    scrollToItem,
  } = useBoxDetailScroll({ visibleSectionIds });
  scrollToSectionRef.current = scrollToSection;

  /** Mobile: hide pinned chrome on scroll down, bring it back on scroll up (like Home). */
  const [chromeHidden, setChromeHidden] = useState(false);
  const lastScrollY = useRef(0);
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      onScroll(e);
      if (isDesktop) return;
      const y = Math.max(0, e.nativeEvent.contentOffset.y);
      const dy = y - lastScrollY.current;
      lastScrollY.current = y;
      if (y < CHROME_REVEAL_TOP_Y || dy < -CHROME_SCROLL_DIR_THRESHOLD) setChromeHidden(false);
      else if (dy > CHROME_SCROLL_DIR_THRESHOLD) setChromeHidden(true);
    },
    [isDesktop, onScroll]
  );

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
    // Story and presents already show per-kid add-back blocks for donated books and gifts.
    const practiceSection = sectionId === 'candles' || sectionId === 'dreidel' || sectionId === 'food';
    const donatedHere =
      showKidAddCtas && practiceSection
        ? donatedItems.filter(({ item }) => displaySectionForCatalogItem(item) === sectionId)
        : [];
    const gap = showKidAddCtas && practiceSection ? includedGap(sectionId) : 0;
    const dreidelsToAddBack = sectionId === 'dreidel' && woodDreidel ? gap : 0;
    const otherGap = sectionId !== 'dreidel' ? gap : 0;
    const gapOptions = otherGap ? freeAddOptionsBySection[sectionId] ?? [] : [];
    const kidAddBlocks =
      kidGiftNeeds.length ||
      kidBookNeeds.length ||
      dreidelsToAddBack ||
      donatedHere.length ||
      gapOptions.length ? (
        <View style={styles.kidAddBlocks}>
          {donatedHere.map(({ item, missing }) => (
            <PerKidSlotAddBlock
              key={`donated-${item.id}`}
              title={missing === 1 ? `Add back ${item.name}` : `Add back ${missing} × ${item.name}`}
              note="Donated to a family who wouldn’t otherwise celebrate. Add it back at no cost."
              items={[item]}
              onPressItem={() => void restoreDonated(item.id)}
            />
          ))}
          {gapOptions.length ? (
            <PerKidSlotAddBlock
              title={
                sectionId === 'candles'
                  ? 'Add back candles'
                  : otherGap === 1
                    ? 'Add back 1 food kit'
                    : `Add back ${otherGap} food kits`
              }
              note="Included in your box. Until you pick one, it’s donated to a family who wouldn’t otherwise celebrate."
              items={gapOptions}
              onPressItem={(item) => void addFreeItemToEmptySlot(sectionId, item)}
            />
          ) : null}
          {dreidelsToAddBack && woodDreidel ? (
            <PerKidSlotAddBlock
              title={dreidelsToAddBack === 1 ? 'Add back 1 dreidel' : `Add back ${dreidelsToAddBack} dreidels`}
              note="One dreidel per person is included. Until you add it back, it’s donated to a family who wouldn’t otherwise celebrate."
              items={[woodDreidel]}
              onPressItem={() => void editing.topUpIncludedDreidels()}
            />
          ) : null}
          {kidGiftNeeds.map(({ child, reason }) => (
            <PerKidSlotAddBlock
              key={`gift-need-${child.id}`}
              title={`Add a gift for ${kidName(child)}`}
              note={
                reason === 'donated'
                  ? `${kidName(child)}’s gift was donated or removed. Add something else at no additional cost.`
                  : `${kidName(child)}’s gift repeats another item — pick something special.`
              }
              items={orderGiftOptionsForAge(includedGiftOptions, kidPlannerAges([child])[0] ?? 0)}
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
    const gapOptionIds = new Set(gapOptions.map((i) => i.id));
    const emptyRailItems = isEmpty
      ? [
          ...freeAddOptions,
          ...(upsellsBySection[sectionId] ?? []).filter((i) => !freeAddIds.has(i.id)),
        ]
      : [];
    const railSource = isEmpty ? emptyRailItems : upsellsBySection[sectionId];
    const railItems = gapOptionIds.size ? railSource?.filter((i) => !gapOptionIds.has(i.id)) : railSource;

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
        countLabel={isChildProfile ? null : includedCountLabel(includedCounts[sectionId])}
        emptySection={isEmpty}
        showUpsells={showUpsells}
        upsellItems={showUpsells ? railItems : undefined}
        upsellLabel={isEmpty ? 'Add items' : undefined}
        upsellIncludedItemIds={freeAddIds.size ? freeAddIds : undefined}
        upsellSwapEligibleItemIds={swapEligibleIdsBySection[sectionId]}
        childrenProfiles={children}
        onUpsellPress={showUpsells ? handleUpsellPress : undefined}
        upsellFooterAction={
          showUpsells && sectionId === 'story'
            ? {
                label: 'browse all books',
                onPress: () => navigation.navigate('StorefrontCategory', { category: 'books' }),
              }
            : undefined
        }
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
                  preWrap={preWrap}
                  onUsePaperInstead={
                    preWrap && wrappingPaper
                      ? () => {
                          setProductModalSection('presents');
                          void swapBackToPaper(wrappingPaper);
                        }
                      : undefined
                  }
                  onToggleWrapSelection={
                    locked
                      ? undefined
                      : (itemId) => {
                          const next = new Set(wrapSelectedIds);
                          if (next.has(itemId)) next.delete(itemId);
                          else next.add(itemId);
                          const ids = [...next];
                          void (async () => {
                            await persistWrapSelection(ids);
                            const current = lineItemsRef.current;
                            const synced = syncWrappingPaperUnitCentsForWrapSelection(
                              current,
                              catalog,
                              ids.length,
                              EXTRA_FLAT_CENTS
                            );
                            if (synced !== current) await persist(synced);
                          })();
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
          const isWrappingPaper =
            isWrapControlSlot(li.slotId) &&
            (catalogSlotId(li.slotId) === 'wrapping-paper' ||
              catalogSlotId(li.slotId) === 'wrapping' ||
              /wrapping.?paper/i.test(`${li.itemId} ${li.label ?? ''} ${item?.name ?? ''}`));
          // Wrap fee rides on paper unitCents for Add-ons, but the paper card stays “1 included”.
          // Don't gate on coalesced includedQuantity — charging paper zeros that field.
          const statusUnitCents =
            isWrappingPaper && wrapSelectedIds.size > 0 ? 0 : group.unitCents;
          const presentMeta = formatBoxItemStatusMeta(
            statusUnitCents,
            names,
            formatCatalogDollars,
            memberValueCents,
            resolveBoxItemAttributionKind(group.lines, item),
            group.quantity,
            group.includedQuantity ?? (isWrappingPaper ? 1 : undefined)
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

          const isPilotPick = group.lines.some(isPilotLine);
          const voteLine =
            group.lines.find(
              (line) =>
                isVotablePerKidSlot(line.slotId) &&
                (!showKidBoxUi || line.childId === activeChild?.id)
            ) ?? li;

          return (
            <View
              key={group.key}
              nativeID={boxItemDomId(group.key)}
              style={
                Platform.OS === 'web'
                  ? ({ scrollMarginTop: BOX_SUMMARY_SCROLL_INSET } as object)
                  : undefined
              }
              {...(Platform.OS === 'web' ? ({ id: boxItemDomId(group.key) } as object) : null)}
            >
              {showChildWrapped ? (
                <WrappedGiftPlaceholder />
              ) : (
                <>
                  {!isChildProfile ? (
                    <BoxItemRow
                      li={li}
                      item={item}
                      meta={isPilotPick ? PILOT_PICK_META : presentMeta}
                      note={group.note ?? li.curationNote}
                      imageBadge={imageBadge}
                      claimGiftChips={claimChips.length && !isPilotPick ? claimChips : undefined}
                      locked={locked || sectionSealed || isPilotPick}
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
                          : group.unitCents === 0
                            ? () => {
                                const opts = (swapOptionsBySlot[li.slotId] ?? []).filter(
                                  (o) => o.id !== li.itemId
                                );
                                if (!opts.length) return;
                                setSwapPicker({
                                  slotIds: group.lines.map((line) => line.slotId),
                                  options: opts,
                                  title: swapTitleForItem(item, {
                                    giftSlot: isGiftSlotLine(li),
                                  }),
                                });
                              }
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

  if (sessionLoading || loading || draftLoading) {
    return (
      <StorefrontChrome bodyMode="fill" hideServicesNav hideSearchAndRav>
        <View style={styles.centered}>
          <BrandLoadingMark color={colors.brand} />
        </View>
      </StorefrontChrome>
    );
  }

  if (draftError && lineItems.length === 0) {
    return (
      <StorefrontChrome bodyMode="fill" hideServicesNav hideSearchAndRav>
        <View style={styles.centered}>
          <View style={styles.kidEmptyCard}>
            <Text style={styles.kidEmptyTitle}>We couldn’t load your box</Text>
            <Text style={styles.kidEmptyBody}>Check your connection and try again.</Text>
            <SystemChip
              label="Try again"
              onPress={() => void refreshDraft()}
              style={{ marginTop: spacing.md, alignSelf: 'flex-start' }}
            />
          </View>
        </View>
      </StorefrontChrome>
    );
  }

  // Mid-handoff into onboarding — brief spinner while the root gate remounts.
  const awaitingBoxCheck =
    !!user && !guestViewOnly && lineItems.length === 0 && !openOrder && ordersLoading;
  if (guestNeedsOnboarding || signedInWithoutBox || awaitingBoxCheck) {
    return (
      <StorefrontChrome bodyMode="fill" hideServicesNav hideSearchAndRav>
        <View style={styles.centered}>
          <BrandLoadingMark color={colors.brand} />
        </View>
      </StorefrontChrome>
    );
  }

  const subtotal = totalCents(lineItems, boxPriceCents);
  /** Code / influencer discount recorded at checkout; it re-applies to the box as it changes. */
  const boxDiscountCents = discountCentsForTerms(openOrder?.promo ?? null, subtotal);
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
      {!guestViewOnly && !locked ? <PilotReturnBanner wrapperStyle={detailStyles.headerExtras} hasPicks={lineItems.some(isPilotLine)} /> : null}
      {shownSwapNotices.length ? (
        <View style={detailStyles.headerExtras}>
          <View style={styles.swapNotice}>
            <View style={styles.swapNoticeBody}>
              {shownSwapNotices.map((n) => (
                <Text key={n.fromItemId} style={styles.swapNoticeText}>
                  {swapNoticeText(n)}
                </Text>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              hitSlop={8}
              onPress={() => setShownSwapNotices([])}
            >
              <Text style={styles.swapNoticeClose}>×</Text>
            </Pressable>
          </View>
        </View>
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
      {guestViewOnly && !isDesktop ? (
        <View style={styles.guestSummaryStack}>
          <View style={styles.guestPriceLine}>
            <Text style={styles.summaryLabel}>Base box</Text>
            <Text style={styles.summaryValue}>{formatCatalogDollars(boxPriceCents)}</Text>
            <Text style={styles.guestPriceSep}>|</Text>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCatalogDollars(subtotal)}</Text>
          </View>
          <GuestBoxAuthBanner centered />
          <View style={styles.guestCtaRow}>
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
              <Text style={styles.guestSignIn}>Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.summaryBreakdown}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>
              {!isDesktop
                ? 'Base box'
                : kidsCount === 1
                  ? 'Base box (1 kid)'
                  : `Base box (${kidsCount} kids)`}
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
              onOpenDonations={locked ? undefined : () => setDonationsOpen(true)}
              labelStyle={styles.summaryLabel}
              valueStyle={styles.summaryDonatedValue}
              itemStyle={styles.summaryItem}
            />
          ) : null}
          {boxDiscountCents > 0 ? (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>
                {openOrder?.promo?.source === 'code' && openOrder.promo.code
                  ? `Code ${openOrder.promo.code}`
                  : 'Discount'}
              </Text>
              <Text style={styles.summaryValue}>-{formatCatalogDollars(boxDiscountCents)}</Text>
            </View>
          ) : null}
          <View style={styles.summaryTotalItem}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCatalogDollars(subtotal - boxDiscountCents)}</Text>
            {retailValueCents > 0 && isDesktop ? (
              <Text style={styles.summaryRetailValue}>
                ({formatCatalogDollars(retailValueCents)} value)
              </Text>
            ) : null}
            {guestViewOnly ? <GuestBoxAuthBanner /> : null}
          </View>
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
                <Text style={styles.guestSignIn}>Log in</Text>
              </TouchableOpacity>
            </View>
          ) : canUpdateCommittedOrder ? (
            <View style={styles.summaryCtaRow} accessibilityLiveRegion="polite">
              {savingOrder || (hasSessionEdits && orderDirty) ? (
                <Text style={styles.orderSaveStatus}>Saving changes…</Text>
              ) : hasSessionEdits ? (
                <Text style={styles.orderSaveStatus} accessibilityRole="text">
                  ✓ All changes saved
                </Text>
              ) : null}
              {hasSessionEdits ? (
                <Pressable
                  style={({ pressed, hovered }) => [
                    styles.checkoutCta,
                    (hovered || pressed) && !savingOrder && styles.checkoutCtaHover,
                    savingOrder && styles.checkoutCtaDisabled,
                  ]}
                  onPress={() => void discardOrderChanges()}
                  disabled={savingOrder}
                  accessibilityRole="button"
                  accessibilityLabel="Revert changes"
                  accessibilityState={{ disabled: savingOrder }}
                >
                  {({ pressed, hovered }) => (
                    <Text
                      style={[
                        styles.checkoutText,
                        (hovered || pressed) && !savingOrder && styles.checkoutTextHover,
                      ]}
                    >
                      Revert changes
                    </Text>
                  )}
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed, hovered }) => [
                  styles.checkoutCta,
                  (hovered || pressed) && styles.checkoutCtaHover,
                ]}
                onPress={goToCheckout}
                accessibilityRole="button"
              >
                {({ pressed, hovered }) => (
                  <Text
                    style={[
                      styles.checkoutText,
                      (hovered || pressed) && styles.checkoutTextHover,
                    ]}
                  >
                    View order status
                  </Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.summaryCtaRow}>
              <View style={styles.checkoutCtaStack}>
                <Pressable
                  style={({ pressed, hovered }) => [
                    styles.checkoutCta,
                    (hovered || pressed) && styles.checkoutCtaHover,
                    locked && styles.checkoutCtaDisabled,
                  ]}
                  onPress={goToCheckout}
                  disabled={locked || lineItems.length === 0}
                  accessibilityRole="button"
                >
                  {({ pressed, hovered }) => (
                    <Text
                      style={[
                        styles.checkoutText,
                        (hovered || pressed) && styles.checkoutTextHover,
                      ]}
                    >
                      Continue
                    </Text>
                  )}
                </Pressable>
                {!cardOnFile && !locked && isDesktop ? (
                  <Text style={styles.checkoutCtaNote}>{editUntilLockNote(lockAt, { twoLines: true })}</Text>
                ) : null}
              </View>
            </View>
          )}
        </View>
      )}
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

  const jumpToItem = (_itemId: string, sectionId: BoxDisplaySectionId, rowKey: string) => {
    requestAnimationFrame(() =>
      scrollToItem(rowKey, sectionId, { inset: BOX_SUMMARY_SCROLL_INSET })
    );
  };

  const scrollBody = (
    <>
      {scrollHeader}
      {kidEmptyState}
      {!isChildProfile && !kidEmptyState ? (
        <BoxSummaryList
          variant="jump"
          lineItems={lineItems}
          catalog={catalog}
          childrenProfiles={children}
          onPressItem={jumpToItem}
        />
      ) : null}
      {kidEmptyState ? null : sections}
      {!isChildProfile && !kidEmptyState ? (
        <BoxSummaryList
          lineItems={lineItems}
          catalog={catalog}
          childrenProfiles={children}
          showReset={!locked && !guestViewOnly && !isChildProfile}
          onPressItem={jumpToItem}
        />
      ) : null}
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

  if (mobileLayout && !isChildProfile && !loading && !draftLoading) {
    return <MyBoxMobile editing={editing} navigation={navigation} />;
  }

  return (
    <StorefrontChrome
      bodyMode="fill"
      hideSearchAndRav
      servicesSlot={servicesSlot}
      fillChromeHidden={chromeHidden}
    >
      <View style={styles.pageRoot}>
        <WebContentPanel
          flush
          centerDesktop
          omitDesktopTopPadding
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
              onScroll={handleScroll}
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
        geltCeiling={editing.geltCeiling}
        fromSection={productModalSection}
        locked={locked || guestViewOnly}
        onClose={() => {
          setProductModalItem(null);
          setProductModalSection(null);
        }}
        onSelectItem={setProductModalItem}
        onAdd={modalAddToBox}
        addUnitCents={(next) =>
          editing.addOnTopCents(next, productModalSection ?? displaySectionForCatalogItem(next))
        }
        onSwap={modalSwapIntoBox}
        onRemove={modalRemoveFromBox}
        onQuantityChange={(next, delta) => {
          const group = coalesceLinesByItemId(
            lineItems.filter((li) => li.itemId === next.id)
          )[0];
          if (!group) return;
          const sectionId =
            productModalSection ?? displaySectionForCatalogItem(next);
          void changeBoxQuantity(group, delta, sectionId);
        }}
      />
      <SwapIntoBoxModal
        visible={swapPicker != null && (swapPicker?.options.length ?? 0) > 0}
        options={(swapPicker?.options ?? []).map((opt) => ({
          key: opt.id,
          name: opt.name,
          imageUrl: opt.imageUrl,
          itemId: opt.id,
        }))}
        onSelect={(key) => {
          if (!swapPicker) return;
          const opt = swapPicker.options.find((o) => o.id === key);
          const slotIds = swapPicker.slotIds;
          setSwapPicker(null);
          if (opt) void applySwap(slotIds, opt);
        }}
        onCancel={() => setSwapPicker(null)}
        title={swapPicker?.title}
      />
      <DonatedItemsModal
        visible={donationsOpen && !donatedSwap}
        items={donatedItems.map(({ item, missing }) => ({
          itemId: item.id,
          name: item.name,
          imageUrl: item.imageUrl,
          quantity: missing,
          canSwap: donatedSwapOptions(item.id).length > 0,
        }))}
        cashDonationCents={cashDonationCents}
        onCashDonationChange={
          locked || guestViewOnly ? undefined : (cents) => void setCashDonation(cents)
        }
        onRestore={locked ? undefined : (itemId) => void restoreDonated(itemId)}
        onSwapIn={
          locked
            ? undefined
            : (itemId) => setDonatedSwap({ itemId, options: donatedSwapOptions(itemId) })
        }
        onClose={() => setDonationsOpen(false)}
      />
      <SwapIntoBoxModal
        visible={donatedSwap != null && donatedSwap.options.length > 0}
        options={(donatedSwap?.options ?? []).map((opt) => ({
          key: opt.id,
          name: opt.name,
          imageUrl: opt.imageUrl,
          itemId: opt.id,
        }))}
        onSelect={(key) => {
          if (!donatedSwap) return;
          const opt = donatedSwap.options.find((o) => o.id === key);
          const { itemId } = donatedSwap;
          setDonatedSwap(null);
          if (opt) void restoreDonated(itemId, opt);
        }}
        onCancel={() => setDonatedSwap(null)}
        title={
          donatedSwap
            ? swapTitleForItem(catalog.find((c) => c.id === donatedSwap.itemId), {
                giftSlot: (() => {
                  const snap = donatedLineSnapshots.current.get(donatedSwap.itemId)?.[0];
                  return snap ? isGiftSlotLine(snap) : false;
                })(),
              })
            : undefined
        }
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
  swapNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.brandLight,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  swapNoticeBody: { flex: 1, gap: 4 },
  swapNoticeText: { fontSize: typography.md, color: colors.textPrimary },
  swapNoticeClose: { fontSize: typography.lg, lineHeight: typography.lg, color: colors.textSecondary },
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
    maxWidth: isDesktop ? 1024 : undefined,
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
  /** Mobile guest: price line → hold copy → CTAs, all centered. */
  guestSummaryStack: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xs,
  },
  guestPriceLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  guestPriceSep: {
    fontSize: typography.sm,
    color: colors.goldMuted,
    ...typeface('medium'),
    marginHorizontal: spacing.xs,
    opacity: 0.7,
  },
  guestCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.xs,
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
    // Mobile: CTAs wrap onto their own line under the price — center them there.
    justifyContent: isDesktop ? 'flex-end' : 'center',
    gap: spacing.sm,
    flexShrink: 1,
    flexGrow: 1,
    flexWrap: 'wrap',
    marginLeft: isDesktop ? 'auto' : 0,
    minWidth: 0,
  },
  orderSaveStatus: {
    fontSize: typography.sm,
    color: colors.goldMuted,
    ...typeface('medium'),
    letterSpacing: -0.22,
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
  /** Desktop: note sits left of the button (row-reverse keeps JSX order button → note). */
  checkoutCtaStack: {
    flexDirection: isDesktop ? 'row-reverse' : 'column',
    alignItems: 'center',
    gap: isDesktop ? spacing.sm : spacing.xs,
    flexShrink: 1,
    minWidth: 0,
  },
  checkoutCtaNote: {
    fontSize: typography.sm,
    color: colors.goldMuted,
    ...typeface('light'),
    letterSpacing: -0.1,
    textAlign: isDesktop ? 'right' : 'center',
    flexShrink: 1,
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
