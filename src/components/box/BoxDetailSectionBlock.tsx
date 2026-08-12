import React, { useMemo, useState } from 'react';
import { View, Text, Platform, type LayoutChangeEvent } from 'react-native';
import { BOX_DISPLAY_SECTIONS, type BoxDisplaySectionId } from '../../constants/boxDisplaySections';
import type { CatalogItem } from '../../types/pilot';
import { BOX_DETAIL_SCROLL_SPY_OFFSET, createBoxDetailStyles } from './boxDetailLayout';
import {
  BOX_TILE_GRID_MIN_WIDTH,
  BOX_TILE_GRID_THREE_COL_MIN_WIDTH,
  BoxItemVisualVariantProvider,
  type BoxItemVisualVariant,
} from './boxSectionItemsLayout';
import { BoxSectionUpsellStrip } from './BoxSectionUpsellStrip';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';

/** Join multi-paragraph blurbs into a single paragraph (no line breaks). */
function sectionBlurbAsParagraph(description: string): string {
  return description
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');
}

function chunkElements(children: React.ReactNode, size: number): React.ReactElement[][] {
  const items = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement[];
  const rows: React.ReactElement[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

type Props = {
  sectionId: BoxDisplaySectionId;
  onLayout: (e: LayoutChangeEvent) => void;
  /** Host node for scroll-to measurement (especially web). */
  onSectionRef?: (id: BoxDisplaySectionId, node: View | null) => void;
  children: React.ReactNode;
  /** Full-width content above the item grid. */
  leading?: React.ReactNode;
  /** Full-width content below the item grid (e.g. Presents wrappable checklist). */
  trailing?: React.ReactNode;
  /** Thumbnail + price upsells under the section (from boxRules + catalog). */
  upsellItems?: CatalogItem[];
  onUpsellPress?: (item: CatalogItem) => void;
  showUpsells?: boolean;
  /** Hide bottom divider when this is the last visible section. */
  isLast?: boolean;
};

/** Figma 370:3534 — one scroll section (title, items, browse/upsell strip). */
export function BoxDetailSectionBlock({
  sectionId,
  onLayout,
  onSectionRef,
  children,
  leading,
  trailing,
  upsellItems,
  onUpsellPress,
  showUpsells = true,
  isLast = false,
}: Props) {
  const { colors } = useThemeMode();
  const { isDesktop, layoutWidth } = useWebLayout();
  const [listWidth, setListWidth] = useState(isDesktop ? layoutWidth : 0);
  const useTileGrid = isDesktop && listWidth >= BOX_TILE_GRID_MIN_WIDTH;
  const itemCount = React.Children.toArray(children).length;
  /** Width capacity — drives tile % width (Story 2-up uses 3-col size when wide). */
  const tileSizeColumns: 2 | 3 = listWidth >= BOX_TILE_GRID_THREE_COL_MIN_WIDTH ? 3 : 2;
  /** Row wrap bias: 4 → 2×2 (not 3+1); 5 → 3+2 when wide. */
  const maxPerRow: 2 | 3 = (() => {
    if (itemCount === 4) return 2;
    if (itemCount === 5) return tileSizeColumns === 3 ? 3 : 2;
    return tileSizeColumns;
  })();
  const itemVariant: BoxItemVisualVariant = useTileGrid ? 'tile' : 'card';
  const styles = useMemo(
    () =>
      createBoxDetailStyles(colors, {
        desktop: isDesktop,
        tileGrid: useTileGrid,
        tileColumns: useTileGrid ? tileSizeColumns : 2,
      }),
    [colors, isDesktop, useTileGrid, tileSizeColumns],
  );
  const meta = BOX_DISPLAY_SECTIONS.find((s) => s.id === sectionId)!;
  const blurb = sectionBlurbAsParagraph(meta.description);
  const stripItems = showUpsells && upsellItems?.length ? upsellItems : [];
  const isPresents = sectionId === 'presents';
  const tileRows = useTileGrid ? chunkElements(children, maxPerRow) : null;

  return (
    <View
      ref={(node) => onSectionRef?.(sectionId, node)}
      style={[
        styles.sectionBlock,
        isPresents ? styles.sectionBlockPresents : null,
        isLast ? { borderBottomWidth: 0 } : null,
        Platform.OS === 'web'
          ? ({ scrollMarginTop: BOX_DETAIL_SCROLL_SPY_OFFSET } as object)
          : null,
      ]}
      onLayout={onLayout}
      collapsable={false}
      nativeID={`box-section-${sectionId}`}
      {...(Platform.OS === 'web'
        ? ({
            id: `box-section-${sectionId}`,
            // Prefer data-* for queries — more reliable than id on RN Web.
            dataSet: { gjSection: sectionId },
            'data-gj-section': sectionId,
          } as object)
        : null)}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{meta.title}</Text>
        </View>
        <Text style={styles.sectionDesc}>{blurb}</Text>
      </View>
      {leading ? <View style={styles.sectionLeading}>{leading}</View> : null}
      <BoxItemVisualVariantProvider value={itemVariant}>
        <View
          style={[styles.itemList, isPresents ? styles.itemListPresents : null]}
          onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
        >
          {tileRows
            ? tileRows.map((row, rowIndex) => (
                <View key={`tile-row-${rowIndex}`} style={styles.itemRow}>
                  {row.map((child, colIndex) => (
                    <View
                      key={child.key != null ? String(child.key) : `tile-${rowIndex}-${colIndex}`}
                      style={styles.itemTile}
                    >
                      {child}
                    </View>
                  ))}
                </View>
              ))
            : children}
        </View>
      </BoxItemVisualVariantProvider>
      {trailing ? <View style={styles.sectionTrailing}>{trailing}</View> : null}
      {stripItems.length && onUpsellPress ? (
        <BoxSectionUpsellStrip items={stripItems} onPressItem={onUpsellPress} />
      ) : null}
    </View>
  );
}
