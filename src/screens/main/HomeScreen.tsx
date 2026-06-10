import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../hooks/useSession';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { useHolidayPhase } from '../../hooks/useHolidayPhase';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useGuestBoxFlow } from '../../hooks/useGuestBoxFlow';
import { usersService } from '../../services/firestore/users';
import { ordersService } from '../../services/firestore/orders';
import { catalogService } from '../../services/firestore/catalog';
import { getHanukkahConfig, getPassoverWaitlistConfig, isBoxLocked } from '../../services/firestore/config';
import { formatCountdown, formatHanukkahWelcomeSubtext } from '../../services/hanukkah/dates';
import {
  deriveBoxLifecycle,
  buildDeliveryTimeline,
  heroTitleForLifecycle,
} from '../../services/box/boxLifecycle';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { CatalogProductRail, COLLECTION_RAIL_GAP } from '../../components/home/CatalogProductRail';
import { HomeHeroCard } from '../../components/home/HomeHeroCard';
import { MyBoxesWelcomeCard } from '../../components/home/MyBoxesWelcomeCard';
import { SetTheStageSection } from '../../components/home/SetTheStageSection';
import { DeliveryTrackingCard } from '../../components/home/DeliveryTrackingCard';
import { PassoverPreregisterCard } from '../../components/home/PassoverPreregisterCard';
import { HANUKKAH_TIMELINE_2026 } from '../../constants/hanukkahTimeline';
import {
  COLLECTION_RAILS,
  filterCatalogByTag,
} from '../../constants/catalogCuration';
import { PASSOVER_NOTIFY_INTEREST } from '../../constants/pilotHolidays';
import type { MainTabsParamList, MainStackParamList } from '../../navigation/types';
import type { CatalogItem, PilotOrder } from '../../types/pilot';
import {
  spacing,
  borderRadius,
  shadows,
  typography,
  MOBILE_GUTTER,
  tabBarTotalHeight,
} from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useEffectiveWindowDimensions } from '../../hooks/useEffectiveWindowDimensions';
import { useWebLayout } from '../../hooks/useWebLayout';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { SearchPill } from '../../components/ui/SearchPill';
import { FIGMA_HERO_SUBTITLE, isFigmaCompareCapture } from '../../utils/figmaCompare';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabsParamList, 'Home'>,
  StackNavigationProp<MainStackParamList>
>;

const HEADER_CHIP_GAP = 16;
const HEADER_TOP_PAD_WEB = 72;
const HEADER_BOTTOM_PAD = 16;
const CONTENT_TOP_GAP = 24;
const SCROLL_GAP = 24;
const SHADOW_BLEED = 8;

/** Figma 370:2954 — category chip row */
const CATEGORY_CHIPS = [
  { id: 'holidays', label: 'Holidays' },
  { id: 'shabbat', label: 'Shabbat' },
  { id: 'home', label: 'Home' },
  { id: 'stories', label: 'Stories' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'orders', label: 'Orders' },
  { id: 'lists', label: 'Lists' },
] as const;

function myBoxCardWidth(screenWidth: number) {
  return Math.floor((screenWidth * 3) / 5);
}

function gridCellForCard(cardWidth: number) {
  const content = cardWidth - 32;
  return Math.floor((content - 4) / 2);
}

function heroSubtext(
  startsOn: string | null,
  lockCountdown: string | null,
  now: Date
): string {
  if (isFigmaCompareCapture()) return FIGMA_HERO_SUBTITLE;
  const hanukkahLine = formatHanukkahWelcomeSubtext(startsOn, now);
  if (lockCountdown) {
    const shipMatch = lockCountdown.match(/^(\d+) day/);
    if (shipMatch) {
      return `${hanukkahLine} (ships in ${shipMatch[1]} day${shipMatch[1] === '1' ? '' : 's'})`;
    }
    return `${hanukkahLine} (${lockCountdown} to customize)`;
  }
  return hanukkahLine;
}

function statusLine(phase: string, locked: boolean, lockCountdown: string | null, hasOrder: boolean, order?: PilotOrder | null): string {
  if (phase === 'during') return 'Tonight\'s night — open the guide in your box →';
  if (phase === 'post') return 'Share how Hanukkah went →';
  if (phase === 'confirmed') return order?.trackingNumber ? 'Track your shipment →' : 'Your box is on the way →';
  if (phase === 'delivered') return 'Your box arrived — get ready →';
  if (hasOrder) return 'Order placed — watch for tracking →';
  if (locked) return 'Customization closed →';
  if (lockCountdown) return `${lockCountdown} to customize →`;
  return 'Ready to customize →';
}

export function HomeScreen() {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createHomeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useEffectiveWindowDimensions();
  const { isDesktop, layoutWidth } = useWebLayout();
  const contentWidth = isDesktop ? layoutWidth : screenWidth;
  const { household, loading: sessionLoading } = useSession();
  const { lineItems, loading: draftLoading } = useBoxDraft();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const guestInterests = useGuestSessionStore((s) => s.interests);
  const toggleGuestInterest = useGuestSessionStore((s) => s.toggleInterest);

  const scrollRef = useRef<ScrollView>(null);
  const [holidaySectionY, setHolidaySectionY] = useState(0);
  const [collectionSectionY, setCollectionSectionY] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [estimatedDelivery, setEstimatedDelivery] = useState<string | null>(null);
  const [orders, setOrders] = useState<PilotOrder[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [passoverCapacity, setPassoverCapacity] = useState(39);
  const [now, setNow] = useState(() => new Date());

  const interests = guestInterests;
  const { beginBoxBuild } = useGuestBoxFlow();

  const openBox = useCallback(() => {
    if (!beginBoxBuild()) {
      navigation.navigate('MyBox');
    }
  }, [beginBoxBuild, navigation]);

  const cardWidth = useMemo(() => myBoxCardWidth(contentWidth), [contentWidth]);
  const gridCell = useMemo(() => gridCellForCard(cardWidth), [cardWidth]);
  const itemCount = lineItems.length;
  const hasOrder = orders.some((o) => o.status === 'confirmed' || o.status === 'shipped' || o.status === 'delivered');
  const hasBoxStarted = itemCount > 0;

  const catalogById = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    catalog.forEach((item) => map.set(item.id, item));
    return map;
  }, [catalog]);

  const previewItems = useMemo(() => {
    const ids = lineItems.slice(0, 6).map((li) => li.itemId);
    return ids.map((id) => catalogById.get(id)).filter((i): i is CatalogItem => i != null);
  }, [lineItems, catalogById]);

  const hanukkiahItems = useMemo(() => filterCatalogByTag(catalog, COLLECTION_RAILS[0]?.tag ?? 'hanukkiah'), [catalog]);
  const dreidelItems = useMemo(() => filterCatalogByTag(catalog, COLLECTION_RAILS[1]?.tag ?? 'dreidel'), [catalog]);
  const decorationItems = useMemo(() => filterCatalogByTag(catalog, 'decorations'), [catalog]);
  const apparelItems = useMemo(() => filterCatalogByTag(catalog, 'apparel'), [catalog]);

  const load = useCallback(async () => {
    setLoading(true);
    const [config, passoverConfig, catalogItems] = await Promise.all([
      getHanukkahConfig(),
      getPassoverWaitlistConfig(),
      catalogService.getAll(),
    ]);
    setLockAt(config.lockAt);
    setStartsOn(config.startsOn);
    setEstimatedDelivery(config.estimatedDeliveryBy ?? null);
    setPassoverCapacity(passoverConfig.capacityPercent);
    setCatalog(catalogItems);

    if (household?.id) {
      setOrders(await ordersService.listForHousehold(household.id));
    } else {
      setOrders([]);
    }

    setLoading(false);
  }, [household?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { phase, hanukkah, primaryOrder } = useHolidayPhase(startsOn, hasOrder, orders, now);
  const locked = isBoxLocked(lockAt);
  const lockCountdown = !locked ? formatCountdown(lockAt, now) : null;
  const passoverNotified = interests.includes(PASSOVER_NOTIFY_INTEREST);

  const boxLifecycle = deriveBoxLifecycle({ itemCount, hasOrder, primaryOrder });
  const heroTitle = heroTitleForLifecycle(boxLifecycle);
  const heroSubtitle = heroSubtext(startsOn, lockCountdown, now);
  const showDeliveryTracking =
    boxLifecycle === 'ordered' ||
    boxLifecycle === 'shipped' ||
    boxLifecycle === 'in_transit' ||
    boxLifecycle === 'delivered';
  const deliverySteps = buildDeliveryTimeline(
    boxLifecycle,
    primaryOrder,
    primaryOrder?.estimatedDelivery ?? estimatedDelivery
  );

  const submitSearch = () => {
    const msg = searchQuery.trim();
    if (!msg) {
      navigation.navigate('Rav');
      return;
    }
    navigation.navigate('Rav', { initialMessage: msg });
    setSearchQuery('');
  };

  const handleToggleInterest = async (holidayId: string) => {
    toggleGuestInterest(holidayId);
    if (isAuthenticated && user?.uid) {
      await usersService.upsert(user.uid, { notificationsOptIn: true });
    }
  };

  const handlePassoverPreregister = () => {
    if (passoverNotified) return;
    void handleToggleInterest(PASSOVER_NOTIFY_INTEREST);
    Alert.alert("You're pre-registered for Passover 2027");
  };

  const handleCategoryChip = (id: (typeof CATEGORY_CHIPS)[number]['id']) => {
    if (id === 'holidays') {
      scrollRef.current?.scrollTo({ y: holidaySectionY, animated: true });
    } else if (id === 'home' || id === 'stories' || id === 'recipes' || id === 'lists') {
      scrollRef.current?.scrollTo({ y: collectionSectionY, animated: true });
    } else if (id === 'orders') {
      navigation.navigate('Account');
    } else if (id === 'shabbat') {
      navigation.navigate('Rav', { initialMessage: 'Help me plan Shabbat with my family' });
    }
  };

  const myBoxCardStyle = [
    styles.myBoxCard,
    { width: cardWidth, minWidth: cardWidth },
    Platform.OS === 'web' ? { boxShadow: '0px 0px 12px rgba(216, 201, 144, 0.50)' } : shadows.goldGlow,
  ];

  const headerShadow =
    Platform.OS === 'web'
      ? ({ boxShadow: '0px 4px 12px rgba(216, 201, 144, 0.50)' } as object)
      : shadows.goldGlow;

  const scrollBottomPad = tabBarTotalHeight(Math.max(insets.bottom, 0)) + spacing.lg;

  if (sessionLoading || loading || draftLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <WebContentPanel flush style={styles.panel}>
        <View
          style={[
            styles.header,
            styles.headerSticky,
            headerShadow,
            {
              paddingTop: Platform.OS === 'web' ? HEADER_TOP_PAD_WEB : Math.max(insets.top, spacing.md),
              paddingBottom: HEADER_BOTTOM_PAD,
            },
          ]}
        >
          <View style={styles.headerSearch}>
            <SearchPill
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={submitSearch}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.categoryChips}
          >
            {CATEGORY_CHIPS.map((chip) => (
              <TouchableOpacity
                key={chip.id}
                style={styles.categoryChip}
                onPress={() => handleCategoryChip(chip.id)}
              >
                <Text style={styles.categoryChipText}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          {showDeliveryTracking ? (
            <DeliveryTrackingCard
              title={heroTitle}
              subtitle={heroSubtitle}
              steps={deliverySteps}
            />
          ) : (
            <HomeHeroCard
              title={heroTitle}
              subtitle={heroSubtitle}
              compact={hasBoxStarted}
              onPress={openBox}
            />
          )}

          {phase === 'during' ? (
            <TouchableOpacity
              style={styles.phaseCard}
              onPress={() => navigation.navigate('Guide')}
              activeOpacity={0.85}
            >
              <Text style={styles.phaseTitle}>Night {hanukkah.night} of 8</Text>
              {HANUKKAH_TIMELINE_2026.filter((n) => n.night === hanukkah.night).map((n) => (
                <View key={n.night}>
                  <Text style={styles.phaseBody}>{n.title} — {n.prompt}</Text>
                </View>
              ))}
              <Text style={styles.phaseLink}>Open tonight&apos;s guide →</Text>
            </TouchableOpacity>
          ) : null}

          {phase === 'post' ? (
            <TouchableOpacity style={styles.phaseCard} onPress={() => navigation.navigate('Reflection')}>
              <Text style={styles.phaseTitle}>How did Hanukkah go?</Text>
              <Text style={styles.phaseBody}>A quick reflection helps us plan next year — and Passover.</Text>
              <Text style={styles.phaseLink}>Start reflection →</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.section} onLayout={(e) => setHolidaySectionY(e.nativeEvent.layout.y)}>
            <View style={[styles.sectionHeader, styles.gutterPad]}>
              <Text style={styles.sectionTitle}>My Boxes</Text>
            </View>

            {!hasBoxStarted && !hasOrder ? (
              <MyBoxesWelcomeCard
                onPress={openBox}
                passoverRegistered={passoverNotified}
                onPassoverPreregister={handlePassoverPreregister}
                onPreregisterInterest={handleToggleInterest}
              />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.myBoxesScroll}
                contentContainerStyle={styles.myBoxesRow}
              >
                <View style={styles.myBoxShadowWrap}>
                  <TouchableOpacity
                    style={myBoxCardStyle}
                    onPress={openBox}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.myBoxCardTitle}>Hanukkah</Text>
                    <Text style={styles.myBoxCardSub}>
                      {hasBoxStarted
                        ? `Annual • ${itemCount} item${itemCount === 1 ? '' : 's'}`
                        : statusLine(phase, locked, lockCountdown, hasOrder, primaryOrder)}
                    </Text>
                    <View style={styles.myBoxGrid}>
                      {[0, 1, 2].map((row) => (
                        <View key={row} style={styles.myBoxGridRow}>
                          {[0, 1].map((col) => {
                            const idx = row * 2 + col;
                            const item = previewItems[idx];
                            return (
                              <BoxItemImage
                                key={col}
                                size={gridCell}
                                imageUrl={item?.imageUrl}
                                itemId={item?.id}
                                style={styles.myBoxGridCell}
                              />
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </TouchableOpacity>
                </View>
                <MyBoxesWelcomeCard
                  width={Math.floor(cardWidth * 0.92)}
                  peek
                  onPress={openBox}
                  passoverRegistered={passoverNotified}
                  onPassoverPreregister={handlePassoverPreregister}
                  onPreregisterInterest={handleToggleInterest}
                />
              </ScrollView>
            )}
          </View>

          <View style={styles.collectionSection} onLayout={(e) => setCollectionSectionY(e.nativeEvent.layout.y)}>
            <View style={styles.collectionBlock}>
              <Text style={[styles.collectionHeading, styles.gutterPad]}>Build your Collection</Text>
              <View style={styles.collectionRails}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.collectionScroll}
                contentContainerStyle={styles.collectionRow}
              >
                <CatalogProductRail
                  title={COLLECTION_RAILS[0]?.title ?? 'Hanukkiahs'}
                  items={hanukkiahItems}
                />
              </ScrollView>
              {!hasBoxStarted ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.collectionScroll}
                  contentContainerStyle={styles.collectionRow}
                >
                  <CatalogProductRail
                    title={COLLECTION_RAILS[1]?.title ?? 'Dreidels'}
                    items={dreidelItems}
                  />
                </ScrollView>
              ) : null}
              </View>
            </View>
            {hasBoxStarted ? (
              <>
                <Text style={[styles.collectionHeading, styles.gutterPad, styles.spiritHeading]}>
                  Get in the Spirit
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.collectionScroll}
                  contentContainerStyle={styles.collectionRow}
                >
                  <CatalogProductRail title="Decorations" items={decorationItems} />
                </ScrollView>
              </>
            ) : (
              <SetTheStageSection apparel={apparelItems} decorations={decorationItems} />
            )}
          </View>

          <View style={styles.passoverWrap}>
            <PassoverPreregisterCard
              capacityPercent={passoverCapacity}
              registered={passoverNotified}
              onRegister={handlePassoverPreregister}
            />
          </View>

        </ScrollView>
      </WebContentPanel>
    </View>
  );
}

function createHomeStyles(colors: SemanticColors) {
  return StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: colors.bgPrimary, overflow: 'visible' as const },
  panel: { overflow: 'visible' as const },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary },
  header: {
    gap: HEADER_CHIP_GAP,
    backgroundColor: colors.bgPrimary,
    overflow: 'visible' as const,
  },
  headerSticky: Platform.OS === 'web' ? ({ position: 'sticky' as const, top: 0, zIndex: 20 }) : {},
  headerSearch: { paddingHorizontal: MOBILE_GUTTER },
  chipsScroll: {
    overflow: 'visible' as const,
    marginHorizontal: 0,
    width: '100%',
  },
  categoryChips: {
    gap: 6,
    paddingLeft: MOBILE_GUTTER,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryChip: {
    borderWidth: 0.5,
    borderColor: colors.brand,
    borderRadius: 32,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  categoryChipText: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.textPrimary,
    letterSpacing: -0.22,
    fontFamily: typography.fontFamily.light,
  },
  scrollView: { flex: 1, overflow: 'visible' as const },
  content: {
    gap: SCROLL_GAP,
    paddingTop: CONTENT_TOP_GAP,
    overflow: 'visible' as const,
  },
  gutterPad: { paddingHorizontal: MOBILE_GUTTER },
  phaseCard: {
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.goldMuted,
  },
  phaseTitle: { fontSize: typography.xl, fontWeight: '600', color: colors.textPrimary },
  phaseBody: { fontSize: typography.md, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 20 },
  phaseLink: { fontSize: typography.sm, color: colors.brand, marginTop: spacing.sm, fontWeight: '600' },
  section: { gap: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: typography.lg,
    fontWeight: '400',
    color: colors.textPrimary,
    letterSpacing: -0.26,
  },
  collectionSection: { gap: COLLECTION_RAIL_GAP, overflow: 'visible' as const },
  /** Matches SetTheStageSection — 12px from section title to first card. */
  collectionBlock: { gap: COLLECTION_RAIL_GAP, overflow: 'visible' as const },
  collectionRails: {
    gap: COLLECTION_RAIL_GAP,
    overflow: 'visible' as const,
  },
  collectionScroll: {
    overflow: 'visible' as const,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'flex-start' as const,
    ...(Platform.OS === 'web'
      ? ({
          overflow: 'visible',
          overflowX: 'auto',
          overflowY: 'visible',
        } as object)
      : {}),
  },
  collectionRow: {
    flexDirection: 'row',
    gap: COLLECTION_RAIL_GAP,
    paddingLeft: MOBILE_GUTTER,
    paddingRight: MOBILE_GUTTER,
    alignItems: 'flex-start',
  },
  collectionHeading: {
    fontSize: typography.lg,
    fontWeight: '400',
    color: colors.textPrimary,
    letterSpacing: -0.26,
  },
  spiritHeading: { marginTop: spacing.xs },
  myBoxesScroll: { overflow: 'visible' as const, paddingVertical: SHADOW_BLEED, marginVertical: -SHADOW_BLEED },
  myBoxesRow: { gap: spacing.md, paddingLeft: MOBILE_GUTTER, paddingRight: MOBILE_GUTTER, alignItems: 'flex-start' },
  myBoxShadowWrap: {
    overflow: 'visible' as const,
    paddingVertical: 4,
  },
  myBoxCard: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 16,
    padding: spacing.md,
    minHeight: 280,
  },
  myBoxCardTitle: { fontSize: typography.lg, fontWeight: '400', color: colors.textPrimary, letterSpacing: -0.26 },
  myBoxCardSub: { fontSize: typography.sm, fontWeight: '200', color: colors.textSecondary, marginTop: 4, marginBottom: spacing.sm },
  myBoxGrid: { marginTop: spacing.sm, gap: 4 },
  myBoxGridRow: { flexDirection: 'row', gap: 4 },
  myBoxGridCell: { backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: borderRadius.sm },
  passoverWrap: {
    overflow: 'visible' as const,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: SHADOW_BLEED,
    marginBottom: -SHADOW_BLEED,
  },
  });
}
