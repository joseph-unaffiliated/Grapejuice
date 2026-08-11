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
}: Props) {
  const { colors } = useThemeMode();
  const { isDesktop, layoutWidth } = useWebLayout();
  const [listWidth, setListWidth] = useState(isDesktop ? layoutWidth : 0);
  const useTileGrid = isDesktop && listWidth >= BOX_TILE_GRID_MIN_WIDTH;
  const tileColumns =
    useTileGrid && listWidth >= BOX_TILE_GRID_THREE_COL_MIN_WIDTH ? 3 : useTileGrid ? 2 : 1;
  const itemVariant: BoxItemVisualVariant = useTileGrid ? 'tile' : 'card';
  const styles = useMemo(
    () =>
      createBoxDetailStyles(colors, {
        desktop: isDesktop,
        tileGrid: useTileGrid,
        tileColumns,
      }),
    [colors, isDesktop, useTileGrid, tileColumns],
  );
  const meta = BOX_DISPLAY_SECTIONS.find((s) => s.id === sectionId)!;
  const blurb = sectionBlurbAsParagraph(meta.description);
  const stripItems = showUpsells && upsellItems?.length ? upsellItems : [];
  const isPresents = sectionId === 'presents';

  return (
    <View
      ref={(node) => onSectionRef?.(sectionId, node)}
      style={[
        styles.sectionBlock,
        isPresents ? styles.sectionBlockPresents : null,
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
          {React.Children.map(children, (child) =>
            useTileGrid && React.isValidElement(child) ? (
              <View style={styles.itemTile}>{child}</View>
            ) : (
              child
            ),
          )}
        </View>
      </BoxItemVisualVariantProvider>
      {trailing ? <View style={styles.sectionTrailing}>{trailing}</View> : null}
      {stripItems.length && onUpsellPress ? (
        <BoxSectionUpsellStrip items={stripItems} onPressItem={onUpsellPress} />
      ) : null}
    </View>
  );
}
