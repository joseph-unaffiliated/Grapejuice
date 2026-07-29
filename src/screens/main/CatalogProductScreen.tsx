import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { useCatalog } from '../../hooks/useCatalog';
import { useSession } from '../../hooks/useSession';
import { useWishlist } from '../../hooks/useWishlist';
import { useWebLayout } from '../../hooks/useWebLayout';
import { getHanukkahConfig, isBoxLocked } from '../../services/firestore/config';
import { ordersService } from '../../services/firestore/orders';
import {
  HANUKKAH_SHIP_WINDOW_LABEL,
  inferPricingTier,
  unitCentsForTier,
} from '../../services/box/pricing';
import { similarCatalogItems } from '../../constants/catalogCuration';
import { ProductImageGallery } from '../../components/catalog/ProductImageGallery';
import { ProductPricingBlock } from '../../components/catalog/ProductPricingBlock';
import { SimilarProductsRail } from '../../components/catalog/SimilarProductsRail';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem } from '../../types/pilot';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { LAYOUT, MOBILE_GUTTER, spacing, typography } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';

/** Match Home / About Hanukkah desktop top inset. */
const DESKTOP_CONTENT_TOP = 41;

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
  const { itemId } = route.params;
  const { colors } = useThemeMode();
  const { isDesktop, layoutWidth } = useWebLayout();
  const { household } = useSession();
  const { lineItems, loading: draftLoading, persist: saveDraft } = useBoxDraft();
  const { guardMutation } = usePaymentGate();
  const { isWishlisted, toggleWishlist, saving: wishlistSaving } = useWishlist();
  const { items: catalog, loading: catalogLoading } = useCatalog();
  const item = useMemo(
    () => catalog.find((c) => c.id === itemId) ?? null,
    [catalog, itemId]
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
        // Keep marketing window; config end date is the anchor (typically Nov 21).
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
  const inCart = useMemo(() => lineItems.some((li) => li.itemId === itemId), [lineItems, itemId]);
  const wishlisted = item ? isWishlisted(item.id) : false;
  const tier = item ? inferPricingTier(item) : 'included';
  const unitCents = item ? unitCentsForTier(tier, item.dollarCostCents) : 0;
  const isPaid = unitCents > 0;
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
    if (isPaid && !guardMutation()) return;
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
    await persist(lineItems.filter((li) => li.itemId !== itemId));
    navigation.goBack();
  };

  const primaryLabel = inCart
    ? boxStarted
      ? 'Remove from box'
      : 'Remove from cart'
    : boxStarted
      ? 'Add to box'
      : 'Add to cart';

  const pageBg = colors.bgPrimary;

  if (loading || draftLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: pageBg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.centered, { backgroundColor: pageBg }]}>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md, letterSpacing: 0 }}>
          Product not found.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.textPrimary, fontWeight: '500', letterSpacing: 0 }}>
            Go back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const buyColumn = (
    <View style={[styles.buy, isDesktop && styles.buyDesktop]}>
      <Text style={[styles.name, { color: colors.textPrimary }]}>{item.name}</Text>
      {item.description ? (
        <Text style={[styles.desc, { color: colors.textSecondary }]}>{item.description}</Text>
      ) : null}

      <View style={[styles.priceRule, { borderTopColor: colors.border }]}>
        <ProductPricingBlock
          item={item}
          hasHanukkahBox={hasHanukkahBox}
          onWhatsInTheBox={() => navigation.navigate('MyBox')}
          onEligibility={() => navigation.navigate('BoxDiscountEligibility')}
        />
      </View>

      <Text style={[styles.shipNote, { color: colors.textPrimary }]}>
        Ships in time for Hanukkah (estimated arrival {shipWindow})
      </Text>

      {isPaid ? (
        <Text style={[styles.chargeNote, { color: colors.textTertiary }]}>
          {boxStarted
            ? 'Added to your box — charged when it ships.'
            : 'Added to your cart — charged when your box ships.'}
        </Text>
      ) : null}

      <View style={styles.ctaRow}>
        <TouchableOpacity
          style={[
            styles.cta,
            styles.ctaPrimary,
            { backgroundColor: colors.textPrimary },
            (locked || saving) && styles.ctaDisabled,
          ]}
          onPress={inCart ? removeFromCartOrBox : addToCartOrBox}
          disabled={locked || saving}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color={colors.bgPrimary} />
          ) : (
            <Text style={[styles.ctaText, { color: colors.bgPrimary }]}>{primaryLabel}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.cta,
            styles.ctaSecondary,
            { borderColor: colors.textPrimary },
            wishlistSaving && styles.ctaDisabled,
          ]}
          onPress={() => toggleWishlist(item.id)}
          disabled={wishlistSaving}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: colors.textPrimary }]}>
            {wishlisted ? 'Saved to wishlist' : 'Add to wishlist'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.wishlistHint, { color: colors.textTertiary }]}>
        Wishlist favorites help Rav prioritize pieces if you build a Hanukkah box later.
      </Text>

      {details.length > 0 ? (
        <View style={[styles.details, { borderTopColor: colors.border }]}>
          <Text style={[styles.detailsHeading, { color: colors.textPrimary }]}>Details</Text>
          {details.map((row) => (
            <View key={row.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>{row.label}</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const body = (
    <>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Text style={[styles.backLink, { color: colors.textPrimary }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.split, isDesktop && styles.splitDesktop]}>
        <View style={[styles.galleryCol, isDesktop && styles.galleryColDesktop]}>
          <ProductImageGallery
            itemId={item.id}
            imageUrl={item.imageUrl}
            imageUrls={item.imageUrls}
          />
        </View>
        {buyColumn}
      </View>

      <SimilarProductsRail items={similar} />
    </>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={Platform.OS === 'web' ? [] : ['top']}>
      <WebContentPanel
        flush={isDesktop}
        gutter={!isDesktop}
        centerDesktop={isDesktop}
        omitDesktopTopPadding={isDesktop}
        style={[styles.panel, { backgroundColor: pageBg }]}
      >
        <View style={[styles.scrollHost, isDesktop && styles.scrollHostDesktopBleed]}>
          <ScrollView
            style={[styles.root, { backgroundColor: pageBg }]}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: isDesktop ? DESKTOP_CONTENT_TOP : spacing.md },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {isDesktop ? (
              <View style={[styles.contentColumn, { maxWidth: layoutWidth }]}>{body}</View>
            ) : (
              body
            )}
          </ScrollView>
        </View>
      </WebContentPanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  panel: { flex: 1, width: '100%', overflow: 'visible' as const },
  scrollHost: { flex: 1, width: '100%' },
  /** Match Home — cancel panel gutter so content spans the main-area frame. */
  scrollHostDesktopBleed: {
    marginHorizontal: -LAYOUT.WEB_CONTENT_GUTTER,
    ...(Platform.OS === 'web'
      ? ({ width: `calc(100% + ${LAYOUT.WEB_CONTENT_GUTTER * 2}px)` } as object)
      : { alignSelf: 'stretch' as const }),
  },
  root: { flex: 1, width: '100%' },
  scrollContent: {
    paddingBottom: 140,
    width: '100%',
  },
  contentColumn: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  backRow: { marginBottom: spacing.lg },
  backLink: {
    fontSize: typography.sm,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
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
  },
  buy: {
    width: '100%',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  buyDesktop: {
    flex: 0.45,
    maxWidth: '42%',
    paddingTop: spacing.md,
  },
  name: {
    fontSize: 36,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 42,
    textAlign: 'left',
  },
  desc: {
    fontSize: typography.md,
    lineHeight: 22,
    letterSpacing: 0,
    textAlign: 'left',
    maxWidth: 440,
  },
  priceRule: {
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  shipNote: {
    fontSize: typography.md,
    letterSpacing: 0,
    lineHeight: 22,
    fontWeight: '500',
  },
  chargeNote: {
    fontSize: typography.sm,
    letterSpacing: 0,
  },
  ctaRow: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cta: {
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    borderRadius: 0,
    alignItems: 'center',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  ctaPrimary: {},
  ctaSecondary: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  ctaDisabled: { opacity: 0.55 },
  ctaText: {
    fontWeight: '500',
    fontSize: typography.sm,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  wishlistHint: {
    fontSize: typography.sm,
    letterSpacing: 0,
    lineHeight: 18,
  },
  details: {
    marginTop: spacing.xl,
    paddingTop: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    width: '100%',
    gap: 0,
  },
  detailsHeading: {
    fontSize: typography.sm,
    fontWeight: '500',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  detailRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  detailValue: {
    fontSize: typography.md,
    lineHeight: 22,
    letterSpacing: 0,
    fontWeight: '400',
  },
});
