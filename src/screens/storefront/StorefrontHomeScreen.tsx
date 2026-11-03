import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
import {
  StorefrontBoxCtaStrip,
  type StorefrontBoxCtaVariant,
} from '../../components/storefront/StorefrontBoxCtaStrip';
import { StorefrontTopPicksAisles } from '../../components/storefront/StorefrontTopPicksAisles';
import {
  DREIDELS_LIFESTYLE_HOTSPOTS,
  StorefrontMenorahsLifestyleCard,
} from '../../components/storefront/StorefrontMenorahsLifestyleCard';
import { LazyMount } from '../../components/storefront/LazyMount';
import { Crossfade } from '../../components/ui/Crossfade';
import {
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
import { useCatalog } from '../../hooks/useCatalog';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import {
  useStorefrontHomeMode,
} from '../../hooks/useStorefrontHomeMode';
import { useStorefrontInterest } from '../../hooks/useStorefrontInterest';
import {
  PASSOVER_NOTIFY_INTEREST,
  PRE_REGISTERED_CTA_LABEL,
} from '../../constants/pilotHolidays';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useGiftIntentStore } from '../../stores/giftIntentStore';
import { getHanukkahConfig, peekHanukkahConfig } from '../../services/firestore/config';
import { getHanukkahStatus } from '../../services/hanukkah/dates';
import { storefrontBuildBoxStripCopy } from '../../constants/storefrontBuildBoxStripCopy';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { MobileBoundary } from '../../components/mobile/MobileBoundary';
import { MobileClosedHome } from '../mobile/MobileClosedHome';
import { MobileHomeBody } from '../mobile/MobileHomeBody';
import { useSession } from '../../hooks/useSession';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { useMergeAbandonedBoxFavorites } from '../../hooks/useMergeAbandonedBoxFavorites';
import { useCatalogAvailabilityMap } from '../../hooks/useCatalogAvailabilityMap';
import { useWishlist } from '../../hooks/useWishlist';
import { prefetchPartnerInvites } from '../../services/account/accountPrefetch';
import {
  usePreviewedIsAuthenticated,
  usePreviewNow,
  useUserStatePreview,
} from '../../hooks/useUserStatePreview';
import { openOrderTracking } from '../../components/orders/OrderHistoryList';
import { familyOrderOpen } from '../../constants/familyOrder';
import { buildShopRail } from '../../services/catalog/shopMerch';
import type { MainStackParamList } from '../../navigation/types';
import { MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  INK,
} from '../../constants/theme';

const DREIDELS_LIFESTYLE_IMG = require('../../../assets/storefront/dreidels-lifestyle-banner.webp');
/** Native aspect of dreidels lifestyle plate (2752×1536 source). */
const DREIDELS_LIFESTYLE_ASPECT = 2752 / 1536;

export function StorefrontHomeScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { items, loading } = useCatalog();
  const { startBox, askRav, goCategory, goOurStory } = useStorefrontActions();
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const guestFavoritesPrompt = useGuestFavoritesPrompt();
  const { isCompact: compact } = useLayoutBreakpoint();
  const mobileLayout = useMobileLayout();
  const now = usePreviewNow();
  const collectionLimit = compact ? 4 : 3;
  /** Cap mobile rail length so we don’t hydrate dozens of catalog PNGs on first paint. */
  const railLimit = compact ? 10 : 6;
  const gridLayout = compact ? 'rail' : 'grid';
  const gridLimit = compact ? 10 : 3;
  const collectionGridLimit = compact ? 10 : collectionLimit;
  const passoverInterest = useStorefrontInterest(PASSOVER_NOTIFY_INTEREST);
  const signedIn = usePreviewedIsAuthenticated();
  const scrollRef = useRef<ScrollView>(null);
  const lookY = useRef(0);
  const [lockAt, setLockAt] = useState<string | null>(() => peekHanukkahConfig()?.lockAt ?? null);
  const [startsOn, setStartsOn] = useState<string | null>(
    () => peekHanukkahConfig()?.startsOn ?? null
  );
  const [estimatedDeliveryBy, setEstimatedDeliveryBy] = useState<string | null>(
    () => peekHanukkahConfig()?.estimatedDeliveryBy ?? null
  );
  const [hanukkahConfigReady, setHanukkahConfigReady] = useState(
    () => peekHanukkahConfig() != null
  );
  const mode = useStorefrontHomeMode(lockAt, startsOn);
  const boxMode = useStorefrontHomeMode(lockAt, startsOn, { ignoreGiftIntent: true });
  const giftDraft = useGiftIntentStore((s) => s.draft);
  const clearGiftIntent = useGiftIntentStore((s) => s.clear);
  const { household, loading: sessionLoading } = useSession();
  const { openOrder } = usePaymentGate();
  const userStatePreview = useUserStatePreview();
  /** Admin “Signed in · locked” pretends a frozen box order so Orders chrome shows. */
  const shopHasBoxOrder =
    mode === 'shop' && (!!openOrder || userStatePreview === 'signed_in_locked');
  const shopOrderCtaLabel =
    openOrder?.trackingNumber && userStatePreview !== 'signed_in_locked'
      ? 'Track package'
      : 'View order';
  useMergeAbandonedBoxFavorites(mode);
  const { byId: availabilityById } = useCatalogAvailabilityMap();
  const { ids: favoriteIds } = useWishlist();
  const shopRails = mode === 'shop';

  const merchRail = (railItems: typeof items) =>
    buildShopRail(railItems, availabilityById, favoriteIds, shopRails, railLimit * 2);

  useEffect(() => {
    if (sessionLoading || !household?.id) return;
    prefetchPartnerInvites(household.id);
  }, [sessionLoading, household?.id]);

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

  const journeyDates = { startsOn, lockAt, estimatedDeliveryBy };
  /** Cold shop still gets countdown dates for the hero; banner is box holders only. */
  const journey =
    mode === 'acquisition' ||
    mode === 'passover' ||
    mode === 'gift_credit_incomplete' ||
    mode === 'gift_customize_incomplete' ||
    mode === 'gift_sent'
      ? null
      : journeyDates;

  const showJourneyBanner =
    journey != null &&
    hanukkahConfigReady &&
    getHanukkahStatus(journey.startsOn, now).phase !== 'during' &&
    (mode !== 'shop' || shopHasBoxOrder);

  /** Hold banner height while config loads so member home doesn’t pop the page. */
  const reserveJourneyBanner =
    !hanukkahConfigReady &&
    mode !== 'acquisition' &&
    mode !== 'passover' &&
    mode !== 'shop' &&
    mode !== 'gift_credit_incomplete' &&
    mode !== 'gift_customize_incomplete' &&
    mode !== 'gift_sent';

  const goCreateAccount = () => startAuthFromGuest('MyBox', 'signup', 'SignUp');
  const goCheckout = () => navigation.navigate('Checkout');
  const goMyBox = () => navigation.navigate('MyBox');
  const goOrders = () => navigation.navigate('Orders');
  const goGiftGive = () => navigation.navigate('GiftLanding');
  const goShopOrderCta = () => {
    if (openOrder?.trackingNumber) {
      openOrderTracking(openOrder);
      return;
    }
    goOrders();
  };

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
        if (signedIn) navigation.navigate('HanukkahFeedback');
        else goOurStory();
        return;
      case 'shop':
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
      case 'shop':
        goShopOrderCta();
        return;
      case 'passover':
        passoverInterest.toggle();
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
      case 'shop':
      case 'locked':
      case 'passover':
        passoverInterest.toggle();
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

  const strip = storefrontBuildBoxStripCopy(mode, passoverInterest.marked);

  /**
   * Bottom paper card: build before a box exists, confirm once started without payment.
   * Mid-gift shoppers get the card for their own box state underneath the gift.
   */
  const boxCta: { variant: StorefrontBoxCtaVariant; onPress: () => void } | null = (() => {
    // Post-lock shop: no Start-my-box card (family-link browsers never enter shop mode).
    if (mode === 'shop' || (boxMode === 'shop' && !familyOrderOpen())) return null;
    const giftIncomplete =
      mode === 'gift_credit_incomplete' || mode === 'gift_customize_incomplete';
    switch (giftIncomplete ? boxMode : mode) {
      case 'acquisition':
        return { variant: 'build', onPress: startBox };
      case 'gift_sent':
        return { variant: 'build', onPress: startOwnBox };
      case 'guest_box':
      case 'needs_payment':
        return { variant: 'confirm', onPress: goCheckout };
      default:
        return null;
    }
  })();

  usePublishRavSurface({ type: 'home', id: 'store', label: 'Store home' });

  const menorahsCollection = useMemo(
    () =>
      merchRail(
        itemsForStorefrontRail(
          items,
          'menorahs-collection',
          collectionMenorahs(items),
          railLimit * 2,
          ['menorahs']
        )
      ).slice(0, railLimit),
    // merchRail closes over shop mode + favorites
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, railLimit, availabilityById, favoriteIds, shopRails]
  );
  const menorahsKids = useMemo(
    () =>
      merchRail(
        itemsForStorefrontRail(items, 'menorahs-kids', kidsMenorahs(items), railLimit * 2)
      ).slice(0, railLimit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, railLimit, availabilityById, favoriteIds, shopRails]
  );
  const dreidelsCollection = useMemo(
    () =>
      merchRail(
        itemsForStorefrontRail(
          items,
          'dreidels-collection',
          collectionDreidels(items),
          railLimit * 2
        )
      ).slice(0, railLimit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, railLimit, availabilityById, favoriteIds, shopRails]
  );
  const dreidelsKids = useMemo(
    () => merchRail(itemsForDreidelsKidsRail(items, railLimit * 2)).slice(0, railLimit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, railLimit, availabilityById, favoriteIds, shopRails]
  );
  const dreidelsSnuggle = useMemo(
    () => merchRail(snuggleStuffies(items)).slice(0, railLimit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, railLimit, availabilityById, favoriteIds, shopRails]
  );
  const books = useMemo(() => {
    const rail = itemsForStorefrontRail(
      items,
      'books',
      filterByStorefrontCategory(items, 'books'),
      railLimit * 2
    );
    return merchRail(sortBooksByYoungerDefaultAges(rail)).slice(0, railLimit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, railLimit, availabilityById, favoriteIds, shopRails]);
  const candles = useMemo(
    () =>
      merchRail(
        orderCandlesRollYourOwnBeforeElectric(
          itemsForStorefrontRail(
            items,
            'candles',
            filterByStorefrontCategory(items, 'candles'),
            railLimit * 2
          )
        )
      ).slice(0, railLimit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, railLimit, availabilityById, favoriteIds, shopRails]
  );
  const scrollToLook = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, lookY.current - 24), animated: true });
  };

  if (mobileLayout) {
    return (
      <StorefrontChrome scrollRef={scrollRef} floatingFooter={guestFavoritesPrompt}>
        <MobileBoundary
          screen="home"
          fallback={
            <StorefrontHero
              mode={mode}
              journey={journey}
              onPrimary={onHeroPrimary}
              onSecondary={onHeroSecondary}
              signedIn={signedIn}
              preRegisterLabel={passoverInterest.marked ? PRE_REGISTERED_CTA_LABEL : undefined}
              shopHasBoxOrder={shopHasBoxOrder}
              shopOrderCtaLabel={shopOrderCtaLabel}
            />
          }
        >
          {mode === 'passover' ? (
            <MobileClosedHome
              year={startsOn ? Number(startsOn.slice(0, 4)) : now.getFullYear()}
              notified={passoverInterest.marked}
              onNotify={passoverInterest.toggle}
              onShop={() => goCategory('collection')}
              onAccount={() => navigation.navigate('MainTabs', { screen: 'Account' })}
            />
          ) : (
          <MobileHomeBody
            items={items}
            startBox={startOwnBox}
            goCategory={(slug) => goCategory(slug)}
            goCheckout={goCheckout}
            goMyBox={shopHasBoxOrder ? goOrders : goMyBox}
            goGift={goGiftGive}
            startsOn={startsOn}
            shopMode={mode === 'shop'}
            shopHasBoxOrder={shopHasBoxOrder}
            shopOrderCtaLabel={shopOrderCtaLabel}
            onShopOrderCta={goShopOrderCta}
            onPassoverRegister={passoverInterest.toggle}
            passoverRegistered={passoverInterest.marked}
          />
          )}
        </MobileBoundary>
      </StorefrontChrome>
    );
  }

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
        signedIn={signedIn}
        preRegisterLabel={passoverInterest.marked ? PRE_REGISTERED_CTA_LABEL : undefined}
        shopHasBoxOrder={shopHasBoxOrder}
        shopOrderCtaLabel={shopOrderCtaLabel}
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
          <View style={styles.journeyBanner} role="region">
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
          <StorefrontTopPicksAisles
            items={items}
            loading={loading}
            onCategory={(category) => goCategory(category)}
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

        {menorahsCollection.length || menorahsKids.length || candles.length ? (
          <LazyMount minHeight={900}>
            {menorahsCollection.length || menorahsKids.length ? (
              <StorefrontMenorahsLifestyleCard
                onShopAll={() => goCategory('menorahs')}
                onProduct={(productId) =>
                  navigation.navigate('CatalogProduct', { slug: productId })
                }
              />
            ) : null}
            {menorahsCollection.length ? (
              <>
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
              </>
            ) : null}
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
            {candles.length ? (
              <>
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
              </>
            ) : null}
          </LazyMount>
        ) : null}

        {dreidelsCollection.length ||
        dreidelsKids.length ||
        dreidelsSnuggle.length ||
        books.length ||
        boxCta ? (
          <LazyMount minHeight={900}>
            {dreidelsCollection.length || dreidelsKids.length ? (
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
            ) : null}
            {dreidelsCollection.length ? (
              <>
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
              </>
            ) : null}
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

            {boxCta ? (
              <StorefrontBoxCtaStrip variant={boxCta.variant} onPress={boxCta.onPress} lockAt={lockAt} />
            ) : null}
          </LazyMount>
        ) : null}
    </StorefrontChrome>
  );
}

function SubSectionHeader({
  title,
  onPress,
  /** After a product row: extra top padding so stacked rails breathe. */
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
    backgroundColor: INK,
    paddingTop: spacing.md - 2,
    paddingBottom: spacing.md,
    paddingHorizontal: MOBILE_GUTTER,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(184, 172, 127, 0.35)',
  },
  /** Matches journey banner block height while Hanukkah config resolves. */
  journeyBannerReserve: {
    width: '100%',
    height: 88,
    backgroundColor: INK,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(184, 172, 127, 0.35)',
  },
  subHead: {
    width: '100%',
    maxWidth: 1024,
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  /** Space after a flush product rail before the next row title. */
  subHeadCompactTop: {
    paddingTop: spacing.xl,
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
});
