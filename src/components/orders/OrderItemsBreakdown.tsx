import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { BoxItemImage } from '../box/BoxItemImage';
import { BOX_PRACTICE_GROUPS, groupLineItemsByPractice } from '../../constants/boxPracticeGroups';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { borderRadius, shadowsWeb, spacing, typeface, typography } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

const TILE_WIDTH = 92;
const IMAGE_SIZE = 56;

function OrderItemTile({
  li,
  catalog,
  styles,
  showPrice,
}: {
  li: BoxLineItem;
  catalog: CatalogItem[];
  styles: ReturnType<typeof createStyles>;
  showPrice?: boolean;
}) {
  const item = catalog.find((c) => c.id === li.itemId);
  const name = li.label ?? item?.name ?? li.itemId;
  const quantity = Math.max(1, li.quantity ?? 1);

  return (
    <View style={styles.tile}>
      <View style={styles.tileImageWrap}>
        <BoxItemImage
          size={IMAGE_SIZE}
          imageUrl={item?.imageUrl}
          itemId={item?.id ?? li.itemId}
          style={styles.tileImage}
        />
      </View>
      <Text style={styles.tileName} numberOfLines={2}>
        {name}
      </Text>
      {quantity > 1 ? <Text style={styles.tileMeta}>×{quantity}</Text> : null}
      {showPrice ? (
        <Text style={styles.tilePrice}>{formatDollars(li.unitCents * quantity)}</Text>
      ) : null}
    </View>
  );
}

function OrderItemSection({
  title,
  items,
  catalog,
  styles,
  showPrice,
}: {
  title: string;
  items: BoxLineItem[];
  catalog: CatalogItem[];
  styles: ReturnType<typeof createStyles>;
  showPrice?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sectionRow}
        style={styles.sectionScroll}
      >
        {items.map((li) => (
          <OrderItemTile
            key={`${li.slotId}-${li.itemId}`}
            li={li}
            catalog={catalog}
            styles={styles}
            showPrice={showPrice}
          />
        ))}
      </ScrollView>
    </View>
  );
}

type Props = {
  lineItems: BoxLineItem[];
  catalog: CatalogItem[];
  /** Group by Hanukkah practice sections (Light candles, etc.). */
  variant?: 'box' | 'flat';
  sectionTitle?: string;
  showPrice?: boolean;
};

/** Read-only order line items — horizontal mini tiles grouped by box practice. */
export function OrderItemsBreakdown({
  lineItems,
  catalog,
  variant = 'box',
  sectionTitle,
  showPrice,
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const grouped = useMemo(
    () => (variant === 'box' ? groupLineItemsByPractice(lineItems) : null),
    [lineItems, variant]
  );

  if (lineItems.length === 0) return null;

  if (variant === 'flat') {
    return (
      <OrderItemSection
        title={sectionTitle ?? 'Items'}
        items={lineItems}
        catalog={catalog}
        styles={styles}
        showPrice={showPrice}
      />
    );
  }

  return (
    <View style={styles.root}>
      {BOX_PRACTICE_GROUPS.map((group) => (
        <OrderItemSection
          key={group.id}
          title={group.title}
          items={grouped?.[group.id] ?? []}
          catalog={catalog}
          styles={styles}
        />
      ))}
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: {
      gap: spacing.md,
    },
    section: {
      gap: spacing.xs,
    },
    sectionTitle: {
      fontSize: typography.sm,
      fontWeight: '700',
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    sectionScroll: {
      marginHorizontal: -2,
    },
    sectionRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: 2,
      paddingRight: spacing.sm,
    },
    tile: {
      width: TILE_WIDTH,
      alignItems: 'center',
    },
    tileImageWrap: {
      width: IMAGE_SIZE,
      height: IMAGE_SIZE,
      borderRadius: borderRadius.md,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
      ...(Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.sm } as object) : {}),
    },
    tileImage: {
      width: IMAGE_SIZE,
      height: IMAGE_SIZE,
      borderRadius: borderRadius.md,
    },
    tileName: {
      marginTop: 6,
      fontSize: typography.xs,
      lineHeight: 14,
      color: colors.textPrimary,
      textAlign: 'center',
      ...typeface('regular'),
    },
    tileMeta: {
      marginTop: 2,
      fontSize: typography.xs,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    tilePrice: {
      marginTop: 2,
      fontSize: typography.xs,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
