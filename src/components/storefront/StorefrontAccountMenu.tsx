import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
  Animated,
  useWindowDimensions,
  type View as RNView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useWishlist } from '../../hooks/useWishlist';
import { useReceivedGifts } from '../../hooks/useReceivedGifts';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { usePreviewedIsAuthenticated } from '../../hooks/useUserStatePreview';
import type { MainStackParamList } from '../../navigation/types';
import {
  borderRadius,
  LAYOUT,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

type MenuItem = {
  key: string;
  label: string;
  icon: typeof icons.user;
  onPress: () => void;
  destructive?: boolean;
};

const AVATAR_SIZE = 36;
const AVATAR_BG = semanticColors.bgPrimary;
const DRAWER_MS = 260;
const DRAWER_MAX_WIDTH = 320;

/**
 * Account control: desktop dropdown; mobile right-side sheet with dimmed overlay.
 * Menu items follow the previewed auth state. Admin tools live in AdminControlPanel.
 */
export function StorefrontAccountMenu() {
  const navigation = useNavigation<Nav>();
  const { ids } = useWishlist();
  const { gifts } = useReceivedGifts();
  const logout = useAuthStore((s) => s.logout);
  const startAuthInPlace = useAuthFlowStore((s) => s.startAuthInPlace);
  const isAuthenticated = usePreviewedIsAuthenticated();
  const { width: windowWidth } = useWindowDimensions();
  const compact = windowWidth < LAYOUT.BREAKPOINT_TABLET;
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: MOBILE_GUTTER });
  const [drawerMounted, setDrawerMounted] = useState(false);
  const avatarRef = useRef<RNView>(null);
  const slide = useRef(new Animated.Value(0)).current;

  const drawerWidth = Math.min(DRAWER_MAX_WIDTH, Math.round(windowWidth * 0.82));

  const close = () => {
    setOpen(false);
  };

  const openDesktop = useCallback(() => {
    avatarRef.current?.measureInWindow((x, y, w, h) => {
      const top = y + h + 8;
      const right = Math.max(MOBILE_GUTTER, windowWidth - (x + w));
      setMenuPos({ top, right });
      setOpen(true);
    });
  }, [windowWidth]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    if (compact) {
      setOpen(true);
      return;
    }
    openDesktop();
  };

  useEffect(() => {
    if (!compact) {
      setDrawerMounted(false);
      slide.setValue(0);
      return;
    }
    if (open) {
      setDrawerMounted(true);
      slide.setValue(0);
      Animated.timing(slide, {
        toValue: 1,
        duration: DRAWER_MS,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!drawerMounted) return;
    Animated.timing(slide, {
      toValue: 0,
      duration: DRAWER_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setDrawerMounted(false);
    });
  }, [open, compact, drawerMounted, slide]);

  const items: MenuItem[] = isAuthenticated
    ? [
        {
          key: 'account',
          label: 'Account',
          icon: icons.user,
          onPress: () => navigation.navigate('MainTabs', { screen: 'Account' }),
        },
        {
          key: 'orders',
          label: 'Orders',
          icon: icons.boxOpen,
          onPress: () => navigation.navigate('Orders'),
        },
        {
          key: 'my-gifts',
          label: gifts.length > 0 ? `My Gifts (${gifts.length})` : 'My Gifts',
          icon: icons.gift,
          onPress: () => navigation.navigate('MyGifts'),
        },
        {
          key: 'history',
          label: 'History',
          icon: icons.clockHistory,
          onPress: () => navigation.navigate('History'),
        },
        {
          key: 'favorites',
          label: `Favorites (${ids.length})`,
          icon: icons.heart,
          onPress: () => navigation.navigate('StorefrontFavorites'),
        },
      ]
    : [];

  const authActions: MenuItem[] = isAuthenticated
    ? [
        {
          key: 'signout',
          label: 'Sign out',
          icon: icons.signOut,
          destructive: true,
          onPress: () => {
            void logout();
          },
        },
      ]
    : [
        {
          key: 'signin',
          label: 'Sign in',
          icon: icons.user,
          onPress: () => startAuthInPlace('signin', 'SignInEmail'),
        },
        {
          key: 'signup',
          label: 'Create an account',
          icon: icons.user,
          onPress: () => startAuthInPlace('signup', 'SignUp'),
        },
      ];

  const run = (fn: () => void) => {
    close();
    fn();
  };

  const renderItem = (item: MenuItem) => (
    <TouchableOpacity
      key={item.key}
      style={styles.menuItem}
      onPress={() => run(item.onPress)}
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}
    >
      <Icon
        icon={item.icon}
        size={15}
        color={item.destructive ? semanticColors.goldMuted : semanticColors.logoDark}
      />
      <Text style={[styles.menuLabel, item.destructive && styles.menuLabelMuted]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  const menuItems = items.map(renderItem);
  const authItems = authActions.map(renderItem);
  const showAuthDivider = menuItems.length > 0;

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [drawerWidth, 0],
  });
  const backdropOpacity = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  });

  return (
    <View style={styles.wrap}>
      <View ref={avatarRef} collapsable={false}>
        <TouchableOpacity
          style={[styles.avatar, open && styles.avatarOpen]}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel="Account menu"
          accessibilityState={{ expanded: open }}
        >
          <Icon icon={icons.user} size={16} color={semanticColors.logoDark} />
        </TouchableOpacity>
      </View>

      {!compact && open ? (
        <Modal visible transparent animationType="fade" onRequestClose={close}>
          <View style={styles.modalRoot} pointerEvents="box-none">
            <Pressable
              style={styles.desktopBackdrop}
              onPress={close}
              accessibilityLabel="Dismiss account menu"
            />
            <View
              style={[styles.dropdown, { top: menuPos.top, right: menuPos.right }]}
              accessibilityRole="menu"
            >
              {menuItems}
              {showAuthDivider ? <View style={styles.menuDivider} /> : null}
              {authItems}
            </View>
          </View>
        </Modal>
      ) : null}

      {compact && drawerMounted ? (
        <Modal visible={drawerMounted} transparent animationType="none" onRequestClose={close}>
          <View style={styles.modalRoot}>
            <Animated.View style={[styles.mobileBackdrop, { opacity: backdropOpacity }]}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={close}
                accessibilityLabel="Dismiss account menu"
              />
            </Animated.View>
            <Animated.View
              style={[
                styles.drawer,
                {
                  width: drawerWidth,
                  transform: [{ translateX }],
                },
              ]}
              accessibilityRole="menu"
              accessibilityLabel="Account menu"
            >
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Account</Text>
                <TouchableOpacity
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel="Close account menu"
                  hitSlop={12}
                  style={styles.closeHit}
                >
                  <Icon icon={icons.close} size={18} color={semanticColors.logoDark} />
                </TouchableOpacity>
              </View>
              <View style={styles.drawerBody}>{menuItems}</View>
              <View style={styles.drawerFooter}>
                {showAuthDivider ? <View style={styles.menuDivider} /> : null}
                {authItems}
              </View>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    zIndex: 5,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: AVATAR_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.goldMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOpen: {
    borderColor: semanticColors.brand,
  },
  modalRoot: {
    flex: 1,
  },
  desktopBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  mobileBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  dropdown: {
    position: 'absolute',
    minWidth: 248,
    maxWidth: 320,
    maxHeight: '80%',
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    paddingVertical: spacing.xs,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 8px 24px rgba(17, 2, 34, 0.12)',
          overflow: 'auto',
        } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 8,
        }),
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: semanticColors.bgPrimary,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '-8px 0 32px rgba(17, 2, 34, 0.18)',
        } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: -8, height: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
          elevation: 16,
        }),
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  drawerTitle: {
    ...typeface('medium'),
    fontSize: 18,
    color: semanticColors.logoDark,
    letterSpacing: -0.3,
  },
  closeHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerBody: {
    flex: 1,
    paddingVertical: spacing.xs,
  },
  drawerFooter: {
    paddingBottom: spacing.lg,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.border,
    marginVertical: spacing.xs,
    marginHorizontal: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  menuLabel: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  menuLabelMuted: {
    color: semanticColors.goldMuted,
  },
});
