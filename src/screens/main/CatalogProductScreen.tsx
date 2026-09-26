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
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { useCatalog } from '../../hooks/useCatalog';
import { useCatalogInventory } from '../../hooks/useCatalogInventory';
import { useWishlist } from '../../hooks/useWishlist';
import { useBrowsingHistoryStore } from '../../stores/browsingHistoryStore';
import {
  useMarketplaceCartStore,
} from '../../stores/marketplaceCartStore';
import { CartQtyStepper } from '../../components/storefront/CartQtyStepper';
import { getHanukkahConfig } from '../../services/firestore/config';
import {
  useEffectiveBoxLocked,
  usePreviewNow,
  usePreviewedHasStartedBox,
  useUserStatePreview,
} from '../../hooks/useUserStatePreview';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import { formatCatalogDollars, buildDefaultLineItems } from '../../services/box/buildDefaultBox';
import { boxLockChipLabel, shipWindowLabel } from '../../constants/hanukkahBoxLock';
import {
  HANUKKAH_SHIP_WINDOW_LABEL,
  resolveCatalogDisplayPrices,
  boxAddOnUnitCents,
} from '../../services/box/pricing';
import {
  availabilityAllowsDirectPurchase,
  availabilityRemaining,
  emptyInventoryCounters,
  resolveAvailability,
} from '../../services/catalog/availability';
import { findSwapSourceLines } from '../../services/box/findSwapSourceLine';
import {
  resolveFreeSwapUnitCents,
  resolveIncludedGiftOptions,
  resolveSwapOptionsForItem,
} from '../../services/box/sectionUpsells';
import { displaySectionForCatalogItem } from '../../constants/boxDisplaySections';
import {
  isGiftSlotLine,
  transferLiveIncludedBaselineOnSwap,
} from '../../components/box/boxLineDisplay';
import { similarCatalogItems } from '../../constants/catalogCuration';
import { pdpBodyCopyForItem } from '../../constants/pdpCategoryCopy';
import { howToLinkForItem } from '../../constants/pdpHowToLink';
import { storefrontCategoryForItem, isBookItem } from '../../constants/storefrontCategories';
import { ProductImageGallery } from '../../components/catalog/ProductImageGallery';
import { ProductPricingBlock } from '../../components/catalog/ProductPricingBlock';
import { SimilarProductsRail } from '../../components/catalog/SimilarProductsRail';
import {
  StorefrontChrome,
  useStorefrontActions,
} from '../../components/storefront/StorefrontChrome';
import { SwapIntoBoxModal } from '../../components/storefront/SwapIntoBoxModal';
import { useGuestFavoritesPrompt } from '../../components/storefront/GuestFavoritesAuthBanner';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import {
  MOBILE_GUTTER,
  PRODUCT_SPLIT_GUTTER,
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

export function CatalogProductScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'CatalogProduct'>>();
  const { slug } = route.params;
  const { width, height } = useWindowDimensions();
  const desktop = width >= 768;
  const {
    lineItems,
    children,
    loading: draftLoading,
    persist: saveDraft,
  } = useBoxDraft();
  const cartItems = useMarketplaceCartStore((s) => s.items);
  const addCartItem = useMarketplaceCartStore((s) => s.addItem);
  const removeCartItem = useMarketplaceCartStore((s) => s.removeItem);
  const changeCartQuantity = useMarketplaceCartStore((s) => s.changeQuantity);
  const hasStartedBox = usePreviewedHasStartedBox();
  const { guardMutation } = usePaymentGate();
  const { isWishlisted, toggleWishlist, saving: wishlistSaving } = useWishlist();
  const guestFavoritesPrompt = useGuestFavoritesPrompt();
  const recordBrowseView = useBrowsingHistoryStore((s) => s.recordView);
  const { items: catalog, loading: catalogLoading } = useCatalog();
  const { byId: inventoryById } = useCatalogInventory();
  const previewNow = usePreviewNow();
  const preview = useUserStatePreview();
  const { goHome, goCategory, startBox, goHowToPlayDreidel, goHowToLightCandles } =
    useStorefrontActions();
  const item = useMemo(
    () => catalog.find((c) => c.id === slug) ?? null,
    [catalog, slug]
  );
  const aisle = useMemo(
    () => (item ? storefrontCategoryForItem(item) : undefined),
    [item]
  );

  usePublishRavSurface(
    item
      ? { type: 'product', id: item.id, label: item.name }
      : { type: 'product', id: slug, label: slug }
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
  const [lockAt, setLockAt] = useState<string | null>(null);
  const locked = useEffectiveBoxLocked(lockAt);
  const [shipWindow, setShipWindow] = useState(HANUKKAH_SHIP_WINDOW_LABEL);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const effectiveLockAtForAvail = useMemo(() => {
    if (preview === 'signed_in_locked') return '2000-01-01T00:00:00.000Z';
    if (
      preview === 'signed_in_box' ||
      preview === 'signed_in_needs_payment' ||
      preview === 'signed_in_no_box' ||
      preview === 'signed_out' ||
      preview === 'signed_out_box'
    ) {
      return null;
    }
    return lockAt;
  }, [preview, lockAt]);

  const availability = useMemo(() => {
    if (!item) return undefined;
    return resolveAvailability(
      item,
      inventoryById[item.id] ?? emptyInventoryCounters(item.id),
      effectiveLockAtForAvail,
      previewNow
    );
  }, [item, inventoryById, effectiveLockAtForAvail, previewNow]);

  const directOk = availability ? availabilityAllowsDirectPurchase(availability) : false;
  const directRemaining = availability ? availabilityRemaining(availability) : null;
  const lockLabel = useMemo(() => {
    if (!lockAt) return null;
    try {
      return new Date(lockAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return boxLockChipLabel(previewNow, lockAt);
    }
  }, [lockAt, previewNow]);

  useEffect(() => {
    setDetailsOpen(true);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoadingConfig(true);
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLockAt(config.lockAt);
      setShipWindow(shipWindowLabel(config.estimatedDeliveryBy));
      setLoadingConfig(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = catalogLoading || draftLoading || loadingConfig;
  const inMarketplaceCart = useMemo(
    () => cartItems.some((li) => li.itemId === slug),
    [cartItems, slug]
  );
  const marketplaceQty = useMemo(() => {
    const line = cartItems.find((li) => li.itemId === slug);
    return line ? Math.max(1, line.quantity || 1) : 0;
  }, [cartItems, slug]);
  const inBox = useMemo(() => lineItems.some((li) => li.itemId === slug), [lineItems, slug]);
  /** Cart CTA when no box yet; box membership once a Hanukkah box exists. */
  const inCart = hasStartedBox ? inBox : inMarketplaceCart;
  const inBoxLines = useMemo(
    () => lineItems.filter((li) => li.itemId === slug),
    [lineItems, slug]
  );
  const inBoxPrimary = inBoxLines[0] ?? null;
  const boxQuantity = useMemo(
    () => inBoxLines.reduce((sum, li) => sum + Math.max(1, li.quantity ?? 1), 0),
    [inBoxLines]
  );
  const inBoxUnitCents = inBoxPrimary?.unitCents ?? 0;
  const wishlisted = item ? isWishlisted(item.id) : false;
  const { memberCents, nonMemberCents } = item
    ? resolveCatalogDisplayPrices(item)
    : { memberCents: 0, nonMemberCents: 0 };
  /** Box-path charge: member list for à la carte; existing tier rules otherwise. */
  const boxUnitCents = item ? boxAddOnUnitCents(item) : 0;
  const bodyCopy = useMemo(() => (item ? pdpBodyCopyForItem(item) : undefined), [item]);
  const details = useMemo(() => (item ? detailRowsFromItem(item) : []), [item]);
  const howTo = useMemo(() => (item ? howToLinkForItem(item) : null), [item]);
  const similar = useMemo(
    () => (item ? similarCatalogItems(item, catalog, 12) : []),
    [item, catalog]
  );
  /**
   * Preview / empty-draft “has box” states still need something to swap against.
   * Prefer the live draft; otherwise seed a default curated box for detection only.
   */
  const swapLineItems = useMemo(() => {
    if (lineItems.length > 0) return lineItems;
    if (!hasStartedBox || !catalog.length) return lineItems;
    return buildDefaultLineItems(catalog, children, []);
  }, [lineItems, hasStartedBox, catalog, children]);
  const swapSources = useMemo(() => {
    if (!item || !hasStartedBox || inBox) return [];
    return findSwapSourceLines(item, swapLineItems, catalog);
  }, [item, hasStartedBox, inBox, swapLineItems, catalog]);
  const swapSource = swapSources[0] ?? null;
  /** When already in box: alternate SKUs to swap this line for. */
  const inBoxSwapOptions = useMemo(() => {
    if (!item || !inBox || !inBoxPrimary) return [];
    if (inBoxUnitCents > 0) return [];
    const opts = isGiftSlotLine(inBoxPrimary)
      ? resolveIncludedGiftOptions(catalog, item.id, 12)
      : resolveSwapOptionsForItem(item, catalog, 12);
    return opts.filter((o) => o.id !== item.id);
  }, [item, inBox, inBoxPrimary, inBoxUnitCents, catalog]);
  /** Cheapest policy-valid swap delta (included swaps are $0). */
  const swapDeltaCents = useMemo(() => {
    if (!item || swapSources.length === 0) return 0;
    let best: number | null = null;
    for (const source of swapSources) {
      const sourceItem = catalog.find((c) => c.id === source.itemId);
      const sectionId = displaySectionForCatalogItem(sourceItem ?? item);
      const free = resolveFreeSwapUnitCents(sourceItem, item, sectionId);
      if (free === undefined) continue;
      const delta = Math.max(0, free - (source.unitCents ?? 0));
      best = best == null ? delta : Math.min(best, delta);
    }
    if (best != null) return best;
    if (!swapSource) return 0;
    return Math.max(0, boxUnitCents - (swapSource.unitCents ?? 0));
  }, [item, swapSources, catalog, swapSource, boxUnitCents]);
  const [swapModalOpen, setSwapModalOpen] = useState(false);

  const persist = async (next: BoxLineItem[]) => {
    setSaving(true);
    try {
      await saveDraft(next);
    } finally {
      setSaving(false);
    }
  };

  const addToCart = async () => {
    if (!item || !directOk) return;
    if (directRemaining != null && marketplaceQty >= directRemaining) return;
    setSaving(true);
    try {
      addCartItem({
        slotId: item.slotId,
        itemId: item.id,
        quantity: 1,
        unitCents: nonMemberCents,
        label: item.name,
      });
    } finally {
      setSaving(false);
    }
  };

  const addToBox = async () => {
    if (!item || locked || inBox) return;
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

  const buyWithBox = async () => {
    await addToBox();
  };

  const swapIntoBox = async (source: BoxLineItem) => {
    if (!item || locked || inBox) return;
    const sourceItem = catalog.find((c) => c.id === source.itemId);
    const sectionId = displaySectionForCatalogItem(sourceItem ?? item);
    const unitCents =
      resolveFreeSwapUnitCents(sourceItem, item, sectionId) ?? boxUnitCents;
    const delta = Math.max(0, unitCents - (source.unitCents ?? 0));
    if (delta > 0 && !guardMutation()) return;
    // Use live draft when present; otherwise persist the seeded default box + swap.
    const base = lineItems.length > 0 ? lineItems : swapLineItems;
    transferLiveIncludedBaselineOnSwap(
      source.itemId,
      item.id,
      Math.max(1, source.quantity ?? 1),
      unitCents
    );
    const next = base.map((li) =>
      li.slotId === source.slotId && li.itemId === source.itemId
        ? {
            ...li,
            itemId: item.id,
            label: item.name,
            unitCents,
            quantity: 1,
          }
        : li
    );
    setSwapModalOpen(false);
    await persist(next);
    navigation.navigate('MyBox');
  };

  /** Replace the current in-box line with another eligible SKU. */
  const swapInBoxFor = async (replacement: CatalogItem) => {
    if (!item || !inBoxPrimary || locked) return;
    const sectionId = displaySectionForCatalogItem(item);
    const unitCents =
      resolveFreeSwapUnitCents(item, replacement, sectionId) ?? 0;
    transferLiveIncludedBaselineOnSwap(
      item.id,
      replacement.id,
      Math.max(1, inBoxPrimary.quantity ?? 1),
      unitCents
    );
    const next = lineItems.map((li) =>
      li.slotId === inBoxPrimary.slotId && li.itemId === item.id
        ? {
            ...li,
            itemId: replacement.id,
            label: replacement.name,
            unitCents,
            quantity: 1,
          }
        : li
    );
    setSwapModalOpen(false);
    await persist(next);
    navigation.replace('CatalogProduct', { slug: replacement.id });
  };

  const removeFromCartOrBox = async () => {
    if (locked) return;
    if (hasStartedBox) {
      await persist(lineItems.filter((li) => li.itemId !== slug));
      return;
    }
    removeCartItem(slug);
  };

  const changeInBoxQuantity = async (delta: 1 | -1) => {
    if (!item || locked || !inBox) return;
    if (delta === -1 && boxQuantity <= 1) {
      await removeFromCartOrBox();
      return;
    }
    if (delta === -1) {
      const multi = inBoxLines.find((li) => (li.quantity ?? 1) > 1);
      if (multi) {
        await persist(
          lineItems.map((li) =>
            li.slotId === multi.slotId
              ? { ...li, quantity: Math.max(1, (li.quantity ?? 1) - 1) }
              : li
          )
        );
        return;
      }
      const drop = inBoxLines[inBoxLines.length - 1];
      if (drop) await persist(lineItems.filter((li) => li.slotId !== drop.slotId));
      return;
    }
    const primary = inBoxPrimary;
    if (!primary) return;
    await persist(
      lineItems.map((li) =>
        li.slotId === primary.slotId
          ? { ...li, quantity: (li.quantity ?? 1) + 1 }
          : li
      )
    );
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

  const isBoxOnly = availability?.status === 'box_only';
  const isSoldOut = availability?.status === 'sold_out';
  /** No box yet + box-only/sold-out: primary drives into a box (or disabled). */
  const marketplaceBoxOnlyPath = !hasStartedBox && isBoxOnly;
  const marketplaceBlocked = !hasStartedBox && isSoldOut;

  const primaryLabel = marketplaceBlocked
    ? 'Sold out'
    : marketplaceBoxOnlyPath
      ? memberCents > 0
        ? `Add to a box (${formatCatalogDollars(memberCents)})`
        : 'Add to a box'
      : inCart && !hasStartedBox
        ? 'Add another'
        : hasStartedBox
          ? boxUnitCents > 0
            ? `Add to box (+${formatCatalogDollars(boxUnitCents)})`
            : 'Add to box'
          : nonMemberCents > 0
            ? `Add to cart (${formatCatalogDollars(nonMemberCents)})`
            : 'Add to cart';

  const canPolicySwap = useMemo(() => {
    if (!item || swapSources.length === 0) return false;
    return swapSources.some((source) => {
      const sourceItem = catalog.find((c) => c.id === source.itemId);
      if (!sourceItem) return false;
      const sectionId = displaySectionForCatalogItem(sourceItem);
      return resolveFreeSwapUnitCents(sourceItem, item, sectionId) !== undefined;
    });
  }, [item, swapSources, catalog]);

  const secondaryLabel = hasStartedBox
    ? inBox
      ? 'Swap'
      : `Swap into my box (+${formatCatalogDollars(swapDeltaCents)})`
    : memberCents > 0
      ? `Buy with a box (${formatCatalogDollars(memberCents)})`
      : 'Buy with a box';

  const showMarketplaceQty = !hasStartedBox && inMarketplaceCart && directOk;
  const showInBoxControls = hasStartedBox && inBox;
  const showSecondary = marketplaceBlocked || marketplaceBoxOnlyPath
    ? false
    : showInBoxControls
      ? inBoxSwapOptions.length > 0
      : hasStartedBox
        ? !inCart && swapSources.length > 0 && canPolicySwap
        : true;
  const atOneQty = boxQuantity <= 1;
  const qtyMinusLabel = atOneQty
    ? inBoxUnitCents === 0
      ? 'Donate'
      : 'Remove'
    : '−';

  const marketplacePrimaryDisabled =
    marketplaceBlocked || saving || (!directOk && !marketplaceBoxOnlyPath);
  const boxPrimaryDisabled = locked || saving;

  const onPrimaryPress = marketplaceBlocked
    ? () => undefined
    : marketplaceBoxOnlyPath
      ? buyWithBox
      : hasStartedBox
        ? addToBox
        : addToCart;

  const onSecondaryPress = hasStartedBox
    ? () => setSwapModalOpen(true)
    : buyWithBox;

  const primaryDisabled = hasStartedBox ? boxPrimaryDisabled : marketplacePrimaryDisabled;

  if (loading || draftLoading) {
    return (
      <StorefrontChrome activeCategory={aisle?.slug}>
        <View style={[styles.centered, { minHeight: Math.round(height * 0.65) }]}>
          <BrandLoadingMark />
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
    <StorefrontChrome activeCategory={aisle?.slug} floatingFooter={guestFavoritesPrompt}>
      {/* Padding on body only — chrome/footer stay full-bleed like /store */}
      <View style={styles.body}>
        {desktop ? (
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
        ) : null}

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
            <View style={styles.titleBlock}>
              <Text style={[styles.name, !desktop && styles.nameMobile]}>{item.name}</Text>
              {isBookItem(item) && item.brand?.trim() ? (
                <Text style={styles.author}>by {item.brand.trim()}</Text>
              ) : null}
            </View>
            {bodyCopy ? (
              <Text style={styles.desc}>
                {bodyCopy}{' '}
                <Text
                  style={styles.followUpLink}
                  onPress={askFollowUpAboutCopy}
                  accessibilityRole="link"
                  accessibilityLabel="I have a follow up question"
                >
                  I have a follow up question {'>'}
                </Text>
              </Text>
            ) : null}

            {howTo ? (
              <TouchableOpacity
                style={styles.howToLink}
                onPress={() => {
                  if (howTo.kind === 'play-dreidel') goHowToPlayDreidel();
                  else goHowToLightCandles();
                }}
                accessibilityRole="link"
                accessibilityLabel={howTo.label}
              >
                <Text style={styles.howToLinkText}>{howTo.label} {'>'}</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.priceRule}>
              <ProductPricingBlock
                item={item}
                hasBox={hasStartedBox}
                availability={availability}
                boxLocked={locked}
                lockLabel={lockLabel}
                onWhatsInTheBox={
                  hasStartedBox ? undefined : () => startBox()
                }
              />
            </View>

            <View style={styles.ctaBlock}>
              <View style={styles.ctaRow}>
                {showMarketplaceQty ? (
                  <CartQtyStepper
                    quantity={marketplaceQty}
                    label={item.name}
                    disabled={saving}
                    maxQuantity={directRemaining ?? undefined}
                    onChange={(delta) => {
                      if (
                        delta > 0 &&
                        directRemaining != null &&
                        marketplaceQty >= directRemaining
                      ) {
                        return;
                      }
                      changeCartQuantity(slug, delta);
                    }}
                  />
                ) : showInBoxControls ? (
                  <>
                    {showSecondary ? (
                      <TouchableOpacity
                        style={[
                          styles.cta,
                          styles.ctaPrimary,
                          (locked || saving) && styles.ctaDisabled,
                        ]}
                        onPress={onSecondaryPress}
                        disabled={locked || saving}
                        accessibilityRole="button"
                      >
                        <Text style={styles.ctaPrimaryText}>{secondaryLabel}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={styles.qtyRow}>
                      <TouchableOpacity
                        style={[styles.qtyBtn, atOneQty && styles.qtyBtnWide]}
                        onPress={() => void changeInBoxQuantity(-1)}
                        disabled={locked || saving}
                        accessibilityRole="button"
                        accessibilityLabel={
                          atOneQty
                            ? qtyMinusLabel === 'Donate'
                              ? 'Donate'
                              : 'Remove from box'
                            : 'Decrease quantity'
                        }
                      >
                        <Text
                          style={[styles.qtyBtnText, atOneQty && styles.qtyBtnTextWide]}
                        >
                          {qtyMinusLabel}
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyValue}>{boxQuantity}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => void changeInBoxQuantity(1)}
                        disabled={locked || saving}
                        accessibilityRole="button"
                        accessibilityLabel="Increase quantity"
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.cta,
                      styles.ctaPrimary,
                      primaryDisabled && styles.ctaDisabled,
                    ]}
                    onPress={onPrimaryPress}
                    disabled={primaryDisabled}
                    accessibilityRole="button"
                  >
                    {saving ? (
                      <ActivityIndicator color={semanticColors.textInverse} />
                    ) : (
                      <Text style={styles.ctaPrimaryText}>{primaryLabel}</Text>
                    )}
                  </TouchableOpacity>
                )}
                {!showInBoxControls && showSecondary ? (
                  <TouchableOpacity
                    style={[
                      styles.cta,
                      styles.ctaSecondary,
                      (hasStartedBox ? locked || saving : saving) && styles.ctaDisabled,
                    ]}
                    onPress={onSecondaryPress}
                    disabled={hasStartedBox ? locked || saving : saving}
                    accessibilityRole="button"
                  >
                    <Text style={styles.ctaSecondaryText}>{secondaryLabel}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {!hasStartedBox || !inCart ? (
                <Text style={styles.shipNote}>
                  Arrives in time for Hanukkah (est. {shipWindow})
                </Text>
              ) : null}
            </View>

            {details.length > 0 ? (
              <View style={styles.details}>
                <TouchableOpacity
                  style={styles.detailsToggle}
                  onPress={() => setDetailsOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: detailsOpen }}
                  accessibilityLabel="Details"
                >
                  <Text style={styles.detailsHeading}>Details</Text>
                  <View
                    style={[
                      styles.detailsChevron,
                      detailsOpen ? styles.detailsChevronOpen : null,
                    ]}
                  >
                    <Icon
                      icon={icons.chevronDown}
                      size={12}
                      color={semanticColors.goldMuted}
                    />
                  </View>
                </TouchableOpacity>
                {detailsOpen
                  ? details.map((row) => (
                      <View key={row.label} style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{row.label}</Text>
                        <Text style={styles.detailValue}>{row.value}</Text>
                      </View>
                    ))
                  : null}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.similarBleed}>
          <SimilarProductsRail items={similar} />
        </View>
      </View>
      <SwapIntoBoxModal
        visible={
          swapModalOpen &&
          (showInBoxControls ? inBoxSwapOptions.length > 0 : swapSources.length > 0)
        }
        options={
          showInBoxControls
            ? inBoxSwapOptions.map((opt) => ({
                key: opt.id,
                name: opt.name,
                imageUrl: opt.imageUrl,
                itemId: opt.id,
              }))
            : swapSources.map((li) => {
                const src = catalog.find((c) => c.id === li.itemId);
                return {
                  key: `${li.slotId}:${li.itemId}`,
                  name: src?.name ?? li.label ?? li.itemId,
                  imageUrl: src?.imageUrl,
                  itemId: src?.id ?? li.itemId,
                };
              })
        }
        onSelect={(key) => {
          if (showInBoxControls) {
            const replacement = inBoxSwapOptions.find((o) => o.id === key);
            if (replacement) void swapInBoxFor(replacement);
            return;
          }
          const source = swapSources.find((li) => `${li.slotId}:${li.itemId}` === key);
          if (source) void swapIntoBox(source);
        }}
        onCancel={() => setSwapModalOpen(false)}
      />
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
  similarBleed: {
    marginHorizontal: -MOBILE_GUTTER,
    alignSelf: 'stretch',
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
    gap: PRODUCT_SPLIT_GUTTER,
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
    paddingRight: spacing.md,
  },
  titleBlock: {
    alignItems: 'flex-start',
    gap: 6,
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
  author: {
    ...typeface('regular'),
    fontSize: typography.md,
    lineHeight: 24,
    color: semanticColors.textSecondary,
    maxWidth: 440,
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
  howToLink: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  howToLinkText: {
    ...typeface('medium'),
    fontSize: typography.md,
    lineHeight: 22,
    color: semanticColors.logoDark,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  priceRule: {
    marginTop: 0,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.border,
    width: '100%',
  },
  ctaBlock: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
    gap: spacing.sm,
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
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: semanticColors.logoDark,
    borderRadius: borderRadius.md,
    paddingHorizontal: 6,
    minHeight: 42,
    backgroundColor: semanticColors.bgPrimary,
  },
  qtyBtn: {
    minWidth: 28,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  qtyBtnWide: { minWidth: 56, paddingHorizontal: 8 },
  qtyBtnText: {
    ...typeface('medium'),
    fontSize: 14,
    lineHeight: 16,
    color: semanticColors.logoDark,
  },
  qtyBtnTextWide: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'lowercase',
    letterSpacing: -0.18,
  },
  qtyValue: {
    ...typeface('medium'),
    fontSize: 13,
    color: semanticColors.logoDark,
    minWidth: 16,
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
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  detailsHeading: {
    ...typeface('medium'),
    fontSize: typography.md,
    lineHeight: 22,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
  },
  detailsChevron: {
    transform: [{ rotate: '0deg' }],
  },
  detailsChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  detailRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.border,
    gap: 4,
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
    color: semanticColors.logoDark,
  },
});
