import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  StorefrontChrome,
  useStorefrontActions,
} from '../../components/storefront/StorefrontChrome';
import { StorefrontProductGrid } from '../../components/storefront/StorefrontProductGrid';
import { StorefrontAskRavStrip } from '../../components/storefront/StorefrontAskRavStrip';
import { StorefrontBuildBoxStrip } from '../../components/storefront/StorefrontBuildBoxStrip';
import { useGuestFavoritesPrompt } from '../../components/storefront/GuestFavoritesAuthBanner';
import {
  DEFAULT_STOREFRONT_CATEGORY,
  filterByStorefrontCategory,
  resolveStorefrontCategorySlug,
  STOREFRONT_CATEGORIES,
  storefrontCategoryBySlug,
} from '../../constants/storefrontCategories';
import {
  applyContextualFilters,
  contextualFiltersForCategory,
} from '../../constants/storefrontCategoryFilters';
import { useCatalog } from '../../hooks/useCatalog';
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

type SortKey = 'relevant' | 'price-asc' | 'price-desc' | 'name';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'relevant', label: 'Featured' },
  { key: 'price-asc', label: 'Price ↑' },
  { key: 'price-desc', label: 'Price ↓' },
  { key: 'name', label: 'A–Z' },
];

function FilterChipButton({
  label,
  active,
  onPress,
  accent,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Gold treatment for On Sale (matches dark category nav). */
  accent?: 'sale';
}) {
  const isSale = accent === 'sale';
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        isSale && styles.filterChipSale,
        active && styles.filterChipActive,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {/* Invisible medium text reserves width so bolding doesn't reflow the row */}
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
            isSale && styles.filterChipTextSale,
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

/** Case-insensitive keyword match across common catalog fields. */
function matchesSearchQuery(item: CatalogItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const words = needle.split(/\s+/).filter(Boolean);
  const hay = [
    item.name,
    item.description,
    item.category,
    ...(item.categories ?? []),
    item.brand,
    item.id,
    ...(item.curationTags ?? []),
    ...(item.storefrontRails ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function StorefrontCategoryScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'StorefrontCategory'>>();
  const rawSlug = (route.params?.category || DEFAULT_STOREFRONT_CATEGORY).toLowerCase();
  const searchQuery = (route.params?.q ?? '').trim();
  const slug = resolveStorefrontCategorySlug(rawSlug);
  const def = storefrontCategoryBySlug(slug);
  const { items, loading } = useCatalog();
  const { goHome, askRav, startBox, goCategory } = useStorefrontActions();
  const guestFavoritesPrompt = useGuestFavoritesPrompt();
  const [sort, setSort] = useState<SortKey>('relevant');
  const [facetFilters, setFacetFilters] = useState<Record<string, string>>({});
  const showCategoryChips = slug === 'collection';

  usePublishRavSurface({
    type: 'category',
    id: slug,
    label: searchQuery ? `Search: ${searchQuery}` : def?.label ?? slug,
  });

  useEffect(() => {
    if (rawSlug !== slug) {
      navigation.replace('StorefrontCategory', {
        category: slug,
        ...(searchQuery ? { q: searchQuery } : null),
      });
    }
  }, [navigation, rawSlug, slug, searchQuery]);

  useEffect(() => {
    navigation.setOptions({
      title: searchQuery
        ? `Search: ${searchQuery}`
        : def?.label ?? def?.title ?? 'Store',
    });
  }, [navigation, def?.label, def?.title, searchQuery]);

  useEffect(() => {
    setFacetFilters({});
    setSort('relevant');
  }, [slug, searchQuery]);

  const categoryItems = useMemo(() => {
    const base = filterByStorefrontCategory(items, slug);
    if (!searchQuery) return base;
    return base.filter((item) => matchesSearchQuery(item, searchQuery));
  }, [items, slug, searchQuery]);

  const contextualGroups = useMemo(
    () => contextualFiltersForCategory(slug, categoryItems),
    [slug, categoryItems]
  );

  const filtered = useMemo(() => {
    const faceted = applyContextualFilters(categoryItems, slug, facetFilters);
    return sortItems(faceted, sort);
  }, [categoryItems, slug, facetFilters, sort]);

  const title = searchQuery ? `Results for “${searchQuery}”` : def?.title ?? 'Shop';
  const description = searchQuery
    ? `${filtered.length} item${filtered.length === 1 ? '' : 's'} in ${def?.label ?? 'the store'}`
    : def?.description ?? '';

  const setFacet = (groupId: string, key: string) => {
    setFacetFilters((prev) => ({ ...prev, [groupId]: key }));
  };

  return (
    <StorefrontChrome activeCategory={slug} floatingFooter={guestFavoritesPrompt}>
      <View style={styles.page}>
        <View style={styles.breadcrumb}>
          <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
            Store
          </Text>
          <Text style={styles.crumbSep}> / </Text>
          <Text style={styles.crumbCurrent}>
            {searchQuery ? `“${searchQuery}”` : def?.label ?? slug}
          </Text>
        </View>

        <View style={styles.headingBlock}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>

        <View style={styles.toolbar}>
          {showCategoryChips ? (
            <View style={styles.facetBlock}>
              <Text style={styles.filterLabel}>Category</Text>
              <View style={styles.chipRow}>
                {STOREFRONT_CATEGORIES.map((c) => (
                  <React.Fragment key={c.slug}>
                    {c.separatorBefore ? (
                      <Text
                        style={styles.chipSeparator}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      >
                        |
                      </Text>
                    ) : null}
                    <FilterChipButton
                      label={c.label}
                      active={c.slug === slug}
                      accent={c.navStyle === 'sale' ? 'sale' : undefined}
                      onPress={() => goCategory(c.slug)}
                    />
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : null}

          {contextualGroups.map((group) => {
            const selected = facetFilters[group.id] ?? 'all';
            return (
              <View key={group.id} style={styles.facetBlock}>
                <Text style={styles.filterLabel}>{group.label}</Text>
                <View style={styles.chipRow}>
                  {group.options.map((opt) => (
                    <FilterChipButton
                      key={opt.key}
                      label={opt.label}
                      active={opt.key === selected}
                      onPress={() => setFacet(group.id, opt.key)}
                    />
                  ))}
                </View>
              </View>
            );
          })}

          <View style={styles.facetBlock}>
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
        </View>

        {loading ? (
          <ActivityIndicator color={semanticColors.brand} style={styles.loader} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing matches</Text>
            <Text style={styles.emptyBody}>
              {searchQuery
                ? `No products matched “${searchQuery}”. Try another term, or ask Rav for ideas.`
                : `Try clearing filters, or ask Rav what to look at in ${def?.label ?? 'this aisle'}.`}
            </Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={() =>
                askRav(
                  searchQuery
                    ? `Help me find something like “${searchQuery}” for my household`
                    : `Help me find something in ${def?.label ?? 'the store'} for my household`
                )
              }
              accessibilityRole="button"
            >
              <Text style={styles.emptyCtaText}>Ask Rav</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <StorefrontProductGrid items={filtered} />
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
    gap: spacing.sm,
  },
  facetBlock: {
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
  filterChipSale: {
    borderColor: semanticColors.brand,
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
  filterChipTextSale: {
    color: semanticColors.brand,
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
  chipSeparator: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
    opacity: 0.55,
    alignSelf: 'center',
    paddingHorizontal: 2,
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
