import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../../hooks/useSession';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { useWebLayout } from '../../hooks/useWebLayout';
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
import { StickySectionNav } from '../../components/box/StickySectionNav';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  BOX_DISPLAY_SECTIONS,
  groupLineItemsByDisplaySection,
  catalogAlternatesForSection,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { BoxBrowseGrid } from '../../components/box/BoxBrowseGrid';
import { defaultIsSurprise } from '../../constants/boxPracticeGroups';
import { PILOT_COPY } from '../../constants/pilotHolidays';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';

const SCROLL_SPY_OFFSET = 56;

function formatLockDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function headerSubtext(lockAt: string | null, now: Date): string {
  const dateLabel = lockAt
    ? formatLockDate(lockAt)
    : new Date(now.getFullYear(), 11, 4).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
  const daysAway = lockAt
    ? Math.max(0, Math.ceil((new Date(lockAt).getTime() - now.getTime()) / 86_400_000))
    : null;
  return daysAway != null ? `${dateLabel}  •  ${daysAway} days away` : dateLabel;
}

export function MyBoxScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { loading: sessionLoading } = useSession();
  const { lineItems, children, loading: draftLoading, persist } = useBoxDraft();
  const { isDesktop } = useWebLayout();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Partial<Record<BoxDisplaySectionId, number>>>({});
  const scrollingToSection = useRef(false);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [swapCache, setSwapCache] = useState<Record<string, CatalogItem[]>>({});
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [boxPriceCents, setBoxPriceCents] = useState(DEFAULT_BOX_PRICE_CENTS);
  const [kidsMode, setKidsMode] = useState(false);
  const [kidsModeUnlocked, setKidsModeUnlocked] = useState(false);
  const [activeSection, setActiveSection] = useState<BoxDisplaySectionId>('candles');
  const [now] = useState(() => new Date());
  const locked = isBoxLocked(lockAt);

  const load = useCallback(async () => {
    setLoading(true);
    const [items, config] = await Promise.all([catalogService.getAll(), getHanukkahConfig()]);
    setLockAt(config.lockAt);
    setBoxPriceCents(config.boxPriceCents ?? DEFAULT_BOX_PRICE_CENTS);
    setCatalog(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => groupLineItemsByDisplaySection(lineItems), [lineItems]);

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

  const extraCatalog = useMemo(
    () => catalog.filter((c) => inferPricingTier(c) === 'extra'),
    [catalog]
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
    await persist(lineItems.filter((li) => li.slotId !== slotId));
  };

  const toggleSurprise = async (slotId: string) => {
    const next = lineItems.map((li) =>
      li.slotId === slotId ? { ...li, isSurprise: !(li.isSurprise ?? defaultIsSurprise(li.slotId)) } : li
    );
    await persist(next);
  };

  const setKeepOrToss = async (slotId: string, value: 'keep' | 'toss') => {
    const next = lineItems.map((li) => (li.slotId === slotId ? { ...li, keepOrToss: value } : li));
    await persist(next);
  };

  const addAnother = async (li: BoxLineItem) => {
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

  const toggleExtra = async (item: CatalogItem) => {
    if (locked) return;
    const existing = lineItems.find((li) => li.itemId === item.id);
    if (existing) {
      await persist(lineItems.filter((li) => li.itemId !== item.id));
    } else {
      const tier = inferPricingTier(item);
      await persist([
        ...lineItems,
        {
          slotId: item.slotId,
          itemId: item.id,
          quantity: 1,
          unitCents: unitCentsForTier(tier, item.dollarCostCents),
          label: item.name,
        },
      ]);
    }
  };

  const addCatalogItem = async (item: CatalogItem) => {
    if (locked) return;
    const tier = inferPricingTier(item);
    await persist([
      ...lineItems,
      {
        slotId: item.slotId,
        itemId: item.id,
        quantity: 1,
        unitCents: unitCentsForTier(tier, item.dollarCostCents),
        label: item.name,
      },
    ]);
  };

  const swapCatalogIn = async (item: CatalogItem) => {
    if (locked) return;
    const baseSlot = catalogSlotId(item.slotId);
    const existing = lineItems.find(
      (li) => li.slotId === item.slotId || catalogSlotId(li.slotId) === baseSlot
    );
    if (existing) {
      await applySwap(existing.slotId, item);
    } else {
      await addCatalogItem(item);
    }
  };

  const onSectionLayout = (id: BoxDisplaySectionId) => (e: LayoutChangeEvent) => {
    sectionOffsets.current[id] = e.nativeEvent.layout.y;
  };

  const updateActiveFromScroll = (scrollY: number) => {
    if (scrollingToSection.current) return;
    const probe = scrollY + SCROLL_SPY_OFFSET;
    let next: BoxDisplaySectionId = BOX_DISPLAY_SECTIONS[0].id;
    for (const { id } of BOX_DISPLAY_SECTIONS) {
      const y = sectionOffsets.current[id];
      if (y !== undefined && y <= probe) next = id;
    }
    setActiveSection((prev) => (prev === next ? prev : next));
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateActiveFromScroll(e.nativeEvent.contentOffset.y);
  };

  const scrollToSection = (id: BoxDisplaySectionId) => {
    const y = sectionOffsets.current[id];
    if (y === undefined) return;
    setActiveSection(id);
    scrollingToSection.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      scrollingToSection.current = false;
    }, 450);
  };

  const renderSection = (sectionId: BoxDisplaySectionId) => {
    const meta = BOX_DISPLAY_SECTIONS.find((s) => s.id === sectionId)!;
    const items = grouped[sectionId];

    return (
      <View
        key={sectionId}
        style={styles.sectionBlock}
        onLayout={onSectionLayout(sectionId)}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{meta.title}</Text>
          <Text style={styles.sectionDesc}>{meta.description}</Text>
        </View>
        {items.map((li) => {
          const item = catalog.find((c) => c.id === li.itemId);
          const kid = children.find((c) => c.id === li.childId);
          const base = catalogSlotId(li.slotId);
          const perKid = base.startsWith('story') || base.startsWith('gift');
          return (
            <BoxItemRow
              key={li.slotId}
              variant="card"
              li={li}
              item={item}
              meta={kid ? `For ${kid.name || 'your kid'}` : undefined}
              locked={locked}
              swapOptions={swapCache[li.slotId] ?? []}
              onSwap={(opt) => void applySwap(li.slotId, opt)}
              onToggleSurprise={perKid || base === 'gelt' ? () => void toggleSurprise(li.slotId) : undefined}
              onSetKeepOrToss={(value) => void setKeepOrToss(li.slotId, value)}
              showAddAnother={perKid || base === 'candles'}
              onAddAnother={() => void addAnother(li)}
              onRemove={() => void removeLineItem(li.slotId)}
              kidsMode={kidsMode && kidsModeUnlocked}
              formatPrice={formatDollars}
            />
          );
        })}
        {meta.browseChips.length ? (
          <View style={styles.browseChips}>
            {meta.browseChips.map((chip) => (
              <TouchableOpacity
                key={chip}
                style={styles.browseChip}
                onPress={() => navigation.navigate('AlaCarteStore')}
              >
                <Text style={styles.browseChipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <BoxBrowseGrid
          title={meta.moreOptionsTitle}
          items={catalogAlternatesForSection(sectionId, catalog, lineItems)}
          locked={locked}
          formatPrice={formatDollars}
          onAdd={(item) => void addCatalogItem(item)}
          onSwapIn={(item) => void swapCatalogIn(item)}
        />
      </View>
    );
  };

  if (sessionLoading || loading || draftLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={semanticColors.brand} />
      </View>
    );
  }

  const subtotal = totalCents(lineItems, boxPriceCents);
  const orderTotal = subtotal + SHIPPING_FLAT_CENTS;
  const chargeableExtras = extraLineItems.reduce((s, li) => s + li.unitCents, 0);
  const chargeableAlaCarte = alaCarteItems.reduce((s, li) => s + li.unitCents, 0);

  const lockBanner = lockAt ? (
    <Text style={[styles.lockBanner, locked && styles.lockBannerClosed]}>
      {locked
        ? `Customization closed on ${formatLockDate(lockAt)}. Contact support to change your box.`
        : `Customize until ${formatLockDate(lockAt)}`}
    </Text>
  ) : null;

  const scrollHeader = (
    <>
      <View style={styles.pageHeader}>
        <Text style={styles.title}>Your Hanukkah box</Text>
        <Text style={styles.headerMeta}>{headerSubtext(lockAt, now)}</Text>
      </View>
      <Text style={styles.subtitle}>{PILOT_COPY.boxDetailTop}</Text>

      <TouchableOpacity
        style={styles.guideLink}
        onPress={() => navigation.navigate('Guide')}
        activeOpacity={0.85}
      >
        <Text style={styles.guideLinkText}>Open Hanukkah night-by-night guide →</Text>
      </TouchableOpacity>

      <View style={styles.kidsRow}>
        <TouchableOpacity style={styles.kidsBtn} onPress={() => setKidsMode((v) => !v)}>
          <Text style={styles.kidsBtnText}>{kidsMode ? 'Exit kids voting mode' : 'Kids voting mode'}</Text>
        </TouchableOpacity>
        {kidsMode && !kidsModeUnlocked ? (
          <TouchableOpacity style={styles.unlockBtn} onPress={() => setKidsModeUnlocked(true)}>
            <Text style={styles.unlockText}>Light gate</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {lockBanner}
    </>
  );

  const sections = BOX_DISPLAY_SECTIONS.map(({ id }) => renderSection(id));

  const addOnsBlock = (
    <View style={[styles.sectionCard, Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined]}>
      <Text style={styles.sectionTitle}>Optional add-ons</Text>
      <Text style={styles.sectionSub}>{formatDollars(EXTRA_FLAT_CENTS)} each — parent guide, decor, extras</Text>
      {extraCatalog.map((item) => {
        const added = lineItems.some((li) => li.itemId === item.id);
        return (
          <View key={item.id} style={styles.extraRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            <TouchableOpacity
              style={[styles.toggleBtn, added && styles.toggleBtnOn, locked && styles.toggleBtnDisabled]}
              onPress={() => toggleExtra(item)}
              disabled={locked}
            >
              <Text style={[styles.toggleText, added && styles.toggleTextOn]}>{added ? 'Added' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );

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
        onPress={() => navigation.navigate('Checkout')}
        disabled={locked || lineItems.length === 0}
      >
        <Text style={styles.checkoutText}>Review box</Text>
      </TouchableOpacity>
    </View>
  );

  const footerCta = !isDesktop ? (
    <View style={[styles.footerBar, Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : undefined]}>
      <TouchableOpacity style={styles.footerSecondary} onPress={() => navigation.goBack()}>
        <Text style={styles.footerSecondaryText}>Not ready</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerPrimary, (locked || lineItems.length === 0) && styles.checkoutCtaDisabled]}
        onPress={() => navigation.navigate('Checkout')}
        disabled={locked || lineItems.length === 0}
      >
        <Text style={styles.footerPrimaryText}>Review box</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  const scrollBody = (
    <>
      {scrollHeader}
      <StickySectionNav activeSection={activeSection} onSelect={scrollToSection} />
      {sections}
      {addOnsBlock}
      {!isDesktop ? summaryPanel : null}
    </>
  );

  if (isDesktop) {
    return (
      <WebContentPanel wide>
        <View style={[styles.root, styles.desktopRoot]}>
          <View style={styles.desktopColumns}>
            <ScrollView
              ref={scrollRef}
              style={styles.desktopList}
              contentContainerStyle={styles.desktopListContent}
              onScroll={onScroll}
              scrollEventThrottle={16}
            >
              {scrollBody}
            </ScrollView>
            <View style={styles.desktopSummary}>{summaryPanel}</View>
          </View>
        </View>
      </WebContentPanel>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <WebContentPanel wide gutter>
        <View style={styles.mobileWrap}>
          <ScrollView
            ref={scrollRef}
            style={styles.root}
            contentContainerStyle={styles.content}
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            {scrollBody}
          </ScrollView>
          {footerCta}
        </View>
      </WebContentPanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  mobileWrap: { flex: 1 },
  desktopRoot: { flex: 1 },
  desktopColumns: { flex: 1, flexDirection: 'row', minHeight: 0, gap: spacing.lg },
  desktopList: { flex: 2 },
  desktopListContent: { paddingBottom: spacing.xxl },
  desktopSummary: { flex: 1, maxWidth: 360, paddingTop: spacing.md },
  content: { paddingTop: spacing.sm, paddingBottom: 160 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageHeader: { alignItems: 'center', marginBottom: spacing.sm },
  title: { fontSize: typography.titleLg, fontWeight: '600', textAlign: 'center' },
  headerMeta: { fontSize: typography.sm, color: semanticColors.goldMuted, marginTop: 4, textAlign: 'center' },
  subtitle: {
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  guideLink: { alignSelf: 'center', marginBottom: spacing.md },
  guideLinkText: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: semanticColors.brand,
  },
  kidsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kidsBtn: {
    borderWidth: 1,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  kidsBtnText: { color: semanticColors.brand, fontWeight: '600', fontSize: typography.sm },
  unlockBtn: {
    backgroundColor: '#2b1432',
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  unlockText: { color: '#f1b8ff', fontWeight: '600' },
  lockBanner: {
    backgroundColor: semanticColors.brandLight,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    marginBottom: spacing.md,
  },
  lockBannerClosed: { color: semanticColors.textPrimary, fontWeight: '600' },
  sectionBlock: {
    borderBottomWidth: 0.5,
    borderBottomColor: semanticColors.goldMuted,
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionHeader: { alignItems: 'center', marginBottom: spacing.md, gap: spacing.xs },
  sectionCard: {
    backgroundColor: semanticColors.accentCream,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionTitle: { fontSize: typography.md, fontWeight: '600', textAlign: 'center' },
  sectionSub: { fontSize: typography.sm, color: semanticColors.goldMuted, marginBottom: spacing.sm },
  sectionDesc: {
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  browseChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.sm },
  browseChip: {
    borderWidth: 0.5,
    borderColor: semanticColors.goldMuted,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: semanticColors.bgPrimary,
  },
  browseChipText: { fontSize: 9, color: semanticColors.textPrimary },
  extraRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  itemName: { fontWeight: '600', flex: 1 },
  toggleBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: semanticColors.brand,
  },
  toggleBtnOn: { backgroundColor: semanticColors.brand },
  toggleBtnDisabled: { opacity: 0.5 },
  toggleText: { fontWeight: '600', color: semanticColors.brand, fontSize: typography.sm },
  toggleTextOn: { color: semanticColors.textPrimary },
  summaryCard: {
    backgroundColor: semanticColors.accentCream,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  summaryHeading: { fontSize: typography.xl, fontWeight: '700', marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  summaryLabel: { fontSize: typography.md, color: semanticColors.textSecondary },
  summaryValue: { fontSize: typography.md, fontWeight: '600' },
  summaryTotalRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: semanticColors.border,
  },
  totalLabel: { fontSize: typography.xl, fontWeight: '600' },
  totalValue: { fontSize: typography.xl, fontWeight: '700' },
  checkoutCta: {
    backgroundColor: semanticColors.textPrimary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  checkoutCtaDisabled: { opacity: 0.5 },
  checkoutText: { fontWeight: '700', color: semanticColors.goldMuted },
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
    backgroundColor: semanticColors.bgPrimary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.border,
  },
  footerSecondary: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: semanticColors.border,
    alignItems: 'center',
  },
  footerSecondaryText: { fontWeight: '600', color: semanticColors.textSecondary },
  footerPrimary: {
    flex: 2,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: semanticColors.textPrimary,
    alignItems: 'center',
  },
  footerPrimaryText: { fontWeight: '700', color: semanticColors.goldMuted },
});
