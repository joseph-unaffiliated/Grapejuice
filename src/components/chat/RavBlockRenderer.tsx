import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import type { RavBlock, CatalogItem, BoxLineItem } from '../../types/pilot';
import { BoxItemImage } from '../box/BoxItemImage';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { resolveCatalogDisplayPrices } from '../../services/box/pricing';
import { HorizontalDragScrollView } from '../home/HorizontalDragScrollView';
import { HORIZONTAL_RAIL_SCROLL_CLASS } from '../home/CatalogProductRail';
import {
  HorizontalScrollEdgeFades,
  useHorizontalScrollEdges,
} from '../ui/ScrollEdgeFades';
import {
  spacing,
  typography,
  borderRadius,
  shadows,
  shadowsWeb,
  typeface,
  semanticColors,
} from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  blocks: RavBlock[];
  /** Live catalog for resolving block item ids. */
  catalog?: CatalogItem[];
  lineItems: BoxLineItem[];
  boxLocked?: boolean;
  paymentGated?: boolean;
  onSwap: (slotId: string, item: CatalogItem) => void;
  onAddExtra?: (item: CatalogItem) => void;
  guardMutation?: () => boolean;
};

const goldCardShadow = Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : shadows.goldGlow;
const TILE = 88;
/** Soft edge fade — narrow enough that the next tile’s leading edge stays readable. */
const RAIL_FADE_W = 16;
/**
 * Thread content pads by spacing.lg; assistant wrap adds spacing.xl on the right.
 * Bleed the rail so it uses the full chat width for a clear “more to scroll” peek.
 */
const RAIL_BLEED_LEFT = spacing.lg;
const RAIL_BLEED_RIGHT = spacing.lg + spacing.xl;

function resolveCatalogItem(
  catalog: CatalogItem[],
  id: string | undefined
): CatalogItem | undefined {
  if (!id?.trim()) return undefined;
  const needle = id.trim();
  const lower = needle.toLowerCase();
  return (
    catalog.find((c) => c.id === needle) ||
    catalog.find((c) => c.id.toLowerCase() === lower) ||
    catalog.find((c) => c.name.trim().toLowerCase() === lower)
  );
}

function ProductRail({
  title,
  items,
  boxLocked,
  onPressItem,
  styles,
}: {
  title?: string;
  items: CatalogItem[];
  boxLocked?: boolean;
  onPressItem: (item: CatalogItem) => void;
  styles: ReturnType<typeof createRavBlockStyles>;
}) {
  const edges = useHorizontalScrollEdges();
  if (!items.length) return null;

  return (
    <View style={styles.railRoot} accessibilityRole="list" accessibilityLabel={title || 'Products'}>
      {title ? (
        <Text style={styles.railTitle} numberOfLines={2}>
          {title}
        </Text>
      ) : null}
      <View style={styles.railWrap}>
        <HorizontalDragScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroller}
          contentContainerStyle={styles.scrollerContent}
          onScroll={edges.onScroll}
          onLayout={edges.onLayout}
          onContentSizeChange={edges.onContentSizeChange}
          scrollEventThrottle={16}
          // @ts-expect-error web className
          className={Platform.OS === 'web' ? HORIZONTAL_RAIL_SCROLL_CLASS : undefined}
        >
          {items.map((item) => {
            const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(item);
            const cents = memberCents > 0 ? memberCents : nonMemberCents;
            const price = cents > 0 ? formatCatalogDollars(cents) : null;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.tile, boxLocked && styles.tileDisabled]}
                onPress={() => onPressItem(item)}
                disabled={boxLocked}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={price ? `${item.name}, ${price}` : item.name}
              >
                <BoxItemImage
                  size={TILE}
                  imageUrl={item.imageUrl}
                  itemId={item.id}
                  style={styles.tileImage}
                />
                {price ? <Text style={styles.tilePrice}>{price}</Text> : null}
                <Text style={styles.tileName} numberOfLines={2}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </HorizontalDragScrollView>
        <HorizontalScrollEdgeFades
          leftProgress={edges.leftProgress}
          rightProgress={edges.rightProgress}
          color={semanticColors.bgPrimary}
          width={RAIL_FADE_W}
        />
      </View>
    </View>
  );
}

export function RavBlockRenderer({
  blocks,
  catalog: catalogProp,
  lineItems,
  boxLocked,
  paymentGated,
  onSwap,
  onAddExtra,
  guardMutation,
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createRavBlockStyles(colors), [colors]);
  const catalog = catalogProp ?? [];

  const handleItemPress = (item: CatalogItem, slotId?: string) => {
    if (boxLocked) return;
    if (paymentGated && guardMutation && !guardMutation()) return;
    const slot = lineItems.find(
      (li) => li.itemId === item.id || (slotId ? li.slotId === slotId : false)
    );
    if (slot) onSwap(slot.slotId, item);
    else onAddExtra?.(item);
  };

  if (!blocks.length) return null;

  /** Coalesce consecutive product blocks into one rail; keep curation/swap discrete. */
  const segments: Array<
    | { kind: 'rail'; title?: string; slotId?: string; items: CatalogItem[] }
    | { kind: 'swap'; block: RavBlock; index: number }
  > = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'curation' && block.swapOptions?.length) {
      const items = block.swapOptions
        .map((id) => resolveCatalogItem(catalog, id))
        .filter((c): c is CatalogItem => Boolean(c));
      // De-dupe while preserving model order
      const seen = new Set<string>();
      const unique = items.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      if (unique.length) {
        segments.push({
          kind: 'rail',
          title: block.title || 'Picks for you',
          slotId: block.slotId,
          items: unique,
        });
      }
      continue;
    }

    if (block.type === 'product' && block.itemId) {
      const item = resolveCatalogItem(catalog, block.itemId);
      if (!item) continue;
      const last = segments[segments.length - 1];
      if (last?.kind === 'rail' && !last.title) {
        if (!last.items.some((c) => c.id === item.id)) last.items.push(item);
      } else {
        segments.push({ kind: 'rail', items: [item], slotId: block.slotId });
      }
      continue;
    }

    if (block.type === 'swap' && block.itemId && block.slotId) {
      segments.push({ kind: 'swap', block, index: i });
    }
  }

  if (!segments.length) return null;

  return (
    <View style={styles.wrap}>
      {segments.map((seg, i) => {
        if (seg.kind === 'rail') {
          return (
            <ProductRail
              key={`rail-${i}`}
              title={seg.title}
              items={seg.items}
              boxLocked={boxLocked}
              onPressItem={(item) => handleItemPress(item, seg.slotId)}
              styles={styles}
            />
          );
        }

        const { block } = seg;
        const current = resolveCatalogItem(catalog, block.itemId);
        const suggested = resolveCatalogItem(catalog, block.swapOptions?.[0]);
        if (!current || !suggested) return null;
        return (
          <View key={`swap-${seg.index}`} style={[styles.swapCard, goldCardShadow]}>
            <Text style={styles.cardTitle}>{block.title || 'Suggested swap'}</Text>
            <Text style={styles.cardBody}>
              {current.name} → {suggested.name}
            </Text>
            <TouchableOpacity
              style={[styles.chipBtn, boxLocked && styles.chipBtnDisabled]}
              disabled={boxLocked}
              onPress={() => {
                if (boxLocked) return;
                if (paymentGated && guardMutation && !guardMutation()) return;
                onSwap(block.slotId!, suggested);
              }}
            >
              <Text style={styles.chipBtnText}>Make this swap</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

function createRavBlockStyles(colors: SemanticColors) {
  return StyleSheet.create({
    wrap: { marginTop: spacing.sm, gap: spacing.md, width: '100%' },
    railRoot: {
      width: 'auto',
      alignSelf: 'stretch',
      marginLeft: -RAIL_BLEED_LEFT,
      marginRight: -RAIL_BLEED_RIGHT,
      gap: spacing.xs,
      overflow: 'visible',
    },
    railTitle: {
      ...typeface('medium'),
      fontSize: typography.sm,
      color: colors.textSecondary,
      letterSpacing: -0.22,
      marginBottom: 2,
      // Keep the label aligned with assistant copy, not the bled rail.
      paddingHorizontal: RAIL_BLEED_LEFT,
    },
    railWrap: {
      position: 'relative',
      width: '100%',
      overflow: 'hidden',
    },
    scroller: {
      width: '100%',
      flexGrow: 0,
      flexShrink: 0,
      alignSelf: 'stretch',
      ...(Platform.OS === 'web'
        ? ({
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehaviorX: 'contain',
          } as object)
        : {}),
    },
    scrollerContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      flexGrow: 1,
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      // First tile lines up with chat text; trailing peek past the fade.
      paddingLeft: RAIL_BLEED_LEFT,
      paddingRight: Math.max(RAIL_BLEED_RIGHT, spacing.xl),
    },
    tile: {
      width: TILE,
      gap: 4,
      flexShrink: 0,
    },
    tileDisabled: { opacity: 0.5 },
    tileImage: {
      width: TILE,
      height: TILE,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(0,0,0,0.05)',
    },
    tileName: {
      fontSize: 11,
      ...typeface('regular'),
      color: colors.textPrimary,
      letterSpacing: -0.2,
      lineHeight: 14,
      minHeight: 28,
    },
    tilePrice: {
      fontSize: typography.sm,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
    cardTitle: { fontSize: typography.lg, color: colors.textPrimary },
    cardBody: {
      fontSize: typography.sm,
      fontWeight: '200',
      color: colors.textSecondary,
      marginTop: 2,
    },
    chipBtn: {
      borderWidth: 0.5,
      borderColor: colors.brand,
      borderRadius: borderRadius.chip,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      alignSelf: 'flex-start',
      marginTop: spacing.xs,
    },
    chipBtnDisabled: { opacity: 0.5 },
    chipBtnText: { fontSize: typography.sm, fontWeight: '200', color: colors.textPrimary },
    swapCard: {
      padding: spacing.md,
      backgroundColor: colors.bgPrimary,
      borderRadius: 16,
      gap: spacing.xs,
    },
  });
}
