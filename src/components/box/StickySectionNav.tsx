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
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  activeSection: BoxDisplaySectionId;
  onSelect: (id: BoxDisplaySectionId) => void;
};

export function StickySectionNav({ activeSection, onSelect }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createNavStyles(colors), [colors]);
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
        {BOX_DISPLAY_SECTIONS.map(({ id, navLabel }) => {
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
function createNavStyles(colors: SemanticColors) {
  return StyleSheet.create({
    wrap: {
      paddingVertical: spacing.lg,
      paddingHorizontal: BOX_DETAIL_TAB_GUTTER,
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
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 8,
      minWidth: 0,
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
