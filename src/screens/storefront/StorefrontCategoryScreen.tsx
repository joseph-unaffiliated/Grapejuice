import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Pressable,
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
import { Icon } from '../../components/ui/Icon';
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
import { icons } from '../../constants/icons';
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

type FilterOption = {
  key: string;
  label: string;
  accent?: 'sale';
};

function FilterDropdown({
  id,
  label,
  options,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  open: boolean;
  onOpenChange: (id: string | null) => void;
  onChange: (key: string) => void;
}) {
  const selected = options.find((o) => o.key === value) ?? options[0];
  const isDefault = value === 'all' || value === 'relevant';

  return (
    <View style={[styles.dropdownWrap, open && styles.dropdownWrapOpen]}>
      <Text style={styles.dropdownLabel} numberOfLines={1}>
        {label}
      </Text>
      <TouchableOpacity
        style={[
          styles.dropdownTrigger,
          !isDefault && styles.dropdownTriggerActive,
          open && styles.dropdownTriggerOpen,
        ]}
        onPress={() => onOpenChange(open ? null : id)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${selected?.label ?? value}`}
      >
        <Text
          style={[
            styles.dropdownValue,
            selected?.accent === 'sale' && styles.dropdownValueSale,
          ]}
          numberOfLines={1}
        >
          {selected?.label ?? value}
        </Text>
        <Icon
          icon={icons.chevronDown}
          size={11}
          color={semanticColors.brand}
          style={open ? styles.dropdownChevronOpen : undefined}
        />
      </TouchableOpacity>
      {open ? (
        <>
          <Pressable
            style={styles.dropdownDismiss}
            onPress={() => onOpenChange(null)}
            accessibilityLabel={`Dismiss ${label} menu`}
          />
          <View style={styles.dropdownMenu} accessibilityRole="menu">
            <ScrollView
              style={styles.dropdownMenuScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {options.map((opt) => {
                const active = opt.key === value;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                    onPress={() => {
                      onChange(opt.key);
                      onOpenChange(null);
                    }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        opt.accent === 'sale' && styles.dropdownItemTextSale,
                        active && styles.dropdownItemTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </>
      ) : null}
    </View>
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
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
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
    setOpenFilterId(null);
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
          <Text style={[styles.title, !isDesktop && styles.titleMobile]}>{title}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.toolbarScroll, openFilterId ? styles.toolbarOpen : null]}
          contentContainerStyle={styles.toolbar}
        >
          {showCategoryChips && categoryChipOptions ? (
            <FilterDropdown
              id="category"
              label="Category"
              options={categoryChipOptions.map((c) => ({
                key: c.slug,
                label: c.label,
                accent: c.navStyle === 'sale' ? 'sale' : undefined,
              }))}
              value={slug}
              open={openFilterId === 'category'}
              onOpenChange={setOpenFilterId}
              onChange={(nextSlug) =>
                goCategory(nextSlug, {
                  ...(searchQuery ? { q: searchQuery } : null),
                  ...(facetFilters.availability &&
                  facetFilters.availability !== 'all'
                    ? {
                        avail: facetFilters.availability as 'buy-now' | 'box-only',
                      }
                    : null),
                })
              }
            />
          ) : null}

          {contextualGroups.map((group) => {
            const selected = facetFilters[group.id] ?? 'all';
            return (
              <FilterDropdown
                key={group.id}
                id={group.id}
                label={group.label}
                options={group.options}
                value={selected}
                open={openFilterId === group.id}
                onOpenChange={setOpenFilterId}
                onChange={(key) => setFacet(group.id, key)}
              />
            );
          })}

          <FilterDropdown
            id="sort"
            label="Sort"
            options={SORT_OPTIONS}
            value={sort}
            open={openFilterId === 'sort'}
            onOpenChange={setOpenFilterId}
            onChange={(key) => setSort(key as SortKey)}
          />
        </ScrollView>

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
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  /** Breadcrumbs are desktop-only — tighter title stack under chrome on mobile. */
  headingBlockMobile: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingTop: 0,
  },
  title: {
    ...typeface('medium'),
    fontSize: 36,
    color: semanticColors.logoDark,
    lineHeight: 42,
  },
  titleMobile: {
    fontSize: 40,
    lineHeight: 46,
  },
  toolbarScroll: {
    marginBottom: spacing.md,
    zIndex: 1,
    ...(Platform.OS === 'web' ? ({ scrollbarWidth: 'none' } as object) : null),
  },
  toolbarOpen: {
    zIndex: 20,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: 2,
  },
  dropdownWrap: {
    position: 'relative',
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'flex-start',
    gap: 6,
    zIndex: 1,
  },
  dropdownWrapOpen: {
    zIndex: 30,
  },
  dropdownLabel: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  dropdownTrigger: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: semanticColors.brand,
    backgroundColor: semanticColors.bgPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dropdownTriggerActive: {
    backgroundColor: semanticColors.bgPrimary,
    borderColor: semanticColors.brand,
  },
  dropdownTriggerOpen: {
    borderColor: semanticColors.brand,
  },
  dropdownValue: {
    ...typeface('regular'),
    flexGrow: 0,
    flexShrink: 0,
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  dropdownValueSale: {
    color: semanticColors.brand,
  },
  dropdownChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  dropdownDismiss: {
    ...StyleSheet.absoluteFillObject,
    top: -4000,
    right: -4000,
    bottom: -4000,
    left: -4000,
    zIndex: 1,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    minWidth: '100%',
    marginTop: 4,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: semanticColors.brand,
    backgroundColor: semanticColors.bgPrimary,
    zIndex: 2,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 10px 28px rgba(17, 2, 34, 0.14)',
        } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.14,
          shadowRadius: 14,
          elevation: 8,
        }),
  },
  dropdownMenuScroll: {
    maxHeight: 260,
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  dropdownItemActive: {
    backgroundColor: semanticColors.accentCream,
  },
  dropdownItemText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
  },
  dropdownItemTextSale: {
    color: semanticColors.brand,
  },
  dropdownItemTextActive: {
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
