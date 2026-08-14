import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontProductTile } from './StorefrontProductTile';
import { useWishlist } from '../../hooks/useWishlist';
import type { CatalogItem } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  items: CatalogItem[];
  /** Max items to show (home rails). Omit for full PLP. */
  limit?: number;
  /**
   * When `items` is empty, render this many skeleton tiles so merchandising
   * sections stay visible (e.g. landings before catalog resolves).
   */
  placeholderCount?: number;
};

/** Prefer 3-up when the grid’s own width is tablet+; else 2. Uses container, not window,
 * so a docked Rav pane doesn’t leave one oversized tile per row. */
function columnsForWidth(width: number): number {
  return width >= 768 ? 3 : 2;
}

export function StorefrontProductGrid({ items, limit, placeholderCount = 0 }: Props) {
  const navigation = useNavigation<Nav>();
  const { width: windowWidth } = useWindowDimensions();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const [containerWidth, setContainerWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w <= 0) return;
    setContainerWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
  };

  const gap = spacing.sm;
  const pad = MOBILE_GUTTER;
  const layoutW = containerWidth > 0 ? containerWidth : windowWidth;
  const cols = columnsForWidth(layoutW);
  const tileWidth = Math.floor((layoutW - pad * 2 - gap * (cols - 1)) / cols);

  const visible = useMemo(() => {
    const list = limit != null ? items.slice(0, limit) : items;
    return list;
  }, [items, limit]);

  const placeholders =
    visible.length === 0 && placeholderCount > 0
      ? Array.from({ length: placeholderCount }, (_, i) => i)
      : [];

  return (
    <View style={[styles.grid, { paddingHorizontal: pad, gap }]} onLayout={onLayout}>
      {visible.map((item) => (
        <StorefrontProductTile
          key={item.id}
          item={item}
          width={tileWidth}
          wishlisted={isWishlisted(item.id)}
          onPress={() => navigation.navigate('CatalogProduct', { slug: item.id })}
          onToggleWishlist={() => void toggleWishlist(item.id)}
        />
      ))}
      {placeholders.map((i) => (
        <View
          key={`ph-${i}`}
          style={[styles.placeholder, { width: tileWidth }]}
          accessibilityRole="text"
          accessibilityLabel="Product placeholder"
        >
          <View style={[styles.placeholderImage, { width: tileWidth, height: tileWidth }]} />
          <Text style={styles.placeholderTitle}>Product</Text>
          <Text style={styles.placeholderMeta}>Coming soon</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: spacing.xl,
  },
  placeholder: {
    gap: spacing.xs,
  },
  placeholderImage: {
    backgroundColor: semanticColors.brandLight,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
  },
  placeholderTitle: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  placeholderMeta: {
    ...typeface('light'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
  },
});
