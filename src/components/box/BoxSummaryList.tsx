import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type LayoutChangeEvent,
} from 'react-native';
import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
import { BoxItemImage } from './BoxItemImage';
import {
  bookBadgeLabelForLines,
  coalesceLinesByItemId,
  giftBadgeLabelForLines,
  isCashDonationLine,
  isWrappingPaperItem,
  oneForBadgeLabelForLines,
  type CoalescedBoxLine,
} from './boxLineDisplay';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { UPSELL_TILE_MEDIUM } from './BoxSectionUpsellStrip';
import {
  displaySectionForLineItem,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import type { SemanticColors } from '../../constants/themeMode';

const GRID_COL_GAP = 8;
const GRID_ROW_GAP = 20;

type Props = {
  lineItems: BoxLineItem[];
  catalog: CatalogItem[];
  childrenProfiles: ChildProfile[];
  /** Jump to the practice section that owns this item so it can be edited in place. */
  onPressItem?: (itemId: string, sectionId: BoxDisplaySectionId) => void;
};

type SummaryRow = {
  key: string;
  itemId: string;
  label: string;
  imageUrl?: string;
  quantity: number;
  sectionId: BoxDisplaySectionId;
  /**
   * Charge for this tile: sum of paid line cents (extras beyond included).
   * Fully included / wrapping paper → 0.
   */
  chargeCents: number;
  attribution?: string;
};

function buildSummaryRows(
  lineItems: BoxLineItem[],
  catalog: CatalogItem[],
  childrenProfiles: ChildProfile[]
): SummaryRow[] {
  const productLines = lineItems.filter((li) => !isCashDonationLine(li));
  const groups = coalesceLinesByItemId(productLines);
  const rows: SummaryRow[] = [];
  for (const group of groups) {
    const row = toSummaryRow(group, catalog, childrenProfiles);
    if (row) rows.push(row);
  }
  return rows;
}

/** Paid amount for a coalesced group — included qty at $0, extras at their unitCents. */
function chargeCentsForGroup(group: CoalescedBoxLine, isPaper: boolean): number {
  if (isPaper) return 0;
  return group.lines.reduce(
    (sum, li) => sum + Math.max(0, li.unitCents ?? 0) * Math.max(1, li.quantity ?? 1),
    0
  );
}

function toSummaryRow(
  group: CoalescedBoxLine,
  catalog: CatalogItem[],
  childrenProfiles: ChildProfile[]
): SummaryRow | null {
  const item = catalog.find((c) => c.id === group.itemId);
  const label = group.primary.label ?? item?.name ?? group.itemId;
  if (!label.trim()) return null;

  const isPaper = isWrappingPaperItem(group.itemId, catalog, group.primary);

  const attribution =
    giftBadgeLabelForLines(group.lines, childrenProfiles) ??
    bookBadgeLabelForLines(group.lines, childrenProfiles) ??
    oneForBadgeLabelForLines(group.lines, childrenProfiles);

  return {
    key: group.key,
    itemId: group.itemId,
    label,
    imageUrl: item?.imageUrl,
    quantity: group.quantity,
    sectionId: displaySectionForLineItem(group.primary, item),
    chargeCents: chargeCentsForGroup(group, isPaper),
    attribution,
  };
}

function priceLabel(row: SummaryRow): string {
  if (row.chargeCents <= 0) return '$0';
  const money = formatCatalogDollars(row.chargeCents).trim();
  return money.startsWith('+') ? money.slice(1) : money;
}

/** Max columns that fit, then shrink so rows balance (8 @ max 7 → 4+4). */
export function balancedColumnCount(itemCount: number, maxCols: number): number {
  if (itemCount <= 0 || maxCols <= 0) return 1;
  const colsCap = Math.min(itemCount, maxCols);
  const rows = Math.ceil(itemCount / colsCap);
  return Math.ceil(itemCount / rows);
}

function chunkRows<T>(items: T[], cols: number): T[][] {
  if (cols <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    out.push(items.slice(i, i + cols));
  }
  return out;
}

export function BoxSummaryList({
  lineItems,
  catalog,
  childrenProfiles,
  onPressItem,
}: Props) {
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const tile = UPSELL_TILE_MEDIUM;
  const styles = useMemo(() => createStyles(colors, isDesktop, tile), [colors, isDesktop, tile]);
  const rows = useMemo(
    () => buildSummaryRows(lineItems, catalog, childrenProfiles),
    [lineItems, catalog, childrenProfiles]
  );
  const [gridWidth, setGridWidth] = useState(0);

  const onGridLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setGridWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
  }, []);

  const maxCols =
    gridWidth > 0
      ? Math.max(1, Math.floor((gridWidth + GRID_COL_GAP) / (tile + GRID_COL_GAP)))
      : rows.length;
  const cols = balancedColumnCount(rows.length, maxCols);
  const rowChunks = chunkRows(rows, cols);

  if (rows.length === 0) return null;

  const renderTile = (row: SummaryRow) => {
    const title = `${row.label}${row.quantity > 1 ? ` ×${row.quantity}` : ''}`;
    const price = priceLabel(row);
    const a11y = row.attribution
      ? `${title}, ${price}, ${row.attribution}`
      : `${title}, ${price}`;
    const body = (
      <>
        <BoxItemImage
          size={tile}
          imageUrl={row.imageUrl}
          itemId={row.itemId}
          style={styles.image}
        />
        <Text style={styles.price}>{price}</Text>
        <Text style={styles.name} numberOfLines={2}>
          {title}
        </Text>
        {row.attribution ? (
          <Text style={styles.attribution} numberOfLines={1}>
            {row.attribution}
          </Text>
        ) : null}
      </>
    );
    if (onPressItem) {
      return (
        <TouchableOpacity
          key={row.key}
          style={styles.tile}
          onPress={() => onPressItem(row.itemId, row.sectionId)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${a11y}. Jump to section to edit.`}
        >
          {body}
        </TouchableOpacity>
      );
    }
    return (
      <View key={row.key} style={styles.tile} accessibilityRole="text" accessibilityLabel={a11y}>
        {body}
      </View>
    );
  };

  return (
    <View style={styles.root} testID="box-summary-list">
      <View style={styles.rule} />
      <Text style={styles.heading}>Your box</Text>
      <View style={styles.grid} onLayout={onGridLayout}>
        {rowChunks.map((chunk, i) => (
          <View key={`row-${i}`} style={styles.row}>
            {chunk.map(renderTile)}
          </View>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: SemanticColors, desktop: boolean, tile: number) {
  return StyleSheet.create({
    root: {
      gap: spacing.lg,
      width: '100%',
      marginTop: spacing.xxl,
      paddingTop: spacing.xl,
    },
    rule: {
      height: 1,
      backgroundColor: colors.textPrimary,
      width: '100%',
      alignSelf: 'stretch',
    },
    heading: {
      // Match BoxDetailToolbar “Your Hanukkah Box” title size.
      fontSize: 28,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.6,
      textAlign: desktop ? 'center' : 'left',
    },
    grid: {
      width: '100%',
      flexDirection: 'column',
      alignItems: 'center',
      gap: GRID_ROW_GAP,
      paddingVertical: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      justifyContent: 'center',
      alignItems: 'flex-start',
      columnGap: GRID_COL_GAP,
    },
    tile: {
      width: tile,
      gap: 4,
      flexShrink: 0,
    },
    image: {
      width: tile,
      height: tile,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(0,0,0,0.05)',
    },
    price: {
      fontSize: typography.sm,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
    name: {
      fontSize: typography.sm,
      ...typeface('regular'),
      color: colors.textPrimary,
      letterSpacing: -0.2,
      lineHeight: 14,
    },
    attribution: {
      fontSize: 10,
      lineHeight: 12,
      ...typeface('medium'),
      color: colors.brand,
      letterSpacing: -0.18,
    },
  });
}
