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
import { useBrowsingHistoryStore } from '../../stores/browsingHistoryStore';
import { getHanukkahConfig, isBoxLocked } from '../../services/firestore/config';
import { ordersService } from '../../services/firestore/orders';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import {
  HANUKKAH_SHIP_WINDOW_LABEL,
  inferPricingTier,
  resolveCatalogDisplayPrices,
  unitCentsForTier,
} from '../../services/box/pricing';
import { similarCatalogItems } from '../../constants/catalogCuration';
import { pdpBodyCopyForItem } from '../../constants/pdpCategoryCopy';
import { storefrontCategoryForItem } from '../../constants/storefrontCategories';
import { ProductImageGallery } from '../../components/catalog/ProductImageGallery';
import { ProductPricingBlock } from '../../components/catalog/ProductPricingBlock';
import { SimilarProductsRail } from '../../components/catalog/SimilarProductsRail';
import {
  StorefrontChrome,
  useStorefrontActions,
} from '../../components/storefront/StorefrontChrome';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type DetailRow = { label: string; value: string };

/** Spec rows for PDP — only include fields that have real values. */
function detailRowsFromItem(item: CatalogItem): DetailRow[] {
  const rows: DetailRow[] = [];
  if (item.dimensions?.trim()) rows.push({ label: 'Dimensions', value: item.dimensions.trim() });
  if (item.weight?.trim()) rows.push({ label: 'Weight', value: item.weight.trim() });
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
  const recordBrowseView = useBrowsingHistoryStore((s) => s.recordView);
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

  useEffect(() => {
    navigation.setOptions({
      title: item?.name?.trim() || 'Product',
    });
  }, [navigation, item?.name]);

  useEffect(() => {
    if (!item?.id) return;
    recordBrowseView({ id: item.id, name: item.name });
  }, [item?.id, item?.name, recordBrowseView]);

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
  const { memberCents, nonMemberCents } = item
    ? resolveCatalogDisplayPrices(item)
    : { memberCents: 0, nonMemberCents: 0 };
  /** Box-path charge: member list for à la carte; existing tier rules otherwise. */
  const boxUnitCents = item
    ? tier === 'alaCarte'
      ? memberCents
      : unitCentsForTier(tier, item.dollarCostCents)
    : 0;
  const bodyCopy = useMemo(() => (item ? pdpBodyCopyForItem(item) : undefined), [item]);
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

  const addToCart = async () => {
    if (!item || locked || inCart) return;
    if (nonMemberCents > 0 && !guardMutation()) return;
    await persist([
      ...lineItems,
      {
        slotId: item.slotId,
        itemId: item.id,
        quantity: 1,
        unitCents: nonMemberCents,
        label: item.name,
      },
    ]);
    navigation.goBack();
  };

  const buyWithBox = async () => {
    if (!item || locked || inCart) return;
    if (boxUnitCents > 0 && !guardMutation()) return;
    await persist([
      ...lineItems,
      {
        slotId: item.slotId,
        itemId: item.id,
        quantity: 1,
        unitCents: boxUnitCents,
        label: item.name,
      },
    ]);
    navigation.navigate('MyBox');
  };

  const removeFromCartOrBox = async () => {
    if (locked) return;
    await persist(lineItems.filter((li) => li.itemId !== slug));
    navigation.goBack();
  };

  const askFollowUpAboutCopy = () => {
    if (!bodyCopy) return;
    navigation.navigate('MainTabs', {
      screen: 'Rav',
      params: {
        newChat: true,
        openingAssistantMessage: bodyCopy,
      },
    });
  };

  const primaryLabel = inCart
    ? boxStarted
      ? 'Remove from box'
      : 'Remove from cart'
    : nonMemberCents > 0
      ? `Add to cart (${formatCatalogDollars(nonMemberCents)})`
      : 'Add to cart';

  const boxCtaLabel =
    memberCents > 0
      ? `Buy with a box (${formatCatalogDollars(memberCents)})`
      : 'Buy with a box';

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
    <StorefrontChrome activeCategory={aisle?.slug}>
      {/* Padding on body only — chrome/footer stay full-bleed like /store */}
      <View style={styles.body}>
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
              wishlisted={wishlisted}
              onToggleWishlist={() => toggleWishlist(item.id)}
              wishlistDisabled={wishlistSaving}
            />
          </View>

          <View style={[styles.buy, desktop && styles.buyDesktop]}>
            <Text style={[styles.name, !desktop && styles.nameMobile]}>{item.name}</Text>
            {bodyCopy ? (
              <Text style={styles.desc}>
                {bodyCopy}{' '}
                <Text
                  style={styles.followUpLink}
                  onPress={askFollowUpAboutCopy}
                  accessibilityRole="link"
                  accessibilityLabel="I have a follow up question"
                >
                  I have a follow up question >
                </Text>
              </Text>
            ) : null}

            <View style={styles.priceRule}>
              <ProductPricingBlock
                item={item}
                hasHanukkahBox={hasHanukkahBox}
                onWhatsInTheBox={() => navigation.navigate('MyBox')}
              />
            </View>

            <View style={styles.ctaBlock}>
              <View style={styles.ctaRow}>
                <TouchableOpacity
                  style={[styles.cta, styles.ctaPrimary, (locked || saving) && styles.ctaDisabled]}
                  onPress={inCart ? removeFromCartOrBox : addToCart}
                  disabled={locked || saving}
                  accessibilityRole="button"
                >
                  {saving ? (
                    <ActivityIndicator color={semanticColors.textInverse} />
                  ) : (
                    <Text style={styles.ctaPrimaryText}>{primaryLabel}</Text>
                  )}
                </TouchableOpacity>
                {!inCart ? (
                  <TouchableOpacity
                    style={[styles.cta, styles.ctaSecondary, (locked || saving) && styles.ctaDisabled]}
                    onPress={buyWithBox}
                    disabled={locked || saving}
                    accessibilityRole="button"
                  >
                    <Text style={styles.ctaSecondaryText}>{boxCtaLabel}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {!inCart ? (
                <Text style={styles.shipNote}>
                  Arrives in time for Hanukkah (est. {shipWindow})
                </Text>
              ) : null}
            </View>

            {details.length > 0 ? (
              <View style={styles.details}>
                <Text style={styles.detailsHeading}>Product details</Text>
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
      </View>
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
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
    lineHeight: 24,
    color: semanticColors.textSecondary,
    maxWidth: 440,
  },
  followUpLink: {
    ...typeface('bold'),
    fontSize: typography.md,
    lineHeight: 24,
    color: semanticColors.logoDark,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  priceRule: {
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.border,
    width: '100%',
  },
  ctaBlock: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    alignSelf: 'flex-start',
    gap: spacing.sm,
  },
  cta: {
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  ctaPrimary: {
    backgroundColor: semanticColors.logoDark,
  },
  ctaSecondary: {
    borderWidth: 1,
    borderColor: semanticColors.logoDark,
    backgroundColor: semanticColors.bgPrimary,
  },
  ctaDisabled: { opacity: 0.55 },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: 11,
    lineHeight: 14,
    color: semanticColors.textInverse,
    textAlign: 'center',
  },
  ctaSecondaryText: {
    ...typeface('medium'),
    fontSize: 11,
    lineHeight: 14,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  shipNote: {
    ...typeface('regular'),
    fontSize: 11,
    lineHeight: 14,
    color: semanticColors.textSecondary,
    textAlign: 'left',
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
