import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  useWindowDimensions,
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
  isBookItem,
  resolveStorefrontCategorySlug,
  STOREFRONT_CATEGORIES,
  storefrontCategoryBySlug,
  orderCandlesRollYourOwnBeforeElectric,
} from '../../constants/storefrontCategories';
import {
  matchesStorefrontSearchQuery,
  storefrontCategoriesForSearch,
} from '../../constants/storefrontSearch';
import {
  applyContextualFilters,
  contextualFiltersForCategory,
} from '../../constants/storefrontCategoryFilters';
import { useCatalogAvailabilityMap } from '../../hooks/useCatalogAvailabilityMap';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import { useStorefrontHomeMode } from '../../hooks/useStorefrontHomeMode';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useGiftIntentStore } from '../../stores/giftIntentStore';
import { getHanukkahConfig } from '../../services/firestore/config';
import { storefrontBuildBoxStripCopy } from '../../constants/storefrontBuildBoxStripCopy';
import type { MainStackParamList } from '../../navigation/types';
import type { CatalogItem } from '../../types/pilot';
import {
  borderRadius,
  LAYOUT,
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

function FilterChipRow({
  children,
  scrollable,
}: {
  children: React.ReactNode;
  scrollable: boolean;
}) {
  if (!scrollable) {
    return <View style={styles.chipRow}>{children}</View>;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRowScrollContent}
      style={[
        styles.chipRowScroll,
        Platform.OS === 'web' ? ({ scrollbarWidth: 'none' } as object) : null,
      ]}
    >
      {children}
    </ScrollView>
  );
}

function sortItems(
  items: CatalogItem[],
  sort: SortKey,
  booksLast = false
): CatalogItem[] {
  const next = [...items];
  switch (sort) {
    case 'price-asc':
      next.sort((a, b) => a.dollarCostCents - b.dollarCostCents);
      break;
    case 'price-desc':
      next.sort((a, b) => b.dollarCostCents - a.dollarCostCents);
      break;
    case 'name':
      next.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      break;
  }
  if (!booksLast) return next;
  const nonBooks = next.filter((item) => !isBookItem(item));
  const books = next.filter((item) => isBookItem(item));
  return [...nonBooks, ...books];
}

export function StorefrontCategoryScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'StorefrontCategory'>>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= LAYOUT.BREAKPOINT_TABLET;
  const rawSlug = (route.params?.category || DEFAULT_STOREFRONT_CATEGORY).toLowerCase();
  const searchQuery = (route.params?.q ?? '').trim();
  const availParam = route.params?.avail;
  const styleParam = route.params?.style;
  const slug = resolveStorefrontCategorySlug(rawSlug);
  const def = storefrontCategoryBySlug(slug);
  const {
    items,
    byId: availabilityById,
    loading,
  } = useCatalogAvailabilityMap();
  const { goHome, askRav, startBox, goCategory, goPassover } = useStorefrontActions();
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const guestFavoritesPrompt = useGuestFavoritesPrompt();
  const [sort, setSort] = useState<SortKey>('relevant');
  const [facetFilters, setFacetFilters] = useState<Record<string, string>>({});
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const mode = useStorefrontHomeMode(lockAt, startsOn);
  const giftDraft = useGiftIntentStore((s) => s.draft);
  const clearGiftIntent = useGiftIntentStore((s) => s.clear);
  const strip = storefrontBuildBoxStripCopy(mode);

  useEffect(() => {
    let cancelled = false;
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLockAt(config.lockAt);
      setStartsOn(config.startsOn);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onStripPress = () => {
    switch (mode) {
      case 'guest_box':
        startAuthFromGuest('MyBox', 'signup', 'SignUp');
        return;
      case 'customize':
        startBox();
        return;
      case 'needs_payment':
        navigation.navigate('Checkout');
        return;
      case 'locked':
      case 'passover':
        goPassover();
        return;
      case 'gift_credit_incomplete':
        if (giftDraft) {
          navigation.navigate('GiftGive', {
            form: giftDraft.form,
            childDrafts: giftDraft.childDrafts,
            initialGiftPath: 'credit_only',
            autoStartPayment: true,
          });
        } else {
          navigation.navigate('GiftGive', { initialGiftPath: 'credit_only' });
        }
        return;
      case 'gift_customize_incomplete':
        if (giftDraft) {
          navigation.navigate('GiftGiverCustomize', {
            form: giftDraft.form,
            childDrafts: giftDraft.childDrafts,
            lineItems: giftDraft.lineItems,
          });
        } else {
          navigation.navigate('GiftGive', { initialGiftPath: 'credit_only' });
        }
        return;
      case 'gift_sent':
        clearGiftIntent();
        navigation.navigate('GiftGive', { initialGiftPath: 'credit_only' });
        return;
      default:
        startBox();
    }
  };

  const categoryChipOptions = useMemo(() => {
    if (searchQuery) return storefrontCategoriesForSearch(items, searchQuery);
    if (slug === 'collection') return STOREFRONT_CATEGORIES;
    return null;
  }, [items, searchQuery, slug]);
  const showCategoryChips = Boolean(categoryChipOptions?.length);

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
        ...(availParam ? { avail: availParam } : null),
        ...(styleParam && styleParam !== 'all' ? { style: styleParam } : null),
      });
    }
  }, [navigation, rawSlug, slug, searchQuery, availParam, styleParam]);

  useEffect(() => {
    navigation.setOptions({
      title: searchQuery
        ? `Search: ${searchQuery}`
        : def?.label ?? def?.title ?? 'Store',
    });
  }, [navigation, def?.label, def?.title, searchQuery]);

  useEffect(() => {
    const next: Record<string, string> = {};
    if (availParam && availParam !== 'all') {
      next.availability = availParam;
    }
    if (styleParam && styleParam !== 'all') {
      next.style = styleParam;
    }
    setFacetFilters(next);
    setSort('relevant');
  }, [slug, searchQuery, availParam, styleParam]);

  const categoryItems = useMemo(() => {
    const base = filterByStorefrontCategory(items, slug);
    if (!searchQuery) return base;
    return base.filter((item) => matchesStorefrontSearchQuery(item, searchQuery));
  }, [items, slug, searchQuery]);

  const contextualGroups = useMemo(
    () => contextualFiltersForCategory(slug, categoryItems, availabilityById),
    [slug, categoryItems, availabilityById]
  );

  const filtered = useMemo(() => {
    const faceted = applyContextualFilters(
      categoryItems,
      slug,
      facetFilters,
      availabilityById
    );
    const booksLast = facetFilters.availability === 'box-only';
    const sorted = sortItems(faceted, sort, booksLast);
    if (slug === 'candles' && sort === 'relevant') {
      return orderCandlesRollYourOwnBeforeElectric(sorted);
    }
    return sorted;
  }, [categoryItems, slug, facetFilters, sort, availabilityById]);

  const title = searchQuery ? `Results for “${searchQuery}”` : def?.title ?? 'Shop';
  const description = searchQuery
    ? `${filtered.length} item${filtered.length === 1 ? '' : 's'} in ${def?.label ?? 'the store'}`
    : def?.description ?? '';

  const setFacet = (groupId: string, key: string) => {
    setFacetFilters((prev) => ({ ...prev, [groupId]: key }));
    if (groupId === 'availability') {
      navigation.setParams({
        avail: key === 'all' ? undefined : (key as 'buy-now' | 'box-only'),
      });
    }
    if (groupId === 'style') {
      navigation.setParams({
        style: key === 'all' ? undefined : (key as 'collection' | 'kids'),
      });
    }
  };

  return (
    <StorefrontChrome activeCategory={slug} floatingFooter={guestFavoritesPrompt}>
      <View style={styles.page}>
        {isDesktop ? (
          <View style={styles.breadcrumb}>
            <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
              Store
            </Text>
            <Text style={styles.crumbSep}> / </Text>
            <Text style={styles.crumbCurrent}>
              {searchQuery ? `“${searchQuery}”` : def?.label ?? slug}
            </Text>
          </View>
        ) : null}

        <View style={[styles.headingBlock, !isDesktop && styles.headingBlockMobile]}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>

        <View style={styles.toolbar}>
          {showCategoryChips && categoryChipOptions ? (
            <View style={styles.facetBlock}>
              <Text style={styles.filterLabel}>Category</Text>
              <FilterChipRow scrollable={!isDesktop}>
                {categoryChipOptions.map((c, index) => (
                  <React.Fragment key={c.slug}>
                    {c.separatorBefore && index > 0 ? (
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
                      onPress={() =>
                        goCategory(c.slug, {
                          ...(searchQuery ? { q: searchQuery } : null),
                          ...(facetFilters.availability &&
                          facetFilters.availability !== 'all'
                            ? {
                                avail: facetFilters.availability as
                                  | 'buy-now'
                                  | 'box-only',
                              }
                            : null),
                        })
                      }
                    />
                  </React.Fragment>
                ))}
              </FilterChipRow>
            </View>
          ) : null}

          {contextualGroups.map((group) => {
            const selected = facetFilters[group.id] ?? 'all';
            return (
              <View key={group.id} style={styles.facetBlock}>
                <Text style={styles.filterLabel}>{group.label}</Text>
                <FilterChipRow scrollable={!isDesktop}>
                  {group.options.map((opt) => (
                    <FilterChipButton
                      key={opt.key}
                      label={opt.label}
                      active={opt.key === selected}
                      onPress={() => setFacet(group.id, opt.key)}
                    />
                  ))}
                </FilterChipRow>
              </View>
            );
          })}

          <View style={styles.facetBlock}>
            <Text style={styles.filterLabel}>Sort</Text>
            <FilterChipRow scrollable={!isDesktop}>
              {SORT_OPTIONS.map((opt) => (
                <FilterChipButton
                  key={opt.key}
                  label={opt.label}
                  active={opt.key === sort}
                  onPress={() => setSort(opt.key)}
                />
              ))}
            </FilterChipRow>
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
          <StorefrontProductGrid
            items={filtered}
            availabilityById={availabilityById}
            constrainWidth={false}
          />
        )}

        <StorefrontAskRavStrip onSubmit={(message) => askRav(message)} />
        <StorefrontBuildBoxStrip
          onPress={onStripPress}
          headline={strip?.headline}
          body={strip?.body}
          ctaLabel={strip?.ctaLabel}
          backgroundSource={strip?.backgroundSource}
          variant="content"
        />
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
  /** Breadcrumbs are desktop-only — give the title room under chrome on mobile. */
  headingBlockMobile: {
    marginTop: spacing.xl,
    paddingTop: spacing.sm,
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
  chipRowScroll: {
    marginHorizontal: -2,
  },
  chipRowScrollContent: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: 2,
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
