import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import type { CatalogItem } from '../../types/pilot';
import { BoxItemImage } from '../box/BoxItemImage';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { unitCentsForGiftTransfer } from '../../services/gift/fromOtherGifts';
import { HorizontalDragScrollView } from '../home/HorizontalDragScrollView';
import { HORIZONTAL_RAIL_SCROLL_CLASS } from '../home/CatalogProductRail';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

const TILE = 72;

export type FromOtherGiftTile = {
  item: CatalogItem;
  fromGiverName: string;
};

type Props = {
  tiles: FromOtherGiftTile[];
  onAdd: (tile: FromOtherGiftTile) => void;
};

/** Highlight non-duplicate items curated by other gifters — Add uses add-on pricing. */
export function GiftFromOtherGiftsRail({ tiles, onAdd }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!tiles.length) return null;

  return (
    <View style={styles.root} accessibilityRole="list" accessibilityLabel="From other gifts">
      <Text style={styles.label}>From other gifts</Text>
      <Text style={styles.hint}>
        Add items another gifter picked. They&apos;re priced as add-ons — gift credit can cover them.
      </Text>
      <HorizontalDragScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroller}
        contentContainerStyle={styles.scrollerContent}
        // @ts-expect-error web className
        className={Platform.OS === 'web' ? HORIZONTAL_RAIL_SCROLL_CLASS : undefined}
      >
        {tiles.map((tile) => {
          const cents = unitCentsForGiftTransfer(tile.item);
          const price = formatCatalogDollars(cents);
          return (
            <TouchableOpacity
              key={`${tile.fromGiverName}-${tile.item.id}`}
              style={styles.tile}
              onPress={() => onAdd(tile)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Add ${tile.item.name} for ${price}, from ${tile.fromGiverName}`}
            >
              <BoxItemImage
                size={TILE}
                imageUrl={tile.item.imageUrl}
                itemId={tile.item.id}
                style={styles.image}
              />
              <Text style={styles.price}>{price}</Text>
              <Text style={styles.name} numberOfLines={2}>
                {tile.item.name}
              </Text>
              <Text style={styles.from} numberOfLines={1}>
                From {tile.fromGiverName}
              </Text>
              <Text style={styles.add}>Add</Text>
            </TouchableOpacity>
          );
        })}
      </HorizontalDragScrollView>
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: {
      width: '100%',
      gap: spacing.xs,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    label: {
      fontSize: typography.lg,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
    hint: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: spacing.xs,
      ...typeface('regular'),
    },
    scroller: {
      width: '100%',
      flexGrow: 0,
      flexShrink: 0,
      ...(Platform.OS === 'web'
        ? ({ overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as object)
        : null),
    },
    scrollerContent: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    tile: {
      width: 96,
      alignItems: 'center',
      gap: 4,
    },
    image: {
      borderRadius: borderRadius.md,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
    },
    price: {
      fontSize: typography.sm,
      ...typeface('medium'),
      color: colors.textPrimary,
    },
    name: {
      fontSize: typography.xs,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 14,
      ...typeface('regular'),
    },
    from: {
      fontSize: 10,
      color: colors.textTertiary,
      textAlign: 'center',
      ...typeface('regular'),
    },
    add: {
      fontSize: typography.sm,
      ...typeface('medium'),
      color: colors.brand,
      marginTop: 2,
    },
  });
}
