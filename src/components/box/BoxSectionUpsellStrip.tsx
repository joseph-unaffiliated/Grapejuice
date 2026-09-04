import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import type { CatalogItem } from '../../types/pilot';
import { BoxItemImage } from './BoxItemImage';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { resolveCatalogDisplayPrices } from '../../services/box/pricing';
import { HorizontalDragScrollView } from '../home/HorizontalDragScrollView';
import { HORIZONTAL_RAIL_SCROLL_CLASS } from '../home/CatalogProductRail';
import {
  HorizontalScrollEdgeFades,
  useHorizontalScrollEdges,
} from '../ui/ScrollEdgeFades';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

const TILE = 72;

type Props = {
  items: CatalogItem[];
  onPressItem: (item: CatalogItem) => void;
  /** Optional strip label; defaults to “Add more”. */
  label?: string;
};

/** Compact thumbnail + price rail under a My Box section (replaces text browse chips). */
export function BoxSectionUpsellStrip({ items, onPressItem, label = 'Add more' }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const edges = useHorizontalScrollEdges();

  if (!items.length) return null;

  return (
    <View style={styles.root} accessibilityRole="list" accessibilityLabel={label}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.railWrap}>
        <HorizontalDragScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroller}
          contentContainerStyle={styles.scrollerContent}
          onScroll={edges.onScroll}
          onLayout={edges.onLayout}
          onContentSizeChange={edges.onContentSizeChange}
          scrollEventThrottle={16}
          // @ts-expect-error web className
          className={Platform.OS === 'web' ? HORIZONTAL_RAIL_SCROLL_CLASS : undefined}
        >
          {items.map((item) => {
            const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(item);
            const cents = memberCents > 0 ? memberCents : nonMemberCents;
            const price = cents > 0 ? formatCatalogDollars(cents) : 'Add';
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.tile}
                onPress={() => onPressItem(item)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${price}`}
              >
                <BoxItemImage
                  size={TILE}
                  imageUrl={item.imageUrl}
                  itemId={item.id}
                  style={styles.image}
                />
                <Text style={styles.price}>{price}</Text>
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </HorizontalDragScrollView>
        <HorizontalScrollEdgeFades
          leftProgress={edges.leftProgress}
          rightProgress={edges.rightProgress}
          color={semanticColors.bgPrimary}
        />
      </View>
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: {
      width: '100%',
      gap: spacing.xs,
      marginTop: spacing.sm,
      overflow: 'visible',
    },
    label: {
      fontSize: typography.sm,
      lineHeight: 18,
      ...typeface('medium'),
      color: colors.textSecondary,
      letterSpacing: -0.22,
      textAlign: 'center',
      // Avoid rail bleed / overflow clipping the label.
      paddingBottom: 2,
      zIndex: 1,
    },
    railWrap: {
      position: 'relative',
      width: '100%',
      overflow: 'hidden',
    },
    /** Edge-to-edge within section content — no side padding on the scroller. */
    scroller: {
      width: '100%',
      flexGrow: 0,
      flexShrink: 0,
      alignSelf: 'stretch',
      ...(Platform.OS === 'web'
        ? ({
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehaviorX: 'contain',
          } as object)
        : {}),
    },
    scrollerContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      // Left-start so overflow always scrolls rightward from the first product.
      justifyContent: 'flex-start',
      flexGrow: 1,
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: 0,
    },
    tile: {
      width: TILE,
      gap: 4,
      flexShrink: 0,
    },
    image: {
      width: TILE,
      height: TILE,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(0,0,0,0.05)',
    },
    name: {
      fontSize: 10,
      ...typeface('regular'),
      color: colors.textPrimary,
      letterSpacing: -0.2,
      lineHeight: 12,
      minHeight: 24,
    },
    price: {
      fontSize: typography.sm,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
  });
}
