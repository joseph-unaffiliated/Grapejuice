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
import { useActiveProfile } from '../../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY, PILOT_HIDE_IN_APP_GUIDE } from '../../constants/pilotFeatures';
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
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  BOX_DISPLAY_SECTIONS,
  groupLineItemsByDisplaySection,
  catalogAlternatesForSection,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { BoxBrowseGrid } from '../../components/box/BoxBrowseGrid';
import { GuestBoxAuthBanner } from '../../components/box/GuestBoxAuthBanner';
import { defaultIsSurprise } from '../../constants/boxPracticeGroups';
import {
  buildVoter,
  isVotablePerKidSlot,
  isWrappableSlot,
  toggleSlotVote,
  topPickItemId,
} from '../../services/box/slotVotes';
import { PILOT_COPY } from '../../constants/pilotHolidays';
import { spacing, typography, borderRadius, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

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
  const { colors } = useThemeMode();
  const styles = useMemo(() => createMyBoxStyles(colors), [colors]);
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { loading: sessionLoading, profile } = useSession();
  const user = useAuthStore((s) => s.user);
  const { isChildProfile, isParentProfile, activeChild } = useActiveProfile();
  const showKidBoxUi = isChildProfile && !PILOT_PARENT_ONLY;
  const { lineItems, slotVotes, children, loading: draftLoading, persist, persistSlotVotes } =
    useBoxDraft();
  const { guestNeedsOnboarding, guestViewOnly, requireAuthToCustomize } = useGuestBoxFlow();
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);
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
    if (!beforeCustomize()) return;
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

  const toggleExtra = async (item: CatalogItem) => {
    if (locked || !beforeCustomize()) return;
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
    if (locked || !beforeCustomize()) return;
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
    if (locked || !beforeCustomize()) return;
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
                      locked={locked}
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
        {!isChildProfile && meta.browseChips.length ? (
          <View style={styles.browseChips}>
            {meta.browseChips.map((chip) => (
              <TouchableOpacity
                key={chip}
                style={styles.browseChip}
                onPress={() => {
                  if (guestViewOnly) {
                    requireAuthToCustomize('signup');
                    return;
                  }
                  navigation.navigate('AlaCarteStore');
                }}
              >
                <Text style={styles.browseChipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {!isChildProfile ? (
          <BoxBrowseGrid
            title={meta.moreOptionsTitle}
            items={catalogAlternatesForSection(sectionId, catalog, lineItems)}
            locked={locked}
            formatPrice={formatDollars}
            onAdd={(item) => void addCatalogItem(item)}
            onSwapIn={(item) => void swapCatalogIn(item)}
          />
        ) : null}
      </View>
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
        <Text style={styles.title}>
          {isChildProfile ? `${activeChild?.name?.trim() || 'Your'} picks` : 'Your Hanukkah box'}
        </Text>
        {!isChildProfile ? (
          <Text style={styles.headerMeta}>
            {guestViewOnly
              ? 'Browse your box — sign in to swap items and add extras'
              : headerSubtext(lockAt, now)}
          </Text>
        ) : (
          <Text style={styles.headerMeta}>Tap 👍 on what you like — a grown-up picks at checkout</Text>
        )}
      </View>
      {!isChildProfile ? (
        <>
          <Text style={styles.subtitle}>{PILOT_COPY.boxDetailTop}</Text>
          {!PILOT_PARENT_ONLY ? (
            <TouchableOpacity
              style={styles.guideLink}
              onPress={() => navigation.navigate('Guide')}
              activeOpacity={0.85}
            >
              <Text style={styles.guideLinkText}>Open Hanukkah night-by-night guide →</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
      {!isChildProfile && !guestViewOnly ? lockBanner : null}
      {!isChildProfile && guestViewOnly ? (
        <GuestBoxAuthBanner
          onCreateAccount={() => requireAuthToCustomize('signup')}
          onSignIn={() => requireAuthToCustomize('signin')}
        />
      ) : null}
    </>
  );

  const sectionIds = isChildProfile
    ? (['presents', 'story'] as BoxDisplaySectionId[])
    : BOX_DISPLAY_SECTIONS.map((s) => s.id);

  const sections = sectionIds.map((id) => renderSection(id));

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
        onPress={() => {
          if (guestViewOnly) {
            requireAuthToCustomize('signup');
            return;
          }
          navigation.navigate('Checkout');
        }}
        disabled={locked || lineItems.length === 0}
      >
        <Text style={styles.checkoutText}>Review box</Text>
      </TouchableOpacity>
    </View>
  );

  const footerCta = !isDesktop && !isChildProfile ? (
    <View style={[styles.footerBar, Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : undefined]}>
      <TouchableOpacity style={styles.footerSecondary} onPress={() => navigation.goBack()}>
        <Text style={styles.footerSecondaryText}>Not ready</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerPrimary, (locked || lineItems.length === 0) && styles.checkoutCtaDisabled]}
        onPress={() => {
          if (guestViewOnly) {
            requireAuthToCustomize('signup');
            return;
          }
          navigation.navigate('Checkout');
        }}
        disabled={locked || lineItems.length === 0}
      >
        <Text style={styles.footerPrimaryText}>Review box</Text>
      </TouchableOpacity>
    </View>
  ) : null;

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
      {!isChildProfile ? <StickySectionNav activeSection={activeSection} onSelect={scrollToSection} /> : null}
      {kidEmptyState ? null : sections}
      {!isChildProfile ? addOnsBlock : null}
      {!isDesktop && !isChildProfile ? summaryPanel : null}
    </>
  );

  if (isDesktop && !isChildProfile) {
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

function createMyBoxStyles(colors: SemanticColors) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bgPrimary },
  root: { flex: 1, backgroundColor: colors.bgPrimary },
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
  headerMeta: { fontSize: typography.sm, color: colors.goldMuted, marginTop: 4, textAlign: 'center' },
  subtitle: {
    fontSize: typography.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 20,
    textAlign: 'center',
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
    borderWidth: 1,
    borderColor: colors.border,
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
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionHeader: { alignItems: 'center', marginBottom: spacing.md, gap: spacing.xs },
  sectionCard: {
    backgroundColor: colors.accentCream,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionTitle: { fontSize: typography.md, fontWeight: '600', textAlign: 'center' },
  sectionSub: { fontSize: typography.sm, color: colors.goldMuted, marginBottom: spacing.sm },
  sectionDesc: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
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
  extraRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  itemName: { fontWeight: '600', flex: 1 },
  toggleBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  toggleBtnOn: { backgroundColor: colors.brand },
  toggleBtnDisabled: { opacity: 0.5 },
  toggleText: { fontWeight: '600', color: colors.brand, fontSize: typography.sm },
  toggleTextOn: { color: colors.textPrimary },
  summaryCard: {
    backgroundColor: colors.accentCream,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  summaryHeading: { fontSize: typography.xl, fontWeight: '700', marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  summaryLabel: { fontSize: typography.md, color: colors.textSecondary },
  summaryValue: { fontSize: typography.md, fontWeight: '600' },
  summaryTotalRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
