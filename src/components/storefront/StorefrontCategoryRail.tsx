import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import { filterByStorefrontCategory } from '../../constants/storefrontCategories';
import type { CatalogItem } from '../../types/pilot';
import { HorizontalDragScrollView } from '../home/HorizontalDragScrollView';
import {
  horizontalRailContentStyle,
  horizontalRailGutterPadding,
  horizontalRailOuterStyle,
  horizontalRailScrollStyle,
} from '../home/CatalogProductRail';

export type StorefrontCategoryRailCard = {
  label: string;
  category: string;
  image: ImageSourcePropType;
};

type Props = {
  /** Omit or pass empty string to hide the intro block. */
  heading?: string | null;
  body?: string | null;
  cards: StorefrontCategoryRailCard[];
  onCategoryPress: (category: string) => void;
};

/** First non-primary URL in `imageUrls`, if any. */
export function catalogItemSecondaryImageUrl(item: CatalogItem): string | null {
  const primary = item.imageUrl?.trim() ?? '';
  for (const raw of item.imageUrls ?? []) {
    const u = raw?.trim();
    if (u && u !== primary) return u;
  }
  return null;
}

/**
 * Prefer a secondary gallery image from an item in the aisle; else primary; else fallback.
 */
export function aisleCoverImage(
  items: CatalogItem[],
  category: string,
  fallback: ImageSourcePropType
): ImageSourcePropType {
  const inAisle = filterByStorefrontCategory(items, category);
  const withSecondary = inAisle.find((item) => catalogItemSecondaryImageUrl(item));
  const secondary = withSecondary ? catalogItemSecondaryImageUrl(withSecondary) : null;
  if (secondary) return { uri: secondary };
  const primary = inAisle.find((item) => item.imageUrl?.trim())?.imageUrl?.trim();
  if (primary) return { uri: primary };
  return fallback;
}

/** Mid-band content max width (Ask Rav / aisle head / product grid). */
const STOREFRONT_BAND_MAX_WIDTH = 1024;

/**
 * Tall photo category cards in a horizontal rail → storefront aisle PLP.
 * Shared by campaign landings (“Shop by aisle”) and store home.
 */
export function StorefrontCategoryRail({
  heading = 'Shop by aisle',
  body = 'Tall looks into the collection — tap through to browse that filter.',
  cards,
  onCategoryPress,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();

  /** Big cards with a peek of the next — ~72% viewport on phone, capped on desktop. */
  const cardWidth = useMemo(() => {
    if (windowWidth < 768) return Math.round(Math.min(300, windowWidth * 0.72));
    if (windowWidth < 1100) return 320;
    return 360;
  }, [windowWidth]);

  /** Align first card with centered 1024 mid-bands; scroll still bleeds to viewport edge. */
  const centerOffset = useMemo(
    () => Math.max(0, (windowWidth - STOREFRONT_BAND_MAX_WIDTH) / 2),
    [windowWidth],
  );

  if (!cards.length) return null;

  const showIntro = Boolean(heading);

  return (
    <View style={[styles.root, !showIntro && styles.rootNoIntro]}>
      {showIntro ? (
        <View style={styles.intro}>
          <Text style={styles.heading}>{heading}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
        </View>
      ) : null}
      <View style={horizontalRailOuterStyle()}>
        <HorizontalDragScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          directionalLockEnabled
          nestedScrollEnabled
          style={horizontalRailScrollStyle()}
          contentContainerStyle={horizontalRailContentStyle({
            gap: spacing.md,
            alignItems: 'stretch',
            ...horizontalRailGutterPadding(MOBILE_GUTTER, { centerOffset }),
          })}
        >
          {cards.map((card) => (
            <TouchableOpacity
              key={card.category}
              style={[styles.card, { width: cardWidth }]}
              onPress={() => onCategoryPress(card.category)}
              accessibilityRole="link"
              accessibilityLabel={`Shop ${card.label}`}
              activeOpacity={0.9}
            >
              <Image source={card.image} style={styles.image} resizeMode="cover" />
              <Text style={styles.label}>{card.label}</Text>
            </TouchableOpacity>
          ))}
        </HorizontalDragScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  /** When intro is omitted, an external SectionHeader supplies top spacing. */
  rootNoIntro: {
    paddingTop: 0,
  },
  intro: {
    paddingHorizontal: MOBILE_GUTTER,
    marginBottom: spacing.md,
    gap: spacing.xs,
    maxWidth: 1024,
    alignSelf: 'center',
    width: '100%',
  },
  heading: {
    ...typeface('medium'),
    fontSize: typography.xl,
    letterSpacing: -0.3,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  body: {
    ...typeface('light'),
    fontSize: typography.lg,
    lineHeight: 24,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
  card: {
    aspectRatio: 4 / 5,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: semanticColors.accentCream,
    justifyContent: 'flex-end',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  label: {
    ...typeface('medium'),
    fontSize: 22,
    lineHeight: 28,
    color: semanticColors.textInverse,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.lg,
    zIndex: 1,
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
