import React, { useEffect, useMemo, useState } from 'react';
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
import { resolveSectionUpsellItems } from '../../services/box/sectionUpsells';
import { resolveCatalogDisplayPrices } from '../../services/box/pricing';
import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
import { BoxItemRow } from '../../components/box/BoxItemRow';
import { BoxProductModal } from '../../components/box/BoxProductModal';
import { StickySectionNav } from '../../components/box/StickySectionNav';
import { BoxDetailToolbar } from '../../components/box/BoxDetailToolbar';
import { BoxDetailSectionBlock } from '../../components/box/BoxDetailSectionBlock';
import { PresentsWrappableList } from '../../components/box/PresentsWrappableList';
import {
  childNamesForLines,
  coalesceLinesByItemId,
  formatBoxItemStatusMeta,
  fullCardLinesForSection,
  isWrapControlSlot,
  resolveBoxItemAttributionKind,
  wrappableLinesInBox,
  wrapControlLines,
  type CoalescedBoxLine,
} from '../../components/box/boxLineDisplay';
import { createBoxDetailStyles } from '../../components/box/boxDetailLayout';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  BOX_DISPLAY_SECTIONS,
  groupLineItemsByDisplaySection,
  nonEmptyDisplaySectionIds,
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
  persistWrapSelection: (itemIds: string[]) => void;
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
  persistWrapSelection,
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

  const grouped = useMemo(
    () => groupLineItemsByDisplaySection(lineItems, catalog),
    [lineItems, catalog],
  );

  const hasPresentsChecklist = useMemo(
    () =>
      wrappableLinesInBox(lineItems, catalog).length > 0 || wrapControlLines(lineItems).length > 0,
    [lineItems, catalog],
  );

  const visibleSectionIds = useMemo(() => {
    const candidates = BOX_DISPLAY_SECTIONS.map((section) => section.id);
    return nonEmptyDisplaySectionIds(
      grouped,
      candidates,
      hasPresentsChecklist ? ['presents'] : undefined,
    );
  }, [grouped, hasPresentsChecklist]);

  const { scrollRef, contentRef, activeSection, registerSection, onSectionLayout, onScroll, scrollToSection } =
    useBoxDetailScroll({ visibleSectionIds });

  const boxItemIds = useMemo(() => new Set(lineItems.map((li) => li.itemId)), [lineItems]);

  const upsellsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, CatalogItem[]>;
    for (const section of BOX_DISPLAY_SECTIONS) {
      map[section.id] = resolveSectionUpsellItems(section.id, catalog, boxItemIds, 8);
    }
    return map;
  }, [catalog, boxItemIds]);

  const chargeableExtras = useMemo(
    () =>
      lineItems
        .filter((li) => li.itemId.startsWith('extra-') || li.slotId.startsWith('extra-') || li.unitCents > 0)
        .reduce((sum, li) => sum + li.unitCents * (li.quantity ?? 1), 0),
    [lineItems],
  );

  const subtotal = useMemo(() => totalCents(lineItems, boxPriceCents), [lineItems, boxPriceCents]);

  const renderSection = (sectionId: BoxDisplaySectionId, isLast = false) => {
    const rawItems = grouped[sectionId] ?? [];
    const isPresents = sectionId === 'presents';
    const cardItems = fullCardLinesForSection(sectionId, rawItems);
    const coalesced = coalesceLinesByItemId(cardItems);
    const showPresentsChecklist = isPresents && hasPresentsChecklist;

    if (!coalesced.length && !showPresentsChecklist) return null;

    const upsellItems = upsellsBySection[sectionId];
    const showUpsells = (upsellItems?.length ?? 0) > 0;

    return (
      <BoxDetailSectionBlock
        key={sectionId}
        sectionId={sectionId}
        onLayout={onSectionLayout(sectionId)}
        onSectionRef={registerSection}
        isLast={isLast}
        showUpsells={showUpsells}
        upsellItems={showUpsells ? upsellItems : undefined}
        onUpsellPress={
          showUpsells
            ? (item) => {
                setProductModalSection(sectionId);
                setProductModalItem(item);
              }
            : undefined
        }
        trailing={
          showPresentsChecklist ? (
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
          ) : null
        }
      >
        {coalesced.map((group) => {
          const li = group.primary;
          const item = catalogById[li.itemId] ?? catalog.find((c) => c.id === li.itemId);
          const names = childNamesForLines(group.lines, kidProfiles);
          const memberValueCents = item ? resolveCatalogDisplayPrices(item).memberCents : 0;
          const presentMeta = formatBoxItemStatusMeta(
            group.unitCents,
            names,
            formatCatalogDollars,
            memberValueCents,
            resolveBoxItemAttributionKind(group.lines, item),
          );
          const isWrappingPaper =
            isWrapControlSlot(li.slotId) &&
            (catalogSlotId(li.slotId) === 'wrapping-paper' ||
              catalogSlotId(li.slotId) === 'wrapping' ||
              /wrapping.?paper/i.test(`${li.itemId} ${li.label ?? ''} ${item?.name ?? ''}`));

          return (
            <BoxItemRow
              key={group.key}
              li={li}
              item={item}
              meta={presentMeta}
              locked={false}
              swapOptions={swapOptionsBySlot[li.slotId] ?? []}
              onSwap={(opt) => applySwap(group.lines.map((line) => line.slotId), opt)}
              swapLabel={isWrappingPaper ? 'pre-wrap presents instead' : undefined}
              onPrimarySwapAction={
                isWrappingPaper
                  ? () => swapToPreWrap(group.lines.map((line) => line.slotId))
                  : undefined
              }
              decrementMode={group.unitCents === 0 ? 'donate' : 'remove'}
              onRemove={() => removeCoalesced(group)}
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
          <Text style={styles.summaryValue}>{formatDollars(boxPriceCents)}</Text>
        </View>
        {chargeableExtras > 0 ? (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Add-ons</Text>
            <Text style={styles.summaryValue}>{formatDollars(chargeableExtras)}</Text>
          </View>
        ) : null}
        <View style={styles.summaryTotalItem}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatDollars(subtotal)}</Text>
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
        <View style={styles.scrollHost}>
          <ScrollView
            ref={scrollRef}
            style={[styles.root, isDesktop && styles.desktopRoot]}
            contentContainerStyle={[
              isDesktop ? styles.desktopScrollContent : detailStyles.scrollContent,
              { paddingBottom: SUMMARY_FLOAT_CLEARANCE + (isDesktop ? floatBottom : insets.bottom) },
            ]}
            onScroll={onScroll}
            scrollEventThrottle={16}
            {...(Platform.OS === 'web'
              ? ({ className: 'gj-box-scroll', testID: 'gift-box-vertical-scroll' } as object)
              : null)}
          >
            <View
              style={[
                isDesktop && styles.desktopShell,
                isDesktop ? { maxWidth: widePanelMaxWidth } : null,
              ]}
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
        onClose={() => {
          setProductModalItem(null);
          setProductModalSection(null);
        }}
        onSelectItem={setProductModalItem}
        onAdd={(next) =>
          addItem(
            next,
            productModalSection ? { displaySectionId: productModalSection } : undefined
          )
        }
        onSwap={(next, source) =>
          applySwap(
            [source.slotId],
            next,
            productModalSection ? { displaySectionId: productModalSection } : undefined
          )
        }
        onRemove={(next) => {
          const group = coalesceLinesByItemId(lineItems.filter((li) => li.itemId === next.id))[0];
          if (group) removeCoalesced(group);
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
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    summaryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexShrink: 0,
    },
    summaryLabel: { fontSize: typography.sm, color: colors.goldMuted, letterSpacing: -0.22 },
    summaryValue: {
      fontSize: typography.sm,
      fontWeight: '600',
      color: colors.textInverse,
      letterSpacing: -0.22,
    },
    summaryTotalItem: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.xs,
      flexShrink: 1,
      flexGrow: 1,
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
      fontWeight: '600',
      fontSize: typography.sm,
      color: colors.brand,
      letterSpacing: -0.22,
    },
    checkoutCta: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.brand,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.pill,
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
