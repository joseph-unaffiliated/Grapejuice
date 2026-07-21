import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import type { BoxDisplaySectionId } from '../../constants/boxDisplaySections';
import { BOX_DISPLAY_SECTIONS } from '../../constants/boxDisplaySections';
import { typography, spacing, typeface } from '../../constants/theme';
import { BOX_DETAIL_TAB_GUTTER } from './boxDetailLayout';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  activeSection: BoxDisplaySectionId;
  onSelect: (id: BoxDisplaySectionId) => void;
  /** Tabs to show — omit empty sections. Defaults to all five. */
  sectionIds?: BoxDisplaySectionId[];
};

export function StickySectionNav({ activeSection, onSelect, sectionIds }: Props) {
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createNavStyles(colors, isDesktop), [colors, isDesktop]);
  const tabs = useMemo(
    () =>
      (sectionIds ?? BOX_DISPLAY_SECTIONS.map((section) => section.id))
        .map((id) => BOX_DISPLAY_SECTIONS.find((section) => section.id === id))
        .filter((section): section is (typeof BOX_DISPLAY_SECTIONS)[number] => section != null),
    [sectionIds],
  );
  const tabLayouts = useRef<Partial<Record<BoxDisplaySectionId, { x: number; width: number }>>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;

  const moveIndicator = (id: BoxDisplaySectionId) => {
    const layout = tabLayouts.current[id];
    if (!layout) return;
    Animated.parallel([
      Animated.spring(indicatorX, { toValue: layout.x, useNativeDriver: false, friction: 8 }),
      Animated.spring(indicatorW, { toValue: layout.width, useNativeDriver: false, friction: 8 }),
    ]).start();
  };

  useEffect(() => {
    moveIndicator(activeSection);
  }, [activeSection]);

  const onTabLayout = (id: BoxDisplaySectionId) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabLayouts.current[id] = { x, width };
    if (id === activeSection) {
      indicatorX.setValue(x);
      indicatorW.setValue(width);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {tabs.map(({ id, navLabel }) => {
          const active = id === activeSection;
          return (
            <TouchableOpacity
              key={id}
              style={styles.tab}
              onLayout={onTabLayout(id)}
              onPress={() => onSelect(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{navLabel}</Text>
            </TouchableOpacity>
          );
        })}
        <Animated.View
          style={[
            styles.indicator,
            {
              left: indicatorX,
              width: indicatorW,
            },
          ]}
        />
      </View>
    </View>
  );
}

/** Figma 370:3524 — section tab row (sentence case, gold rule + black active bar). */
function createNavStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    wrap: {
      paddingTop: spacing.lg,
      paddingHorizontal: isDesktop ? 0 : BOX_DETAIL_TAB_GUTTER,
      backgroundColor: colors.bgPrimary,
      zIndex: 10,
      ...(Platform.OS === 'web' ? { position: 'sticky' as const, top: 0 } : {}),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      position: 'relative',
      borderBottomWidth: 0.5,
      borderBottomColor: 'rgba(216,201,144,0.5)',
      ...(isDesktop ? { justifyContent: 'flex-start', gap: spacing.lg } : null),
    },
    tab: {
      flex: isDesktop ? undefined : 1,
      alignItems: isDesktop ? 'flex-start' : 'center',
      justifyContent: 'center',
      paddingBottom: 8,
      minWidth: isDesktop ? undefined : 0,
      paddingRight: isDesktop ? spacing.sm : 0,
    },
    tabText: {
      fontSize: typography.sm,
      ...typeface('light'),
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
    tabTextActive: {
      ...typeface('regular'),
    },
    indicator: {
      position: 'absolute',
      bottom: 0,
      height: 1,
      backgroundColor: colors.textPrimary,
    },
  });
}
