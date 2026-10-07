import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BrandLoadingMark } from '../brand/BrandLoadingMark';
import { STOREFRONT_HOME_AISLE_CARDS } from '../../constants/landingAudiences';
import { excludeBooks, itemsForStorefrontRail } from '../../constants/storefrontCategories';
import { filterCatalogByTag } from '../../constants/catalogCuration';
import { MOBILE_GUTTER, semanticColors, spacing, typeface, typography } from '../../constants/theme';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';
import type { CatalogItem } from '../../types/pilot';
import { StorefrontCategoryRail } from './StorefrontCategoryRail';
import { StorefrontProductGrid } from './StorefrontProductGrid';

type Props = {
  /** Required for the `home` variant (Top Picks). */
  items?: CatalogItem[];
  loading?: boolean;
  onCategory: (category: string) => void;
  /** Drop the first header's top padding when a section above already spaces it. */
  flushTop?: boolean;
  /** `aisles` = category rail only, under a smaller "Browse all Products" header on every breakpoint. */
  variant?: 'home' | 'aisles';
};

const EMPTY_ITEMS: CatalogItem[] = [];

/** Home "Top Picks" products + "Browse by Aisle" category rail. */
export function StorefrontTopPicksAisles({
  items = EMPTY_ITEMS,
  loading = false,
  onCategory,
  flushTop,
  variant = 'home',
}: Props) {
  const { isCompact: compact } = useLayoutBreakpoint();
  const railLimit = compact ? 10 : 6;
  const gridLimit = compact ? 10 : 3;
  const gridLayout = compact ? 'rail' : 'grid';

  const loved = useMemo(() => {
    const nonBooks = excludeBooks(items);
    const tagged = filterCatalogByTag(nonBooks, 'collection');
    const fallback = tagged.length ? tagged : nonBooks;
    return itemsForStorefrontRail(items, 'most-loved', fallback, railLimit);
  }, [items, railLimit]);

  if (variant === 'aisles') {
    return (
      <View style={styles.root}>
        <SectionHeader
          title="Browse all Products"
          subtitle="Explore the whole Hanukkah collection"
          flushTop={flushTop}
          small
        />
        <StorefrontCategoryRail
          heading={null}
          cards={STOREFRONT_HOME_AISLE_CARDS}
          onCategoryPress={onCategory}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SectionHeader
        title="Top Picks"
        subtitle="The most favorited products from our collection"
        onPress={() => onCategory('collection')}
        flushTop={flushTop}
      />
      <View style={styles.topPicksBody}>
        {loading ? (
          <View style={styles.loader}>
            <BrandLoadingMark />
          </View>
        ) : (
          <StorefrontProductGrid
            items={loved}
            limit={gridLimit}
            layout={gridLayout}
            flushBottom
            browseMoreLabel="top picks"
            onBrowseMore={() => onCategory('collection')}
          />
        )}
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
          cards={STOREFRONT_HOME_AISLE_CARDS}
          onCategoryPress={onCategory}
        />
      </View>
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  onPress,
  /** After a product rail: less paddingTop so gap matches hero → Top picks (rail already has marginBottom). */
  compactTop,
  flushTop,
  small,
}: {
  title: string;
  subtitle?: string;
  /** Navigate when tapping the title/subtitle block. */
  onPress?: () => void;
  compactTop?: boolean;
  flushTop?: boolean;
  /** Article-hero title size (32) instead of the 40px section headline. */
  small?: boolean;
}) {
  const text = (
    <>
      <Text style={[styles.sectionTitle, small ? styles.sectionTitleSmall : null]}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </>
  );

  return (
    <View
      style={[
        styles.sectionHead,
        compactTop ? styles.sectionHeadCompactTop : null,
        flushTop ? styles.sectionHeadFlushTop : null,
      ]}
    >
      <View style={styles.sectionHeadRow}>
        {onPress ? (
          <TouchableOpacity
            style={styles.sectionHeadText}
            onPress={onPress}
            accessibilityRole="link"
            accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
          >
            {text}
          </TouchableOpacity>
        ) : (
          <View style={styles.sectionHeadText}>{text}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Rails size tiles from their measured width; a centering parent would let them grow unbounded. */
  root: {
    width: '100%',
    alignSelf: 'stretch',
  },
  loader: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  sectionHeadFlushTop: {
    paddingTop: 0,
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
  sectionTitleSmall: {
    fontSize: 32,
    lineHeight: 32 * 1.15,
    letterSpacing: 0,
  },
  sectionSub: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
});
