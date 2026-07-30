import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { StorefrontChrome, useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { StorefrontProductGrid } from '../../components/storefront/StorefrontProductGrid';
import { StorefrontAskRavStrip } from '../../components/storefront/StorefrontAskRavStrip';
import { StorefrontBuildBoxStrip } from '../../components/storefront/StorefrontBuildBoxStrip';
import {
  DEFAULT_STOREFRONT_CATEGORY,
  STOREFRONT_CATEGORIES,
  filterByStorefrontCategory,
  storefrontCategoryBySlug,
} from '../../constants/storefrontCategories';
import { useCatalog } from '../../hooks/useCatalog';
import type { MainStackParamList } from '../../navigation/types';
import type { AgeGroup, CatalogItem } from '../../types/pilot';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type SortKey = 'relevant' | 'price-asc' | 'price-desc' | 'name';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'relevant', label: 'Featured' },
  { key: 'price-asc', label: 'Price ↑' },
  { key: 'price-desc', label: 'Price ↓' },
  { key: 'name', label: 'A–Z' },
];

const AGE_FILTERS: { key: AgeGroup | 'all'; label: string }[] = [
  { key: 'all', label: 'All ages' },
  { key: '0-2', label: '0–2' },
  { key: '3-5', label: '3–5' },
  { key: '6-8', label: '6–8' },
  { key: '9-12', label: '9–12' },
];

function sortItems(items: CatalogItem[], sort: SortKey): CatalogItem[] {
  const next = [...items];
  switch (sort) {
    case 'price-asc':
      return next.sort((a, b) => a.dollarCostCents - b.dollarCostCents);
    case 'price-desc':
      return next.sort((a, b) => b.dollarCostCents - a.dollarCostCents);
    case 'name':
      return next.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return next;
  }
}

export function StorefrontCategoryScreen() {
  const route = useRoute<RouteProp<MainStackParamList, 'StorefrontCategory'>>();
  const slug = (route.params?.category || DEFAULT_STOREFRONT_CATEGORY).toLowerCase();
  const def = storefrontCategoryBySlug(slug);
  const { items, loading } = useCatalog();
  const { goHome, goCategory, askRav, startBox } = useStorefrontActions();
  const [sort, setSort] = useState<SortKey>('relevant');
  const [ageFilter, setAgeFilter] = useState<AgeGroup | 'all'>('all');
  const [withImageOnly, setWithImageOnly] = useState(false);

  const categoryItems = useMemo(
    () => filterByStorefrontCategory(items, slug),
    [items, slug]
  );

  const filtered = useMemo(() => {
    let list = categoryItems;
    if (ageFilter !== 'all') {
      list = list.filter((item) => item.ageGroups?.includes(ageFilter));
    }
    if (withImageOnly) {
      list = list.filter((item) => Boolean(item.imageUrl?.trim()));
    }
    return sortItems(list, sort);
  }, [categoryItems, sort, ageFilter, withImageOnly]);

  const title = def?.title ?? 'Shop';
  const description = def?.description ?? '';

  return (
    <StorefrontChrome activeCategory={slug}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.breadcrumb}>
          <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
            Store
          </Text>
          <Text style={styles.crumbSep}> / </Text>
          <Text style={styles.crumbCurrent}>{def?.label ?? slug}</Text>
        </View>

        <View style={styles.headingBlock}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>

        {/* Browse other categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catChips}
        >
          {STOREFRONT_CATEGORIES.map((c) => {
            const active = c.slug === slug;
            return (
              <TouchableOpacity
                key={c.slug}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => goCategory(c.slug)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={c.label}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.toolbar}>
          <Text style={styles.count}>
            {loading
              ? '…'
              : `${filtered.length} item${filtered.length === 1 ? '' : 's'}${
                  filtered.length !== categoryItems.length
                    ? ` of ${categoryItems.length}`
                    : ''
                }`}
          </Text>

          <Text style={styles.filterLabel}>Age</Text>
          <View style={styles.chipRow}>
            {AGE_FILTERS.map((opt) => {
              const active = opt.key === ageFilter;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setAgeFilter(opt.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.filterChip, withImageOnly && styles.filterChipActive]}
            onPress={() => setWithImageOnly((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: withImageOnly }}
          >
            <Text style={[styles.filterChipText, withImageOnly && styles.filterChipTextActive]}>
              With photo
            </Text>
          </TouchableOpacity>

          <Text style={styles.filterLabel}>Sort</Text>
          <View style={styles.chipRow}>
            {SORT_OPTIONS.map((opt) => {
              const active = opt.key === sort;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setSort(opt.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={semanticColors.brand} style={styles.loader} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing matches</Text>
            <Text style={styles.emptyBody}>
              Try clearing filters, or ask Rav what to look at in {def?.label ?? 'this aisle'}.
            </Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={() =>
                askRav(`Help me find something in ${def?.label ?? 'the store'} for my household`)
              }
              accessibilityRole="button"
            >
              <Text style={styles.emptyCtaText}>Ask Rav</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <StorefrontProductGrid items={filtered} />
        )}

        <StorefrontAskRavStrip
          onPress={() =>
            askRav(`Help me browse ${def?.label ?? 'this category'} — what fits my household?`)
          }
        />
        <StorefrontBuildBoxStrip onPress={startBox} />
      </ScrollView>
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xxl },
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
  catChips: {
    paddingHorizontal: MOBILE_GUTTER,
    gap: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: semanticColors.border,
    backgroundColor: semanticColors.bgPrimary,
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: semanticColors.logoDark,
    borderColor: semanticColors.logoDark,
  },
  chipText: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  chipTextActive: {
    color: semanticColors.textInverse,
  },
  toolbar: {
    paddingHorizontal: MOBILE_GUTTER,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  count: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    marginBottom: spacing.xs,
  },
  filterLabel: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    marginTop: spacing.xs,
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
