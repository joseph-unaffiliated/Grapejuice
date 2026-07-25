import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useWebSidebar } from '../../context/WebSidebarContext';

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
const COLLAPSE_ICON_SIZE = 10;
const COLLAPSE_BTN_PADDING = 4;
const COLLAPSE_BTN_WIDTH = COLLAPSE_BTN_PADDING * 2 + COLLAPSE_ICON_SIZE;

const CHEVRON_FLIP_TRANSITION =
  Platform.OS === 'web' ? ({ transition: `transform ${ANIM_MS}ms ease` } as object) : {};

/** Mouse clicks should not move focus — avoids the browser focus-ring flash on press. */
const WEB_SUPPRESS_MOUSE_FOCUS =
  Platform.OS === 'web'
    ? ({
        onMouseDown: (e: { preventDefault(): void }) => e.preventDefault(),
      } as object)
    : {};

const railWidthFor = (collapsed: boolean) =>
  collapsed ? LAYOUT.WEB_SIDEBAR_COLLAPSED_WIDTH : LAYOUT.WEB_SIDEBAR_WIDTH;

const railPadLeftFor = (collapsed: boolean) =>
  collapsed ? LAYOUT.WEB_SIDEBAR_COLLAPSED_GUTTER : spacing.lg;

const railPadRightFor = (collapsed: boolean) =>
  collapsed ? LAYOUT.WEB_SIDEBAR_COLLAPSED_GUTTER : spacing.md;

/** Chevron `left` from the rail border (RN Web absolute positioning). */
const expandedChevronLeft = () =>
  LAYOUT.WEB_SIDEBAR_WIDTH - railPadRightFor(false) - spacing.sm - COLLAPSE_BTN_WIDTH;

/** Same horizontal midpoint as collapsed nav icons (WEB_SIDEBAR_COLLAPSED_ITEM). */
const collapsedChevronLeft = () =>
  LAYOUT.WEB_SIDEBAR_COLLAPSED_ITEM - COLLAPSE_BTN_WIDTH / 2;

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
  const { setLayoutSidebarWidth } = useWebSidebar()!;
  const { isChildProfile, ravEnabledForActiveChild } = useActiveProfile();
  const navState = useNavigationState((s) => s);
  const activeTab = useMemo(() => resolveActiveTab(navState), [navState]);
  const navItems = PILOT_PARENT_ONLY ? PARENT_NAV : isChildProfile ? childNav(ravEnabledForActiveChild) : PARENT_NAV;
  const { primaryItems, accountItem } = useMemo(() => splitNavItems(navItems), [navItems]);
  const [logoHover, setLogoHover] = useState(false);

  useEffect(() => {
    if (collapsed) setLogoHover(false);
  }, [collapsed]);

  const railWidth = useRef(new Animated.Value(railWidthFor(collapsed))).current;
  const railPadLeft = useRef(new Animated.Value(railPadLeftFor(collapsed))).current;
  const railPadRight = useRef(new Animated.Value(railPadRightFor(collapsed))).current;
  const iconShift = useRef(new Animated.Value(collapsed ? COLLAPSED_ICON_TRANSLATE_X : 0)).current;
  const fadeOpacity = useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  const labelSlotWidth = useRef(new Animated.Value(collapsed ? 0 : LABEL_SLOT_WIDTH)).current;
  const labelMargin = useRef(new Animated.Value(collapsed ? 0 : spacing.sm)).current;
  const collapseProgress = useRef(new Animated.Value(collapsed ? 1 : 0)).current;

  const chevronLeft = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [expandedChevronLeft(), collapsedChevronLeft()],
  });

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
      Animated.timing(collapseProgress, { ...anim, toValue: collapsed ? 1 : 0 }),
    ]).start(({ finished }) => {
      if (finished) setLayoutSidebarWidth(railWidthFor(collapsed));
    });
  }, [
    collapseProgress,
    collapsed,
    fadeOpacity,
    iconShift,
    labelMargin,
    labelSlotWidth,
    railPadLeft,
    railPadRight,
    railWidth,
    setLayoutSidebarWidth,
  ]);

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
        Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldBar } : undefined,
      ]}
      testID="desktop-side-rail"
    >
      <Animated.View style={[styles.collapseBtnAnchor, { top: spacing.xl, left: chevronLeft }]}>
        <TouchableOpacity
          style={styles.collapseBtn}
          onPress={onToggleCollapse}
          testID="sidebar-collapse-btn"
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          {...WEB_SUPPRESS_MOUSE_FOCUS}
        >
          <View
            style={[
              CHEVRON_FLIP_TRANSITION,
              collapsed ? { transform: [{ scaleX: -1 }] } : undefined,
            ]}
          >
            <Icon icon={icons.chevronsLeft} size={COLLAPSE_ICON_SIZE} color={colors.goldMuted} />
          </View>
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.brandHeader}>
        <View style={styles.collapseRowSpacer} />
        <View style={styles.logoRow}>
          <Animated.View
            style={[
              styles.logoAnchor,
              {
                opacity: fadeOpacity,
                transform: [{ translateX: iconShift }],
              },
              Platform.OS === 'web' ? ({ cursor: 'default' } as object) : null,
            ]}
            pointerEvents={collapsed ? 'none' : 'auto'}
            {...(Platform.OS === 'web'
              ? ({
                  'aria-hidden': collapsed,
                  onMouseEnter: () => setLogoHover(true),
                  onMouseLeave: () => setLogoHover(false),
                } as object)
              : {})}
          >
            <GrapejuiceBrandMark variant="sidebar" align="left" animating={logoHover} loop={false} />
          </Animated.View>
        </View>
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
    position: 'relative',
    borderRightWidth: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
    zIndex: 30,
  },
  brandHeader: {
    marginBottom: spacing.xl,
    width: '100%',
    gap: spacing.xs,
  },
  collapseRowSpacer: {
    width: '100%',
    height: COLLAPSE_BTN_WIDTH,
  },
  collapseBtnAnchor: {
    position: 'absolute',
    justifyContent: 'center',
    zIndex: 1,
  },
  logoRow: {
    position: 'relative',
    width: '100%',
    minHeight: NAV_ICON_SIZE + spacing.sm * 2,
  },
  logoAnchor: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
  },
  collapseBtn: {
    flexShrink: 0,
    padding: COLLAPSE_BTN_PADDING,
    borderRadius: 4,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' } as object)
      : {}),
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
