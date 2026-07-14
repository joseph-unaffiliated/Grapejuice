import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform, type LayoutChangeEvent } from 'react-native';
import { BOX_DISPLAY_SECTIONS, type BoxDisplaySectionId } from '../../constants/boxDisplaySections';
import { createBoxDetailStyles } from './boxDetailLayout';
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
};

/** Figma 370:3534 — one scroll section (title, items, browse chips). */
export function BoxDetailSectionBlock({
  sectionId,
  onLayout,
  onSectionRef,
  children,
  onBrowseChipPress,
  showBrowseChips = true,
}: Props) {
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createBoxDetailStyles(colors, { desktop: isDesktop }), [colors, isDesktop]);
  const meta = BOX_DISPLAY_SECTIONS.find((s) => s.id === sectionId)!;

  return (
    <View
      ref={(node) => onSectionRef?.(sectionId, node)}
      style={styles.sectionBlock}
      onLayout={onLayout}
      collapsable={false}
      nativeID={`box-section-${sectionId}`}
      {...(Platform.OS === 'web' ? ({ id: `box-section-${sectionId}` } as object) : null)}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{meta.title}</Text>
        <Text style={styles.sectionDesc}>{meta.description}</Text>
      </View>
      <View style={styles.itemList}>{children}</View>
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
