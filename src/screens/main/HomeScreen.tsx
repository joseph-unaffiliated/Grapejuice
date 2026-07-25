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
  Animated,
  Easing,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../hooks/useSession';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { PILOT_HIDE_IN_APP_GUIDE } from '../../constants/pilotFeatures';
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
import {
  CatalogProductRail,
  COLLECTION_RAIL_GAP,
  horizontalRailContentStyle,
  horizontalRailGutterPadding,
  horizontalRailOuterStyle,
  horizontalRailScrollStyle,
} from '../../components/home/CatalogProductRail';
import { HorizontalDragScrollView } from '../../components/home/HorizontalDragScrollView';
import { MyBoxesCardHeader } from '../../components/home/MyBoxesCardHeader';
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
import { useHolidayPhase } from '../../hooks/useHolidayPhase';
import type { MainTabsParamList, MainStackParamList } from '../../navigation/types';
import type { CatalogItem, PilotOrder } from '../../types/pilot';
import {
  spacing,
  borderRadius,
  shadows,
  shadowsWeb,
  typography,
  MOBILE_GUTTER,
  LAYOUT,
  tabBarTotalHeight,
} from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useEffectiveWindowDimensions } from '../../hooks/useEffectiveWindowDimensions';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useMeasuredContentColumnOffset } from '../../hooks/useMeasuredContentColumnOffset';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  HomeStickySearchHeader,
  HEADER_DESKTOP_TOP_PAD,
  HOME_HEADER_COLLAPSE_MS,
  HOME_HEADER_COLLAPSE_RANGE,
} from '../../components/home/HomeStickySearchHeader';
import { TextWithChevron } from '../../components/ui/TextWithChevron';
import { FIGMA_HERO_SUBTITLE, isFigmaCompareCapture } from '../../utils/figmaCompare';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabsParamList, 'Home'>,
  StackNavigationProp<MainStackParamList>
>;

const CONTENT_TOP_GAP = 24;
const SCROLL_GAP = 24;
const CONTENT_TOP_GAP_DESKTOP = 41;
const SCROLL_GAP_DESKTOP = 41;
const SHADOW_BLEED = 8;

/** Category chips scroll to collection sections on Home. */
const CATEGORY_CHIPS = [
  { id: 'hanukkah', label: 'Hanukkah' },
  { id: 'hanukkiahs', label: 'Hanukkiahs' },
  { id: 'dreidels', label: 'Dreidels' },
  { id: 'apparel', label: 'Apparel' },
  { id: 'decorations', label: 'Decorations' },
] as const;

/** Active Hanukkah card is content-sized (grid), not a screen-width fraction. */
const MY_BOXES_GRID_CELL_TARGET = 100;
const MY_BOXES_ACTIVE_CARD_WIDTH = spacing.md * 2 + MY_BOXES_GRID_CELL_TARGET * 2 + 4;
/**
 * Peek “Add More” needs room for holiday rows (64px thumb + copy + CTAs).
 * Keep this wider than the Hanukkah card — do not share the same width formula.
 */
const MY_BOXES_PEEK_CARD_WIDTH = 400;

function gridCellForCard(cardWidth: number) {
  const horizontalPad = spacing.md * 2;
  const content = cardWidth - horizontalPad;
  const widthBased = Math.floor((content - 4) / 2);
  return Math.min(widthBased, MY_BOXES_GRID_CELL_TARGET);
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
  if (phase === 'post') return 'Hanukkah debrief →';
  if (phase === 'confirmed') return order?.trackingNumber ? 'Track your shipment →' : 'Your box is on the way →';
  if (phase === 'delivered') return 'Your box arrived — get ready →';
  if (hasOrder) return 'Order placed — watch for tracking →';
  if (locked) return 'Customization closed →';
  if (lockCountdown) return `${lockCountdown} to customize →`;
  return 'Ready to customize →';
}

export function HomeScreen() {
  const { colors } = useThemeMode();
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useEffectiveWindowDimensions();
  const { isDesktop, layoutWidth, contentColumnOffset: layoutContentOffset } = useWebLayout();
  const { contentColumnOffset: measuredContentOffset, onLayoutContainer } =
    useMeasuredContentColumnOffset(layoutWidth, isDesktop);
  // Prefer the live-measured main-area width so rails stay aligned while the sidebar animates.
  const contentColumnOffset =
    measuredContentOffset > 0 ? measuredContentOffset : layoutContentOffset;
  const styles = useMemo(
    () => createHomeStyles(colors, isDesktop, contentColumnOffset),
    [colors, isDesktop, contentColumnOffset],
  );
  const contentWidth = isDesktop ? layoutWidth : screenWidth;
  const { household, loading: sessionLoading } = useSession();
  const { lineItems, loading: draftLoading } = useBoxDraft();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const guestInterests = useGuestSessionStore((s) => s.interests);
  const toggleGuestInterest = useGuestSessionStore((s) => s.toggleInterest);

  const scrollRef = useRef<ScrollView>(null);
  const collapseProgress = useRef(new Animated.Value(0)).current;
  const headerCollapsedRef = useRef(false);
  const headerCollapseAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  /** True only at the top / fully expanded header — drives SearchPill typewriter. */
  const [headerExpanded, setHeaderExpanded] = useState(true);

  const setHeaderCollapsed = useCallback((collapsed: boolean) => {
    if (headerCollapsedRef.current === collapsed) return;
    headerCollapsedRef.current = collapsed;
    setHeaderExpanded(!collapsed);
    headerCollapseAnimRef.current?.stop();
    headerCollapseAnimRef.current = Animated.timing(collapseProgress, {
      toValue: collapsed ? 1 : 0,
      duration: HOME_HEADER_COLLAPSE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    headerCollapseAnimRef.current.start();
  }, [collapseProgress]);

  const onHomeScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = event.nativeEvent.contentOffset.y;
      // Hysteresis: fire a full timed transition instead of scrubbing with scroll.
      if (y >= HOME_HEADER_COLLAPSE_RANGE) setHeaderCollapsed(true);
      else if (y <= 8) setHeaderCollapsed(false);
    },
    [setHeaderCollapsed],
  );
  const [hanukkahSectionY, setHanukkahSectionY] = useState(0);
  const [hanukkiahSectionY, setHanukkiahSectionY] = useState(0);
  const [dreidelSectionY, setDreidelSectionY] = useState(0);
  const [apparelSectionY, setApparelSectionY] = useState(0);

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

  const cardWidth = MY_BOXES_ACTIVE_CARD_WIDTH;
  const gridCell = useMemo(() => gridCellForCard(cardWidth), [cardWidth]);
  const itemCount = lineItems.length;
  const hasOrder = orders.some(
    (o) =>
      o.status === 'committed' ||
      o.status === 'confirmed' ||
      o.status === 'shipped' ||
      o.status === 'delivered'
  );
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
    const targets: Record<(typeof CATEGORY_CHIPS)[number]['id'], number> = {
      hanukkah: hanukkahSectionY,
      hanukkiahs: hanukkiahSectionY,
      dreidels: dreidelSectionY,
      apparel: apparelSectionY,
      decorations: apparelSectionY,
    };
    const y = targets[id];
    if (y > 0) {
      scrollRef.current?.scrollTo({ y, animated: true });
    }
  };

  const myBoxCardStyle = [
    styles.myBoxCard,
    { width: cardWidth, minWidth: cardWidth },
    Platform.OS === 'web' ? { boxShadow: '0px 0px 12px rgba(216, 201, 144, 0.50)' } : shadows.goldGlow,
  ];

  const headerShadow =
    Platform.OS === 'web'
      ? ({ boxShadow: shadowsWeb.goldBar } as object)
      : shadows.goldGlow;

  const expandedHeaderPaddingTop = isDesktop
    ? HEADER_DESKTOP_TOP_PAD
    : Platform.OS === 'web'
      ? spacing.md
      : Math.max(insets.top, spacing.md);

  const headerBlock = (
    <HomeStickySearchHeader
      collapseProgress={collapseProgress}
      isDesktop={isDesktop}
      contentWidth={contentWidth}
      expandedPaddingTop={expandedHeaderPaddingTop}
      searchQuery={searchQuery}
      onChangeSearch={setSearchQuery}
      onSubmitSearch={submitSearch}
      chips={CATEGORY_CHIPS}
      onChipPress={handleCategoryChip}
      headerShadow={headerShadow}
      animatePlaceholder={headerExpanded && isFocused}
    />
  );

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
      {isDesktop ? headerBlock : null}
      <WebContentPanel
        flush
        omitDesktopTopPadding={isDesktop}
        centerDesktop={isDesktop}
        style={styles.panel}
      >
        {!isDesktop ? headerBlock : null}

        <View
          style={[styles.scrollHost, isDesktop && styles.scrollHostDesktopBleed]}
          onLayout={isDesktop ? onLayoutContainer : undefined}
          testID="home-scroll-host"
        >
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollBody,
            isDesktop && styles.scrollBodyDesktop,
            { paddingBottom: scrollBottomPad },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onHomeScroll}
          {...(Platform.OS === 'web' ? { className: 'gj-home-scroll', testID: 'home-vertical-scroll' } : {})}
        >
          <View style={styles.scrollContent} testID="home-scroll-content">
          <View
            style={[styles.contentColumn, isDesktop ? { maxWidth: layoutWidth, alignSelf: 'center' as const } : null]}
            testID="home-content-column"
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

          {phase === 'during' && !PILOT_HIDE_IN_APP_GUIDE ? (
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
              <TextWithChevron
                text={"Open tonight's guide →"}
                textStyle={styles.phaseLink}
                style={styles.phaseLinkRow}
                iconColor={colors.brand}
              />
            </TouchableOpacity>
          ) : phase === 'during' ? (
            <View style={styles.phaseCard}>
              <Text style={styles.phaseTitle}>Night {hanukkah.night} of 8</Text>
              {HANUKKAH_TIMELINE_2026.filter((n) => n.night === hanukkah.night).map((n) => (
                <View key={n.night}>
                  <Text style={styles.phaseBody}>{n.title} — {n.prompt}</Text>
                </View>
              ))}
              <Text style={styles.phaseBody}>Tonight&apos;s activities are in the Hanukkah guide in your box.</Text>
            </View>
          ) : null}

          {phase === 'post' ? (
            <TouchableOpacity style={styles.phaseCard} onPress={() => navigation.navigate('Reflection')}>
              <Text style={styles.phaseTitle}>Hanukkah debrief</Text>
              <Text style={styles.phaseBody}>Share how Hanukkah went — and unlock $80 toward Passover next year.</Text>
              <TextWithChevron
                text="Start debrief →"
                textStyle={styles.phaseLink}
                style={styles.phaseLinkRow}
                iconColor={colors.brand}
              />
            </TouchableOpacity>
          ) : null}

          {phase !== 'post' ? (
            <TouchableOpacity
              style={styles.aboutHanukkahLink}
              onPress={() => navigation.navigate('AboutHanukkah')}
              activeOpacity={0.85}
            >
              <TextWithChevron
                text="About Hanukkah — light primer →"
                textStyle={styles.phaseLink}
                style={styles.phaseLinkRow}
                iconColor={colors.brand}
              />
            </TouchableOpacity>
          ) : null}
          </View>

          <View style={styles.railBleedSection} testID="home-my-boxes-rail">
          <View
            style={styles.collectionBlock}
            onLayout={(e) => setHanukkahSectionY(e.nativeEvent.layout.y)}
          >
            <Text
              style={[
                styles.collectionHeading,
                isDesktop ? styles.sectionTitleInset : styles.gutterPad,
              ]}
            >
              My Boxes
            </Text>

            {!hasBoxStarted && !hasOrder ? (
              // Solo empty-state card: match hero width (content column − card gutter).
              // Don't add MOBILE_GUTTER here — MyBoxesWelcomeCard's shadowWrap already has it.
              <View style={isDesktop ? { paddingHorizontal: contentColumnOffset } : undefined}>
                <MyBoxesWelcomeCard
                  onPress={openBox}
                  passoverRegistered={passoverNotified}
                  onPassoverPreregister={handlePassoverPreregister}
                  onPreregisterInterest={handleToggleInterest}
                />
              </View>
            ) : (
              <View style={styles.collectionRailOuter}>
                <HorizontalDragScrollView
                  horizontal
                  nestedScrollEnabled
                  directionalLockEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.collectionScroll}
                  contentContainerStyle={styles.myBoxesRow}
                >
                  <View style={styles.myBoxShadowWrap}>
                    <TouchableOpacity
                      style={myBoxCardStyle}
                      onPress={openBox}
                      activeOpacity={0.85}
                    >
                      <MyBoxesCardHeader
                        title="Hanukkah"
                        subtitle={
                          hasBoxStarted
                            ? `Annual  •  ${itemCount} item${itemCount === 1 ? '' : 's'}`
                            : statusLine(phase, locked, lockCountdown, hasOrder, primaryOrder)
                        }
                      />
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
                    width={MY_BOXES_PEEK_CARD_WIDTH}
                    peek
                    onPress={openBox}
                    passoverRegistered={passoverNotified}
                    onPassoverPreregister={handlePassoverPreregister}
                    onPreregisterInterest={handleToggleInterest}
                  />
                </HorizontalDragScrollView>
              </View>
            )}
          </View>
          </View>

          <View
            style={styles.railBleedSection}
            testID="home-rail-bleed"
          >
          <View style={styles.collectionSection}>
            <View
              style={styles.collectionBlock}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                setHanukkiahSectionY(y);
                setDreidelSectionY(y);
              }}
            >
              <Text
                style={[
                  styles.collectionHeading,
                  isDesktop ? styles.sectionTitleInset : styles.gutterPad,
                ]}
              >
                Build your Collection
              </Text>
              <View style={styles.collectionRailOuter}>
                <HorizontalDragScrollView
                  horizontal
                  nestedScrollEnabled
                  directionalLockEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.collectionScroll}
                  contentContainerStyle={styles.collectionRow}
                >
                  <CatalogProductRail
                    title={COLLECTION_RAILS[0]?.title ?? 'Hanukkiahs'}
                    items={hanukkiahItems}
                  />
                  <CatalogProductRail
                    title={COLLECTION_RAILS[1]?.title ?? 'Dreidels'}
                    items={dreidelItems}
                  />
                </HorizontalDragScrollView>
              </View>
            </View>
            <View onLayout={(e) => setApparelSectionY(e.nativeEvent.layout.y)}>
              <SetTheStageSection
                apparel={apparelItems}
                decorations={decorationItems}
                contentColumnOffset={contentColumnOffset}
              />
            </View>
          </View>
          </View>

          <View
            style={[styles.contentColumn, isDesktop ? { maxWidth: layoutWidth, alignSelf: 'center' as const } : null]}
          >
          <View style={styles.passoverWrap}>
            <PassoverPreregisterCard
              capacityPercent={passoverCapacity}
              registered={passoverNotified}
              onRegister={handlePassoverPreregister}
            />
          </View>
          </View>
          </View>

        </Animated.ScrollView>
        </View>
      </WebContentPanel>
    </View>
  );
}

function createHomeStyles(
  colors: SemanticColors,
  isDesktop: boolean,
  contentColumnOffset: number,
) {
  return StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: colors.bgPrimary, overflow: 'visible' as const },
  panel: { overflow: 'visible' as const },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary },
  scrollHost: {
    flex: 1,
    width: '100%',
    overflow: 'hidden' as const,
  },
  /**
   * Cancel panel gutter and span the live main-area width (tracks sidebar collapse)
   * so the content column stays centered with the search header.
   */
  scrollHostDesktopBleed: {
    marginHorizontal: -LAYOUT.WEB_CONTENT_GUTTER,
    ...(Platform.OS === 'web'
      ? ({ width: `calc(100% + ${LAYOUT.WEB_CONTENT_GUTTER * 2}px)` } as object)
      : { alignSelf: 'stretch' as const }),
  },
  scrollView: { flex: 1, width: '100%', overflow: 'hidden' as const },
  scrollContent: {
    width: '100%',
    paddingTop: isDesktop ? CONTENT_TOP_GAP_DESKTOP : CONTENT_TOP_GAP,
    gap: isDesktop ? SCROLL_GAP_DESKTOP : SCROLL_GAP,
    overflow: 'visible' as const,
  },
  /** RN Web scroll content wrapper — fixed width; horizontal motion stays in rail scroll views. */
  scrollBody: {
    flexGrow: 1,
    overflow: 'visible' as const,
  },
  scrollBodyDesktop: {
    alignItems: 'stretch' as const,
    overflow: 'visible' as const,
  },
  contentColumn: {
    width: '100%',
    gap: isDesktop ? SCROLL_GAP_DESKTOP : SCROLL_GAP,
    overflow: 'visible' as const,
  },
  /** Must stay visible — overflow-x:hidden here becomes overflow-y:auto and nests a Y scroller. */
  railBleedSection: {
    width: '100%',
    overflow: 'visible' as const,
  },
  gutterPad: { paddingHorizontal: MOBILE_GUTTER },
  sectionTitleInset: {
    paddingHorizontal: contentColumnOffset + MOBILE_GUTTER,
  },
  phaseCard: {
    marginHorizontal: MOBILE_GUTTER,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.goldMuted,
  },
  phaseTitle: { fontSize: typography.xl, fontWeight: '600', color: colors.textPrimary },
  phaseBody: { fontSize: typography.md, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 20 },
  phaseLink: { fontSize: typography.sm, color: colors.brand, fontWeight: '600' },
  phaseLinkRow: { marginTop: spacing.sm },
  aboutHanukkahLink: { marginHorizontal: MOBILE_GUTTER, marginBottom: isDesktop ? 0 : spacing.md },
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
  collectionRailOuter: horizontalRailOuterStyle(),
  collectionScroll: horizontalRailScrollStyle(),
  collectionRow: horizontalRailContentStyle({
    gap: COLLECTION_RAIL_GAP,
    ...horizontalRailGutterPadding(MOBILE_GUTTER, { centerOffset: contentColumnOffset }),
  }),
  collectionHeading: {
    fontSize: typography.lg,
    fontWeight: '400',
    color: colors.textPrimary,
    letterSpacing: -0.26,
  },
  myBoxesRow: horizontalRailContentStyle({
    gap: spacing.md,
    // Stretch the Hanukkah card to the natural height of the Add More peek card.
    alignItems: 'stretch' as const,
    ...horizontalRailGutterPadding(MOBILE_GUTTER, { centerOffset: contentColumnOffset }),
  }),
  myBoxShadowWrap: {
    overflow: 'visible' as const,
    paddingVertical: 4,
    alignSelf: 'stretch' as const,
  },
  myBoxCard: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 16,
    padding: spacing.md,
    overflow: 'hidden',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 1,
    alignSelf: 'stretch' as const,
  },
  myBoxGrid: { gap: 4, width: '100%', alignItems: 'center' },
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
