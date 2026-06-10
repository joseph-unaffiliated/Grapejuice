import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useNavigationState } from '@react-navigation/native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useThemeMode } from '../../context/ThemeContext';
import { LAYOUT, spacing, typography, shadowsWeb } from '../../constants/theme';
import type { MainTabsParamList, MainStackParamList } from '../../navigation/types';
import { navigateMainTab, navigateMainStack } from '../../navigation/mainStackNavigation';

type TabName = keyof MainTabsParamList;

const NAV_ITEMS: {
  name: TabName | 'Guide';
  label: string;
  icon: (typeof icons)[keyof typeof icons];
  stack?: keyof MainStackParamList;
}[] = [
  { name: 'Home', label: 'Home', icon: icons.explosion },
  { name: 'Rav', label: 'Rav', icon: icons.childReaching },
  { name: 'Guide', label: 'Guide', icon: icons.book, stack: 'Guide' },
  { name: 'Account', label: 'Account', icon: icons.fingerprint },
];

function resolveActiveTab(state: ReturnType<typeof useNavigationState> | undefined): TabName | null {
  if (!state) return null;
  let current = state;
  while (current) {
    const route = current.routes[current.index ?? 0];
    if (route.name === 'Home' || route.name === 'Rav' || route.name === 'Account') {
      return route.name as TabName;
    }
    if (route.state) {
      current = route.state as typeof state;
      continue;
    }
    break;
  }
  return null;
}

type Props = { width: number };

export function WebDesktopNav({ width }: Props) {
  const { colors } = useThemeMode();
  const navState = useNavigationState((s) => s);
  const activeTab = useMemo(() => resolveActiveTab(navState), [navState]);

  return (
    <View
      style={[
        styles.rail,
        {
          width,
          backgroundColor: colors.bgPrimary,
          borderRightColor: colors.border,
        },
        Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined,
      ]}
      testID="desktop-side-rail"
    >
      <Text style={[styles.brand, { color: colors.textPrimary }]}>Grapejuice</Text>
      <View style={styles.nav}>
        {NAV_ITEMS.map(({ name, label, icon, stack }) => {
          const focused = stack ? false : activeTab === name;
          return (
            <TouchableOpacity
              key={name}
              onPress={() => (stack ? navigateMainStack(stack) : navigateMainTab(name as TabName))}
              style={[styles.item, focused && { backgroundColor: colors.brandLight }]}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
            >
              <Icon icon={icon} size={20} color={focused ? colors.brand : colors.textTertiary} />
              <Text
                style={[
                  styles.label,
                  { color: focused ? colors.brand : colors.textSecondary },
                  focused && styles.labelActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderRightWidth: 1,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
  },
  brand: {
    fontSize: typography.titleLg,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xl,
  },
  nav: { gap: spacing.xs },
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
