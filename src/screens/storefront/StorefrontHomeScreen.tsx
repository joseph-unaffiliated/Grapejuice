import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { StorefrontChrome, useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { StorefrontHero } from '../../components/storefront/StorefrontHero';
import {
  StorefrontHeroJourneyTimeline,
} from '../../components/storefront/StorefrontHeroJourneyTimeline';
import { StorefrontProductGrid } from '../../components/storefront/StorefrontProductGrid';
import { StorefrontBuildBoxStrip } from '../../components/storefront/StorefrontBuildBoxStrip';
import { useGuestFavoritesPrompt } from '../../components/storefront/GuestFavoritesAuthBanner';
import { StorefrontAskRavStrip } from '../../components/storefront/StorefrontAskRavStrip';
import { StorefrontOurStoryStrip } from '../../components/storefront/StorefrontOurStoryStrip';
import { StorefrontPassoverStrip } from '../../components/storefront/StorefrontPassoverStrip';
import { StorefrontCategoryRail } from '../../components/storefront/StorefrontCategoryRail';
import {
  DREIDELS_LIFESTYLE_HOTSPOTS,
  StorefrontMenorahsLifestyleCard,
} from '../../components/storefront/StorefrontMenorahsLifestyleCard';
import { LazyMount } from '../../components/storefront/LazyMount';
import { Crossfade } from '../../components/ui/Crossfade';
import { STOREFRONT_HOME_AISLE_CARDS } from '../../constants/landingAudiences';
import {
  excludeBooks,
  filterByStorefrontCategory,
  collectionMenorahs,
  kidsMenorahs,
  collectionDreidels,
  snuggleStuffies,
  itemsForDreidelsKidsRail,
  itemsForStorefrontRail,
  sortBooksByYoungerDefaultAges,
  orderCandlesRollYourOwnBeforeElectric,
} from '../../constants/storefrontCategories';
import { filterCatalogByTag } from '../../constants/catalogCuration';
import { useCatalog } from '../../hooks/useCatalog';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import {
  useStorefrontHomeMode,
} from '../../hooks/useStorefrontHomeMode';
import { useStorefrontInterest } from '../../hooks/useStorefrontInterest';
import { PASSOVER_NOTIFY_INTEREST, PRE_REGISTERED_CTA_LABEL } from '../../constants/pilotHolidays';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useGiftIntentStore } from '../../stores/giftIntentStore';
import { getHanukkahConfig } from '../../services/firestore/config';
import { getHanukkahStatus } from '../../services/hanukkah/dates';
import { storefrontBuildBoxStripCopy } from '../../constants/storefrontBuildBoxStripCopy';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';
import { usePreviewNow } from '../../hooks/useUserStatePreview';
import type { MainStackParamList } from '../../navigation/types';
import {
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const DREIDELS_LIFESTYLE_IMG = require('../../../assets/storefront/dreidels-lifestyle-banner.webp');
/** Native aspect of dreidels lifestyle plate (2752×1536 source). */
const DREIDELS_LIFESTYLE_ASPECT = 2752 / 1536;

export function StorefrontHomeScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { items, loading } = useCatalog();
  const { startBox, askRav, goCategory, goPassover, goOurStory } = useStorefrontActions();
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const guestFavoritesPrompt = useGuestFavoritesPrompt();
  const { isCompact: compact } = useLayoutBreakpoint();
  const now = usePreviewNow();
  const collectionLimit = compact ? 4 : 3;
  /** Cap mobile rail length so we don’t hydrate dozens of catalog PNGs on first paint. */
  const railLimit = compact ? 10 : 6;
  const gridLayout = compact ? 'rail' : 'grid';
  const gridLimit = compact ? 10 : 3;
  const collectionGridLimit = compact ? 10 : collectionLimit;
  const passoverInterest = useStorefrontInterest(PASSOVER_NOTIFY_INTEREST);
  const scrollRef = useRef<ScrollView>(null);
  const lookY = useRef(0);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [estimatedDeliveryBy, setEstimatedDeliveryBy] = useState<string | null>(null);
  const [hanukkahConfigReady, setHanukkahConfigReady] = useState(false);
  const mode = useStorefrontHomeMode(lockAt, startsOn);
  const giftDraft = useGiftIntentStore((s) => s.draft);
  const clearGiftIntent = useGiftIntentStore((s) => s.clear);

  useEffect(() => {
    let cancelled = false;
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLockAt(config.lockAt);
      setStartsOn(config.startsOn);
      setEstimatedDeliveryBy(config.estimatedDeliveryBy);
      setHanukkahConfigReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const journey =
    mode === 'acquisition' ||
    mode === 'passover' ||
    mode === 'gift_credit_incomplete' ||
    mode === 'gift_customize_incomplete' ||
    mode === 'gift_sent'
      ? null
      : { startsOn, lockAt, estimatedDeliveryBy };

  const showJourneyBanner =
    journey != null &&
    hanukkahConfigReady &&
    getHanukkahStatus(journey.startsOn, now).phase !== 'during';

  /** Hold banner height while config loads so member home doesn’t pop the page. */
  const reserveJourneyBanner =
    !hanukkahConfigReady &&
    mode !== 'acquisition' &&
    mode !== 'passover' &&
    mode !== 'gift_credit_incomplete' &&
    mode !== 'gift_customize_incomplete' &&
    mode !== 'gift_sent';

  const goCreateAccount = () => startAuthFromGuest('MyBox', 'signup', 'SignUp');
  const goCheckout = () => navigation.navigate('Checkout');
  const goMyBox = () => navigation.navigate('MyBox');
  const goGiftGive = () => navigation.navigate('GiftGive', { initialGiftPath: 'credit_only' });

  const resumeIncompleteGift = () => {
    if (!giftDraft) {
      goGiftGive();
      return;
    }
    if (mode === 'gift_customize_incomplete') {
      navigation.navigate('GiftGiverCustomize', {
        form: giftDraft.form,
        childDrafts: giftDraft.childDrafts,
        lineItems: giftDraft.lineItems,
      });
      return;
    }
    navigation.navigate('GiftGive', {
      form: giftDraft.form,
      childDrafts: giftDraft.childDrafts,
      initialGiftPath: 'credit_only',
      autoStartPayment: true,
    });
  };

  const startFreshGift = () => {
    clearGiftIntent();
    goGiftGive();
  };

  const startOwnBox = () => {
    clearGiftIntent();
    startBox();
  };

  const onHeroPrimary = () => {
    switch (mode) {
      case 'guest_box':
        startBox();
        return;
      case 'needs_payment':
        goCheckout();
        return;
      case 'passover':
        goPassover();
        return;
      case 'customize':
        goCategory('collection');
        return;
      case 'gift_credit_incomplete':
      case 'gift_customize_incomplete':
        resumeIncompleteGift();
        return;
      case 'gift_sent':
        startFreshGift();
        return;
      default:
        goCategory('collection');
    }
  };

  const onHeroSecondary = () => {
    switch (mode) {
      case 'guest_box':
        goCategory('collection');
        return;
      case 'customize':
        startBox();
        return;
      case 'needs_payment':
        goMyBox();
        return;
      case 'passover':
        goCategory('collection');
        return;
      case 'gift_credit_incomplete':
      case 'gift_customize_incomplete':
        startFreshGift();
        return;
      case 'gift_sent':
        startOwnBox();
        return;
      default:
        startBox();
    }
  };

  const onStripPress = () => {
    switch (mode) {
      case 'guest_box':
        goCreateAccount();
        return;
      case 'customize':
        startBox();
        return;
      case 'needs_payment':
        goCheckout();
        return;
      case 'locked':
      case 'passover':
        goPassover();
        return;
      case 'gift_credit_incomplete':
      case 'gift_customize_incomplete':
        resumeIncompleteGift();
        return;
      case 'gift_sent':
        startFreshGift();
        return;
      default:
        startBox();
    }
  };

  const strip = storefrontBuildBoxStripCopy(mode);

  usePublishRavSurface({ type: 'home', id: 'store', label: 'Store home' });

  const menorahsCollection = useMemo(
    () =>
      itemsForStorefrontRail(
        items,
        'menorahs-collection',
        collectionMenorahs(items),
        railLimit,
        ['menorahs']
      ),
    [items, railLimit]
  );
  const menorahsKids = useMemo(
    () => itemsForStorefrontRail(items, 'menorahs-kids', kidsMenorahs(items), railLimit),
    [items, railLimit]
  );
  const dreidelsCollection = useMemo(
    () =>
      itemsForStorefrontRail(
        items,
        'dreidels-collection',
        collectionDreidels(items),
        railLimit
      ),
    [items, railLimit]
  );
  const dreidelsKids = useMemo(
    () => itemsForDreidelsKidsRail(items, railLimit),
    [items, railLimit]
  );
  const dreidelsSnuggle = useMemo(
    () => snuggleStuffies(items).slice(0, railLimit),
    [items, railLimit]
  );
  const books = useMemo(() => {
    const rail = itemsForStorefrontRail(
      items,
      'books',
      filterByStorefrontCategory(items, 'books'),
      railLimit
    );
    return sortBooksByYoungerDefaultAges(rail);
  }, [items, railLimit]);
  const candles = useMemo(
    () =>
      orderCandlesRollYourOwnBeforeElectric(
        itemsForStorefrontRail(
          items,
          'candles',
          filterByStorefrontCategory(items, 'candles'),
          railLimit
        )
      ),
    [items, railLimit]
  );
  const loved = useMemo(() => {
    const nonBooks = excludeBooks(items);
    const tagged = filterCatalogByTag(nonBooks, 'collection');
    const fallback = tagged.length ? tagged : nonBooks;
    return itemsForStorefrontRail(items, 'most-loved', fallback, railLimit);
  }, [items, railLimit]);

  /** Aisle rail covers: fixed lifestyle assets from STOREFRONT_HOME_AISLE_CARDS. */
  const aisleCards = STOREFRONT_HOME_AISLE_CARDS;

  const scrollToLook = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, lookY.current - 24), animated: true });
  };

  return (
    <StorefrontChrome
      onShopLook={scrollToLook}
      scrollRef={scrollRef}
      floatingFooter={guestFavoritesPrompt}
    >
      <StorefrontHero
        mode={mode}
        journey={journey}
        onPrimary={onHeroPrimary}
        onSecondary={onHeroSecondary}
      />
      <Crossfade
        contentKey={
          showJourneyBanner && journey
            ? `banner|${journey.startsOn ?? ''}|${journey.lockAt ?? ''}`
            : reserveJourneyBanner
              ? 'reserve'
              : 'none'
        }
      >
        {showJourneyBanner && journey ? (
          <View style={styles.journeyBanner} accessibilityRole="region">
            <StorefrontHeroJourneyTimeline journey={journey} variant="banner" />
          </View>
        ) : reserveJourneyBanner ? (
          <View style={styles.journeyBannerReserve} accessibilityElementsHidden />
        ) : null}
      </Crossfade>

        {/* Products first */}
        <View
          onLayout={(e) => {
            lookY.current = e.nativeEvent.layout.y;
          }}
        >
          <SectionHeader
            title="Top Picks"
            subtitle="The most favorited products from our collection"
            onPress={() => goCategory('collection')}
          />
          <View style={styles.topPicksBody}>
            {loading ? (
              <ActivityIndicator color={semanticColors.brand} style={styles.loader} />
            ) : (
              <StorefrontProductGrid
                items={loved}
                limit={gridLimit}
                layout={gridLayout}
                flushBottom
                browseMoreLabel="top picks"
                onBrowseMore={() => goCategory('collection')}
              />
            )}
          </View>
        </View>

        {!compact ? (
          <SectionHeader
            title="Browse by Aisle"
            subtitle="Explore the whole Hanukkah collection"
            compactTop
          />
        ) : null}
        <View style={compact ? styles.aisleRailCompact : null}>
          <StorefrontCategoryRail
            heading={null}
            cards={aisleCards}
            onCategoryPress={(category) => goCategory(category)}
          />
        </View>

        <LazyMount minHeight={320}>
          <StorefrontOurStoryStrip
            onLearnMore={goOurStory}
            onGiveGift={goGiftGive}
          />
        </LazyMount>

        <LazyMount minHeight={420}>
          <StorefrontBuildBoxStrip
            onPress={onStripPress}
            headline={strip?.headline}
            body={strip?.body}
            ctaLabel={strip?.ctaLabel}
            backgroundSource={strip?.backgroundSource}
          />
        </LazyMount>

        <LazyMount minHeight={280}>
          <StorefrontAskRavStrip onSubmit={(message) => askRav(message)} />
        </LazyMount>

        <LazyMount minHeight={900}>
          <StorefrontMenorahsLifestyleCard
            onShopAll={() => goCategory('menorahs')}
            onProduct={(productId) =>
              navigation.navigate('CatalogProduct', { slug: productId })
            }
          />
          <SubSectionHeader
            title="Instant heirlooms"
            onPress={() => goCategory('menorahs', { style: 'collection' })}
          />
          <StorefrontProductGrid
            items={menorahsCollection}
            limit={collectionGridLimit}
            layout={gridLayout}
            flushBottom
            browseMoreLabel="menorahs"
            onBrowseMore={() => goCategory('menorahs', { style: 'collection' })}
          />
          {menorahsKids.length ? (
            <>
              <SubSectionHeader
                title="Something for everyone"
                compactTop
                onPress={() => goCategory('menorahs', { style: 'kids' })}
              />
              <StorefrontProductGrid
                items={menorahsKids}
                limit={gridLimit}
                layout={gridLayout}
                flushBottom
                browseMoreLabel="kids menorahs"
                onBrowseMore={() => goCategory('menorahs', { style: 'kids' })}
              />
            </>
          ) : null}
          <SubSectionHeader
            title="Don't forget the candles"
            compactTop
            onPress={() => goCategory('candles')}
          />
          <StorefrontProductGrid
            items={candles}
            limit={gridLimit}
            layout={gridLayout}
            browseMoreLabel="candles"
            onBrowseMore={() => goCategory('candles')}
          />
        </LazyMount>

        <LazyMount minHeight={900}>
          <StorefrontMenorahsLifestyleCard
            label={'Let the\nfun begin'}
            image={DREIDELS_LIFESTYLE_IMG}
            aspectRatio={DREIDELS_LIFESTYLE_ASPECT}
            hotspots={DREIDELS_LIFESTYLE_HOTSPOTS}
            onShopAll={() => goCategory('dreidels')}
            onProduct={(productId) =>
              navigation.navigate('CatalogProduct', { slug: productId })
            }
          />
          <SubSectionHeader
            title="Spin spin spin"
            onPress={() => goCategory('dreidels', { style: 'collection' })}
          />
          <StorefrontProductGrid
            items={dreidelsCollection}
            limit={collectionGridLimit}
            layout={gridLayout}
            flushBottom={Boolean(
              dreidelsKids.length || dreidelsSnuggle.length || books.length
            )}
            browseMoreLabel="dreidels"
            onBrowseMore={() => goCategory('dreidels', { style: 'collection' })}
          />
          {dreidelsKids.length ? (
            <>
              <SubSectionHeader
                title="Make it yourself"
                compactTop
                onPress={() => goCategory('dreidels', { style: 'kids' })}
              />
              <StorefrontProductGrid
                items={dreidelsKids}
                limit={gridLimit}
                layout={gridLayout}
                flushBottom={Boolean(dreidelsSnuggle.length || books.length)}
                browseMoreLabel="kids dreidels"
                onBrowseMore={() => goCategory('dreidels', { style: 'kids' })}
              />
            </>
          ) : null}
          {dreidelsSnuggle.length ? (
            <>
              <SubSectionHeader
                title="Time to snuggle"
                compactTop
                onPress={() => goCategory('stuffies')}
              />
              <StorefrontProductGrid
                items={dreidelsSnuggle}
                limit={gridLimit}
                layout={gridLayout}
                flushBottom={Boolean(books.length)}
                browseMoreLabel="stuffies"
                onBrowseMore={() => goCategory('stuffies')}
              />
            </>
          ) : null}
          {books.length ? (
            <>
              <SubSectionHeader
                title="Tell me a story"
                compactTop
                onPress={() => goCategory('books')}
              />
              <StorefrontProductGrid
                items={books}
                limit={gridLimit}
                layout={gridLayout}
                browseMoreLabel="books"
                onBrowseMore={() => goCategory('books')}
              />
            </>
          ) : null}

          <StorefrontPassoverStrip
            onPreRegister={passoverInterest.toggle}
            onLearnMore={goPassover}
            primaryLabel={
              passoverInterest.marked ? PRE_REGISTERED_CTA_LABEL : undefined
            }
          />
        </LazyMount>
    </StorefrontChrome>
  );
}

function SectionHeader({
  title,
  subtitle,
  viewAllLabel,
  onViewAll,
  onPress,
  /** After a product rail: less paddingTop so gap matches hero → Top picks (rail already has marginBottom). */
  compactTop,
}: {
  title: string;
  subtitle?: string;
  viewAllLabel?: string;
  onViewAll?: () => void;
  /** Navigate when tapping the title/subtitle block (or whole header if no View all). */
  onPress?: () => void;
  compactTop?: boolean;
}) {
  const go = onPress ?? onViewAll;
  const titleBlock = (
    <View style={styles.sectionHeadText}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );

  return (
    <View style={[styles.sectionHead, compactTop ? styles.sectionHeadCompactTop : null]}>
      <View style={styles.sectionHeadRow}>
        {go ? (
          <TouchableOpacity
            style={styles.sectionHeadText}
            onPress={go}
            accessibilityRole="link"
            accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
          >
            <Text style={styles.sectionTitle}>{title}</Text>
            {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
          </TouchableOpacity>
        ) : (
          titleBlock
        )}
        {viewAllLabel && onViewAll ? (
          <TouchableOpacity
            style={styles.viewAllRow}
            onPress={onViewAll}
            accessibilityRole="link"
            accessibilityLabel={`${viewAllLabel} ${title}`}
            hitSlop={8}
          >
            <Text style={styles.viewAll}>{viewAllLabel}</Text>
            <Icon icon={icons.chevronRight} size={11} color={semanticColors.logoDark} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function SubSectionHeader({
  title,
  onPress,
  /** After a product row: drop paddingTop so stacked rails sit tight. */
  compactTop,
}: {
  title: string;
  onPress?: () => void;
  compactTop?: boolean;
}) {
  const content = (
    <View style={styles.subHeadRow}>
      <Text style={styles.subTitle}>{title}</Text>
      {onPress ? (
        <View style={styles.subViewAllRow}>
          <Text style={styles.subViewAll}>view all</Text>
          <Icon icon={icons.chevronRight} size={10} color={semanticColors.brand} />
        </View>
      ) : null}
    </View>
  );

  const headStyle = [styles.subHead, compactTop ? styles.subHeadCompactTop : null];

  if (onPress) {
    return (
      <TouchableOpacity
        style={headStyle}
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={`${title}, view all`}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={headStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  journeyBanner: {
    width: '100%',
    backgroundColor: '#000000',
    paddingTop: spacing.md - 2,
    paddingBottom: spacing.md,
    paddingHorizontal: MOBILE_GUTTER,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(216, 201, 144, 0.35)',
  },
  /** Matches journey banner block height while Hanukkah config resolves. */
  journeyBannerReserve: {
    width: '100%',
    height: 88,
    backgroundColor: '#000000',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(216, 201, 144, 0.35)',
  },
  loader: { marginVertical: spacing.xl },
  /** Keep Top picks from collapsing → expanding when catalog arrives. */
  topPicksBody: {
    minHeight: 280,
  },
  /** Matches former Browse-by-Aisle sectionHead compactTop when the headline is hidden. */
  aisleRailCompact: {
    paddingTop: spacing.md,
  },
  sectionHead: {
    width: '100%',
    maxWidth: 1024,
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.xxl,
    paddingBottom: 32,
  },
  /**
   * Flush rail + xl would match tallest tile → title; visible cards are often shorter,
   * so use md so the optical gap from on-screen tiles ≈ hero → Top picks (xl).
   */
  sectionHeadCompactTop: {
    paddingTop: spacing.md,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.md,
  },
  sectionHeadText: {
    flex: 1,
    gap: 4,
    alignItems: 'center',
  },
  sectionTitle: {
    ...typeface('medium'),
    // Match Build Box strip headline (“Secure your Hanukkah Box”).
    fontSize: 40,
    lineHeight: 38,
    letterSpacing: -0.2,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  sectionSub: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
  subHead: {
    width: '100%',
    maxWidth: 1024,
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  /** Product rail already owns spacing; stacked subheads sit flush under tiles. */
  subHeadCompactTop: {
    paddingTop: spacing.sm,
  },
  subHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  subTitle: {
    ...typeface('medium'),
    fontSize: 16,
    letterSpacing: -0.2,
    color: semanticColors.logoDark,
    flexShrink: 1,
  },
  subViewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  /** Category cue — brand gold, right-aligned with caret. */
  subViewAll: {
    ...typeface('medium'),
    fontSize: 12,
    color: semanticColors.brand,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    marginBottom: 2,
  },
  viewAll: {
    ...typeface('medium'),
    fontSize: 14,
    color: semanticColors.logoDark,
  },
});
