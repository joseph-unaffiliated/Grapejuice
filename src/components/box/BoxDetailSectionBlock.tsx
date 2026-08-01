import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, type LayoutChangeEvent } from 'react-native';
import { BOX_DISPLAY_SECTIONS, type BoxDisplaySectionId } from '../../constants/boxDisplaySections';
import { BOX_DETAIL_SCROLL_SPY_OFFSET, createBoxDetailStyles } from './boxDetailLayout';
import {
  BOX_TILE_GRID_MIN_WIDTH,
  BoxItemVisualVariantProvider,
  type BoxItemVisualVariant,
} from './boxSectionItemsLayout';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';

type Props = {
  sectionId: BoxDisplaySectionId;
  onLayout: (e: LayoutChangeEvent) => void;
  /** Host node for scroll-to measurement (especially web). */
  onSectionRef?: (id: BoxDisplaySectionId, node: View | null) => void;
  children: React.ReactNode;
  onBrowseChipPress?: (chip: string, sectionId: BoxDisplaySectionId) => void;
  showBrowseChips?: boolean;
  /** Line items shown under this section — tan count pill beside the title. */
  itemCount?: number;
};

/** Figma 370:3534 — one scroll section (title, items, browse chips). */
export function BoxDetailSectionBlock({
  sectionId,
  onLayout,
  onSectionRef,
  children,
  onBrowseChipPress,
  showBrowseChips = true,
  itemCount,
}: Props) {
  const { colors } = useThemeMode();
  const { isDesktop, layoutWidth } = useWebLayout();
  const [listWidth, setListWidth] = useState(isDesktop ? layoutWidth : 0);
  const useTileGrid = isDesktop && listWidth >= BOX_TILE_GRID_MIN_WIDTH;
  const itemVariant: BoxItemVisualVariant = useTileGrid ? 'tile' : 'card';
  const styles = useMemo(
    () => createBoxDetailStyles(colors, { desktop: isDesktop, tileGrid: useTileGrid }),
    [colors, isDesktop, useTileGrid],
  );
  const meta = BOX_DISPLAY_SECTIONS.find((s) => s.id === sectionId)!;
  const showCount = typeof itemCount === 'number' && itemCount > 0;

  return (
    <View
      ref={(node) => onSectionRef?.(sectionId, node)}
      style={[
        styles.sectionBlock,
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
          {showCount ? (
            <View
              style={styles.sectionCountBadge}
              accessibilityLabel={`${itemCount} item${itemCount === 1 ? '' : 's'}`}
            >
              <Text style={styles.sectionCountText}>{itemCount}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sectionDesc}>{meta.description}</Text>
      </View>
      <BoxItemVisualVariantProvider value={itemVariant}>
        <View
          style={styles.itemList}
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
      {showBrowseChips && meta.browseChips.length ? (
        <View style={styles.browseChips}>
          {meta.browseChips.map((chip) =>
            onBrowseChipPress ? (
              <TouchableOpacity
                key={chip}
                style={styles.browseChip}
                onPress={() => onBrowseChipPress(chip, sectionId)}
                activeOpacity={0.85}
              >
                <Text style={styles.browseChipText}>{chip}</Text>
              </TouchableOpacity>
            ) : (
              <View key={chip} style={styles.browseChip}>
                <Text style={styles.browseChipText}>{chip}</Text>
              </View>
            )
          )}
        </View>
      ) : null}
    </View>
  );
}
