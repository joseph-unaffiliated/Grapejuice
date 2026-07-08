import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useThemeMode } from '../../context/ThemeContext';
import { LAYOUT, spacing, typography, shadowsWeb } from '../../constants/theme';

const TAB_META: Record<
  string,
  { label: string; icon: (typeof icons)[keyof typeof icons] }
> = {
  Home: { label: 'Home', icon: icons.explosion },
  MyBox: { label: 'My Box', icon: icons.boxOpen },
  Rav: { label: 'Rav', icon: icons.fingerprint },
  Guide: { label: 'Guide', icon: icons.book },
  Account: { label: 'Account', icon: icons.childReaching },
};

/** Left rail navigation for tablet/desktop web. */
export function DesktopSideRail({ state, navigation }: BottomTabBarProps) {
  const { colors } = useThemeMode();
  const primaryRoutes = state.routes.filter((route) => route.name !== 'Account');
  const accountRoute = state.routes.find((route) => route.name === 'Account');

  const renderRoute = (route: (typeof state.routes)[number], index: number) => {
    const focused = state.index === index;
    const meta = TAB_META[route.name] ?? { label: route.name, icon: icons.explosion };
    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };
    return (
      <TouchableOpacity
        key={route.key}
        onPress={onPress}
        style={[styles.item, focused && { backgroundColor: colors.brandLight }]}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
      >
        <Icon icon={meta.icon} size={20} color={focused ? colors.brand : colors.textTertiary} />
        <Text
          style={[
            styles.label,
            { color: focused ? colors.brand : colors.textSecondary },
            focused && styles.labelActive,
          ]}
        >
          {meta.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.rail,
        {
          width: LAYOUT.WEB_SIDEBAR_WIDTH,
          backgroundColor: colors.bgPrimary,
          borderRightColor: colors.border,
        },
        Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined,
      ]}
      testID="desktop-side-rail"
    >
      <Text style={[styles.brand, { color: colors.textPrimary }]}>Grapejuice</Text>
      <View style={styles.navPrimary}>
        {primaryRoutes.map((route) => renderRoute(route, state.routes.indexOf(route)))}
      </View>
      {accountRoute ? (
        <>
          <View style={styles.navSpacer} />
          <View style={styles.navBottom}>
            {renderRoute(accountRoute, state.routes.indexOf(accountRoute))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
    borderRightWidth: 1,
    paddingTop: spacing.lg,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    paddingBottom: spacing.lg,
  },
  brand: {
    fontSize: typography.titleLg,
    fontWeight: '700',
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    marginBottom: spacing.lg,
  },
  navPrimary: { gap: spacing.xs },
  navSpacer: { flex: 1 },
  navBottom: { paddingTop: spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  label: { fontSize: typography.lg, fontWeight: '500' },
  labelActive: { fontWeight: '700' },
});
