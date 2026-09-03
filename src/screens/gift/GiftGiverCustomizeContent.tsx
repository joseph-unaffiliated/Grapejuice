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
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { inferPricingTier } from '../../services/box/pricing';
import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
import { BoxItemRow } from '../../components/box/BoxItemRow';
import { StickySectionNav } from '../../components/box/StickySectionNav';
import { BoxDetailToolbar } from '../../components/box/BoxDetailToolbar';
import { BoxDetailSectionBlock } from '../../components/box/BoxDetailSectionBlock';
import { createBoxDetailStyles } from '../../components/box/boxDetailLayout';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
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
  applySwap: (slotId: string, item: CatalogItem) => void;
  swapOptionsFor: (li: BoxLineItem) => CatalogItem[];
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
  applySwap,
  swapOptionsFor,
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

  const includedItems = useMemo(
    () =>
      lineItems.filter((li) => {
        const item = catalogById[li.itemId];
        if (!item) return true;
        const tier = inferPricingTier(item);
        return tier === 'included' || tier === 'perKid';
      }),
    [lineItems, catalogById],
  );

  const grouped = useMemo(
    () => groupLineItemsByDisplaySection(includedItems, catalog),
    [includedItems, catalog],
  );
  const visibleSectionIds = useMemo(() => nonEmptyDisplaySectionIds(grouped), [grouped]);
  const { scrollRef, contentRef, activeSection, registerSection, onSectionLayout, onScroll, scrollToSection } =
    useBoxDetailScroll({ visibleSectionIds });

  const renderSection = (sectionId: BoxDisplaySectionId, isLast = false) => {
    const items = grouped[sectionId];
    if (!items.length) return null;

    return (
      <BoxDetailSectionBlock
        key={sectionId}
        sectionId={sectionId}
        onLayout={onSectionLayout(sectionId)}
        onSectionRef={registerSection}
        isLast={isLast}
      >
        {items.map((li) => {
          const item = catalogById[li.itemId];
          const kid = kidProfiles.find((c) => c.id === li.childId);
          return (
            <BoxItemRow
              key={li.slotId + li.itemId}
              li={li}
              item={item}
              meta={kid ? `Present for ${kid.name || 'your kid'}` : undefined}
              locked={false}
              swapOptions={swapOptionsFor(li)}
              onSwap={(nextItem) => applySwap(li.slotId, nextItem)}
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

  const floatBottom = Math.max(insets.bottom, spacing.md);
  const kidsCount = Math.max(1, kidProfiles.length);

  const summaryPanel = (
    <View
      style={[
        styles.summaryCard,
        Platform.OS === 'web' ? { boxShadow: shadowsWeb.md } : shadows.md,
      ]}
    >
      <View style={styles.summaryBreakdown}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>
            {kidsCount === 1 ? 'Gift box (1 kid)' : `Gift box (${kidsCount} kids)`}
          </Text>
          <Text style={styles.summaryValue}>{formatDollars(DEFAULT_BOX_PRICE_CENTS)}</Text>
        </View>
        <View style={styles.summaryTotalItem}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatDollars(DEFAULT_BOX_PRICE_CENTS)}</Text>
        </View>
        {!isAuthenticated ? (
          <View style={styles.guestCtaRow}>
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
              { paddingBottom: SUMMARY_FLOAT_CLEARANCE + floatBottom },
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
      paddingHorizontal: isDesktop ? 0 : spacing.sm,
    },
    summaryCard: {
      width: '100%',
      backgroundColor: colors.logoDark,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
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
    guestCtaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flexShrink: 0,
      marginLeft: 'auto',
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
      marginLeft: 'auto',
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
