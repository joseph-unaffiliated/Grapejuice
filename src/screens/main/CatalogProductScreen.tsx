import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { useCatalog } from '../../hooks/useCatalog';
import { useSession } from '../../hooks/useSession';
import { useWishlist } from '../../hooks/useWishlist';
import { getHanukkahConfig, isBoxLocked } from '../../services/firestore/config';
import { ordersService } from '../../services/firestore/orders';
import {
  HANUKKAH_SHIP_WINDOW_LABEL,
  inferPricingTier,
  unitCentsForTier,
} from '../../services/box/pricing';
import { similarCatalogItems } from '../../constants/catalogCuration';
import { storefrontCategoryForItem } from '../../constants/storefrontCategories';
import { ProductImageGallery } from '../../components/catalog/ProductImageGallery';
import { ProductPricingBlock } from '../../components/catalog/ProductPricingBlock';
import { SimilarProductsRail } from '../../components/catalog/SimilarProductsRail';
import {
  StorefrontChrome,
  useStorefrontActions,
} from '../../components/storefront/StorefrontChrome';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem } from '../../types/pilot';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type DetailRow = { label: string; value: string };

function detailRowsFromItem(item: {
  dimensions?: string;
  materials?: string;
  whatsIncluded?: string;
  careNotes?: string;
}): DetailRow[] {
  const rows: DetailRow[] = [];
  if (item.dimensions?.trim()) rows.push({ label: 'Dimensions', value: item.dimensions.trim() });
  if (item.materials?.trim()) rows.push({ label: 'Materials', value: item.materials.trim() });
  if (item.whatsIncluded?.trim()) {
    rows.push({ label: 'What’s included', value: item.whatsIncluded.trim() });
  }
  if (item.careNotes?.trim()) rows.push({ label: 'Care', value: item.careNotes.trim() });
  return rows;
}

function hasActiveHanukkahBoxOrder(orders: { status: string }[]): boolean {
  return orders.some(
    (o) =>
      o.status === 'committed' ||
      o.status === 'confirmed' ||
      o.status === 'shipped' ||
      o.status === 'delivered'
  );
}

export function CatalogProductScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'CatalogProduct'>>();
  const { slug } = route.params;
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const { household } = useSession();
  const { lineItems, loading: draftLoading, persist: saveDraft } = useBoxDraft();
  const { guardMutation } = usePaymentGate();
  const { isWishlisted, toggleWishlist, saving: wishlistSaving } = useWishlist();
  const { items: catalog, loading: catalogLoading } = useCatalog();
  const { goHome, goCategory } = useStorefrontActions();
  const item = useMemo(
    () => catalog.find((c) => c.id === slug) ?? null,
    [catalog, slug]
  );
  const aisle = useMemo(
    () => (item ? storefrontCategoryForItem(item) : undefined),
    [item]
  );
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hasHanukkahBox, setHasHanukkahBox] = useState(false);
  const [shipWindow, setShipWindow] = useState(HANUKKAH_SHIP_WINDOW_LABEL);

  useEffect(() => {
    let cancelled = false;
    setLoadingConfig(true);
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLocked(isBoxLocked(config.lockAt));
      if (config.estimatedDeliveryBy) {
        setShipWindow(HANUKKAH_SHIP_WINDOW_LABEL);
      }
      setLoadingConfig(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!household?.id) {
      setHasHanukkahBox(false);
      return;
    }
    ordersService.listForHousehold(household.id).then((orders) => {
      if (cancelled) return;
      setHasHanukkahBox(hasActiveHanukkahBoxOrder(orders));
    });
    return () => {
      cancelled = true;
    };
  }, [household?.id]);

  const loading = catalogLoading || loadingConfig;
  const boxStarted = lineItems.length > 0;
  const inCart = useMemo(() => lineItems.some((li) => li.itemId === slug), [lineItems, slug]);
  const wishlisted = item ? isWishlisted(item.id) : false;
  const tier = item ? inferPricingTier(item) : 'included';
  const unitCents = item ? unitCentsForTier(tier, item.dollarCostCents) : 0;
  const details = useMemo(() => (item ? detailRowsFromItem(item) : []), [item]);
  const similar = useMemo(
    () => (item ? similarCatalogItems(item, catalog, 12) : []),
    [item, catalog]
  );

  const persist = async (next: BoxLineItem[]) => {
    setSaving(true);
    try {
      await saveDraft(next);
    } finally {
      setSaving(false);
    }
  };

  const addToCartOrBox = async () => {
    if (!item || locked || inCart) return;
    if (unitCents > 0 && !guardMutation()) return;
    await persist([
      ...lineItems,
      {
        slotId: item.slotId,
        itemId: item.id,
        quantity: 1,
        unitCents,
        label: item.name,
      },
    ]);
    navigation.goBack();
  };

  const removeFromCartOrBox = async () => {
    if (locked) return;
    await persist(lineItems.filter((li) => li.itemId !== slug));
    navigation.goBack();
  };

  const primaryLabel = inCart
    ? boxStarted
      ? 'Remove from box'
      : 'Remove from cart'
    : boxStarted
      ? 'Add to box'
      : 'Add to cart';

  if (loading || draftLoading) {
    return (
      <StorefrontChrome activeCategory={aisle?.slug}>
        <View style={styles.centered}>
          <ActivityIndicator color={semanticColors.brand} />
        </View>
      </StorefrontChrome>
    );
  }

  if (!item) {
    return (
      <StorefrontChrome>
        <View style={styles.centered}>
          <Text style={styles.missing}>Product not found.</Text>
          <TouchableOpacity onPress={goHome} accessibilityRole="button">
            <Text style={styles.missingLink}>Back to store</Text>
          </TouchableOpacity>
        </View>
      </StorefrontChrome>
    );
  }

  return (
    <StorefrontChrome
      activeCategory={aisle?.slug}
      contentContainerStyle={styles.content}
    >
      <View style={styles.breadcrumb}>
          <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
            Store
          </Text>
          {aisle ? (
            <>
              <Text style={styles.crumbSep}> / </Text>
              <Text
                style={styles.crumbLink}
                onPress={() => goCategory(aisle.slug)}
                accessibilityRole="link"
              >
                {aisle.label}
              </Text>
            </>
          ) : null}
          <Text style={styles.crumbSep}> / </Text>
          <Text style={styles.crumbCurrent}>{item.name}</Text>
        </View>

        <View style={[styles.split, desktop && styles.splitDesktop]}>
          <View
            style={[
              styles.galleryCol,
              desktop && styles.galleryColDesktop,
              desktop && Platform.OS === 'web' ? styles.galleryColSticky : null,
            ]}
          >
            <ProductImageGallery
              itemId={item.id}
              imageUrl={item.imageUrl}
              imageUrls={item.imageUrls}
            />
          </View>

          <View style={[styles.buy, desktop && styles.buyDesktop]}>
            <Text style={[styles.name, !desktop && styles.nameMobile]}>{item.name}</Text>
            {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

            <View style={styles.priceRule}>
              <ProductPricingBlock
                item={item}
                hasHanukkahBox={hasHanukkahBox}
                onWhatsInTheBox={() => navigation.navigate('MyBox')}
                onEligibility={() => navigation.navigate('BoxDiscountEligibility')}
              />
            </View>

            <Text style={styles.shipNote}>
              Ships in time for Hanukkah (estimated arrival {shipWindow})
            </Text>

            <View style={styles.ctaRow}>
              <TouchableOpacity
                style={[styles.cta, styles.ctaPrimary, (locked || saving) && styles.ctaDisabled]}
                onPress={inCart ? removeFromCartOrBox : addToCartOrBox}
                disabled={locked || saving}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={semanticColors.textInverse} />
                ) : (
                  <Text style={styles.ctaPrimaryText}>{primaryLabel}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cta, styles.ctaSecondary, wishlistSaving && styles.ctaDisabled]}
                onPress={() => toggleWishlist(item.id)}
                disabled={wishlistSaving}
                accessibilityRole="button"
              >
                <Text style={styles.ctaSecondaryText}>
                  {wishlisted ? 'Saved to wishlist' : 'Add to wishlist'}
                </Text>
              </TouchableOpacity>
            </View>

            {details.length > 0 ? (
              <View style={styles.details}>
                <Text style={styles.detailsHeading}>Details</Text>
                {details.map((row) => (
                  <View key={row.label} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{row.label}</Text>
                    <Text style={styles.detailValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <SimilarProductsRail items={similar} />
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    minHeight: 280,
  },
  missing: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    marginBottom: spacing.md,
  },
  missingLink: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  breadcrumb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  crumbLink: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
  },
  crumbSep: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.border,
  },
  crumbCurrent: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    flexShrink: 1,
  },
  split: {
    flexDirection: 'column',
    gap: spacing.xxl,
  },
  splitDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxl,
  },
  galleryCol: { width: '100%' },
  galleryColDesktop: {
    flex: 0.55,
    maxWidth: '55%',
    minWidth: 0,
  },
  galleryColSticky: {
    position: 'sticky' as const,
    top: spacing.md,
    alignSelf: 'flex-start',
    zIndex: 2,
  },
  buy: {
    width: '100%',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  buyDesktop: {
    flex: 0.45,
    maxWidth: '42%',
    minWidth: 0,
    paddingTop: spacing.sm,
  },
  name: {
    ...typeface('medium'),
    fontSize: 32,
    color: semanticColors.logoDark,
    lineHeight: 38,
  },
  nameMobile: {
    fontSize: 24,
    lineHeight: 30,
  },
  desc: {
    ...typeface('regular'),
    fontSize: typography.md,
    lineHeight: 22,
    color: semanticColors.textSecondary,
    maxWidth: 440,
  },
  priceRule: {
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.border,
    width: '100%',
  },
  shipNote: {
    ...typeface('medium'),
    fontSize: typography.md,
    lineHeight: 22,
    color: semanticColors.textPrimary,
  },
  ctaRow: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cta: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  ctaPrimary: {
    backgroundColor: semanticColors.logoDark,
  },
  ctaSecondary: {
    borderWidth: 1,
    borderColor: semanticColors.logoDark,
    backgroundColor: 'transparent',
  },
  ctaDisabled: { opacity: 0.55 },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textInverse,
  },
  ctaSecondaryText: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  details: {
    marginTop: spacing.xl,
    paddingTop: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.border,
    width: '100%',
  },
  detailsHeading: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    marginBottom: spacing.md,
  },
  detailRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
    gap: 6,
  },
  detailLabel: {
    ...typeface('medium'),
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: semanticColors.goldMuted,
  },
  detailValue: {
    ...typeface('regular'),
    fontSize: typography.md,
    lineHeight: 22,
    color: semanticColors.textPrimary,
  },
});
