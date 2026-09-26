import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { BoxItemImage } from '../box/BoxItemImage';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { borderRadius, semanticColors, spacing, typeface, typography } from '../../constants/theme';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null;

export function OrderItemPressable({
  itemId,
  children,
  style,
  accessibilityLabel,
}: {
  itemId: string | undefined;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
}) {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const slug = itemId?.trim();
  if (!slug) return <>{children}</>;
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('CatalogProduct', { slug })}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.75}
      style={[webPointer, style]}
    >
      {children}
    </TouchableOpacity>
  );
}

/** Square beside an à la carte purchase. A box collage fills the same square. */
export const ORDER_THUMB = 168;
const COLLAGE_GAP = 4;
/** Named grid under “Show all items” — same idea as the expanded Add more rail. */
const NAME_TILE = 112;

export function orderItemName(li: BoxLineItem, catalog: CatalogItem[]): string {
  const item = catalog.find((c) => c.id === li.itemId);
  return li.label?.trim() || item?.name?.trim() || li.itemId;
}

function itemImageProps(li: BoxLineItem, catalog: CatalogItem[]) {
  const item = catalog.find((c) => c.id === li.itemId);
  return {
    imageUrl: item?.imageUrl,
    itemId: item?.id ?? li.itemId,
  };
}

export function OrderProductImage({
  li,
  catalog,
  size = ORDER_THUMB,
  style,
  linked = true,
}: {
  li: BoxLineItem;
  catalog: CatalogItem[];
  size?: number;
  style?: { width: number; height: number };
  /** False when a parent tile is already the link, so presses are not nested. */
  linked?: boolean;
}) {
  const image = itemImageProps(li, catalog);
  const photo = (
    <BoxItemImage
      size={size}
      imageUrl={image.imageUrl}
      itemId={image.itemId}
      style={style ? { ...style, borderRadius: borderRadius.md } : undefined}
    />
  );
  if (!linked) return photo;
  return (
    <OrderItemPressable itemId={li.itemId} accessibilityLabel={orderItemName(li, catalog)}>
      {photo}
    </OrderItemPressable>
  );
}

/** One large photo and up to three smaller ones, in the same square as a single product. */
export function OrderBoxCollage({
  items,
  catalog,
  size = ORDER_THUMB,
  linked = true,
}: {
  items: BoxLineItem[];
  catalog: CatalogItem[];
  /** Square the collage fills. Orders uses the default; checkout passes a smaller one. */
  size?: number;
  linked?: boolean;
}) {
  const shown = items.slice(0, 4);
  if (shown.length === 0) return null;
  if (shown.length === 1) {
    return <OrderProductImage li={shown[0]} catalog={catalog} size={size} linked={linked} />;
  }

  const gap = size >= ORDER_THUMB ? COLLAGE_GAP : 2;
  // Always size for three small tiles so the large photo stays large
  // even when the box has fewer than four items.
  const small = (size - gap * 2) / 3;
  const largeW = size - gap - small;
  const hero = shown[0];
  const side = shown.slice(1, 4);

  return (
    <View style={[styles.collage, { width: size, height: size, gap }]}>
      <OrderProductImage
        li={hero}
        catalog={catalog}
        linked={linked}
        style={{ width: largeW, height: size }}
      />
      <View style={[styles.collageSide, { width: small, height: size, gap }]}>
        {side.map((li) => (
          <OrderProductImage
            key={`${li.slotId}-${li.itemId}`}
            li={li}
            catalog={catalog}
            linked={linked}
            style={{ width: small, height: small }}
          />
        ))}
      </View>
    </View>
  );
}

/** Every item, image with its name underneath — the expanded Add more grid. */
export function OrderItemNameGrid({
  items,
  catalog,
}: {
  items: BoxLineItem[];
  catalog: CatalogItem[];
}) {
  if (items.length === 0) return null;
  return (
    <View style={gridStyles.grid}>
      {items.map((li) => {
        const qty = Math.max(1, li.quantity ?? 1);
        return (
          <OrderItemPressable
            key={`${li.slotId}-${li.itemId}`}
            itemId={li.itemId}
            accessibilityLabel={orderItemName(li, catalog)}
            style={gridStyles.tile}
          >
            <OrderProductImage li={li} catalog={catalog} size={NAME_TILE} linked={false} />
            <Text style={gridStyles.name} numberOfLines={2}>
              {orderItemName(li, catalog)}
            </Text>
            {qty > 1 ? <Text style={gridStyles.qty}>×{qty}</Text> : null}
          </OrderItemPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  collage: {
    flexDirection: 'row',
  },
  collageSide: {
    justifyContent: 'flex-start',
  },
});

const gridStyles = StyleSheet.create({
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: 8,
    rowGap: 20,
    marginTop: spacing.sm,
  },
  tile: {
    width: NAME_TILE,
    gap: 4,
  },
  name: {
    fontSize: typography.sm,
    lineHeight: 14,
    color: semanticColors.textPrimary,
    letterSpacing: -0.2,
    ...typeface('regular'),
  },
  qty: {
    fontSize: typography.xs,
    color: semanticColors.textTertiary,
    ...typeface('regular'),
  },
});
