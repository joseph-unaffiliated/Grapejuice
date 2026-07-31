import React, { useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
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
import {
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

export function StorefrontHomeScreen() {
  const { items, loading } = useCatalog();
  const { startBox, askRav, goCategory, goEligibility } = useStorefrontActions();
  const scrollRef = useRef<ScrollView>(null);
  const lookY = useRef(0);

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
      <StorefrontHero onShopLook={() => goCategory('collection')} onBuildBox={startBox} />

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
            <StorefrontProductGrid items={loved} limit={6} />
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
        <StorefrontProductGrid items={menorahsCollection} limit={6} />
        {menorahsKids.length ? (
          <>
            <SubSectionHeader title="For kids" />
            <StorefrontProductGrid items={menorahsKids} limit={6} />
          </>
        ) : null}

        <StorefrontBuildBoxStrip onPress={startBox} />

        <SectionHeader
          title="Dreidels"
          subtitle="For the table and the kids"
          viewAllLabel="View all"
          onViewAll={() => goCategory('dreidels')}
        />
        <SubSectionHeader title="The collection" />
        <StorefrontProductGrid items={dreidelsCollection} limit={6} />
        {dreidelsKids.length ? (
          <>
            <SubSectionHeader title="For kids" />
            <StorefrontProductGrid items={dreidelsKids} limit={6} />
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
        <StorefrontProductGrid items={candles} limit={6} />

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
        <StorefrontProductGrid items={food} limit={8} />

        <SectionHeader
          title="Books"
          subtitle="Stories for the couch and the kids’ room"
          viewAllLabel="View all"
          onViewAll={() => goCategory('books')}
        />
        <StorefrontProductGrid items={books} limit={6} />

        <StorefrontBoxFeature onBuildBox={startBox} onEligibility={goEligibility} />
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
    fontSize: 22,
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
