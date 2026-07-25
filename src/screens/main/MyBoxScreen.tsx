import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { getHanukkahConfig, isBoxLocked } from '../../services/firestore/config';
import type { MainStackParamList } from '../../navigation/types';
import { catalogService } from '../../services/firestore/catalog';
import {
  catalogSlotId,
  formatDollars,
  totalCents,
  DEFAULT_BOX_PRICE_CENTS,
  EXTRA_FLAT_CENTS,
  unitCentsForTier,
} from '../../services/box/buildDefaultBox';
import { inferPricingTier, SHIPPING_FLAT_CENTS } from '../../services/box/pricing';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { BoxItemRow } from '../../components/box/BoxItemRow';
import { BoxSlotVoteRow, WrappedGiftPlaceholder } from '../../components/box/BoxSlotVoteRow';
import { StickySectionNav } from '../../components/box/StickySectionNav';
import { BoxDetailToolbar } from '../../components/box/BoxDetailToolbar';
import { BoxDetailSectionBlock } from '../../components/box/BoxDetailSectionBlock';
import { BoxDetailReviewCta } from '../../components/box/BoxDetailReviewCta';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  BOX_DISPLAY_SECTIONS,
  groupLineItemsByDisplaySection,
  nonEmptyDisplaySectionIds,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { GuestBoxAuthBanner } from '../../components/box/GuestBoxAuthBanner';
import { defaultIsSurprise } from '../../constants/boxPracticeGroups';
import {
  buildVoter,
  isVotablePerKidSlot,
  isWrappableSlot,
  toggleSlotVote,
  topPickItemId,
} from '../../services/box/slotVotes';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { useBoxDetailScroll } from '../../hooks/useBoxDetailScroll';
import { createBoxDetailStyles } from '../../components/box/boxDetailLayout';
import { spacing, typography, borderRadius, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

/** Home-matching top inset on desktop My Box. */
const DESKTOP_CONTENT_TOP = 41;

export function MyBoxScreen() {
  const { colors } = useThemeMode();
  const { isDesktop, widePanelMaxWidth } = useWebLayout();
  const styles = useMemo(() => createMyBoxStyles(colors, isDesktop), [colors, isDesktop]);
  const detailStyles = useMemo(
    () => createBoxDetailStyles(colors, { desktop: isDesktop }),
    [colors, isDesktop],
  );
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { loading: sessionLoading, profile } = useSession();
  const user = useAuthStore((s) => s.user);
  const { isChildProfile, isParentProfile, activeChild } = useActiveProfile();
  const showKidBoxUi = isChildProfile && !PILOT_PARENT_ONLY;
  const { lineItems, slotVotes, sealedSectionIds, children, loading: draftLoading, persist, persistSlotVotes } =
    useBoxDraft();
  const { guestNeedsOnboarding, guestViewOnly, requireAuthToCustomize } = useGuestBoxFlow();
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [swapCache, setSwapCache] = useState<Record<string, CatalogItem[]>>({});
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [estimatedDeliveryBy, setEstimatedDeliveryBy] = useState<string | null>(null);
  const [boxPriceCents, setBoxPriceCents] = useState(DEFAULT_BOX_PRICE_CENTS);
  const [now] = useState(() => new Date());
  const locked = isBoxLocked(lockAt);
  const { cardOnFile, guardMutation } = usePaymentGate();

  const load = useCallback(async () => {
    setLoading(true);
    const [items, config] = await Promise.all([catalogService.getAll(), getHanukkahConfig()]);
    setLockAt(config.lockAt);
    setStartsOn(config.startsOn);
    setEstimatedDeliveryBy(config.estimatedDeliveryBy);
    setBoxPriceCents(config.boxPriceCents ?? DEFAULT_BOX_PRICE_CENTS);
    setCatalog(items);
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

  const beforeCustomize = useCallback((): boolean => {
    if (guestViewOnly) {
      requireAuthToCustomize('signup');
      return false;
    }
    return true;
  }, [guestViewOnly, requireAuthToCustomize]);

  const grouped = useMemo(() => groupLineItemsByDisplaySection(lineItems), [lineItems]);

  const visibleSectionIds = useMemo(() => {
    const candidates = isChildProfile
      ? (['presents', 'story'] as BoxDisplaySectionId[])
      : BOX_DISPLAY_SECTIONS.map((section) => section.id);
    return nonEmptyDisplaySectionIds(grouped, candidates);
  }, [grouped, isChildProfile]);

  const { scrollRef, contentRef, activeSection, registerSection, onSectionLayout, onScroll, scrollToSection } =
    useBoxDetailScroll({ visibleSectionIds });

  const extraLineItems = useMemo(
    () => lineItems.filter((li) => li.itemId.startsWith('extra-') || li.slotId.startsWith('extra-')),
    [lineItems]
  );

  const alaCarteItems = useMemo(
    () =>
      lineItems.filter((li) => {
        const item = catalog.find((c) => c.id === li.itemId);
        return item && inferPricingTier(item) === 'alaCarte';
      }),
    [lineItems, catalog]
  );

  const loadSwapOptions = async (li: BoxLineItem): Promise<CatalogItem[]> => {
    if (swapCache[li.slotId]) return swapCache[li.slotId];
    const current = catalog.find((c) => c.id === li.itemId);
    const ids = current?.swapOptions?.length ? current.swapOptions : [];
    const resolvedSlotId = catalogSlotId(li.slotId);
    const alts = ids.length
      ? await catalogService.getMany(ids)
      : catalog.filter((c) => c.slotId === resolvedSlotId && c.id !== li.itemId);
    const opts = alts.slice(0, 6);
    setSwapCache((c) => ({ ...c, [li.slotId]: opts }));
    return opts;
  };

  useEffect(() => {
    lineItems.forEach((li) => {
      void loadSwapOptions(li);
    });
  }, [lineItems, catalog]);

  const applySwap = async (slotId: string, newItem: CatalogItem) => {
    if (!beforeCustomize() || !guardMutation()) return;
    const tier = inferPricingTier(newItem);
    const next = lineItems.map((li) =>
      li.slotId === slotId
        ? {
            ...li,
            itemId: newItem.id,
            unitCents: unitCentsForTier(tier, newItem.dollarCostCents),
            label: newItem.name,
          }
        : li
    );
    await persist(next);
  };

  const removeLineItem = async (slotId: string) => {
    if (!beforeCustomize()) return;
    await persist(lineItems.filter((li) => li.slotId !== slotId));
  };

  const toggleSurprise = async (slotId: string) => {
    if (!beforeCustomize()) return;
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
    const alts = swapCache[li.slotId] ?? [];
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
    if (!beforeCustomize()) return;
    const next = lineItems.map((li) => (li.slotId === slotId ? { ...li, keepOrToss: value } : li));
    await persist(next);
  };

  const addAnother = async (li: BoxLineItem) => {
    if (!beforeCustomize()) return;
    const item = catalog.find((c) => c.id === li.itemId);
    if (!item) return;
    const tier = inferPricingTier(item);
    const suffix = `${li.slotId}-extra-${Date.now()}`;
    await persist([
      ...lineItems,
      {
        slotId: suffix,
        itemId: item.id,
        quantity: 1,
        unitCents: unitCentsForTier(tier, item.dollarCostCents) || EXTRA_FLAT_CENTS,
        childId: li.childId,
        label: `${item.name} (extra)`,
      },
    ]);
  };

  const goToCheckout = () => {
    if (guestViewOnly) {
      requireAuthToCustomize('signup');
      return;
    }
    navigation.navigate('Checkout');
  };

  const onBrowseChipPress = (chip: string, sectionId: BoxDisplaySectionId) => {
    if (guestViewOnly) {
      requireAuthToCustomize('signup');
      return;
    }
    void chip;
    scrollToSection(sectionId);
  };

  const renderSection = (sectionId: BoxDisplaySectionId) => {
    const items = grouped[sectionId];
    if (!items.length && !isChildProfile) return null;
    const sectionSealed = sealedSectionIds?.includes(sectionId) ?? false;
    const visibleItems = isChildProfile
      ? items.filter(
          (li) => li.childId === activeChild?.id && isVotablePerKidSlot(li.slotId),
        )
      : items;

    return (
      <BoxDetailSectionBlock
        key={sectionId}
        sectionId={sectionId}
        onLayout={onSectionLayout(sectionId)}
        onSectionRef={registerSection}
        itemCount={visibleItems.length}
        showBrowseChips={!isChildProfile && !sectionSealed}
        onBrowseChipPress={!isChildProfile && !sectionSealed ? onBrowseChipPress : undefined}
      >
        {items.map((li) => {
          const item = catalog.find((c) => c.id === li.itemId);
          const kid = children.find((c) => c.id === li.childId);
          const base = catalogSlotId(li.slotId);
          const perKid = base.startsWith('story') || base.startsWith('gift');
          const wrapped =
            isChildProfile &&
            isWrappableSlot(li.slotId) &&
            !!(li.isSurprise ?? defaultIsSurprise(li.slotId));
          const showChildWrapped = wrapped;
          const showVotes =
            !PILOT_PARENT_ONLY &&
            isVotablePerKidSlot(li.slotId) &&
            (!showKidBoxUi || li.childId === activeChild?.id) &&
            !(showKidBoxUi && showChildWrapped);

          if (isChildProfile && li.childId !== activeChild?.id) return null;
          if (isChildProfile && !isVotablePerKidSlot(li.slotId)) return null;

          return (
            <View key={li.slotId}>
              {showChildWrapped ? (
                <WrappedGiftPlaceholder />
              ) : (
                <>
                  {!isChildProfile ? (
                    <BoxItemRow
                      variant="card"
                      li={li}
                      item={item}
                      meta={kid ? `For ${kid.name || 'your kid'}` : undefined}
                      locked={locked || sectionSealed}
                      swapOptions={swapCache[li.slotId] ?? []}
                      onSwap={(opt) => void applySwap(li.slotId, opt)}
                      onToggleSurprise={
                        !PILOT_PARENT_ONLY && isParentProfile && isWrappableSlot(li.slotId)
                          ? () => void toggleSurprise(li.slotId)
                          : undefined
                      }
                      onSetKeepOrToss={(value) => void setKeepOrToss(li.slotId, value)}
                      showAddAnother={perKid || base === 'candles'}
                      onAddAnother={() => void addAnother(li)}
                      onRemove={() => void removeLineItem(li.slotId)}
                      formatPrice={formatDollars}
                    />
                  ) : (
                    <View style={styles.childItemHeader}>
                      <Text style={styles.childItemTitle}>{item?.name ?? li.label ?? 'Your pick'}</Text>
                      {kid?.name ? (
                        <Text style={styles.childItemMeta}>For {kid.name}</Text>
                      ) : null}
                    </View>
                  )}
                  {showVotes ? (
                    <BoxSlotVoteRow
                      slotId={li.slotId}
                      slotVotes={slotVotes}
                      options={voteOptionsFor(li)}
                      currentItemId={li.itemId}
                      currentVoterId={currentVoterId}
                      onToggleVote={(itemId) => void handleToggleVote(li.slotId, itemId)}
                      topPickItemId={isParentProfile ? topPickItemId(slotVotes, li.slotId) : null}
                      topPickItemName={
                        isParentProfile
                          ? catalog.find((c) => c.id === topPickItemId(slotVotes, li.slotId))?.name
                          : undefined
                      }
                      onApplyTopPick={
                        isParentProfile && !locked && !guestViewOnly
                          ? () => {
                              const pickId = topPickItemId(slotVotes, li.slotId);
                              const pick = catalog.find((c) => c.id === pickId);
                              if (pick) void applySwap(li.slotId, pick);
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
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const subtotal = totalCents(lineItems, boxPriceCents);
  const orderTotal = subtotal + SHIPPING_FLAT_CENTS;
  const chargeableExtras = extraLineItems.reduce((s, li) => s + li.unitCents, 0);
  const chargeableAlaCarte = alaCarteItems.reduce((s, li) => s + li.unitCents, 0);

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
        onBack={() => navigation.goBack()}
        title="Your Hanukkah Box"
        startsOn={startsOn}
        estimatedDeliveryBy={estimatedDeliveryBy}
        align={isDesktop ? 'left' : 'center'}
      />
      {guestViewOnly ? (
        <View style={detailStyles.headerExtras}>
          <GuestBoxAuthBanner
            onCreateAccount={() => requireAuthToCustomize('signup')}
            onSignIn={() => requireAuthToCustomize('signin')}
          />
        </View>
      ) : null}
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

  const sections = visibleSectionIds.map((id) => renderSection(id));

  const summaryPanel = (
    <View style={[styles.summaryCard, Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined]}>
      <Text style={styles.summaryHeading}>Order summary</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Hanukkah box</Text>
        <Text style={styles.summaryValue}>{formatDollars(boxPriceCents)}</Text>
      </View>
      {chargeableExtras > 0 ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Add-ons</Text>
          <Text style={styles.summaryValue}>{formatDollars(chargeableExtras)}</Text>
        </View>
      ) : null}
      {chargeableAlaCarte > 0 ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>À la carte</Text>
          <Text style={styles.summaryValue}>{formatDollars(chargeableAlaCarte)}</Text>
        </View>
      ) : null}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Shipping</Text>
        <Text style={styles.summaryValue}>{formatDollars(SHIPPING_FLAT_CENTS)}</Text>
      </View>
      <View style={[styles.summaryRow, styles.summaryTotalRow]}>
        <Text style={styles.totalLabel}>Estimated total</Text>
        <Text style={styles.totalValue}>{formatDollars(orderTotal)}</Text>
      </View>
      <TouchableOpacity
        style={[styles.checkoutCta, locked && styles.checkoutCtaDisabled]}
        onPress={goToCheckout}
        disabled={locked || lineItems.length === 0}
      >
        <Text style={styles.checkoutText}>{cardOnFile ? 'Review shipping' : 'Add payment & shipping'}</Text>
      </TouchableOpacity>
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
      {!isChildProfile && visibleSectionIds.length > 0 ? (
        <StickySectionNav
          activeSection={activeSection}
          onSelect={scrollToSection}
          sectionIds={visibleSectionIds}
        />
      ) : null}
      {kidEmptyState ? null : sections}
      {!isDesktop && !isChildProfile ? (
        <BoxDetailReviewCta
          onPress={goToCheckout}
          disabled={locked || lineItems.length === 0}
        />
      ) : null}
    </>
  );

  if (isDesktop && !isChildProfile) {
    return (
      <WebContentPanel flush centerDesktop omitDesktopTopPadding style={styles.panel}>
        <View style={styles.scrollHost} testID="box-scroll-host">
          <ScrollView
            ref={scrollRef}
            style={[styles.root, styles.desktopRoot]}
            contentContainerStyle={styles.desktopScrollContent}
            onScroll={onScroll}
            scrollEventThrottle={16}
            {...(Platform.OS === 'web'
              ? ({ className: 'gj-box-scroll', testID: 'box-vertical-scroll' } as object)
              : null)}
          >
            <View
              style={[styles.desktopShell, { maxWidth: widePanelMaxWidth }]}
              ref={contentRef}
              collapsable={false}
            >
              <View style={styles.desktopColumns}>
                <View style={styles.desktopList}>
                  {scrollBody}
                </View>
                <View style={styles.desktopSummary}>
                  {summaryPanel}
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </WebContentPanel>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={Platform.OS === 'web' ? [] : ['top']}>
      <WebContentPanel gutter>
        <View style={styles.scrollHost} testID="box-scroll-host">
          <ScrollView
            ref={scrollRef}
            style={styles.root}
            contentContainerStyle={detailStyles.scrollContent}
            onScroll={onScroll}
            scrollEventThrottle={16}
            {...(Platform.OS === 'web'
              ? ({ className: 'gj-box-scroll', testID: 'box-vertical-scroll' } as object)
              : null)}
          >
            <View ref={contentRef} collapsable={false}>
              {scrollBody}
            </View>
          </ScrollView>
        </View>
      </WebContentPanel>
    </SafeAreaView>
  );
}

function createMyBoxStyles(colors: SemanticColors, isDesktop = false) {
  const cardSurface = isDesktop ? colors.bgElevated : colors.accentCream;
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bgPrimary },
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  panel: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: colors.bgPrimary,
  },
  scrollHost: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    overflow: 'hidden' as const,
  },
  mobileWrap: { flex: 1 },
  desktopRoot: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: colors.bgPrimary,
  },
  desktopScrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
    // Room for guest-banner gold glow; content (not ScrollView) may overflow visible.
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
  },
  desktopShell: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: DESKTOP_CONTENT_TOP,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
  },
  desktopColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
  },
  desktopList: {
    flex: 2,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
  },
  desktopListContent: { paddingBottom: spacing.xxl },
  desktopSummary: {
    flex: 1,
    maxWidth: 360,
    minWidth: 280,
    paddingTop: spacing.xs,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web'
      ? ({ position: 'sticky' as const, top: DESKTOP_CONTENT_TOP, zIndex: 5 } as object)
      : {}),
  },
  content: { paddingTop: spacing.sm, paddingBottom: 160 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageHeader: { alignItems: 'center', marginBottom: spacing.sm },
  title: { fontSize: typography.titleLg, fontWeight: '600', textAlign: 'center' },
  headerMeta: { fontSize: typography.sm, color: colors.goldMuted, marginTop: 4, textAlign: 'center' },
  subtitle: {
    fontSize: typography.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  paymentPending: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  guideLink: { alignSelf: 'center', marginBottom: spacing.md },
  guideLinkText: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.brand,
  },
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
  sectionBlock: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.goldMuted,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionHeader: { alignItems: 'center', marginBottom: spacing.md, gap: spacing.xs },
  sectionDesc: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
    fontFamily: typography.fontFamily.light,
  },
  browseChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.sm },
  browseChip: {
    borderWidth: 0.5,
    borderColor: colors.goldMuted,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.bgPrimary,
  },
  browseChipText: { fontSize: 9, color: colors.textPrimary },
  summaryCard: {
    backgroundColor: cardSurface,
    borderRadius: 16,
    padding: spacing.lg,
    marginTop: isDesktop ? 0 : spacing.md,
  },
  summaryHeading: { fontSize: typography.xl, fontWeight: '700', marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  summaryLabel: { fontSize: typography.md, color: colors.textSecondary },
  summaryValue: { fontSize: typography.md, fontWeight: '600' },
  summaryTotalRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.goldMuted,
  },
  totalLabel: { fontSize: typography.xl, fontWeight: '600' },
  totalValue: { fontSize: typography.xl, fontWeight: '700' },
  checkoutCta: {
    backgroundColor: colors.textPrimary,
    padding: spacing.md,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  checkoutCtaDisabled: { opacity: 0.5 },
  checkoutText: { fontWeight: '700', color: colors.goldMuted },
  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bgPrimary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerSecondary: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  footerSecondaryText: { fontWeight: '600', color: colors.textSecondary },
  footerPrimary: {
    flex: 2,
    padding: spacing.md,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
  },
  footerPrimaryText: { fontWeight: '700', color: colors.goldMuted },
  });
}
