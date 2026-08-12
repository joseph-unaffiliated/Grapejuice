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
import { StorefrontChrome, useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { StorefrontHero } from '../../components/storefront/StorefrontHero';
import { StorefrontBoxFeature } from '../../components/storefront/StorefrontBoxFeature';
import { StorefrontEditorialBand } from '../../components/storefront/StorefrontEditorialBand';
import { StorefrontProductGrid } from '../../components/storefront/StorefrontProductGrid';
import { StorefrontBuildBoxStrip } from '../../components/storefront/StorefrontBuildBoxStrip';
import { StorefrontAskRavStrip } from '../../components/storefront/StorefrontAskRavStrip';
import { STOREFRONT_EDITORIAL } from '../../constants/storefrontMedia';
import {
  excludeBooks,
  filterByStorefrontCategory,
  collectionMenorahs,
  kidsMenorahs,
  collectionDreidels,
  kidsDreidels,
  itemsForStorefrontRail,
} from '../../constants/storefrontCategories';
import { filterCatalogByTag } from '../../constants/catalogCuration';
import { useCatalog } from '../../hooks/useCatalog';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import {
  useStorefrontHomeMode,
  type StorefrontHomeMode,
} from '../../hooks/useStorefrontHomeMode';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { getHanukkahConfig } from '../../services/firestore/config';
import type { MainStackParamList } from '../../navigation/types';
import {
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const PASSOVER_STRIP_BG = require('../../../assets/storefront/setthetablev1.webp');

function stripCopy(mode: StorefrontHomeMode): {
  headline: string;
  body: string;
  ctaLabel: string;
  backgroundSource?: number;
} | null {
  switch (mode) {
    case 'guest_box':
      return {
        headline: 'Save your Personalized Hanukkah Box',
        body: 'Your box is started. Create an account so we can hold your curation and lock date — pick up right where you left off on any device.',
        ctaLabel: 'Create an account',
      };
    case 'customize':
      return {
        headline: 'Customize your Hanukkah Box',
        body: 'Your box is secured. Swap pieces and add extras anytime before lock — then we ship a week or two before the first night.',
        ctaLabel: 'Customize your box',
      };
    case 'needs_payment':
      return {
        headline: 'Secure your Hanukkah Box',
        body: 'Add payment to lock in your picks. You can browse swaps now — you won’t be charged until your box ships.',
        ctaLabel: 'Add payment to secure',
      };
    case 'locked':
      return {
        headline: 'Passover 2027 is coming',
        body: 'Your Hanukkah box is locked and on its way. Explore early interest for Passover 2027 — dates and offers coming soon.',
        ctaLabel: 'Explore Passover 2027',
        backgroundSource: PASSOVER_STRIP_BG,
      };
    case 'passover':
      return {
        headline: 'Passover 2027 is coming',
        body: 'Hanukkah 2026 is complete. Explore early interest for Passover 2027 — dates and offers coming soon.',
        ctaLabel: 'Explore Passover 2027',
        backgroundSource: PASSOVER_STRIP_BG,
      };
    default:
      return null;
  }
}

export function StorefrontHomeScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { items, loading } = useCatalog();
  const { startBox, askRav, goCategory, goEligibility, goPassover } = useStorefrontActions();
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const scrollRef = useRef<ScrollView>(null);
  const lookY = useRef(0);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [estimatedDeliveryBy, setEstimatedDeliveryBy] = useState<string | null>(null);
  const mode = useStorefrontHomeMode(lockAt, startsOn);

  useEffect(() => {
    let cancelled = false;
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLockAt(config.lockAt);
      setStartsOn(config.startsOn);
      setEstimatedDeliveryBy(config.estimatedDeliveryBy);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const journey =
    mode === 'acquisition' || mode === 'passover'
      ? null
      : { startsOn, lockAt, estimatedDeliveryBy };

  const goCreateAccount = () => startAuthFromGuest('MyBox', 'signup', 'SignUp');
  const goCheckout = () => navigation.navigate('Checkout');
  const goMyBox = () => navigation.navigate('MyBox');

  const onHeroPrimary = () => {
    switch (mode) {
      case 'guest_box':
        goCreateAccount();
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
      default:
        goCategory('collection');
    }
  };

  const onHeroSecondary = () => {
    switch (mode) {
      case 'guest_box':
        startBox();
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
      default:
        startBox();
    }
  };

  const onFeaturePrimary = () => {
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
      default:
        startBox();
    }
  };

  const strip = stripCopy(mode);

  usePublishRavSurface({ type: 'home', id: 'store', label: 'Store home' });

  const menorahsCollection = useMemo(
    () =>
      itemsForStorefrontRail(
        items,
        'menorahs-collection',
        collectionMenorahs(items),
        6,
        ['menorahs']
      ),
    [items]
  );
  const menorahsKids = useMemo(
    () => itemsForStorefrontRail(items, 'menorahs-kids', kidsMenorahs(items)),
    [items]
  );
  const dreidelsCollection = useMemo(
    () =>
      itemsForStorefrontRail(
        items,
        'dreidels-collection',
        collectionDreidels(items),
        6,
        ['dreidels']
      ),
    [items]
  );
  const dreidelsKids = useMemo(
    () => itemsForStorefrontRail(items, 'dreidels-kids', kidsDreidels(items)),
    [items]
  );
  const food = useMemo(
    () =>
      itemsForStorefrontRail(items, 'food', filterByStorefrontCategory(items, 'food'), 8),
    [items]
  );
  const books = useMemo(
    () =>
      itemsForStorefrontRail(
        items,
        'books',
        filterByStorefrontCategory(items, 'books')
      ),
    [items]
  );
  const candles = useMemo(
    () =>
      itemsForStorefrontRail(
        items,
        'candles',
        filterByStorefrontCategory(items, 'candles')
      ),
    [items]
  );
  const loved = useMemo(() => {
    const nonBooks = excludeBooks(items);
    const tagged = filterCatalogByTag(nonBooks, 'collection');
    const fallback = tagged.length ? tagged : nonBooks;
    return itemsForStorefrontRail(items, 'most-loved', fallback);
  }, [items]);

  const scrollToLook = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, lookY.current - 24), animated: true });
  };

  const handleEditorialCta = (href?: string) => {
    if (!href || href === 'look') {
      scrollToLook();
      return;
    }
    if (href === 'box') {
      startBox();
      return;
    }
    if (href === 'rav') {
      askRav();
      return;
    }
    goCategory(href);
  };

  return (
    <StorefrontChrome onShopLook={scrollToLook} scrollRef={scrollRef}>
      <StorefrontHero
        mode={mode}
        journey={journey}
        onPrimary={onHeroPrimary}
        onSecondary={onHeroSecondary}
      />

        {/* Products first */}
        <View
          onLayout={(e) => {
            lookY.current = e.nativeEvent.layout.y;
          }}
        >
          <SectionHeader
            title="Most loved"
            subtitle="Pieces households keep coming back to"
          />
          {loading ? (
            <ActivityIndicator color={semanticColors.brand} style={styles.loader} />
          ) : (
            <StorefrontProductGrid items={loved} limit={3} />
          )}
        </View>

        <StorefrontAskRavStrip onSubmit={(message) => askRav(message)} />

        <SectionHeader
          title="Menorahs"
          subtitle="Statement, keepsake, and play"
          viewAllLabel="View all"
          onViewAll={() => goCategory('menorahs')}
        />
        <SubSectionHeader title="The collection" />
        <StorefrontProductGrid items={menorahsCollection} limit={3} />
        {menorahsKids.length ? (
          <>
            <SubSectionHeader title="For kids" />
            <StorefrontProductGrid items={menorahsKids} limit={3} />
          </>
        ) : null}

        <StorefrontBuildBoxStrip
          onPress={onStripPress}
          headline={strip?.headline}
          body={strip?.body}
          ctaLabel={strip?.ctaLabel}
          backgroundSource={strip?.backgroundSource}
        />

        <SectionHeader
          title="Dreidels"
          subtitle="For the table and the kids"
          viewAllLabel="View all"
          onViewAll={() => goCategory('dreidels')}
        />
        <SubSectionHeader title="The collection" />
        <StorefrontProductGrid items={dreidelsCollection} limit={3} />
        {dreidelsKids.length ? (
          <>
            <SubSectionHeader title="For kids" />
            <StorefrontProductGrid items={dreidelsKids} limit={3} />
          </>
        ) : null}

        {STOREFRONT_EDITORIAL[0] ? (
          <StorefrontEditorialBand
            slot={STOREFRONT_EDITORIAL[0]}
            reverse
            onCta={() => handleEditorialCta(STOREFRONT_EDITORIAL[0].href)}
          />
        ) : null}

        <SectionHeader
          title="Candles"
          subtitle="Wax and light for eight nights"
          viewAllLabel="View all"
          onViewAll={() => goCategory('candles')}
        />
        <StorefrontProductGrid items={candles} limit={3} />

        {STOREFRONT_EDITORIAL[1] ? (
          <StorefrontEditorialBand
            slot={STOREFRONT_EDITORIAL[1]}
            onCta={() => handleEditorialCta(STOREFRONT_EDITORIAL[1].href)}
          />
        ) : null}

        <SectionHeader
          title="Food"
          subtitle="Gelt, latkes, sufganiyot, and soft treats"
          viewAllLabel="View all"
          onViewAll={() => goCategory('food')}
        />
        <StorefrontProductGrid items={food} limit={3} />

        <SectionHeader
          title="Books"
          subtitle="Stories for the couch and the kids’ room"
          viewAllLabel="View all"
          onViewAll={() => goCategory('books')}
        />
        <StorefrontProductGrid items={books} limit={3} />

        <StorefrontBoxFeature
          mode={mode}
          onPrimary={onFeaturePrimary}
          onEligibility={goEligibility}
        />
    </StorefrontChrome>
  );
}

function SectionHeader({
  title,
  subtitle,
  viewAllLabel,
  onViewAll,
}: {
  title: string;
  subtitle?: string;
  viewAllLabel?: string;
  onViewAll?: () => void;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionHeadRow}>
        <View style={styles.sectionHeadText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        </View>
        {viewAllLabel && onViewAll ? (
          <TouchableOpacity
            onPress={onViewAll}
            accessibilityRole="link"
            accessibilityLabel={`${viewAllLabel} ${title}`}
            hitSlop={8}
          >
            <Text style={styles.viewAll}>{viewAllLabel} →</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function SubSectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.subHead}>
      <Text style={styles.subTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: spacing.xl },
  sectionHead: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionHeadText: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    ...typeface('medium'),
    fontSize: 28,
    letterSpacing: -0.3,
    color: semanticColors.logoDark,
  },
  sectionSub: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textSecondary,
  },
  subHead: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  subTitle: {
    ...typeface('medium'),
    fontSize: 16,
    color: semanticColors.logoDark,
  },
  viewAll: {
    ...typeface('medium'),
    fontSize: 14,
    color: semanticColors.logoDark,
    textDecorationLine: 'underline',
    marginBottom: 2,
  },
});
