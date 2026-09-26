/**
 * In-context product viewer for My Box / gift customize.
 * Stays on the current page; CTAs target the active box draft.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductImageGallery } from '../catalog/ProductImageGallery';
import { ProductPricingBlock } from '../catalog/ProductPricingBlock';
import { SimilarProductsRail } from '../catalog/SimilarProductsRail';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { similarCatalogItems } from '../../constants/catalogCuration';
import { pdpBodyCopyForItem } from '../../constants/pdpCategoryCopy';
import { howToLinkForItem } from '../../constants/pdpHowToLink';
import { isBookItem } from '../../constants/storefrontCategories';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { findSwapSourceLines } from '../../services/box/findSwapSourceLine';
import { isGiftSlotLine } from './boxLineDisplay';
import { boxAddOnUnitCents, HANUKKAH_SHIP_WINDOW_LABEL } from '../../services/box/pricing';
import {
  resolveFreeSwapUnitCents,
  resolveIncludedGiftOptions,
  resolveSwapOptionsForItem,
} from '../../services/box/sectionUpsells';
import { displaySectionForCatalogItem } from '../../constants/boxDisplaySections';
import { useWishlist } from '../../hooks/useWishlist';
import { useThemeMode } from '../../context/ThemeContext';
import { navigateMainStack, navigateMainTab } from '../../navigation/mainStackNavigation';
import { SwapIntoBoxModal } from '../storefront/SwapIntoBoxModal';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import type { BoxDisplaySectionId } from '../../constants/boxDisplaySections';
import type { SemanticColors } from '../../constants/themeMode';
import {
  MOBILE_GUTTER,
  PRODUCT_SPLIT_GUTTER,
  borderRadius,
  spacing,
  typeface,
  typography,
  shadows,
  shadowsWeb,
} from '../../constants/theme';

export type BoxProductModalContext = 'ownBox' | 'giftBox';

type DetailRow = { label: string; value: string };

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

type Props = {
  visible: boolean;
  item: CatalogItem | null;
  catalog: CatalogItem[];
  lineItems: BoxLineItem[];
  context: BoxProductModalContext;
  /** Practice section the modal was opened from — scopes Swap to that section only. */
  fromSection?: BoxDisplaySectionId | null;
  locked?: boolean;
  onClose: () => void;
  /** Switch product while staying in the modal (similar rail). */
  onSelectItem?: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void | Promise<void>;
  onSwap: (item: CatalogItem, source: BoxLineItem) => void | Promise<void>;
  onRemove?: (item: CatalogItem) => void | Promise<void>;
  /** In-box quantity adjust (+1 / −1). At qty 1, −1 donates/removes. */
  onQuantityChange?: (item: CatalogItem, delta: 1 | -1) => void | Promise<void>;
};

export function BoxProductModal({
  visible,
  item,
  catalog,
  lineItems,
  context,
  fromSection = null,
  locked = false,
  onClose,
  onSelectItem,
  onAdd,
  onSwap,
  onRemove,
  onQuantityChange,
}: Props) {
  const { colors } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const styles = useMemo(() => createStyles(colors, desktop), [colors, desktop]);
  const { isWishlisted, toggleWishlist, saving: wishlistSaving } = useWishlist();
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [swapPickerOpen, setSwapPickerOpen] = useState(false);
  /** Soft-mask the sheet bottom while more scroll content remains below. */
  const [showBottomFade, setShowBottomFade] = useState(false);
  const scrollViewportH = React.useRef(0);
  const scrollContentH = React.useRef(0);

  useEffect(() => {
    if (visible) {
      setDetailsOpen(true);
      setShowBottomFade(false);
      setSwapPickerOpen(false);
      scrollViewportH.current = 0;
      scrollContentH.current = 0;
    }
  }, [visible, item?.id]);

  const syncBottomFade = (offsetY = 0) => {
    const viewportH = scrollViewportH.current;
    const contentH = scrollContentH.current;
    if (viewportH <= 0 || contentH <= 0) {
      setShowBottomFade(false);
      return;
    }
    const overflows = contentH > viewportH + 4;
    const atBottom = offsetY + viewportH >= contentH - 4;
    setShowBottomFade(overflows && !atBottom);
  };

  const inBox = useMemo(
    () => (item ? lineItems.some((li) => li.itemId === item.id) : false),
    [item, lineItems]
  );

  const inBoxLines = useMemo(
    () => (item ? lineItems.filter((li) => li.itemId === item.id) : []),
    [item, lineItems]
  );
  const inBoxPrimary = inBoxLines[0] ?? null;
  const boxQuantity = useMemo(
    () => inBoxLines.reduce((sum, li) => sum + Math.max(1, li.quantity ?? 1), 0),
    [inBoxLines]
  );
  const inBoxUnitCents = inBoxPrimary?.unitCents ?? 0;

  /** When already in box: alternate SKUs to swap this line for (My Box swap shelf). */
  const inBoxSwapOptions = useMemo(() => {
    if (!item || !inBox || !inBoxPrimary) return [];
    // Paid extras aren't swapped laterally — same rule as My Box cards.
    if (inBoxUnitCents > 0) return [];
    const opts = isGiftSlotLine(inBoxPrimary)
      ? resolveIncludedGiftOptions(catalog, item.id, 12)
      : resolveSwapOptionsForItem(item, catalog, 12);
    return opts.filter((o) => o.id !== item.id);
  }, [item, inBox, inBoxPrimary, inBoxUnitCents, catalog]);

  const swapSources = useMemo(() => {
    if (!item || inBox) return [];
    return findSwapSourceLines(item, lineItems, catalog, fromSection);
  }, [item, inBox, lineItems, catalog, fromSection]);
  const swapSource = swapSources[0] ?? null;

  const boxUnitCents = item ? boxAddOnUnitCents(item) : 0;
  /** Cheapest policy-valid swap delta (included swaps are $0). */
  const swapDeltaCents = useMemo(() => {
    if (!item || swapSources.length === 0) return 0;
    let best: number | null = null;
    for (const source of swapSources) {
      const sourceItem = catalog.find((c) => c.id === source.itemId);
      const sectionId =
        fromSection ?? (sourceItem ? displaySectionForCatalogItem(sourceItem) : undefined);
      if (!sectionId) continue;
      const free = resolveFreeSwapUnitCents(sourceItem, item, sectionId);
      if (free === undefined) continue;
      const delta = Math.max(0, free - (source.unitCents ?? 0));
      best = best == null ? delta : Math.min(best, delta);
    }
    if (best != null) return best;
    if (!swapSource) return 0;
    return Math.max(0, boxUnitCents - (swapSource.unitCents ?? 0));
  }, [item, swapSources, catalog, fromSection, swapSource, boxUnitCents]);

  /** Only offer Swap when at least one target is an included/policy swap. */
  const canPolicySwap = useMemo(() => {
    if (!item || swapSources.length === 0) return false;
    return swapSources.some((source) => {
      const sourceItem = catalog.find((c) => c.id === source.itemId);
      const sectionId =
        fromSection ?? (sourceItem ? displaySectionForCatalogItem(sourceItem) : undefined);
      if (!sectionId) return false;
      return resolveFreeSwapUnitCents(sourceItem, item, sectionId) !== undefined;
    });
  }, [item, swapSources, catalog, fromSection]);

  const bodyCopy = item ? pdpBodyCopyForItem(item) : undefined;
  const details = item ? detailRowsFromItem(item) : [];
  const howTo = item ? howToLinkForItem(item) : null;
  const similar = item ? similarCatalogItems(item, catalog, 12) : [];
  const wishlisted = item ? isWishlisted(item.id) : false;

  const noun = context === 'giftBox' ? 'gift' : 'box';
  const primaryLabel =
    boxUnitCents > 0
      ? `Add to ${noun} (+${formatCatalogDollars(boxUnitCents)})`
      : `Add to ${noun}`;

  const secondaryLabel = inBox
    ? 'Swap'
    : context === 'giftBox'
      ? `Swap into gift (+${formatCatalogDollars(swapDeltaCents)})`
      : `Swap into my box (+${formatCatalogDollars(swapDeltaCents)})`;

  const showSecondary = inBox
    ? inBoxSwapOptions.length > 0
    : swapSources.length > 0 && canPolicySwap;
  const showQty = inBox && Boolean(onQuantityChange) && !locked;
  const atOneQty = boxQuantity <= 1;
  const qtyMinusLabel = atOneQty
    ? context === 'giftBox'
      ? 'Donate'
      : inBoxUnitCents === 0
        ? 'Donate'
        : 'Remove'
    : '−';

  const askFollowUpAboutCopy = () => {
    if (!bodyCopy) return;
    onClose();
    navigateMainTab('Rav', {
      newChat: true,
      openingAssistantMessage: bodyCopy,
    });
  };

  const run = async (fn: () => void | Promise<void>) => {
    if (busy || locked) return;
    setBusy(true);
    try {
      await fn();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const swapPickerOptions = useMemo(() => {
    if (inBox) {
      return inBoxSwapOptions.map((opt) => ({
        key: opt.id,
        name: opt.name,
        imageUrl: opt.imageUrl,
        itemId: opt.id,
      }));
    }
    return swapSources.map((li) => {
      const src = catalog.find((c) => c.id === li.itemId);
      return {
        key: `${li.slotId}:${li.itemId}`,
        name: src?.name ?? li.label ?? li.itemId,
        imageUrl: src?.imageUrl,
        itemId: src?.id ?? li.itemId,
      };
    });
  }, [inBox, inBoxSwapOptions, swapSources, catalog]);

  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : null)}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropHit} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            Platform.OS === 'web' ? { boxShadow: shadowsWeb.lg } : shadows.lg,
          ]}
          accessibilityViewIsModal
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtnFloat}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Text style={styles.closeGlyph}>✕</Text>
          </TouchableOpacity>

          <View style={styles.scrollWrap}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                desktop && similar.length > 0 && onSelectItem
                  ? styles.scrollContentFlushBottom
                  : null,
                !desktop && {
                  paddingBottom:
                    spacing.xxl + spacing.md + Math.max(insets.bottom, spacing.sm),
                },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScroll={(e) => {
                const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                scrollViewportH.current = layoutMeasurement.height;
                scrollContentH.current = contentSize.height;
                syncBottomFade(contentOffset.y);
              }}
              onContentSizeChange={(_w, h) => {
                scrollContentH.current = h;
                syncBottomFade(0);
              }}
              onLayout={(e) => {
                scrollViewportH.current = e.nativeEvent.layout.height;
                syncBottomFade(0);
              }}
            >
              <View style={[styles.split, desktop && styles.splitDesktop]}>
                <View style={[styles.galleryCol, desktop && styles.galleryColDesktop]}>
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
                        onClose();
                        navigateMainStack(
                          howTo.kind === 'play-dreidel'
                            ? 'StorefrontHowToPlayDreidel'
                            : 'StorefrontHowToLightCandles'
                        );
                      }}
                      accessibilityRole="link"
                      accessibilityLabel={howTo.label}
                    >
                      <Text style={styles.howToLinkText}>
                        {howTo.label} {'>'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <View style={styles.priceRule}>
                    <ProductPricingBlock item={item} hasBox />
                  </View>

                  <View style={styles.ctaBlock}>
                    <View style={styles.ctaRow}>
                      {inBox ? (
                        <>
                          {showSecondary ? (
                            <TouchableOpacity
                              style={[
                                styles.cta,
                                styles.ctaPrimary,
                                (locked || busy) && styles.ctaDisabled,
                              ]}
                              onPress={() => setSwapPickerOpen(true)}
                              disabled={locked || busy}
                              accessibilityRole="button"
                            >
                              <Text style={styles.ctaPrimaryText}>{secondaryLabel}</Text>
                            </TouchableOpacity>
                          ) : null}
                          {showQty && onQuantityChange ? (
                            <View style={styles.qtyRow}>
                              <TouchableOpacity
                                style={[styles.qtyBtn, atOneQty && styles.qtyBtnWide]}
                                onPress={() => {
                                  if (atOneQty) {
                                    void run(() => onQuantityChange(item, -1));
                                  } else {
                                    void onQuantityChange(item, -1);
                                  }
                                }}
                                disabled={busy}
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
                                onPress={() => void onQuantityChange(item, 1)}
                                disabled={busy}
                                accessibilityRole="button"
                                accessibilityLabel="Increase quantity"
                              >
                                <Text style={styles.qtyBtnText}>+</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={[
                              styles.cta,
                              styles.ctaPrimary,
                              (locked || busy) && styles.ctaDisabled,
                            ]}
                            onPress={() => void run(() => onAdd(item))}
                            disabled={locked || busy}
                            accessibilityRole="button"
                          >
                            {busy ? (
                              <ActivityIndicator color={colors.textInverse} />
                            ) : (
                              <Text style={styles.ctaPrimaryText}>{primaryLabel}</Text>
                            )}
                          </TouchableOpacity>
                          {showSecondary ? (
                            <TouchableOpacity
                              style={[
                                styles.cta,
                                styles.ctaSecondary,
                                (locked || busy) && styles.ctaDisabled,
                              ]}
                              onPress={() => setSwapPickerOpen(true)}
                              disabled={locked || busy}
                              accessibilityRole="button"
                            >
                              <Text style={styles.ctaSecondaryText}>{secondaryLabel}</Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      )}
                    </View>
                    {!inBox ? (
                      <Text style={styles.shipNote}>
                        Arrives in time for Hanukkah (est. {HANUKKAH_SHIP_WINDOW_LABEL})
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
                          <Icon icon={icons.chevronDown} size={12} color={colors.goldMuted} />
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

              {similar.length > 0 && onSelectItem ? (
                <View style={styles.similarBleed}>
                  <SimilarProductsRail items={similar} onPressItem={onSelectItem} />
                </View>
              ) : null}
            </ScrollView>

            {desktop ? (
              <View
                pointerEvents="none"
                style={[
                  styles.bottomFade,
                  {
                    opacity: showBottomFade ? 1 : 0,
                    ...(Platform.OS === 'web'
                      ? ({
                          backgroundImage: `linear-gradient(to top, ${colors.bgPrimary} 0%, ${colors.bgPrimary} 18%, transparent 100%)`,
                          transitionProperty: 'opacity',
                          transitionDuration: '140ms',
                          transitionTimingFunction: 'ease-out',
                        } as object)
                      : { backgroundColor: colors.bgPrimary }),
                  },
                ]}
              />
            ) : null}
          </View>
        </View>
      </View>
      <SwapIntoBoxModal
        visible={swapPickerOpen && swapPickerOptions.length > 0}
        options={swapPickerOptions}
        onSelect={(key) => {
          if (!item) return;
          if (inBox) {
            const replacement = inBoxSwapOptions.find((o) => o.id === key);
            const source = inBoxPrimary;
            if (!replacement || !source) return;
            setSwapPickerOpen(false);
            if (busy || locked) return;
            setBusy(true);
            void (async () => {
              try {
                await onSwap(replacement, source);
                onSelectItem?.(replacement);
              } finally {
                setBusy(false);
              }
            })();
            return;
          }
          const source = swapSources.find((li) => `${li.slotId}:${li.itemId}` === key);
          if (!source) return;
          setSwapPickerOpen(false);
          void run(() => onSwap(item, source));
        }}
        onCancel={() => setSwapPickerOpen(false)}
      />
    </Modal>
  );
}

function createStyles(colors: SemanticColors, desktop: boolean) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(17, 2, 34, 0.45)',
      justifyContent: desktop ? 'center' : 'flex-end',
      alignItems: 'center',
      padding: desktop ? spacing.xl : 0,
      ...(Platform.OS === 'web'
        ? ({ minHeight: '100%', height: '100%', maxHeight: '100dvh' } as object)
        : null),
    },
    backdropHit: {
      ...StyleSheet.absoluteFillObject,
    },
    sheet: {
      width: '100%',
      maxWidth: desktop ? 1320 : undefined,
      maxHeight: desktop ? '92%' : '94%',
      backgroundColor: colors.bgPrimary,
      borderRadius: desktop ? borderRadius.lg : borderRadius.lg,
      borderBottomLeftRadius: desktop ? borderRadius.lg : 0,
      borderBottomRightRadius: desktop ? borderRadius.lg : 0,
      overflow: 'hidden',
      zIndex: 2,
      position: 'relative',
    },
    closeBtnFloat: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      zIndex: 4,
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.md,
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
    },
    closeGlyph: {
      fontSize: 18,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    scrollWrap: {
      flexGrow: 0,
      flexShrink: 1,
      minHeight: 0,
      position: 'relative',
    },
    scroll: { flexGrow: 0, flexShrink: 1 },
    scrollContent: {
      paddingHorizontal: desktop ? spacing.xxl : MOBILE_GUTTER,
      paddingTop: desktop ? spacing.xxl + spacing.sm : spacing.xl + spacing.sm,
      paddingBottom: spacing.xxl + spacing.md,
      gap: spacing.xxl,
    },
    /** Let “You may also like” run to the sheet edge; bottom fade softens the clip. */
    scrollContentFlushBottom: {
      paddingBottom: spacing.md,
    },
    bottomFade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 56,
      zIndex: 2,
    },
    split: {
      flexDirection: 'column',
      gap: spacing.xl,
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
      color: colors.logoDark,
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
      color: colors.textSecondary,
      maxWidth: 440,
    },
    desc: {
      ...typeface('regular'),
      fontSize: typography.md,
      lineHeight: 24,
      color: colors.textSecondary,
      maxWidth: 440,
    },
    followUpLink: {
      ...typeface('bold'),
      fontSize: typography.md,
      lineHeight: 24,
      color: colors.logoDark,
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
      color: colors.logoDark,
      textDecorationLine: 'underline',
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
    },
    priceRule: {
      marginTop: 0,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      width: '100%',
    },
    ctaBlock: {
      alignSelf: 'flex-start',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: 6,
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
      backgroundColor: colors.logoDark,
    },
    ctaSecondary: {
      borderWidth: 1,
      borderColor: colors.logoDark,
      backgroundColor: colors.bgPrimary,
    },
    ctaDisabled: { opacity: 0.55 },
    ctaPrimaryText: {
      ...typeface('medium'),
      fontSize: 11,
      lineHeight: 14,
      color: colors.textInverse,
      textAlign: 'center',
    },
    ctaSecondaryText: {
      ...typeface('medium'),
      fontSize: 11,
      lineHeight: 14,
      color: colors.logoDark,
      textAlign: 'center',
    },
    qtyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: colors.logoDark,
      borderRadius: borderRadius.md,
      paddingHorizontal: 6,
      minHeight: 42,
      backgroundColor: colors.bgPrimary,
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
      color: colors.logoDark,
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
      color: colors.logoDark,
      minWidth: 16,
      textAlign: 'center',
    },
    shipNote: {
      ...typeface('regular'),
      fontSize: 11,
      lineHeight: 14,
      color: colors.textSecondary,
      textAlign: 'left',
    },
    details: {
      width: '100%',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
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
      color: colors.logoDark,
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
      borderTopColor: colors.border,
      gap: 4,
    },
    detailLabel: {
      ...typeface('medium'),
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: colors.goldMuted,
    },
    detailValue: {
      ...typeface('regular'),
      fontSize: typography.md,
      lineHeight: 22,
      color: colors.logoDark,
    },
    similarBleed: {
      marginHorizontal: desktop ? -spacing.xxl : -MOBILE_GUTTER,
      alignSelf: 'stretch',
    },
  });
}
