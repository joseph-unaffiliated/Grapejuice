import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useNavigationState } from '@react-navigation/native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useThemeMode } from '../../context/ThemeContext';
import { useActiveProfile } from '../../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY } from '../../constants/pilotFeatures';
import { spacing, typography, shadowsWeb } from '../../constants/theme';
import type { MainTabsParamList } from '../../navigation/types';
import { navigateMainTab } from '../../navigation/mainStackNavigation';

type TabName = keyof MainTabsParamList;

type NavItem = {
  name: TabName;
  label: string;
  icon: (typeof icons)[keyof typeof icons];
};

const PARENT_NAV: NavItem[] = [
  { name: 'Home', label: 'Home', icon: icons.explosion },
  { name: 'Rav', label: 'Rav', icon: icons.childReaching },
  { name: 'Account', label: 'Account', icon: icons.fingerprint },
];

function childNav(ravEnabled: boolean): NavItem[] {
  const items: NavItem[] = [
    { name: 'Home', label: 'Home', icon: icons.explosion },
    { name: 'Box', label: 'My picks', icon: icons.boxOpen },
  ];
  if (ravEnabled) {
    items.push({ name: 'Rav', label: 'Rav', icon: icons.childReaching });
  }
  return items;
}

function resolveActiveTab(state: ReturnType<typeof useNavigationState> | undefined): TabName | null {
  if (!state) return null;
  let current = state;
  while (current) {
    const route = current.routes[current.index ?? 0];
    if (
      route.name === 'Home' ||
      route.name === 'Rav' ||
      route.name === 'Account' ||
      route.name === 'Box'
    ) {
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

function splitNavItems(items: NavItem[]) {
  const accountItem = items.find((item) => item.name === 'Account') ?? null;
  const primaryItems = items.filter((item) => item.name !== 'Account');
  return { primaryItems, accountItem };
}

type NavLinkProps = {
  item: NavItem;
  focused: boolean;
  colors: ReturnType<typeof useThemeMode>['colors'];
};

function NavLink({ item, focused, colors }: NavLinkProps) {
  return (
    <TouchableOpacity
      onPress={() => navigateMainTab(item.name)}
      style={[styles.item, focused && { backgroundColor: colors.brandLight }]}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
    >
      <Icon icon={item.icon} size={20} color={focused ? colors.brand : colors.textTertiary} />
      <Text
        style={[
          styles.label,
          { color: focused ? colors.brand : colors.textSecondary },
          focused && styles.labelActive,
        ]}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );
}

type Props = { width: number };

export function WebDesktopNav({ width }: Props) {
  const { colors } = useThemeMode();
  const { isChildProfile, ravEnabledForActiveChild } = useActiveProfile();
  const navState = useNavigationState((s) => s);
  const activeTab = useMemo(() => resolveActiveTab(navState), [navState]);
  const navItems = PILOT_PARENT_ONLY ? PARENT_NAV : isChildProfile ? childNav(ravEnabledForActiveChild) : PARENT_NAV;
  const { primaryItems, accountItem } = useMemo(() => splitNavItems(navItems), [navItems]);

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
      <View style={styles.navPrimary}>
        {primaryItems.map((item) => (
          <NavLink key={item.name} item={item} focused={activeTab === item.name} colors={colors} />
        ))}
      </View>
      {accountItem ? (
        <>
          <View style={styles.navSpacer} />
          <View style={styles.navBottom}>
            <NavLink item={accountItem} focused={activeTab === accountItem.name} colors={colors} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    alignSelf: 'stretch',
    borderRightWidth: 1,
    paddingTop: spacing.xl,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    paddingBottom: spacing.lg,
  },
  brand: {
    fontSize: typography.titleLg,
    fontWeight: '700',
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    marginBottom: spacing.xl,
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
