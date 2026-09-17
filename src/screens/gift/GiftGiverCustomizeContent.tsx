import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../../navigation/types';
import {
  formatCatalogDollars,
  formatDollars,
  totalCents,
  catalogSlotId,
} from '../../services/box/buildDefaultBox';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import { findSwapSourceLine } from '../../services/box/findSwapSourceLine';
import {
  resolveSectionUpsellItems,
  resolveFreeSlotAddOptions,
  resolveFreeSwapUnitCents,
  resolveIncludedGiftOptions,
  kidPlannerAges,
  filterBooksForKidAges,
  catalogBookFitsKidAge,
} from '../../services/box/sectionUpsells';
import { resolveCatalogDisplayPrices, boxALaCarteRetailValueCents, boxAddOnUnitCents } from '../../services/box/pricing';
import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
import { BoxItemRow } from '../../components/box/BoxItemRow';
import { BoxProductModal } from '../../components/box/BoxProductModal';
import { StickySectionNav } from '../../components/box/StickySectionNav';
import { BoxDetailToolbar } from '../../components/box/BoxDetailToolbar';
import { BoxDetailSectionBlock } from '../../components/box/BoxDetailSectionBlock';
import { PresentsWrappableList } from '../../components/box/PresentsWrappableList';
import { BoxSummaryList } from '../../components/box/BoxSummaryList';
import { PerKidSlotAddBlock } from '../../components/box/PerKidSlotAddBlock';
import {
  childNamesForLines,
  coalesceLinesByItemId,
  donatedMemberValueCents,
  formatBoxItemStatusMeta,
  fullCardLinesForSection,
  giftBadgeLabelForLines,
  bookBadgeLabelForLines,
  oneForBadgeLabelForLines,
  getCashDonationCents,
  isCashDonationLine,
  isGiftSlotLine,
  isWrapControlSlot,
  isWrappingPaperItem,
  kidsNeedingBook,
  kidsNeedingGift,
  resolveBoxItemAttributionKind,
  seedIncludedBaselines,
  transferIncludedBaselineOnSwap,
  setLiveIncludedBaselines,
  includedPracticeSlotVacant,
  wrappableLinesInBox,
  wrapControlLines,
  type CoalescedBoxLine,
} from '../../components/box/boxLineDisplay';
import { BoxSummaryDonated } from '../../components/box/BoxSummaryDonated';
import { createBoxDetailStyles, BOX_SUMMARY_SCROLL_INSET } from '../../components/box/boxDetailLayout';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  BOX_DISPLAY_SECTIONS,
  displaySectionForCatalogItem,
  groupLineItemsByDisplaySection,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { useBoxDetailScroll } from '../../hooks/useBoxDetailScroll';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useThemeMode } from '../../context/ThemeContext';
import { useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { useAuthStore } from '../../stores/authStore';
import {
  MOBILE_GUTTER,
  spacing,
  typography,
  borderRadius,
  typeface,
  shadows,
  shadowsWeb,
} from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import type { GiftGiveFormValues } from './giftGiveTypes';

/** Clearance under scroll content for the floating order-summary card. */
const SUMMARY_FLOAT_CLEARANCE = 140;

type Props = {
  form: GiftGiveFormValues;
  catalog: CatalogItem[];
  lineItems: BoxLineItem[];
  kidProfiles: ChildProfile[];
  loading: boolean;
  submitting: boolean;
  wrapSelectedItemIds?: string[];
  applySwap: (
    slotIds: string[],
    item: CatalogItem,
    opts?: { displaySectionId?: BoxLineItem['displaySectionId'] }
  ) => void;
  swapToPreWrap: (slotIds: string[]) => void;
  swapOptionsBySlot: Record<string, CatalogItem[]>;
  removeCoalesced: (group: CoalescedBoxLine) => void;
  addItem: (
    item: CatalogItem,
    opts?: { displaySectionId?: BoxLineItem['displaySectionId'] }
  ) => void;
  /** Insert at $0 — used by the empty-section "add these for free" placeholder. */
  addFreeItem: (
    item: CatalogItem,
    opts?: { displaySectionId?: BoxLineItem['displaySectionId'] }
  ) => void;
  /** Set (re-point or create) a kid's gift line at $0. */
  setKidGift: (childId: string, item: CatalogItem) => void;
  /** Add a kid's book line at $0. */
  setKidBook: (childId: string, item: CatalogItem) => void;
  persistWrapSelection: (itemIds: string[]) => void;
  setCashDonation?: (cents: number) => void;
  onPay: () => void;
  onRequireAuth?: (entry: 'signup' | 'signin') => void;
  payError?: string | null;
  paymentSlot?: React.ReactNode;
};

function pickingLead(giverName: string): string {
  const name = giverName.trim();
  if (!name || /^you$/i.test(name)) {
    return 'You are picking this box — the family will see your choices when they claim the gift.';
  }
  return `${name} is picking this box — the family will see your choices when they claim the gift.`;
}

export function GiftGiverCustomizeContent({
  form,
  catalog,
  lineItems,
  kidProfiles,
  loading,
  submitting,
  wrapSelectedItemIds = [],
  applySwap,
  swapToPreWrap,
  swapOptionsBySlot,
  removeCoalesced,
  addItem,
  addFreeItem,
  setKidGift,
  setKidBook,
  persistWrapSelection,
  setCashDonation,
  onPay,
  onRequireAuth,
  payError,
  paymentSlot,
}: Props) {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { goHome } = useStorefrontActions();
  const { colors } = useThemeMode();
  const { isDesktop, widePanelMaxWidth } = useWebLayout();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [catalogById, setCatalogById] = useState<Record<string, CatalogItem>>({});
  const [productModalItem, setProductModalItem] = useState<CatalogItem | null>(null);
  const [productModalSection, setProductModalSection] = useState<BoxDisplaySectionId | null>(
    null
  );
  const styles = useMemo(() => createGiftCustomizeStyles(colors, isDesktop), [colors, isDesktop]);
  const detailStyles = useMemo(
    () => createBoxDetailStyles(colors, { desktop: isDesktop }),
    [colors, isDesktop],
  );

  useEffect(() => {
    const map: Record<string, CatalogItem> = {};
    catalog.forEach((c) => {
      map[c.id] = c;
    });
    setCatalogById(map);
  }, [catalog]);

  const kidsCount = Math.max(1, kidProfiles.length);
  const boxPriceCents = listBoxCentsForKids(kidsCount);
  const wrapSelectedIds = useMemo(() => new Set(wrapSelectedItemIds), [wrapSelectedItemIds]);
  const includedBaselineByItemId = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    setLiveIncludedBaselines(includedBaselineByItemId.current);
    return () => setLiveIncludedBaselines(null);
  }, []);
  seedIncludedBaselines(lineItems, includedBaselineByItemId.current);
  const donatedCents = donatedMemberValueCents(
    lineItems,
    catalog,
    includedBaselineByItemId.current,
    { wrapSelectedCount: wrapSelectedIds.size }
  );
  const cashDonationCents = getCashDonationCents(lineItems);

  const trackAndRemoveCoalesced = (group: CoalescedBoxLine) => {
    const removingWrapPaper = isWrappingPaperItem(group.itemId, catalog, group.primary);
    const havingItemsToWrap = wrapSelectedIds.size > 0;
    const freeQty = group.lines
      .filter((li) => !li.slotId.endsWith('::x') && (li.unitCents ?? 0) === 0)
      .reduce((s, li) => s + Math.max(1, li.quantity ?? 1), 0);
    const persistedBaseline = group.lines
      .filter((li) => !li.slotId.endsWith('::x') && (li.unitCents ?? 0) === 0)
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
    removeCoalesced(group);
  };

  const grouped = useMemo(
    () => groupLineItemsByDisplaySection(lineItems, catalog),
    [lineItems, catalog],
  );

  const hasPresentsChecklist = useMemo(
    () =>
      wrappableLinesInBox(lineItems, catalog).length > 0 || wrapControlLines(lineItems).length > 0,
    [lineItems, catalog],
  );

  // Always show every section, even empty ones — an empty section renders a
  // "add these for free" placeholder instead of disappearing.
  const visibleSectionIds = useMemo(
    () => BOX_DISPLAY_SECTIONS.map((section) => section.id),
    [],
  );

  const { scrollRef, contentRef, activeSection, registerSection, onSectionLayout, onScroll, scrollToSection } =
    useBoxDetailScroll({ visibleSectionIds });

  const assignKidGiftAndReveal = (childId: string, item: CatalogItem) => {
    setKidGift(childId, item);
    const target = displaySectionForCatalogItem(item);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToSection(target));
    });
  };

  const assignKidBookAndReveal = (childId: string, item: CatalogItem) => {
    setKidBook(childId, item);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToSection('story'));
    });
  };

  const boxItemIds = useMemo(() => new Set(lineItems.map((li) => li.itemId)), [lineItems]);

  const upsellsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, CatalogItem[]>;
    const ages = kidPlannerAges(kidProfiles);
    for (const section of BOX_DISPLAY_SECTIONS) {
      const limit = section.id === 'story' ? 48 : section.id === 'dreidel' ? 12 : 8;
      const raw = resolveSectionUpsellItems(section.id, catalog, boxItemIds, limit);
      map[section.id] =
        section.id === 'story' ? filterBooksForKidAges(raw, ages, 8) : raw;
    }
    return map;
  }, [catalog, boxItemIds, kidProfiles]);

  /** Free ('included' policy) items offered on an empty section's placeholder. */
  const freeAddOptionsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, CatalogItem[]>;
    const ages = kidPlannerAges(kidProfiles);
    for (const section of BOX_DISPLAY_SECTIONS) {
      const limit = section.id === 'story' ? 48 : section.id === 'dreidel' ? 12 : 8;
      const raw = resolveFreeSlotAddOptions(section.id, catalog, limit);
      map[section.id] =
        section.id === 'story' ? filterBooksForKidAges(raw, ages, 8) : raw;
    }
    return map;
  }, [catalog, kidProfiles]);

  /** Included-policy swap targets that can actually replace a line in this gift box. */
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

  /** Fixed included per-kid gift set for the add-gift affordance. */
  const includedGiftOptions = useMemo(
    () => resolveIncludedGiftOptions(catalog, undefined, 8),
    [catalog]
  );
  const includedGiftIds = useMemo(
    () => new Set(includedGiftOptions.map((i) => i.id)),
    [includedGiftOptions]
  );

  const chargeableExtras = useMemo(
    () =>
      lineItems
        .filter(
          (li) =>
            !isCashDonationLine(li) &&
            (li.itemId.startsWith('extra-') ||
              li.slotId.includes('::x') ||
              li.unitCents > 0)
        )
        .reduce((sum, li) => sum + li.unitCents * (li.quantity ?? 1), 0),
    [lineItems],
  );

  const subtotal = useMemo(() => totalCents(lineItems, boxPriceCents), [lineItems, boxPriceCents]);
  const retailValueCents = useMemo(
    () => boxALaCarteRetailValueCents(lineItems, catalog),
    [lineItems, catalog]
  );

  const renderSection = (sectionId: BoxDisplaySectionId, isLast = false) => {
    const rawItems = grouped[sectionId] ?? [];
    const isPresents = sectionId === 'presents';
    const cardItems = fullCardLinesForSection(sectionId, rawItems);
    const coalesced = coalesceLinesByItemId(cardItems);
    const showPresentsChecklist = isPresents && hasPresentsChecklist;
    // Stays visible with a free-add placeholder instead of disappearing.
    const isEmpty = !coalesced.length && !showPresentsChecklist;

    const upsellItems = upsellsBySection[sectionId];

    // Per-kid "add a gift/book" affordances (kids may be unnamed in the gift-giver flow).
    const kidGiftNeeds = sectionId === 'presents' ? kidsNeedingGift(lineItems, kidProfiles) : [];
    const claimGiftNeeds = kidsNeedingGift(lineItems, kidProfiles);
    const kidBookNeeds = sectionId === 'story' ? kidsNeedingBook(lineItems, kidProfiles) : [];
    const kidLabel = (child: ChildProfile) => child.name?.trim() || 'this kid';
    const kidAddBlocks =
      kidGiftNeeds.length || kidBookNeeds.length ? (
        <View style={styles.kidAddBlocks}>
          {kidGiftNeeds.map(({ child, reason }) => (
            <PerKidSlotAddBlock
              key={`gift-need-${child.id}`}
              title={`Add a gift for ${kidLabel(child)}`}
              note={
                reason === 'donated'
                  ? `${kidLabel(child)}’s gift was donated or removed. Add something else at no additional cost.`
                  : `${kidLabel(child)}’s gift repeats another item — pick something special.`
              }
              items={includedGiftOptions}
              onPressItem={(item) => assignKidGiftAndReveal(child.id, item)}
            />
          ))}
          {kidBookNeeds.map((child) => (
            <PerKidSlotAddBlock
              key={`book-need-${child.id}`}
              title={`Add a book for ${kidLabel(child)}`}
              note={`${kidLabel(child)}’s book was donated — pick one to add it back.`}
              items={(freeAddOptionsBySection.story ?? []).filter((item) =>
                catalogBookFitsKidAge(
                  item,
                  kidPlannerAges([child])[0] ?? 0
                )
              )}
              onPressItem={(item) => assignKidBookAndReveal(child.id, item)}
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
      ? [...freeAddOptions, ...(upsellItems ?? []).filter((i) => !freeAddIds.has(i.id))]
      : [];
    const showUpsells = isEmpty ? emptyRailItems.length > 0 : (upsellItems?.length ?? 0) > 0;

    const handleUpsellPress = (item: CatalogItem) => {
      if (freeAddIds.has(item.id) && (isEmpty || practiceVacant)) {
        if (practiceVacant) {
          for (const opt of freeAddOptionsBySection[sectionId] ?? []) {
            includedBaselineByItemId.current.delete(opt.id);
          }
        }
        includedBaselineByItemId.current.set(
          item.id,
          Math.max(includedBaselineByItemId.current.get(item.id) ?? 0, 1)
        );
        addFreeItem(item, { displaySectionId: sectionId });
        return;
      }
      setProductModalSection(sectionId);
      setProductModalItem(item);
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
        upsellItems={showUpsells ? (isEmpty ? emptyRailItems : upsellItems) : undefined}
        upsellLabel={isEmpty ? 'Add items' : undefined}
        upsellIncludedItemIds={freeAddIds.size ? freeAddIds : undefined}
        upsellSwapEligibleItemIds={swapEligibleIdsBySection[sectionId]}
        childrenProfiles={kidProfiles}
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
                  childrenProfiles={kidProfiles}
                  selectedItemIds={wrapSelectedIds}
                  onToggleWrapSelection={(itemId) => {
                    const next = new Set(wrapSelectedIds);
                    if (next.has(itemId)) next.delete(itemId);
                    else next.add(itemId);
                    persistWrapSelection([...next]);
                  }}
                />
              ) : null}
            </View>
          ) : null
        }
      >
        {coalesced.map((group) => {
          const li = group.primary;
          const item = catalogById[li.itemId] ?? catalog.find((c) => c.id === li.itemId);
          const names = childNamesForLines(group.lines, kidProfiles);
          const giftBadge = giftBadgeLabelForLines(group.lines, kidProfiles, 'A gift for them');
          const bookBadge = bookBadgeLabelForLines(group.lines, kidProfiles, 'A book for them');
          const oneForBadge = oneForBadgeLabelForLines(group.lines, kidProfiles, 'One for them');
          const imageBadge = giftBadge ?? bookBadge ?? oneForBadge;
          const isGiftGroup = group.lines.some((line) => isGiftSlotLine(line));
          const isPracticeDreidelCard = group.lines.some((line) =>
            ['wood-dreidel', 'blank-dreidel', 'airdry-dreidel'].includes(catalogSlotId(line.slotId))
          );
          const isBookCard =
            group.lines.some((line) => catalogSlotId(line.slotId) === 'story') ||
            item?.category === 'Book' ||
            item?.slotId === 'story';
          const claimGiftChips =
            !imageBadge &&
            !isGiftGroup &&
            !isPracticeDreidelCard &&
            catalogSlotId(li.slotId) !== 'candles' &&
            item &&
            includedGiftIds.has(item.id) &&
            claimGiftNeeds.length
              ? claimGiftNeeds.map(({ child }) => ({
                  label: `Make this ${kidLabel(child)}’s included gift`,
                  onPress: () => setKidGift(child.id, item),
                }))
              : undefined;
          const claimBookChips =
            sectionId === 'story' &&
            !imageBadge &&
            isBookCard &&
            item &&
            kidBookNeeds.length
              ? kidBookNeeds.map((child) => ({
                  label: `Make this ${kidLabel(child)}’s included book`,
                  onPress: () => setKidBook(child.id, item),
                }))
              : undefined;
          const claimChips = [...(claimGiftChips ?? []), ...(claimBookChips ?? [])];
          const memberValueCents = item ? resolveCatalogDisplayPrices(item).memberCents : 0;
          const isWrappingPaper =
            isWrapControlSlot(li.slotId) &&
            (catalogSlotId(li.slotId) === 'wrapping-paper' ||
              catalogSlotId(li.slotId) === 'wrapping' ||
              /wrapping.?paper/i.test(`${li.itemId} ${li.label ?? ''} ${item?.name ?? ''}`));
          const statusUnitCents =
            isWrappingPaper && wrapSelectedIds.size > 0 ? 0 : group.unitCents;
          const presentMeta = formatBoxItemStatusMeta(
            statusUnitCents,
            names,
            formatCatalogDollars,
            memberValueCents,
            resolveBoxItemAttributionKind(group.lines, item),
            group.quantity,
            group.includedQuantity ?? (isWrappingPaper ? 1 : undefined),
          );
          return (
            <BoxItemRow
              key={group.key}
              li={li}
              item={item}
              meta={presentMeta}
              note={group.note ?? li.curationNote}
              imageBadge={imageBadge}
              claimGiftChips={claimChips.length ? claimChips : undefined}
              locked={false}
              swapOptions={group.unitCents > 0 ? [] : (swapOptionsBySlot[li.slotId] ?? [])}
              onSwap={(opt) => {
                transferIncludedBaselineOnSwap(
                  includedBaselineByItemId.current,
                  group.itemId,
                  opt.id,
                  Math.max(1, group.quantity ?? 1),
                  0
                );
                applySwap(group.lines.map((line) => line.slotId), opt);
              }}
              swapLabel={isWrappingPaper ? 'pre-wrap presents instead' : undefined}
              onPrimarySwapAction={
                isWrappingPaper
                  ? () => swapToPreWrap(group.lines.map((line) => line.slotId))
                  : undefined
              }
              decrementMode={group.unitCents === 0 ? 'donate' : 'remove'}
              onRemove={() => trackAndRemoveCoalesced(group)}
              onOpenProduct={() => {
                if (!item) return;
                setProductModalSection(sectionId);
                setProductModalItem(item);
              }}
              formatPrice={formatDollars}
            />
          );
        })}
      </BoxDetailSectionBlock>
    );
  };

  const breadcrumb = (
    <View style={styles.breadcrumb}>
      <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
        Store
      </Text>
      <Text style={styles.crumbSep}> / </Text>
      <Text style={styles.crumbLink} onPress={() => navigation.goBack()} accessibilityRole="link">
        Send a gift
      </Text>
      <Text style={styles.crumbSep}> / </Text>
      <Text style={styles.crumbCurrent}>Pick their box</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (paymentSlot) {
    return (
      <View style={styles.pageRoot}>
        <WebContentPanel flush centerDesktop omitDesktopTopPadding gutter={!isDesktop} style={styles.panel}>
          <ScrollView
            contentContainerStyle={[
              styles.paymentScroll,
              isDesktop && styles.paymentScrollDesktop,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.paymentShell}>
              {breadcrumb}
              {paymentSlot}
            </View>
          </ScrollView>
        </WebContentPanel>
      </View>
    );
  }

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
            {kidsCount === 1 ? 'Gift box (1 kid)' : `Gift box (${kidsCount} kids)`}
          </Text>
          <Text style={styles.summaryValue}>{formatCatalogDollars(boxPriceCents)}</Text>
        </View>
        {chargeableExtras > 0 ? (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Add-ons</Text>
            <Text style={styles.summaryValue}>{formatCatalogDollars(chargeableExtras)}</Text>
          </View>
        ) : null}
        {donatedCents > 0 || cashDonationCents > 0 ? (
          <BoxSummaryDonated
            cents={donatedCents}
            cashDonationCents={cashDonationCents}
            onCashDonationChange={setCashDonation}
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
        </View>
        {!isAuthenticated ? (
          <View style={styles.summaryCtaRow}>
            <Pressable
              style={({ pressed, hovered }) => [
                styles.checkoutCta,
                styles.guestPrimaryCta,
                (hovered || pressed) && styles.checkoutCtaHover,
              ]}
              onPress={() => onRequireAuth?.('signup')}
              accessibilityRole="button"
            >
              {({ pressed, hovered }) => (
                <Text
                  style={[styles.checkoutText, (hovered || pressed) && styles.checkoutTextHover]}
                >
                  Sign up to continue
                </Text>
              )}
            </Pressable>
            <TouchableOpacity
              onPress={() => onRequireAuth?.('signin')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.guestSignIn}>Sign in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.summaryCtaRow}>
            <Pressable
              style={({ pressed, hovered }) => [
                styles.checkoutCta,
                (hovered || pressed) && styles.checkoutCtaHover,
                (submitting || lineItems.length === 0) && styles.checkoutCtaDisabled,
              ]}
              onPress={onPay}
              disabled={submitting || lineItems.length === 0}
              accessibilityRole="button"
            >
              {({ pressed, hovered }) =>
                submitting ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <Text
                    style={[styles.checkoutText, (hovered || pressed) && styles.checkoutTextHover]}
                  >
                    Continue to payment
                  </Text>
                )
              }
            </Pressable>
          </View>
        )}
      </View>
      {payError ? <Text style={styles.payError}>{payError}</Text> : null}
    </View>
  );

  return (
    <View style={styles.pageRoot}>
      <WebContentPanel flush centerDesktop omitDesktopTopPadding gutter={!isDesktop} style={styles.panel}>
        <View
          style={[
            styles.scrollHost,
            isDesktop
              ? { maxWidth: widePanelMaxWidth, width: '100%', alignSelf: 'center' }
              : null,
          ]}
        >
          <ScrollView
            ref={scrollRef}
            style={[styles.root, isDesktop && styles.desktopRoot]}
            contentContainerStyle={[
              isDesktop ? styles.desktopScrollContent : detailStyles.scrollContent,
              { paddingBottom: SUMMARY_FLOAT_CLEARANCE + (isDesktop ? floatBottom : insets.bottom) },
            ]}
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            {...(Platform.OS === 'web'
              ? ({ className: 'gj-box-scroll', testID: 'gift-box-vertical-scroll' } as object)
              : null)}
          >
            <View
              style={isDesktop ? styles.desktopShell : undefined}
              ref={contentRef}
              collapsable={false}
            >
              {breadcrumb}
              <Text style={styles.lead}>{pickingLead(form.giverName)}</Text>
              <BoxDetailToolbar
                lockAt={null}
                now={new Date()}
                title="Pick their box"
                onBack={() => navigation.goBack()}
                showCalendar={false}
              />
              {visibleSectionIds.length > 0 ? (
                <StickySectionNav
                  activeSection={activeSection}
                  onSelect={scrollToSection}
                  sectionIds={visibleSectionIds}
                />
              ) : null}
              {visibleSectionIds.map((id, index) =>
                renderSection(id, index === visibleSectionIds.length - 1),
              )}
              <BoxSummaryList
                lineItems={lineItems}
                catalog={catalog}
                childrenProfiles={kidProfiles}
                onPressItem={(_itemId, sectionId) => {
                  requestAnimationFrame(() =>
                    scrollToSection(sectionId, { inset: BOX_SUMMARY_SCROLL_INSET })
                  );
                }}
              />
            </View>
          </ScrollView>
        </View>
      </WebContentPanel>
      <View style={[styles.summaryFloat, { bottom: floatBottom }]} pointerEvents="box-none">
        <View style={styles.summaryFloatInner}>{summaryPanel}</View>
      </View>
      <BoxProductModal
        visible={!!productModalItem}
        item={productModalItem}
        catalog={catalog}
        lineItems={lineItems}
        context="giftBox"
        fromSection={productModalSection}
        onClose={() => {
          setProductModalItem(null);
          setProductModalSection(null);
        }}
        onSelectItem={setProductModalItem}
        onAdd={(next) => {
          const sectionId = productModalSection ?? displaySectionForCatalogItem(next);
          const freeOpts = freeAddOptionsBySection[sectionId] ?? [];
          const freeIds = new Set(freeOpts.map((i) => i.id));
          if (freeIds.has(next.id) && includedPracticeSlotVacant(sectionId, lineItems)) {
            for (const opt of freeOpts) {
              includedBaselineByItemId.current.delete(opt.id);
            }
            includedBaselineByItemId.current.set(
              next.id,
              Math.max(includedBaselineByItemId.current.get(next.id) ?? 0, 1)
            );
            addFreeItem(next, { displaySectionId: sectionId });
            return;
          }
          addItem(
            next,
            productModalSection ? { displaySectionId: productModalSection } : undefined
          );
        }}
        onSwap={(next, source) => {
          const sourceItem = catalog.find((c) => c.id === source.itemId);
          const sectionId =
            productModalSection ?? (sourceItem ? displaySectionForCatalogItem(sourceItem) : undefined);
          const nextUnit = isGiftSlotLine(source)
            ? 0
            : (sectionId ? resolveFreeSwapUnitCents(sourceItem, next, sectionId) : undefined) ??
              boxAddOnUnitCents(next);
          transferIncludedBaselineOnSwap(
            includedBaselineByItemId.current,
            source.itemId,
            next.id,
            Math.max(1, source.quantity ?? 1),
            nextUnit
          );
          applySwap(
            [source.slotId],
            next,
            productModalSection ? { displaySectionId: productModalSection } : undefined
          );
        }}
        onRemove={(next) => {
          const group = coalesceLinesByItemId(lineItems.filter((li) => li.itemId === next.id))[0];
          if (group) trackAndRemoveCoalesced(group);
        }}
      />
    </View>
  );
}

function createGiftCustomizeStyles(colors: SemanticColors, isDesktop = false) {
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
    },
    scrollHost: {
      flex: 1,
      minHeight: 0,
    },
    desktopRoot: {
      ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
    },
    desktopScrollContent: {
      flexGrow: 1,
      paddingBottom: SUMMARY_FLOAT_CLEARANCE,
      ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
    },
    desktopShell: {
      width: '100%',
      alignSelf: 'center',
      paddingTop: 0,
      ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
    },
    paymentScroll: {
      paddingHorizontal: isDesktop ? 0 : MOBILE_GUTTER,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
      flexGrow: 1,
    },
    paymentScrollDesktop: {
      paddingTop: spacing.xl,
      alignItems: 'center',
    },
    paymentShell: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    breadcrumb: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      marginBottom: spacing.md,
      paddingHorizontal: isDesktop ? 0 : MOBILE_GUTTER,
      paddingTop: isDesktop ? spacing.lg : 0,
    },
    crumbLink: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.goldMuted,
    },
    crumbSep: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.goldMuted,
    },
    crumbCurrent: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: colors.logoDark,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgPrimary,
    },
    kidAddBlocks: { width: '100%', gap: spacing.md, marginTop: spacing.lg },
    /** Space between “Add a gift for…” rails and “Wrappable in this box”. */
    presentsTrailingStack: { width: '100%', gap: spacing.xl },
    lead: {
      fontSize: typography.md,
      lineHeight: typography.md * 1.45,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      paddingHorizontal: isDesktop ? 0 : MOBILE_GUTTER,
      ...typeface('regular'),
    },
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
      backgroundColor: colors.logoDark,
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
      justifyContent: isDesktop ? 'space-between' : 'center',
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
      fontSize: typography.sm,
      fontWeight: '600',
      color: colors.textInverse,
      letterSpacing: -0.22,
    },
    summaryDonatedValue: {
      fontSize: typography.sm,
      fontWeight: '600',
      color: colors.brand,
      letterSpacing: -0.22,
    },
    summaryTotalItem: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.xs,
      flexShrink: 1,
      flexGrow: 0,
      paddingLeft: spacing.xs,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.goldMuted,
      minWidth: 0,
    },
    totalLabel: {
      fontSize: typography.md,
      fontWeight: '600',
      color: colors.textInverse,
      letterSpacing: -0.22,
    },
    totalValue: {
      fontSize: typography.md,
      fontWeight: '700',
      color: colors.brand,
      letterSpacing: -0.22,
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
      justifyContent: 'center',
      gap: spacing.sm,
      flexShrink: 0,
      width: '100%',
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
      minHeight: 36,
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
      fontWeight: '700',
      fontSize: typography.sm,
      color: colors.brand,
      letterSpacing: -0.22,
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
    payError: {
      marginTop: spacing.sm,
      fontSize: typography.sm,
      color: colors.brand,
      ...typeface('medium'),
    },
  });
}
