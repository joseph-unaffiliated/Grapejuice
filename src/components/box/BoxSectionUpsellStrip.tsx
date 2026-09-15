import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import type { CatalogItem, ChildProfile } from '../../types/pilot';
import { BoxItemImage } from './BoxItemImage';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { resolveCatalogDisplayPrices } from '../../services/box/pricing';
import { formatBookForKidsLabel } from '../../services/box/sectionUpsells';
import { HorizontalDragScrollView } from '../home/HorizontalDragScrollView';
import { HORIZONTAL_RAIL_SCROLL_CLASS } from '../home/CatalogProductRail';
import {
  HorizontalScrollEdgeFades,
  useHorizontalScrollEdges,
} from '../ui/ScrollEdgeFades';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

/** Compact Add more rail (default). */
export const UPSELL_TILE_COMPACT = 72;
/** Medium tiles for empty-section “Add items” rails and expanded “More”. */
export const UPSELL_TILE_MEDIUM = 148;
/** Horizontal gap between tiles in the expanded wrap grid. */
const EXPANDED_GRID_COL_GAP = 8;
/** Vertical gap between wrapped rows — taller so age lines don’t collide with next row. */
const EXPANDED_GRID_ROW_GAP = 20;
/** Shared horizontal inset for contracted rail + expanded grid. */
const UPSELL_RAIL_PAD_H = 0;

export type UpsellTileSize = 'compact' | 'medium';

type Props = {
  items: CatalogItem[];
  onPressItem: (item: CatalogItem) => void;
  /** Optional strip label; defaults to “Add more”. */
  label?: string;
  /**
   * Item ids that are free to add (included). Rendered as “$0 ($X value)” instead of
   * their catalog price, since tapping them adds at no extra cost.
   */
  includedItemIds?: ReadonlySet<string>;
  /**
   * Item ids eligible as an included (free) swap for this section.
   * Price renders as “$X or swap” so shoppers know both paths.
   */
  swapEligibleItemIds?: ReadonlySet<string>;
  /** Tile scale — medium for empty sections, compact under populated cards. */
  tileSize?: UpsellTileSize;
  /** Kids in the household — book tiles show “For Sam” / “For Sam or Riley”. */
  childrenProfiles?: readonly ChildProfile[];
  /** Shown at the bottom of the expanded grid (e.g. “browse all books”). */
  footerAction?: { label: string; onPress: () => void };
};

type CollapseAdjust = {
  scrollEl: HTMLElement;
  scrollBefore: number;
  heightBefore: number;
  fullyAbove: boolean;
};

function isDomElement(node: unknown): node is HTMLElement {
  return (
    typeof node === 'object' &&
    node !== null &&
    'getBoundingClientRect' in node &&
    typeof (node as HTMLElement).getBoundingClientRect === 'function'
  );
}

function findVerticalScrollParent(el: HTMLElement): HTMLElement {
  let p: HTMLElement | null = el.parentElement;
  while (p) {
    const style = window.getComputedStyle(p);
    const oy = style.overflowY;
    if (
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
      p.scrollHeight > p.clientHeight + 1
    ) {
      return p;
    }
    p = p.parentElement;
  }
  return document.documentElement;
}

function readScrollTop(scrollEl: HTMLElement): number {
  return scrollEl === document.documentElement || scrollEl === document.body
    ? window.scrollY
    : scrollEl.scrollTop;
}

function writeScrollTop(scrollEl: HTMLElement, top: number) {
  const y = Math.max(0, top);
  if (scrollEl === document.documentElement || scrollEl === document.body) {
    window.scrollTo({ top: y, behavior: 'auto' });
  } else {
    scrollEl.scrollTop = y;
  }
}

/** Compact thumbnail + price rail under a My Box section (replaces text browse chips). */
export function BoxSectionUpsellStrip({
  items,
  onPressItem,
  label = 'Add more',
  includedItemIds,
  swapEligibleItemIds,
  tileSize = 'compact',
  childrenProfiles,
  footerAction,
}: Props) {
  const { colors } = useThemeMode();
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<View>(null);
  const expandedRef = useRef(false);
  const collapseAdjustRef = useRef<CollapseAdjust | null>(null);
  /** Last measured height while contracted — used to pre-correct scroll before Yoga lays out. */
  const lastContractedHeightRef = useRef<number | null>(null);
  expandedRef.current = expanded;

  const effectiveSize: UpsellTileSize = expanded ? 'medium' : tileSize;
  const tile = effectiveSize === 'medium' ? UPSELL_TILE_MEDIUM : UPSELL_TILE_COMPACT;
  const styles = useMemo(
    () => createStyles(colors, tile, effectiveSize),
    [colors, tile, effectiveSize]
  );
  const edges = useHorizontalScrollEdges();
  const showMore = !expanded && edges.overflows;

  /** Included ($0) first, then swap-eligible, then paid-only add-ons. */
  const orderedItems = useMemo(() => {
    const included: CatalogItem[] = [];
    const swapEligible: CatalogItem[] = [];
    const rest: CatalogItem[] = [];
    for (const item of items) {
      if (includedItemIds?.has(item.id)) included.push(item);
      else if (swapEligibleItemIds?.has(item.id)) swapEligible.push(item);
      else rest.push(item);
    }
    if (!included.length && !swapEligible.length) return items;
    return [...included, ...swapEligible, ...rest];
  }, [items, includedItemIds, swapEligibleItemIds]);

  const renderTile = useCallback(
    (item: CatalogItem) => {
      const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(item);
      const cents = memberCents > 0 ? memberCents : nonMemberCents;
      const included = includedItemIds?.has(item.id);
      const swapEligible = !included && !!swapEligibleItemIds?.has(item.id);
      const valueLabel =
        included && cents > 0 ? `(${formatCatalogDollars(cents)} value)` : null;
      const priceMain = included
        ? '$0'
        : cents > 0
          ? swapEligible
            ? `${formatCatalogDollars(cents)} or swap`
            : formatCatalogDollars(cents)
          : swapEligible
            ? 'Swap'
            : 'Add';
      const a11yPrice = valueLabel ? `${priceMain} ${valueLabel}` : priceMain;
      const ageLabel = formatBookForKidsLabel(item, childrenProfiles ?? []);
      return (
        <TouchableOpacity
          key={item.id}
          style={styles.tile}
          onPress={() => onPressItem(item)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={
            ageLabel ? `${item.name}, ${a11yPrice}, ${ageLabel}` : `${item.name}, ${a11yPrice}`
          }
        >
          <BoxItemImage
            size={tile}
            imageUrl={item.imageUrl}
            itemId={item.id}
            style={styles.image}
          />
          <Text style={styles.price}>
            {priceMain}
            {valueLabel ? <Text style={styles.priceValue}> {valueLabel}</Text> : null}
          </Text>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          {ageLabel ? (
            <Text style={styles.age} numberOfLines={1}>
              {ageLabel}
            </Text>
          ) : null}
        </TouchableOpacity>
      );
    },
    [includedItemIds, swapEligibleItemIds, onPressItem, styles, tile, childrenProfiles]
  );

  /** Apply pending scroll compensation from a measured height shrink above the viewport. */
  const applyCollapseScrollFix = useCallback(() => {
    const pending = collapseAdjustRef.current;
    if (!pending?.fullyAbove) return false;
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!isDomElement(node)) return false;
    const heightAfter = node.getBoundingClientRect().height;
    const delta = pending.heightBefore - heightAfter;
    if (delta <= 1) return false;
    writeScrollTop(pending.scrollEl, pending.scrollBefore - delta);
    return true;
  }, []);

  /**
   * Collapse after leaving the viewport; keep scroll position stable when shrinking above.
   * Pre-correct scroll using the last contracted height (before paint), then refine via
   * useLayoutEffect + ResizeObserver once Yoga commits the real height.
   */
  const collapseWithoutJump = useCallback(() => {
    if (!expandedRef.current) return;
    if (Platform.OS !== 'web') {
      setExpanded(false);
      return;
    }
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!isDomElement(node)) {
      setExpanded(false);
      return;
    }
    const heightBefore = node.getBoundingClientRect().height;
    const scrollEl = findVerticalScrollParent(node);
    const scrollRect =
      scrollEl === document.documentElement || scrollEl === document.body
        ? { top: 0 }
        : scrollEl.getBoundingClientRect();
    const stripRect = node.getBoundingClientRect();
    const fullyAbove = stripRect.bottom <= scrollRect.top + 1;
    const scrollBefore = readScrollTop(scrollEl);

    // Opt out of scroll anchoring so the browser doesn’t fight our compensation.
    scrollEl.style.overflowAnchor = 'none';

    // Pre-correct before React commits so the first paint isn’t a jump.
    const knownContracted = lastContractedHeightRef.current;
    if (fullyAbove && knownContracted != null && heightBefore > knownContracted + 1) {
      writeScrollTop(scrollEl, scrollBefore - (heightBefore - knownContracted));
    }

    collapseAdjustRef.current = {
      scrollEl,
      scrollBefore,
      heightBefore,
      fullyAbove,
    };
    setExpanded(false);
  }, []);

  useLayoutEffect(() => {
    if (expanded) {
      collapseAdjustRef.current = null;
      return;
    }
    if (applyCollapseScrollFix()) {
      collapseAdjustRef.current = null;
    }
  }, [expanded, applyCollapseScrollFix]);

  // Track contracted height + apply pending scroll fix when Yoga finally shrinks the strip.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!isDomElement(node) || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!isDomElement(node)) return;
      const h = node.getBoundingClientRect().height;
      if (!expandedRef.current && !collapseAdjustRef.current) {
        lastContractedHeightRef.current = h;
      }
      if (!collapseAdjustRef.current) return;
      if (applyCollapseScrollFix()) {
        collapseAdjustRef.current = null;
        if (!expandedRef.current) {
          lastContractedHeightRef.current = h;
        }
      }
    });
    ro.observe(node);
    // Seed contracted height if we mount collapsed.
    if (!expandedRef.current) {
      lastContractedHeightRef.current = node.getBoundingClientRect().height;
    }
    return () => ro.disconnect();
  }, [applyCollapseScrollFix, orderedItems.length]);

  useEffect(() => {
    if (!expanded || Platform.OS !== 'web') return;
    const node = rootRef.current as unknown as Element | null;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && !entry.isIntersecting) {
          collapseWithoutJump();
        }
      },
      { threshold: 0, rootMargin: '0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded, collapseWithoutJump]);

  if (!orderedItems.length) return null;

  return (
    <View
      ref={rootRef}
      style={[styles.root, !label ? styles.rootFlush : null]}
      accessibilityRole="list"
      accessibilityLabel={label || undefined}
      collapsable={false}
    >
      {label ? (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded ? `Collapse ${label}` : `Expand ${label}`
          }
          style={styles.labelPress}
        >
          <Text style={styles.label} numberOfLines={1}>
            {label}
            <Text style={styles.labelExpandHint}>
              {expanded ? ' (collapse)' : ' (expand)'}
            </Text>
          </Text>
        </TouchableOpacity>
      ) : null}

      {expanded ? (
        <View style={styles.expandedShell}>
          <View style={styles.expandedGrid}>{orderedItems.map(renderTile)}</View>
          {footerAction ? (
            <TouchableOpacity
              style={styles.footerBtn}
              onPress={footerAction.onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={footerAction.label}
            >
              <Text style={styles.footerBtnLabel}>{footerAction.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
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
            {orderedItems.map(renderTile)}
          </HorizontalDragScrollView>
          <HorizontalScrollEdgeFades
            leftProgress={edges.leftProgress}
            rightProgress={edges.rightProgress}
            color={semanticColors.bgPrimary}
          />
        </View>
      )}

      {showMore ? (
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={() => setExpanded(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Show more add options"
        >
          <Text style={styles.moreLabel}>More</Text>
          <Icon icon={icons.chevronDown} size={10} color={colors.goldMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createStyles(
  colors: SemanticColors,
  tile: number,
  tileSize: UpsellTileSize
) {
  const medium = tileSize === 'medium';
  return StyleSheet.create({
    root: {
      width: '100%',
      alignSelf: 'stretch',
      gap: spacing.xs,
      marginTop: spacing.sm,
      overflow: 'visible',
      // Stretch so the expanded shell measures full width (center would shrink to 1 tile).
      alignItems: 'stretch',
      // Prevent browser scroll-anchoring from fighting collapse compensation.
      ...(Platform.OS === 'web' ? ({ overflowAnchor: 'none' } as object) : null),
    },
    rootFlush: {
      marginTop: 0,
    },
    label: {
      fontSize: typography.sm,
      lineHeight: 18,
      ...typeface('medium'),
      color: colors.textSecondary,
      letterSpacing: -0.22,
      textAlign: 'center',
      // Avoid rail bleed / overflow clipping the label.
      paddingBottom: 2,
      zIndex: 1,
    },
    labelExpandHint: {
      ...typeface('medium'),
      color: colors.brand,
      letterSpacing: -0.22,
    },
    labelPress: {
      alignSelf: 'center',
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
    },
    railWrap: {
      position: 'relative',
      width: '100%',
      overflow: 'hidden',
      alignSelf: 'stretch',
    },
    /** Edge-to-edge within section content — no side padding on the scroller. */
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
      gap: medium ? spacing.md : spacing.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: UPSELL_RAIL_PAD_H,
      // Center the rail when content is shorter than the viewport.
      ...(Platform.OS === 'web'
        ? ({ marginLeft: 'auto', marginRight: 'auto' } as object)
        : null),
    },
    /** Full-width wrap grid — fills horizontal space without depending on onLayout width. */
    expandedShell: {
      width: '100%',
      alignSelf: 'stretch',
      ...(Platform.OS === 'web' ? ({ display: 'flex' } as object) : null),
    },
    expandedGrid: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'flex-start',
      alignContent: 'flex-start',
      columnGap: EXPANDED_GRID_COL_GAP,
      rowGap: EXPANDED_GRID_ROW_GAP,
      paddingVertical: spacing.xs,
      paddingHorizontal: UPSELL_RAIL_PAD_H,
      maxWidth: '100%',
    },
    tile: {
      width: tile,
      gap: medium ? 4 : 4,
      flexShrink: 0,
    },
    image: {
      width: tile,
      height: tile,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(0,0,0,0.05)',
    },
    name: {
      fontSize: medium ? typography.sm : 10,
      ...typeface('regular'),
      color: colors.textPrimary,
      letterSpacing: -0.2,
      lineHeight: medium ? 14 : 12,
      // No fixed minHeight — age sits flush under 1-line titles.
    },
    age: {
      fontSize: medium ? 10 : 9,
      lineHeight: medium ? 12 : 11,
      ...typeface('medium'),
      color: colors.brand,
      letterSpacing: -0.18,
    },
    price: {
      fontSize: typography.sm,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
    priceValue: {
      ...typeface('medium'),
      color: colors.goldMuted,
      letterSpacing: -0.22,
    },
    moreBtn: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingTop: 2,
      paddingBottom: spacing.xs,
      paddingHorizontal: spacing.sm,
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
    },
    moreLabel: {
      fontSize: typography.sm,
      lineHeight: 16,
      ...typeface('medium'),
      color: colors.goldMuted,
      letterSpacing: -0.22,
    },
    footerBtn: {
      alignSelf: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      backgroundColor: colors.bgPrimary,
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
    },
    footerBtnLabel: {
      fontSize: typography.sm,
      lineHeight: 18,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.22,
      textAlign: 'center',
    },
  });
}
