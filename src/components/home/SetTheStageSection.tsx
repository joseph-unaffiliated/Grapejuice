import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { BoxItemImage } from '../box/BoxItemImage';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { getItemBrand } from '../../constants/catalogCuration';
import type { CatalogItem } from '../../types/pilot';
import type { MainTabsParamList, MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius, shadows, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import {
  CATALOG_TILE,
  CATALOG_PRODUCT_NAME_LINES,
  COLLECTION_CARD_GAP,
  COLLECTION_CARD_PADDING,
  COLLECTION_RAIL_GAP,
  catalogProductNameStyle,
  collectionCardWidth,
  horizontalRailContentStyle,
  horizontalRailScrollStyle,
  HORIZONTAL_RAIL_SCROLL_CLASS,
} from './CatalogProductRail';

type Props = {
  apparel: CatalogItem[];
  decorations: CatalogItem[];
};

function StageCard({
  title,
  items,
  styles,
  onItemPress,
}: {
  title: string;
  items: CatalogItem[];
  styles: ReturnType<typeof createSetTheStageStyles>;
  onItemPress: (itemId: string) => void;
}) {
  if (!items.length) return null;

  const cardWidth = collectionCardWidth(items.length);
  const cardShadow =
    Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : shadows.goldGlow;

  return (
    <View style={[styles.card, { width: cardWidth, minWidth: cardWidth }, cardShadow]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.productRow}>
        {items.map((item) => (
          <TouchableOpacity key={item.id} style={styles.tile} activeOpacity={0.85} onPress={() => onItemPress(item.id)}>
            <BoxItemImage size={CATALOG_TILE} imageUrl={item.imageUrl} itemId={item.id} style={styles.image} />
            <View style={styles.meta}>
              <Text style={styles.itemName} numberOfLines={CATALOG_PRODUCT_NAME_LINES}>
                {item.name}
              </Text>
              {getItemBrand(item) ? (
                <Text style={styles.brand}>{getItemBrand(item)}</Text>
              ) : null}
            </View>
            <Text style={styles.price}>{formatCatalogDollars(item.dollarCostCents)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/** Figma 370:3192 — Apparel / Decorations tiles in a horizontal card scrub. */
export function SetTheStageSection({ apparel, decorations }: Props) {
  const navigation = useNavigation<
    CompositeNavigationProp<
      BottomTabNavigationProp<MainTabsParamList>,
      StackNavigationProp<MainStackParamList>
    >
  >();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createSetTheStageStyles(colors), [colors]);
  const openProduct = (itemId: string) => navigation.navigate('CatalogProduct', { itemId });
  const cards = [
    apparel.length ? { key: 'apparel', title: 'Apparel', items: apparel } : null,
    decorations.length ? { key: 'decorations', title: 'Decorations', items: decorations } : null,
  ].filter(Boolean) as { key: string; title: string; items: CatalogItem[] }[];

  if (!cards.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Set the Stage</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        nestedScrollEnabled
        style={styles.scrollBleed}
        contentContainerStyle={styles.rail}
        {...(Platform.OS === 'web' ? { className: HORIZONTAL_RAIL_SCROLL_CLASS } : {})}
      >
        {cards.map((c) => (
          <StageCard key={c.key} title={c.title} items={c.items} styles={styles} onItemPress={openProduct} />
        ))}
      </ScrollView>
    </View>
  );
}

function createSetTheStageStyles(colors: SemanticColors) {
  return StyleSheet.create({
    section: { gap: COLLECTION_RAIL_GAP, overflow: 'visible' as const },
    sectionTitle: {
      fontSize: typography.lg,
      fontWeight: '400',
      color: colors.textPrimary,
      letterSpacing: -0.26,
      paddingHorizontal: MOBILE_GUTTER,
    },
    scrollBleed: horizontalRailScrollStyle(),
    rail: horizontalRailContentStyle({
      gap: COLLECTION_RAIL_GAP,
      paddingLeft: MOBILE_GUTTER,
      paddingRight: MOBILE_GUTTER,
    }),
    card: {
      backgroundColor: colors.bgPrimary,
      borderRadius: 16,
      padding: COLLECTION_CARD_PADDING,
      gap: COLLECTION_CARD_GAP,
      overflow: 'visible' as const,
    },
    cardTitle: {
      fontSize: typography.lg,
      fontWeight: '400',
      color: colors.textPrimary,
      letterSpacing: -0.26,
      textAlign: 'center',
    },
    productRow: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      alignItems: 'flex-start',
      gap: 4,
    },
    tile: {
      width: CATALOG_TILE,
      alignSelf: 'flex-start',
      gap: 4,
    },
    image: { borderRadius: borderRadius.md, backgroundColor: 'rgba(0,0,0,0.05)' },
    meta: { gap: 0 },
    itemName: catalogProductNameStyle(colors),
    brand: {
      fontSize: typography.sm,
      fontWeight: '400',
      color: colors.goldMuted,
      letterSpacing: -0.22,
      lineHeight: 14,
    },
    price: {
      fontSize: typography.lg,
      fontWeight: '400',
      color: colors.textPrimary,
      letterSpacing: -0.26,
    },
  });
}
