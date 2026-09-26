import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  StorefrontChrome,
  useStorefrontActions,
} from '../../components/storefront/StorefrontChrome';
import { AccountHubHeader } from '../../components/account/AccountHubHeader';
import { StorefrontProductGrid } from '../../components/storefront/StorefrontProductGrid';
import { useCatalog } from '../../hooks/useCatalog';
import { useWishlist } from '../../hooks/useWishlist';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import type { MainStackParamList } from '../../navigation/types';
import type { CatalogItem } from '../../types/pilot';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type SortKey = 'recent' | 'price-asc' | 'price-desc' | 'name';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently saved' },
  { key: 'price-asc', label: 'Price ↑' },
  { key: 'price-desc', label: 'Price ↓' },
  { key: 'name', label: 'A–Z' },
];

function sortItems(items: CatalogItem[], sort: SortKey, wishlistOrder: string[]): CatalogItem[] {
  const next = [...items];
  switch (sort) {
    case 'price-asc':
      return next.sort((a, b) => a.dollarCostCents - b.dollarCostCents);
    case 'price-desc':
      return next.sort((a, b) => b.dollarCostCents - a.dollarCostCents);
    case 'name':
      return next.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return next.sort(
        (a, b) => wishlistOrder.indexOf(b.id) - wishlistOrder.indexOf(a.id)
      );
  }
}

function FilterChipButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <View>
        <Text
          style={[styles.filterChipText, styles.filterChipTextSizer]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {label}
        </Text>
        <Text
          style={[
            styles.filterChipText,
            active && styles.filterChipTextActive,
            styles.filterChipTextOverlay,
          ]}
        >
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function StorefrontFavoritesScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { items, loading } = useCatalog();
  const { ids } = useWishlist();
  const { goHome } = useStorefrontActions();
  const [sort, setSort] = useState<SortKey>('recent');

  usePublishRavSurface({
    type: 'category',
    id: 'favorites',
    label: 'Favorites',
  });

  useEffect(() => {
    navigation.setOptions({ title: 'Favorites' });
  }, [navigation]);

  const favoriteItems = useMemo(() => {
    const idSet = new Set(ids);
    const matched = items.filter((item) => idSet.has(item.id));
    return sortItems(matched, sort, ids);
  }, [items, ids, sort]);

  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <AccountHubHeader page="favorites" />

        {ids.length > 0 ? (
          <>
            <View style={styles.sectionDivider} />
            <View style={styles.toolbar}>
              <Text style={styles.filterLabel}>Sort</Text>
              <View style={styles.chipRow}>
                {SORT_OPTIONS.map((opt) => (
                  <FilterChipButton
                    key={opt.key}
                    label={opt.label}
                    active={opt.key === sort}
                    onPress={() => setSort(opt.key)}
                  />
                ))}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.sectionDivider} />
        )}

        {loading ? (
          <ActivityIndicator color={semanticColors.brand} style={styles.loader} />
        ) : favoriteItems.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No favorites yet</Text>
            <Text style={styles.emptyBody}>
              Tap the heart on any product in the store to save it here for later.
            </Text>
            <TouchableOpacity style={styles.emptyCta} onPress={goHome} accessibilityRole="button">
              <Text style={styles.emptyCtaText}>Browse the store</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <StorefrontProductGrid items={favoriteItems} />
        )}
      </ScrollView>
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    width: '100%',
  },
  page: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + spacing.md,
    paddingBottom: spacing.xxl,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  sectionDivider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.border,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  toolbar: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  filterLabel: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    backgroundColor: semanticColors.bgPrimary,
  },
  filterChipActive: {
    backgroundColor: semanticColors.logoDark,
    borderColor: semanticColors.logoDark,
  },
  filterChipText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textPrimary,
  },
  filterChipTextActive: {
    ...typeface('medium'),
    color: semanticColors.brand,
  },
  filterChipTextSizer: {
    ...typeface('medium'),
    opacity: 0,
  },
  filterChipTextOverlay: {
    ...StyleSheet.absoluteFillObject,
    textAlign: 'center',
  },
  loader: { marginVertical: spacing.xl },
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typeface('medium'),
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: semanticColors.logoDark,
  },
  emptyBody: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 20,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  emptyCta: {
    marginTop: spacing.sm,
    backgroundColor: semanticColors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
  },
  emptyCtaText: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
});
