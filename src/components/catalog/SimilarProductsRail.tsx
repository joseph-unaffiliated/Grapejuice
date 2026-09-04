import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
  type ScrollView,
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
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import {
  horizontalRailContentStyle,
  horizontalRailScrollStyle,
} from '../home/CatalogProductRail';
import { HorizontalDragScrollView } from '../home/HorizontalDragScrollView';
import {
  HorizontalScrollEdgeFades,
  useHorizontalScrollEdges,
} from '../ui/ScrollEdgeFades';

type Props = {
  title?: string;
  items: CatalogItem[];
  /** When set, select in-place instead of navigating to CatalogProduct. */
  onPressItem?: (item: CatalogItem) => void;
};

const TILE = 140;
const SCROLL_STEP = TILE * 2 + spacing.md * 2;

export function SimilarProductsRail({
  title = 'You may also like',
  items,
  onPressItem,
}: Props) {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const [viewportW, setViewportW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const edges = useHorizontalScrollEdges();

  if (!items.length) return null;

  const canScroll = contentW > viewportW + 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.current = e.nativeEvent.contentOffset.x;
    edges.onScroll(e);
  };

  const onViewportLayout = (e: LayoutChangeEvent) => {
    setViewportW(e.nativeEvent.layout.width);
    edges.onLayout(e);
  };

  const onContentSizeChange = (w: number, h: number) => {
    setContentW(w);
    edges.onContentSizeChange(w, h);
  };

  const scrollBy = (dir: -1 | 1) => {
    const maxX = Math.max(0, contentW - viewportW);
    const next = Math.max(0, Math.min(maxX, scrollX.current + dir * SCROLL_STEP));
    scrollRef.current?.scrollTo({ x: next, animated: true });
  };

  const openItem = (item: CatalogItem) => {
    if (onPressItem) {
      onPressItem(item);
      return;
    }
    navigation.navigate('CatalogProduct', { slug: item.id });
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
      <View style={styles.railWrap}>
        <HorizontalDragScrollView
          ref={scrollRef}
          showsHorizontalScrollIndicator={false}
          scrollEnabled={canScroll}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onLayout={onViewportLayout}
          onContentSizeChange={onContentSizeChange}
          style={[horizontalRailScrollStyle(), styles.scrollEdge]}
          contentContainerStyle={horizontalRailContentStyle({
            gap: spacing.md,
            paddingHorizontal: MOBILE_GUTTER,
          })}
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
                onPress={() => openItem(item)}
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
        </HorizontalDragScrollView>
        <HorizontalScrollEdgeFades
          showLeft={edges.showLeft}
          showRight={edges.showRight}
          color={semanticColors.bgPrimary}
        />
      </View>
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
    paddingHorizontal: MOBILE_GUTTER,
  },
  title: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  railWrap: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
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
  /** Bleed lives on content; keep the scrollport edge-to-edge of the PDP column. */
  scrollEdge: {
    paddingHorizontal: 0,
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
