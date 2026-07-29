import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { BoxItemImage } from '../box/BoxItemImage';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import type { CatalogItem } from '../../types/pilot';
import type { MainTabsParamList, MainStackParamList } from '../../navigation/types';
import { typography, borderRadius, shadows, shadowsWeb } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { ProductStarRating } from './ProductStarRating';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabsParamList>,
  StackNavigationProp<MainStackParamList>
>;

type Props = {
  title: string;
  items: CatalogItem[];
};

export const CATALOG_TILE = 100;
const TILE_GAP = 4;
/** Figma 384:488 — inner collection card padding (all sides). */
export const COLLECTION_CARD_PADDING = 16;
/** Figma 384:488 — gap between rail title and product row. */
export const COLLECTION_CARD_GAP = 16;
/** Figma 384:775 — vertical gap between collection cards / horizontal gap between stage cards. */
export const COLLECTION_RAIL_GAP = 12;
/**
 * Gold-glow bleed — slightly larger than shadowsWeb.goldGlow (16px blur) so the soft
 * edge isn't clipped by overflowY:hidden on horizontal rails.
 */
export const HORIZONTAL_RAIL_SHADOW_BLEED = 20;

/** Web class for index.html touch-action overrides on horizontal rails. */
export const HORIZONTAL_RAIL_SCROLL_CLASS = 'gj-horizontal-rail-scroll';

/** Rail wrapper — no negative margins (they cause instant layout shifts during horizontal pan). */
export function horizontalRailOuterStyle(): object {
  return {
    overflow: 'visible' as const,
    width: '100%',
  };
}

/** Shared horizontal ScrollView style for catalog / stage rails. */
export function horizontalRailScrollStyle(): object {
  return {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'flex-start' as const,
    // Cancels content-container vertical bleed so gaps between sections stay tight.
    marginVertical: -HORIZONTAL_RAIL_SHADOW_BLEED,
    // Horizontal pad on the scrollport so side glow clears overflowX clip while scrolling.
    paddingHorizontal: HORIZONTAL_RAIL_SHADOW_BLEED,
    ...(Platform.OS === 'web'
      ? ({
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
          overscrollBehaviorX: 'contain',
        } as object)
      : {}),
  };
}

/**
 * Row layout inside the rail. Vertical bleed must live here (content container), not on
 * the ScrollView style — scrollport padding does not reliably reserve space inside
 * overflowY:hidden for descendant box-shadows on web.
 */
export function horizontalRailContentStyle(extra?: object): object {
  return {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: HORIZONTAL_RAIL_SHADOW_BLEED,
    ...extra,
  };
}

/** Gutter inset after scroll shadow padding (bleed pad + inset = gutter). */
export function horizontalRailGutterPadding(
  gutter: number,
  options?: { centerOffset?: number },
): { paddingLeft: number; paddingRight: number } {
  const centerOffset = options?.centerOffset ?? 0;
  const inset = Math.max(0, gutter - HORIZONTAL_RAIL_SHADOW_BLEED);
  return {
    paddingLeft: centerOffset + inset,
    paddingRight: inset,
  };
}
export const CATALOG_PRODUCT_NAME_LINES = 3;

/** Shared product title typography for catalog tiles (rails + Set the Stage). */
export function catalogProductNameStyle(colors: SemanticColors) {
  return {
    fontSize: typography.sm,
    fontWeight: '200' as const,
    color: colors.textPrimary,
    letterSpacing: -0.22,
    lineHeight: 14,
  };
}

/** Figma 384:487 — wide card, products in one horizontal row; parent ScrollView pans the card. */
export function collectionCardWidth(itemCount: number): number {
  if (itemCount <= 0) return 0;
  return COLLECTION_CARD_PADDING * 2 + itemCount * CATALOG_TILE + (itemCount - 1) * TILE_GAP;
}

export function CatalogProductRail({ title, items }: Props) {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createCatalogRailStyles(colors), [colors]);

  if (!items.length) return null;

  const cardWidth = collectionCardWidth(items.length);
  const cardShadow =
    Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : shadows.goldGlow;

  return (
    <View style={[styles.carouselWrap, cardShadow, { width: cardWidth, minWidth: cardWidth }]}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.productRow}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.tile}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('CatalogProduct', { slug: item.id })}
            >
              <BoxItemImage size={CATALOG_TILE} imageUrl={item.imageUrl} itemId={item.id} style={styles.image} />
              <Text style={styles.name} numberOfLines={CATALOG_PRODUCT_NAME_LINES}>
                {item.name}
              </Text>
              <ProductStarRating count={242} />
              <Text style={styles.price}>{formatCatalogDollars(item.dollarCostCents)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

function createCatalogRailStyles(colors: SemanticColors) {
  return StyleSheet.create({
    carouselWrap: {
      borderRadius: 16,
      overflow: 'visible' as const,
    },
    card: {
      backgroundColor: colors.bgPrimary,
      borderRadius: 16,
      padding: COLLECTION_CARD_PADDING,
      gap: COLLECTION_CARD_GAP,
      overflow: 'visible' as const,
    },
    title: {
      fontSize: typography.lg,
      fontWeight: '400',
      color: colors.textPrimary,
      letterSpacing: -0.26,
    },
    productRow: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      alignItems: 'flex-start',
      gap: TILE_GAP,
    },
    tile: {
      width: CATALOG_TILE,
      alignSelf: 'flex-start',
      gap: 4,
    },
    image: { borderRadius: borderRadius.md, backgroundColor: 'rgba(0,0,0,0.05)' },
    name: catalogProductNameStyle(colors),
    price: {
      fontSize: typography.lg,
      fontWeight: '400',
      color: colors.textPrimary,
      letterSpacing: -0.26,
    },
  });
}
