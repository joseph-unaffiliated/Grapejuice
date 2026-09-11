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
import { useWebLayout } from '../../hooks/useWebLayout';
import type { SemanticColors } from '../../constants/themeMode';

/** Compact Add more rail (default). */
export const UPSELL_TILE_COMPACT = 72;
/** Medium tiles for empty-section “Add items” rails. */
export const UPSELL_TILE_MEDIUM = 112;

export type UpsellTileSize = 'compact' | 'medium';

type Props = {
  items: CatalogItem[];
  onPressItem: (item: CatalogItem) => void;
  /** Optional strip label; defaults to “Add more”. */
  label?: string;
  /**
   * Item ids that are free to add (included). Rendered as “$0 ($X value)” instead of
   * their catalog price, since tapping them adds at no extra cost.
   */
  includedItemIds?: ReadonlySet<string>;
  /** Tile scale — medium for empty sections, compact under populated cards. */
  tileSize?: UpsellTileSize;
};

/** Compact thumbnail + price rail under a My Box section (replaces text browse chips). */
export function BoxSectionUpsellStrip({
  items,
  onPressItem,
  label = 'Add more',
  includedItemIds,
  tileSize = 'compact',
}: Props) {
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const tile = tileSize === 'medium' ? UPSELL_TILE_MEDIUM : UPSELL_TILE_COMPACT;
  const styles = useMemo(
    () => createStyles(colors, isDesktop, tile, tileSize),
    [colors, isDesktop, tile, tileSize]
  );
  const edges = useHorizontalScrollEdges();

  if (!items.length) return null;

  return (
    <View
      style={[styles.root, !label ? styles.rootFlush : null]}
      accessibilityRole="list"
      accessibilityLabel={label || undefined}
    >
      {label ? (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
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
            const included = includedItemIds?.has(item.id);
            const valueLabel =
              included && cents > 0 ? `(${formatCatalogDollars(cents)} value)` : null;
            const priceMain = included ? '$0' : cents > 0 ? formatCatalogDollars(cents) : 'Add';
            const a11yPrice = valueLabel ? `${priceMain} ${valueLabel}` : priceMain;
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.tile}
                onPress={() => onPressItem(item)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${a11yPrice}`}
              >
                <BoxItemImage
                  size={tile}
                  imageUrl={item.imageUrl}
                  itemId={item.id}
                  style={styles.image}
                />
                <Text style={styles.price}>
                  {priceMain}
                  {valueLabel ? (
                    <Text style={styles.priceValue}> {valueLabel}</Text>
                  ) : null}
                </Text>
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

function createStyles(
  colors: SemanticColors,
  desktop: boolean,
  tile: number,
  tileSize: UpsellTileSize
) {
  const medium = tileSize === 'medium';
  return StyleSheet.create({
    root: {
      width: '100%',
      gap: spacing.xs,
      marginTop: spacing.sm,
      overflow: 'visible',
    },
    rootFlush: {
      marginTop: 0,
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
      // Always start left — centering wide rails via justifyContent expands
      // min-content width and can push a page-level horizontal scrollbar.
      justifyContent: 'flex-start',
      gap: medium ? spacing.md : spacing.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: 0,
      ...(desktop
        ? ({ marginLeft: 'auto', marginRight: 'auto' } as object)
        : null),
    },
    tile: {
      width: tile,
      gap: medium ? 6 : 4,
      flexShrink: 0,
    },
    image: {
      width: tile,
      height: tile,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(0,0,0,0.05)',
    },
    name: {
      fontSize: medium ? typography.sm : 10,
      ...typeface('regular'),
      color: colors.textPrimary,
      letterSpacing: -0.2,
      lineHeight: medium ? 14 : 12,
      minHeight: medium ? 28 : 24,
    },
    price: {
      fontSize: typography.sm,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
    priceValue: {
      ...typeface('medium'),
      color: colors.goldMuted,
      letterSpacing: -0.22,
    },
  });
}
