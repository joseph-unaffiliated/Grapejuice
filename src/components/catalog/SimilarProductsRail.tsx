import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { BoxItemImage } from '../box/BoxItemImage';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { resolveCatalogDisplayPrices } from '../../services/box/pricing';
import type { CatalogItem } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import {
  HORIZONTAL_RAIL_SCROLL_CLASS,
  horizontalRailContentStyle,
  horizontalRailScrollStyle,
} from '../home/CatalogProductRail';

type Props = {
  title?: string;
  items: CatalogItem[];
};

const TILE = 140;
const SCROLL_STEP = TILE * 2 + spacing.md * 2;

export function SimilarProductsRail({ title = 'You may also like', items }: Props) {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const [viewportW, setViewportW] = useState(0);
  const [contentW, setContentW] = useState(0);

  if (!items.length) return null;

  const canScroll = contentW > viewportW + 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.current = e.nativeEvent.contentOffset.x;
  };

  const onViewportLayout = (e: LayoutChangeEvent) => {
    setViewportW(e.nativeEvent.layout.width);
  };

  const onContentSizeChange = (w: number) => {
    setContentW(w);
  };

  const scrollBy = (dir: -1 | 1) => {
    const maxX = Math.max(0, contentW - viewportW);
    const next = Math.max(0, Math.min(maxX, scrollX.current + dir * SCROLL_STEP));
    scrollRef.current?.scrollTo({ x: next, animated: true });
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {canScroll ? (
          <View style={styles.arrows}>
            <TouchableOpacity
              accessibilityLabel="Scroll similar products left"
              onPress={() => scrollBy(-1)}
              style={styles.arrowBtn}
            >
              <Text style={styles.arrowGlyph}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Scroll similar products right"
              onPress={() => scrollBy(1)}
              style={styles.arrowBtn}
            >
              <Text style={styles.arrowGlyph}>›</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={canScroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={onViewportLayout}
        onContentSizeChange={onContentSizeChange}
        style={horizontalRailScrollStyle()}
        contentContainerStyle={horizontalRailContentStyle({ gap: spacing.md })}
        // @ts-expect-error web className
        className={Platform.OS === 'web' ? HORIZONTAL_RAIL_SCROLL_CLASS : undefined}
      >
        {items.map((item) => {
          const { nonMemberCents, memberCents } = resolveCatalogDisplayPrices(item);
          const price =
            nonMemberCents > 0
              ? formatCatalogDollars(nonMemberCents)
              : memberCents === 0
                ? 'Included'
                : formatCatalogDollars(memberCents);
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.tile}
              onPress={() => navigation.navigate('CatalogProduct', { slug: item.id })}
              accessibilityRole="button"
            >
              <View style={styles.imageWell}>
                <BoxItemImage
                  size={TILE}
                  itemId={item.id}
                  imageUrl={item.imageUrl}
                  style={styles.image}
                />
              </View>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.price}>{price}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.lg,
    width: '100%',
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  arrows: { flexDirection: 'row', gap: spacing.xs },
  arrowBtn: {
    width: 36,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowGlyph: {
    color: semanticColors.logoDark,
    fontSize: 20,
  },
  tile: {
    width: TILE,
    gap: spacing.xs,
  },
  imageWell: {
    width: TILE,
    height: TILE,
    overflow: 'hidden',
    borderRadius: borderRadius.md,
    backgroundColor: semanticColors.accentCream,
  },
  image: {
    width: TILE,
    height: TILE,
    borderRadius: borderRadius.md,
  },
  name: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textPrimary,
    lineHeight: 16,
  },
  price: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
});
