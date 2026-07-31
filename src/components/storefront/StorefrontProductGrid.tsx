import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontProductTile } from './StorefrontProductTile';
import { useWishlist } from '../../hooks/useWishlist';
import type { CatalogItem } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import { MOBILE_GUTTER, spacing } from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  items: CatalogItem[];
  /** Max items to show (home rails). Omit for full PLP. */
  limit?: number;
};

export function StorefrontProductGrid({ items, limit }: Props) {
  const navigation = useNavigation<Nav>();
  const { width: windowWidth } = useWindowDimensions();
  const { isWishlisted, toggleWishlist } = useWishlist();

  // 2 on phone; 3 from tablet / mid desktop (matches other storefront breakpoints).
  const cols = windowWidth >= 768 ? 3 : 2;
  const gap = spacing.sm;
  const pad = MOBILE_GUTTER;
  const tileWidth = Math.floor((windowWidth - pad * 2 - gap * (cols - 1)) / cols);

  const visible = useMemo(() => {
    const list = limit != null ? items.slice(0, limit) : items;
    return list;
  }, [items, limit]);

  return (
    <View style={[styles.grid, { paddingHorizontal: pad, gap }]}>
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
});
