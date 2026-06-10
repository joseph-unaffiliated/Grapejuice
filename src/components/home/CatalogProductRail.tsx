import React from 'react';
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
import { semanticColors, typography, borderRadius, shadows, shadowsWeb } from '../../constants/theme';
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
export const CATALOG_PRODUCT_NAME_LINES = 3;

/** Shared product title typography for catalog tiles (rails + Set the Stage). */
export const catalogProductNameStyle = {
  fontSize: typography.sm,
  fontWeight: '200' as const,
  color: semanticColors.textPrimary,
  letterSpacing: -0.22,
  lineHeight: 14,
};

/** Figma 384:487 — wide card, products in one horizontal row; parent ScrollView pans the card. */
export function collectionCardWidth(itemCount: number): number {
  if (itemCount <= 0) return 0;
  return COLLECTION_CARD_PADDING * 2 + itemCount * CATALOG_TILE + (itemCount - 1) * TILE_GAP;
}

export function CatalogProductRail({ title, items }: Props) {
  const navigation = useNavigation<Nav>();

  if (!items.length) return null;

  const cardWidth = collectionCardWidth(items.length);
  const cardShadow =
    Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : shadows.goldGlow;

  return (
    <View style={styles.carouselWrap}>
      <View style={[styles.card, cardShadow, { width: cardWidth, minWidth: cardWidth }]}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.productRow}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.tile}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('AlaCarteStore')}
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

const styles = StyleSheet.create({
  carouselWrap: {
    overflow: 'visible' as const,
  },
  card: {
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: 16,
    padding: COLLECTION_CARD_PADDING,
    gap: COLLECTION_CARD_GAP,
    overflow: 'visible' as const,
  },
  title: {
    fontSize: typography.lg,
    fontWeight: '400',
    color: semanticColors.textPrimary,
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
  name: catalogProductNameStyle,
  price: {
    fontSize: typography.lg,
    fontWeight: '400',
    color: semanticColors.textPrimary,
    letterSpacing: -0.26,
  },
});
