import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useThemeMode } from '../../context/ThemeContext';
import { MOBILE_GUTTER, shadows, TAB_NAV } from '../../constants/theme';

/** Figma 366:1799 — icons vertically centered in padded footer row. */
export function PilotTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors } = useThemeMode();
  const bottomInset = Platform.OS === 'web' ? 0 : Math.max(insets.bottom, 0);

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: TAB_NAV.padTop,
          paddingBottom: TAB_NAV.padBottom + bottomInset,
          backgroundColor: colors.bgPrimary,
          borderTopColor: colors.border,
        },
        Platform.OS === 'web' ? styles.barWeb : shadows.goldGlow,
      ]}
    >
      <View style={styles.iconRow}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const color = isFocused
            ? options.tabBarActiveTintColor ?? colors.textPrimary
            : options.tabBarInactiveTintColor ?? colors.goldMuted;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}
            >
              {options.tabBarIcon?.({ focused: isFocused, color, size: TAB_NAV.iconSize })}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    paddingHorizontal: MOBILE_GUTTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barWeb: {
    boxShadow: '0px -4px 12px rgba(216, 201, 144, 0.50)',
  } as object,
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: TAB_NAV.iconGap,
    minHeight: TAB_NAV.iconSize,
  },
  tabButton: {
    width: TAB_NAV.iconSize,
    height: TAB_NAV.iconSize,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ padding: 0, margin: 0, minHeight: 0, border: 'none', backgroundColor: 'transparent' } as object)
      : null),
  },
});
