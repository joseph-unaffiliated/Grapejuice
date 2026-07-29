import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { BoxItemImage } from '../box/BoxItemImage';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { resolveCatalogDisplayPrices } from '../../services/box/pricing';
import type { CatalogItem } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
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

export function SimilarProductsRail({ title = 'You may also like', items }: Props) {
  const { colors } = useThemeMode();
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const scrollRef = useRef<ScrollView>(null);

  if (!items.length) return null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <View style={styles.arrows}>
          <TouchableOpacity
            accessibilityLabel="Scroll similar products left"
            onPress={() => scrollRef.current?.scrollTo({ x: 0, animated: true })}
            style={[styles.arrowBtn, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 20 }}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Scroll similar products right"
            onPress={() => scrollRef.current?.scrollTo({ x: 400, animated: true })}
            style={[styles.arrowBtn, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
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
              onPress={() => navigation.navigate('CatalogProduct', { itemId: item.id })}
              accessibilityRole="button"
            >
              <View style={[styles.imageWell, { backgroundColor: colors.brandLight }]}>
                <BoxItemImage
                  size={TILE}
                  itemId={item.id}
                  imageUrl={item.imageUrl}
                  style={styles.image}
                />
              </View>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={[styles.price, { color: colors.textSecondary }]}>{price}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.xxl,
    width: '100%',
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: typography.sm,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  arrows: { flexDirection: 'row', gap: spacing.xs },
  arrowBtn: {
    width: 36,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    width: TILE,
    gap: spacing.xs,
  },
  imageWell: {
    width: TILE,
    height: TILE,
    overflow: 'hidden',
  },
  image: {
    width: TILE,
    height: TILE,
    borderRadius: 0,
  },
  name: {
    fontSize: typography.sm,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 16,
  },
  price: {
    fontSize: typography.sm,
    letterSpacing: 0,
  },
});
