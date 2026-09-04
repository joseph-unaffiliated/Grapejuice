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
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { findSwapSourceLine } from '../../services/box/findSwapSourceLine';
import { boxAddOnUnitCents } from '../../services/box/pricing';
import { useWishlist } from '../../hooks/useWishlist';
import { useThemeMode } from '../../context/ThemeContext';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import type { SemanticColors } from '../../constants/themeMode';
import {
  MOBILE_GUTTER,
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
  locked?: boolean;
  onClose: () => void;
  /** Switch product while staying in the modal (similar rail). */
  onSelectItem?: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void | Promise<void>;
  onSwap: (item: CatalogItem, source: BoxLineItem) => void | Promise<void>;
  onRemove?: (item: CatalogItem) => void | Promise<void>;
};

export function BoxProductModal({
  visible,
  item,
  catalog,
  lineItems,
  context,
  locked = false,
  onClose,
  onSelectItem,
  onAdd,
  onSwap,
  onRemove,
}: Props) {
  const { colors } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const styles = useMemo(() => createStyles(colors, desktop), [colors, desktop]);
  const { isWishlisted, toggleWishlist, saving: wishlistSaving } = useWishlist();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) setDetailsOpen(false);
  }, [visible, item?.id]);

  const inBox = useMemo(
    () => (item ? lineItems.some((li) => li.itemId === item.id) : false),
    [item, lineItems]
  );

  const swapSource = useMemo(() => {
    if (!item || inBox) return null;
    return findSwapSourceLine(item, lineItems, catalog);
  }, [item, inBox, lineItems, catalog]);

  const boxUnitCents = item ? boxAddOnUnitCents(item) : 0;
  const swapDeltaCents = swapSource
    ? Math.max(0, boxUnitCents - (swapSource.unitCents ?? 0))
    : 0;

  const bodyCopy = item ? pdpBodyCopyForItem(item) : undefined;
  const details = item ? detailRowsFromItem(item) : [];
  const similar = item ? similarCatalogItems(item, catalog, 12) : [];
  const wishlisted = item ? isWishlisted(item.id) : false;

  const noun = context === 'giftBox' ? 'gift' : 'box';
  const primaryLabel = inBox
    ? context === 'giftBox'
      ? 'Remove from gift'
      : 'Remove from box'
    : boxUnitCents > 0
      ? `Add to ${noun} (+${formatCatalogDollars(boxUnitCents)})`
      : `Add to ${noun}`;

  const secondaryLabel =
    context === 'giftBox'
      ? `Swap into gift (+${formatCatalogDollars(swapDeltaCents)})`
      : `Swap into my box (+${formatCatalogDollars(swapDeltaCents)})`;

  const showSecondary = !inBox && Boolean(swapSource);
  const showRemove = inBox && Boolean(onRemove);

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
            desktop ? { paddingBottom: Math.max(insets.bottom, spacing.md) } : null,
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetEyebrow}>
              {context === 'giftBox' ? 'Add to their gift' : 'Add to your box'}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              !desktop && {
                paddingBottom: spacing.xxl + spacing.md + Math.max(insets.bottom, spacing.sm),
              },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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
                <Text style={[styles.name, !desktop && styles.nameMobile]}>{item.name}</Text>
                {bodyCopy ? <Text style={styles.desc}>{bodyCopy}</Text> : null}

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

                <View style={styles.priceRule}>
                  <ProductPricingBlock item={item} hasBox />
                </View>

                <View style={styles.ctaBlock}>
                  <View style={styles.ctaRow}>
                    <TouchableOpacity
                      style={[
                        styles.cta,
                        styles.ctaPrimary,
                        (locked || busy) && styles.ctaDisabled,
                      ]}
                      onPress={() =>
                        void run(() =>
                          showRemove && onRemove ? onRemove(item) : onAdd(item)
                        )
                      }
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
                        onPress={() =>
                          void run(() => {
                            if (swapSource) return onSwap(item, swapSource);
                          })
                        }
                        disabled={locked || busy}
                        accessibilityRole="button"
                      >
                        <Text style={styles.ctaSecondaryText}>{secondaryLabel}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            {similar.length > 0 && onSelectItem ? (
              <View style={styles.similarBleed}>
                <SimilarProductsRail items={similar} onPressItem={onSelectItem} />
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
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
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: desktop ? spacing.xxl : MOBILE_GUTTER,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sheetEyebrow: {
      ...typeface('medium'),
      fontSize: typography.sm,
      color: colors.goldMuted,
      letterSpacing: 0.2,
    },
    closeBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.pill,
    },
    closeGlyph: {
      fontSize: 18,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    scroll: { flexGrow: 0, flexShrink: 1 },
    scrollContent: {
      paddingHorizontal: desktop ? spacing.xxl : MOBILE_GUTTER,
      paddingTop: desktop ? spacing.xxl : spacing.xl,
      paddingBottom: spacing.xxl + spacing.md,
      gap: spacing.xxl,
    },
    split: {
      flexDirection: 'column',
      gap: spacing.xl,
    },
    splitDesktop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xxl + spacing.md,
    },
    galleryCol: { width: '100%' },
    galleryColDesktop: {
      flex: 0.48,
      maxWidth: '48%',
      minWidth: 0,
    },
    buy: {
      width: '100%',
      alignItems: 'flex-start',
      gap: spacing.lg,
    },
    buyDesktop: {
      flex: 0.52,
      maxWidth: '52%',
      minWidth: 0,
      paddingTop: spacing.sm,
    },
    name: {
      ...typeface('medium'),
      fontSize: 28,
      color: colors.logoDark,
      lineHeight: 34,
    },
    nameMobile: {
      fontSize: 22,
      lineHeight: 28,
    },
    desc: {
      ...typeface('regular'),
      fontSize: typography.md,
      lineHeight: 24,
      color: colors.textSecondary,
    },
    details: {
      width: '100%',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: spacing.md,
      gap: spacing.xs,
    },
    detailsToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
    },
    detailsHeading: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: colors.textPrimary,
    },
    detailsChevron: {
      transform: [{ rotate: '0deg' }],
    },
    detailsChevronOpen: {
      transform: [{ rotate: '180deg' }],
    },
    detailRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: 4,
    },
    detailLabel: {
      ...typeface('medium'),
      fontSize: typography.sm,
      color: colors.textSecondary,
      width: 110,
    },
    detailValue: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: colors.textPrimary,
      flex: 1,
    },
    priceRule: {
      width: '100%',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: spacing.md,
    },
    ctaBlock: { width: '100%', gap: spacing.md, marginTop: spacing.md },
    ctaRow: {
      flexDirection: 'row',
      flexWrap: desktop ? 'nowrap' : 'wrap',
      gap: spacing.md + 2,
      width: '100%',
      alignItems: 'stretch',
    },
    cta: {
      borderRadius: borderRadius.pill,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl + spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
    },
    ctaPrimary: {
      backgroundColor: colors.logoDark,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: desktop ? 260 : 200,
    },
    ctaSecondary: {
      backgroundColor: colors.bgPrimary,
      borderWidth: 1,
      borderColor: colors.logoDark,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: desktop ? 260 : 200,
    },
    ctaDisabled: { opacity: 0.45 },
    ctaPrimaryText: {
      ...typeface('bold'),
      fontSize: typography.md,
      color: colors.textInverse,
      textAlign: 'center',
      ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as object) : null),
    },
    ctaSecondaryText: {
      ...typeface('bold'),
      fontSize: typography.md,
      color: colors.logoDark,
      textAlign: 'center',
      ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as object) : null),
    },
    similarBleed: {
      marginHorizontal: desktop ? -spacing.xxl : -MOBILE_GUTTER,
      alignSelf: 'stretch',
    },
  });
}
