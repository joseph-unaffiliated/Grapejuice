import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated, Easing } from 'react-native';
import { useNavigationState } from '@react-navigation/native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { useThemeMode } from '../../context/ThemeContext';
import { useActiveProfile } from '../../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY } from '../../constants/pilotFeatures';
import { LAYOUT, spacing, typography, shadowsWeb } from '../../constants/theme';
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

const ANIM_MS = 220;
const NAV_ICON_SIZE = 20;
const LABEL_SLOT_WIDTH = 160;

const CHEVRON_FLIP_TRANSITION =
  Platform.OS === 'web' ? ({ transition: `transform ${ANIM_MS}ms ease` } as object) : {};

const railWidthFor = (collapsed: boolean) =>
  collapsed ? LAYOUT.WEB_SIDEBAR_COLLAPSED_WIDTH : LAYOUT.WEB_SIDEBAR_WIDTH;

const railPadLeftFor = (collapsed: boolean) =>
  collapsed ? LAYOUT.WEB_SIDEBAR_COLLAPSED_GUTTER : spacing.lg;

const railPadRightFor = (collapsed: boolean) =>
  collapsed ? LAYOUT.WEB_SIDEBAR_COLLAPSED_GUTTER : spacing.md;

/** Shift icon center to rail midpoint when collapsed (padding animation handles the rest). */
const COLLAPSED_ICON_TRANSLATE_X =
  LAYOUT.WEB_SIDEBAR_COLLAPSED_WIDTH / 2 -
  (LAYOUT.WEB_SIDEBAR_COLLAPSED_GUTTER + spacing.sm + NAV_ICON_SIZE / 2);

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
  iconShift: Animated.Value;
  fadeOpacity: Animated.Value;
  labelSlotWidth: Animated.Value;
  labelMargin: Animated.Value;
  colors: ReturnType<typeof useThemeMode>['colors'];
};

function NavLink({ item, focused, iconShift, fadeOpacity, labelSlotWidth, labelMargin, colors }: NavLinkProps) {
  return (
    <TouchableOpacity
      onPress={() => navigateMainTab(item.name)}
      style={[styles.item, focused && { backgroundColor: colors.brandLight }]}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={item.label}
    >
      <Animated.View style={[styles.iconSlot, { transform: [{ translateX: iconShift }] }]}>
        <Icon
          icon={item.icon}
          size={NAV_ICON_SIZE}
          color={focused ? colors.brand : colors.textTertiary}
        />
      </Animated.View>
      <Animated.View
        style={{
          opacity: fadeOpacity,
          width: labelSlotWidth,
          marginLeft: labelMargin,
          overflow: 'hidden',
        }}
      >
        <Text
          style={[
            styles.label,
            { color: focused ? colors.brand : colors.textSecondary },
            focused && styles.labelActive,
          ]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
};

export function WebDesktopNav({ collapsed, onToggleCollapse }: Props) {
  const { colors } = useThemeMode();
  const { isChildProfile, ravEnabledForActiveChild } = useActiveProfile();
  const navState = useNavigationState((s) => s);
  const activeTab = useMemo(() => resolveActiveTab(navState), [navState]);
  const navItems = PILOT_PARENT_ONLY ? PARENT_NAV : isChildProfile ? childNav(ravEnabledForActiveChild) : PARENT_NAV;
  const { primaryItems, accountItem } = useMemo(() => splitNavItems(navItems), [navItems]);

  const railWidth = useRef(new Animated.Value(railWidthFor(collapsed))).current;
  const railPadLeft = useRef(new Animated.Value(railPadLeftFor(collapsed))).current;
  const railPadRight = useRef(new Animated.Value(railPadRightFor(collapsed))).current;
  const iconShift = useRef(new Animated.Value(collapsed ? COLLAPSED_ICON_TRANSLATE_X : 0)).current;
  const fadeOpacity = useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  const labelSlotWidth = useRef(new Animated.Value(collapsed ? 0 : LABEL_SLOT_WIDTH)).current;
  const labelMargin = useRef(new Animated.Value(collapsed ? 0 : spacing.sm)).current;

  useEffect(() => {
    const anim = {
      duration: ANIM_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    };

    Animated.parallel([
      Animated.timing(railWidth, { ...anim, toValue: railWidthFor(collapsed) }),
      Animated.timing(railPadLeft, { ...anim, toValue: railPadLeftFor(collapsed) }),
      Animated.timing(railPadRight, { ...anim, toValue: railPadRightFor(collapsed) }),
      Animated.timing(iconShift, {
        ...anim,
        toValue: collapsed ? COLLAPSED_ICON_TRANSLATE_X : 0,
      }),
      Animated.timing(fadeOpacity, { ...anim, toValue: collapsed ? 0 : 1 }),
      Animated.timing(labelSlotWidth, { ...anim, toValue: collapsed ? 0 : LABEL_SLOT_WIDTH }),
      Animated.timing(labelMargin, { ...anim, toValue: collapsed ? 0 : spacing.sm }),
    ]).start();
  }, [collapsed, fadeOpacity, iconShift, labelMargin, labelSlotWidth, railPadLeft, railPadRight, railWidth]);

  return (
    <Animated.View
      style={[
        styles.rail,
        {
          width: railWidth,
          paddingLeft: railPadLeft,
          paddingRight: railPadRight,
          backgroundColor: colors.bgPrimary,
          borderRightColor: colors.border,
        },
        Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined,
      ]}
      testID="desktop-side-rail"
    >
      <View
        style={[
          styles.brandHeaderRow,
          collapsed ? styles.brandHeaderRowCollapsed : styles.brandHeaderRowExpanded,
        ]}
      >
        <Animated.View
          style={[styles.logoAnchor, { opacity: fadeOpacity }]}
          pointerEvents={collapsed ? 'none' : 'auto'}
          aria-hidden={collapsed}
        >
          <GrapejuiceBrandMark variant="sidebar" align="left" />
        </Animated.View>
        <TouchableOpacity
          style={[styles.collapseBtn, !collapsed && styles.collapseBtnExpanded]}
          onPress={onToggleCollapse}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <View
            style={[
              CHEVRON_FLIP_TRANSITION,
              collapsed ? { transform: [{ scaleX: -1 }] } : undefined,
            ]}
          >
            <Icon icon={icons.chevronsLeft} size={14} color={colors.textTertiary} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.navPrimary}>
        {primaryItems.map((item) => (
          <NavLink
            key={item.name}
            item={item}
            focused={activeTab === item.name}
            iconShift={iconShift}
            fadeOpacity={fadeOpacity}
            labelSlotWidth={labelSlotWidth}
            labelMargin={labelMargin}
            colors={colors}
          />
        ))}
      </View>
      {accountItem ? (
        <>
          <View style={styles.navSpacer} />
          <View style={styles.navBottom}>
            <NavLink
              item={accountItem}
              focused={activeTab === accountItem.name}
              iconShift={iconShift}
              fadeOpacity={fadeOpacity}
              labelSlotWidth={labelSlotWidth}
              labelMargin={labelMargin}
              colors={colors}
            />
          </View>
        </>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexShrink: 0,
    alignSelf: 'stretch',
    borderRightWidth: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
  },
  brandHeaderRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
    minHeight: 22,
    width: '100%',
    paddingLeft: spacing.sm,
  },
  brandHeaderRowExpanded: {
    justifyContent: 'flex-end',
  },
  brandHeaderRowCollapsed: {
    justifyContent: 'center',
  },
  logoAnchor: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  collapseBtn: {
    flexShrink: 0,
    padding: spacing.xs,
    borderRadius: 6,
  },
  collapseBtnExpanded: {
    marginLeft: 'auto',
  },
  navPrimary: { gap: spacing.xs, width: '100%', alignItems: 'stretch' },
  navSpacer: { flex: 1 },
  navBottom: { paddingTop: spacing.md, width: '100%', alignItems: 'stretch' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  iconSlot: {
    width: NAV_ICON_SIZE,
    height: NAV_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    fontSize: typography.lg,
    fontWeight: '500',
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as object) : {}),
  },
  labelActive: { fontWeight: '700' },
});
