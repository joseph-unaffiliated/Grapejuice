import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  StorefrontProductTile,
  type StorefrontTileBoxRelation,
} from './StorefrontProductTile';
import { SwapIntoBoxModal } from './SwapIntoBoxModal';
import { transferLiveIncludedBaselineOnSwap } from '../box/boxLineDisplay';
import { useWishlist } from '../../hooks/useWishlist';
import { useCatalogAvailabilityMap } from '../../hooks/useCatalogAvailabilityMap';
import { useCatalog } from '../../hooks/useCatalog';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { usePreviewedHasStartedBox } from '../../hooks/useUserStatePreview';
import {
  findSwapSourceLine,
  findSwapSourceLines,
} from '../../services/box/findSwapSourceLine';
import { resolveFreeSwapUnitCents } from '../../services/box/sectionUpsells';
import { boxAddOnUnitCents } from '../../services/box/pricing';
import { displaySectionForCatalogItem } from '../../constants/boxDisplaySections';
import type { BoxLineItem, CatalogAvailability, CatalogItem } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  items: CatalogItem[];
  /** Max items to show (home rails). Omit for full PLP. */
  limit?: number;
  /**
   * When `items` is empty, render this many skeleton tiles so merchandising
   * sections stay visible (e.g. landings before catalog resolves).
   */
  placeholderCount?: number;
  /** Optional precomputed availability (avoids a second subscription). */
  availabilityById?: Record<string, CatalogAvailability>;
  /** When false, omit maxWidth so PLPs can use the full content column. */
  constrainWidth?: boolean;
  /** `rail` = single-row horizontal scroll (~1.5 tiles visible). */
  layout?: 'grid' | 'rail';
  /**
   * Drop the rail’s bottom margin when the next section header owns spacing
   * (avoids stacking with variable-height tiles).
   */
  flushBottom?: boolean;
  /**
   * End-of-rail CTA on mobile rails — white card, brand gold stroke at lower opacity,
   * “browse more {label}”. Sized to the product photo (square), not the full tile + text.
   */
  browseMoreLabel?: string;
  onBrowseMore?: () => void;
};

/** Prefer 3-up when the grid’s own width is tablet+; else 2. Uses container, not window,
 * so a docked Rav pane doesn’t leave one oversized tile per row. */
function columnsForWidth(width: number): number {
  return width >= 768 ? 3 : 2;
}

function boxRelationForItem(
  item: CatalogItem,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[],
  hasStartedBox: boolean
): StorefrontTileBoxRelation | null {
  if (!hasStartedBox || lineItems.length === 0) return null;
  if (lineItems.some((li) => li.itemId === item.id)) return 'in_box';
  if (findSwapSourceLine(item, lineItems, catalog)) return 'swap';
  return 'add';
}

export function StorefrontProductGrid({
  items,
  limit,
  placeholderCount = 0,
  availabilityById: availabilityProp,
  constrainWidth = true,
  layout = 'grid',
  flushBottom = false,
  browseMoreLabel,
  onBrowseMore,
}: Props) {
  const navigation = useNavigation<Nav>();
  const { width: windowWidth } = useWindowDimensions();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const availHook = useCatalogAvailabilityMap();
  const availabilityById = availabilityProp ?? availHook.byId;
  const { items: catalog } = useCatalog();
  const { lineItems, persist } = useBoxDraft();
  const { guardMutation } = usePaymentGate();
  const hasStartedBox = usePreviewedHasStartedBox();
  const [containerWidth, setContainerWidth] = useState(0);
  const [swapIncoming, setSwapIncoming] = useState<CatalogItem | null>(null);
  const isRail = layout === 'rail';
  const showBrowseMore = isRail && Boolean(browseMoreLabel && onBrowseMore);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w <= 0) return;
    setContainerWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
  };

  const gap = spacing.sm;
  const pad = MOBILE_GUTTER;
  const layoutW = containerWidth > 0 ? containerWidth : windowWidth;
  const cols = columnsForWidth(layoutW);
  const tileWidth = isRail
    ? Math.floor((layoutW - pad * 2 - gap / 2) / 1.8)
    : Math.floor((layoutW - pad * 2 - gap * (cols - 1)) / cols);

  const visible = useMemo(() => {
    const list = limit != null ? items.slice(0, limit) : items;
    return list;
  }, [items, limit]);

  const catalogForSwap = catalog.length ? catalog : items;

  const swapSources = useMemo(() => {
    if (!swapIncoming) return [];
    return findSwapSourceLines(swapIncoming, lineItems, catalogForSwap);
  }, [swapIncoming, lineItems, catalogForSwap]);

  const swapOptions = useMemo(
    () =>
      swapSources.map((li) => {
        const src = catalogForSwap.find((c) => c.id === li.itemId);
        return {
          key: `${li.slotId}:${li.itemId}`,
          name: src?.name ?? li.label ?? li.itemId,
          imageUrl: src?.imageUrl,
          itemId: src?.id ?? li.itemId,
        };
      }),
    [swapSources, catalogForSwap]
  );

  const placeholders =
    visible.length === 0 && placeholderCount > 0
      ? Array.from({ length: placeholderCount }, (_, i) => i)
      : [];

  const updateBoxQty = (itemId: string, delta: 1 | -1) => {
    const idx = lineItems.findIndex((li) => li.itemId === itemId);
    if (idx < 0) return;
    const line = lineItems[idx]!;
    const nextQty = Math.max(0, (line.quantity || 1) + delta);
    const next =
      nextQty <= 0
        ? lineItems.filter((_, i) => i !== idx)
        : lineItems.map((li, i) =>
            i === idx ? { ...li, quantity: nextQty } : li
          );
    void persist(next);
  };

  const confirmSwap = (key: string) => {
    if (!swapIncoming) return;
    const source = swapSources.find((li) => `${li.slotId}:${li.itemId}` === key);
    if (!source) return;
    const sourceItem = catalogForSwap.find((c) => c.id === source.itemId);
    const sectionId = displaySectionForCatalogItem(sourceItem ?? swapIncoming);
    const swapUnitCents =
      resolveFreeSwapUnitCents(sourceItem, swapIncoming, sectionId) ??
      boxAddOnUnitCents(swapIncoming);
    const delta = Math.max(0, swapUnitCents - (source.unitCents ?? 0));
    if (delta > 0 && !guardMutation()) return;
    transferLiveIncludedBaselineOnSwap(
      source.itemId,
      swapIncoming.id,
      Math.max(1, source.quantity ?? 1),
      swapUnitCents
    );
    const next = lineItems.map((li) =>
      li.slotId === source.slotId && li.itemId === source.itemId
        ? {
            ...li,
            itemId: swapIncoming.id,
            label: swapIncoming.name,
            unitCents: swapUnitCents,
            quantity: 1,
          }
        : li
    );
    setSwapIncoming(null);
    void persist(next).then(() => {
      navigation.navigate('MyBox');
    });
  };

  const browseMoreLabelText = browseMoreLabel
    ? `browse more ${browseMoreLabel}`
    : '';

  const tiles = (
    <>
      {visible.map((item) => {
        const relation = boxRelationForItem(
          item,
          lineItems,
          catalogForSwap,
          hasStartedBox
        );
        const qty =
          relation === 'in_box'
            ? Math.max(
                1,
                lineItems.find((li) => li.itemId === item.id)?.quantity ?? 1
              )
            : 1;
        return (
          <StorefrontProductTile
            key={item.id}
            item={item}
            width={tileWidth}
            wishlisted={isWishlisted(item.id)}
            availability={availabilityById[item.id]}
            boxRelation={relation}
            boxQuantity={qty}
            onBoxQtyChange={
              relation === 'in_box' ? (delta) => updateBoxQty(item.id, delta) : undefined
            }
            onPress={() => navigation.navigate('CatalogProduct', { slug: item.id })}
            onSwapPress={
              relation === 'swap' ? () => setSwapIncoming(item) : undefined
            }
            onToggleWishlist={() => void toggleWishlist(item.id)}
            flushBottom={isRail}
          />
        );
      })}
      {placeholders.map((i) => (
        <View
          key={`ph-${i}`}
          style={[styles.placeholder, { width: tileWidth }]}
          accessibilityRole="text"
          accessibilityLabel="Product placeholder"
        >
          <View style={[styles.placeholderImage, { width: tileWidth, height: tileWidth }]} />
          <Text style={styles.placeholderTitle}>Product</Text>
          <Text style={styles.placeholderMeta}>Coming soon</Text>
        </View>
      ))}
      {showBrowseMore ? (
        <Pressable
          onPress={onBrowseMore}
          accessibilityRole="link"
          accessibilityLabel={browseMoreLabelText}
          style={({ pressed }) => [
            styles.browseMore,
            { width: tileWidth, height: tileWidth },
            pressed && styles.browseMorePressed,
          ]}
        >
          <Text style={styles.browseMoreText}>{browseMoreLabelText}</Text>
        </Pressable>
      ) : null}
    </>
  );

  const swapModal = (
    <SwapIntoBoxModal
      visible={swapIncoming != null && swapOptions.length > 0}
      options={swapOptions}
      onSelect={confirmSwap}
      onCancel={() => setSwapIncoming(null)}
    />
  );

  if (isRail) {
    return (
      <>
        <View
          style={[
            styles.railOuter,
            constrainWidth && styles.constrained,
            flushBottom && styles.railOuterFlush,
          ]}
          onLayout={onLayout}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.railContent,
              { gap, paddingLeft: pad, paddingRight: pad },
            ]}
            style={
              Platform.OS === 'web'
                ? ({ scrollbarWidth: 'none' } as object)
                : undefined
            }
          >
            {tiles}
          </ScrollView>
        </View>
        {swapModal}
      </>
    );
  }

  return (
    <>
      <View
        style={[
          styles.grid,
          constrainWidth && styles.constrained,
          flushBottom && styles.gridFlush,
          { paddingHorizontal: pad, gap },
        ]}
        onLayout={onLayout}
      >
        {tiles}
      </View>
      {swapModal}
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    // Match home: journey banner → Top picks (banner paddingBottom.md + sectionHead.paddingTop.xl).
    marginBottom: spacing.md,
    width: '100%',
    alignSelf: 'center',
  },
  gridFlush: {
    marginBottom: 0,
  },
  constrained: {
    maxWidth: 1024,
  },
  railOuter: {
    width: '100%',
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  railOuterFlush: {
    marginBottom: 0,
  },
  railContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  /** Square — matches product photo only (not title/price block). */
  browseMore: {
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(216, 201, 144, 0.55)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  browseMorePressed: {
    opacity: 0.88,
  },
  browseMoreText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  placeholder: {
    gap: spacing.xs,
  },
  placeholderImage: {
    backgroundColor: semanticColors.brandLight,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
  },
  placeholderTitle: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  placeholderMeta: {
    ...typeface('light'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
  },
});
