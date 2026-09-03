import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  StorefrontChrome,
  useStorefrontActions,
} from '../../components/storefront/StorefrontChrome';
import { StorefrontProductGrid } from '../../components/storefront/StorefrontProductGrid';
import { StorefrontAskRavStrip } from '../../components/storefront/StorefrontAskRavStrip';
import { StorefrontBuildBoxStrip } from '../../components/storefront/StorefrontBuildBoxStrip';
import { useCatalog } from '../../hooks/useCatalog';
import { useWishlist } from '../../hooks/useWishlist';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import type { MainStackParamList } from '../../navigation/types';
import type { CatalogItem } from '../../types/pilot';
import {
  borderRadius,
  MOBILE_GUTTER,
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
        <Text style={[styles.filterChipText, active && styles.filterChipTextActive, styles.filterChipTextOverlay]}>
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
  const { goHome, askRav, startBox } = useStorefrontActions();
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
    <StorefrontChrome>
      <View style={styles.page}>
        <View style={styles.breadcrumb}>
          <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
            Store
          </Text>
          <Text style={styles.crumbSep}> / </Text>
          <Text style={styles.crumbCurrent}>Favorites</Text>
        </View>

        <View style={styles.headingBlock}>
          <Text style={styles.title}>Favorites</Text>
          <Text style={styles.description}>
            {ids.length === 0
              ? 'Save products with the heart icon while you browse — they’ll show up here.'
              : `${favoriteItems.length} saved product${favoriteItems.length === 1 ? '' : 's'}`}
          </Text>
        </View>

        {ids.length > 0 ? (
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
        ) : null}

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

        <StorefrontAskRavStrip onSubmit={(message) => askRav(message)} />
        <StorefrontBuildBoxStrip onPress={startBox} />
      </View>
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  page: {},
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  crumbLink: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    textDecorationLine: 'underline',
  },
  crumbSep: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
  },
  crumbCurrent: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  headingBlock: {
    paddingHorizontal: MOBILE_GUTTER,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    gap: 6,
  },
  title: {
    ...typeface('medium'),
    fontSize: 28,
    color: semanticColors.logoDark,
    lineHeight: 34,
  },
  description: {
    ...typeface('regular'),
    fontSize: 15,
    color: semanticColors.textSecondary,
    lineHeight: 22,
  },
  toolbar: {
    paddingHorizontal: MOBILE_GUTTER,
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
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.borderDark,
    backgroundColor: semanticColors.bgDark,
  },
  filterChipActive: {
    backgroundColor: semanticColors.accentCream,
    borderColor: semanticColors.brand,
  },
  filterChipText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
  },
  filterChipTextActive: {
    ...typeface('medium'),
    color: semanticColors.logoDark,
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
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typeface('medium'),
    fontSize: 18,
    color: semanticColors.logoDark,
  },
  emptyBody: {
    ...typeface('regular'),
    fontSize: 14,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 22,
  },
  emptyCta: {
    marginTop: spacing.sm,
    backgroundColor: semanticColors.logoDark,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  emptyCtaText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.textInverse,
  },
});
