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
  Alert,
  useWindowDimensions,
  type View as RNView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { AdminPreviewCalendar } from './AdminPreviewCalendar';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useWishlist } from '../../hooks/useWishlist';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { usePreviewedIsAuthenticated } from '../../hooks/useUserStatePreview';
import {
  useUserStatePreviewStore,
  USER_STATE_PREVIEW_OPTIONS,
  formatPreviewNowIso,
  type UserStatePreview,
} from '../../stores/userStatePreviewStore';
import { getHanukkahConfig } from '../../services/firestore/config';
import { getHanukkahWindow } from '../../services/hanukkah/dates';
import { resetTesterBox } from '../../services/admin/resetTesterBox';
import { isAdminEmail } from '../../constants/admin';
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
const MENU_GAP = 8;
const DRAWER_MS = 260;
const DRAWER_MAX_WIDTH = 320;

/**
 * Account control: desktop dropdown; mobile right-side sheet with dimmed overlay.
 * Menu items follow the previewed auth state. Admins get a “Preview as…” section.
 */
export function StorefrontAccountMenu() {
  const navigation = useNavigation<Nav>();
  const { ids } = useWishlist();
  const { household, refresh } = useSession();
  const realUserEmail = useAuthStore((s) => s.user?.email);
  const logout = useAuthStore((s) => s.logout);
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const isAuthenticated = usePreviewedIsAuthenticated();
  const preview = useUserStatePreviewStore((s) => s.preview);
  const setPreview = useUserStatePreviewStore((s) => s.setPreview);
  const previewNowIso = useUserStatePreviewStore((s) => s.previewNowIso);
  const setPreviewNowIso = useUserStatePreviewStore((s) => s.setPreviewNowIso);
  const showPreviewControls =
    isAdminEmail(realUserEmail) || (typeof __DEV__ !== 'undefined' && __DEV__);
  const { width: windowWidth } = useWindowDimensions();
  const compact = windowWidth < LAYOUT.BREAKPOINT_TABLET;
  const [open, setOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [resettingBox, setResettingBox] = useState(false);
  const [datePresets, setDatePresets] = useState<{ label: string; iso: string }[]>([]);
  const [markerIsos, setMarkerIsos] = useState<string[]>([]);
  const [menuPos, setMenuPos] = useState({ top: 0, right: MOBILE_GUTTER });
  const [drawerMounted, setDrawerMounted] = useState(false);
  const avatarRef = useRef<RNView>(null);
  const slide = useRef(new Animated.Value(0)).current;

  const drawerWidth = Math.min(DRAWER_MAX_WIDTH, Math.round(windowWidth * 0.82));

  useEffect(() => {
    if (!showPreviewControls || !previewExpanded) return;
    let cancelled = false;
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      const toDay = (raw: string | null | undefined): string | null => {
        if (!raw?.trim()) return null;
        const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
        return m?.[1] ?? null;
      };
      const lock = toDay(config.lockAt);
      const ship = toDay(config.estimatedDeliveryBy);
      const hanukkah = toDay(config.startsOn) ?? '2026-12-05';
      const presets: { label: string; iso: string }[] = [];
      const push = (label: string, iso: string | null) => {
        if (!iso || presets.some((p) => p.iso === iso)) return;
        presets.push({ label, iso });
      };
      // Mid-customize: ~2 weeks before lock when possible
      if (lock) {
        const [y, m, d] = lock.split('-').map(Number);
        const before = new Date(y, m - 1, d - 14, 12);
        push('Before lock', formatPreviewNowIso(before));
        push('Lock day', lock);
        const afterLock = new Date(y, m - 1, d + 3, 12);
        push('After lock', formatPreviewNowIso(afterLock));
      }
      push('Ships', ship);
      push('Hanukkah', hanukkah);
      const { endDate } = getHanukkahWindow(config.startsOn);
      const after = new Date(endDate);
      after.setDate(after.getDate() + 1);
      push('After Hanukkah', formatPreviewNowIso(after));
      setDatePresets(presets);
      setMarkerIsos(
        [lock, ship, hanukkah, formatPreviewNowIso(after)].filter((v): v is string => Boolean(v))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [showPreviewControls, previewExpanded]);

  const close = () => {
    setOpen(false);
    setPreviewExpanded(false);
  };

  const openDesktop = useCallback(() => {
    avatarRef.current?.measureInWindow((x, y, w, h) => {
      setMenuPos({
        top: y + h + MENU_GAP,
        right: Math.max(MOBILE_GUTTER, windowWidth - (x + w)),
      });
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
          key: 'history',
          label: 'History',
          icon: icons.clockHistory,
          onPress: () => navigation.navigate('History'),
        },
        {
          key: 'favorites',
          label: `Favorites (${ids.length})`,
          icon: icons.heart,
          onPress: () => navigation.navigate('MainTabs', { screen: 'Account' }),
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
          onPress: () => startAuthFromGuest('Account', 'signin', 'SignInEmail'),
        },
        {
          key: 'signup',
          label: 'Create an account',
          icon: icons.user,
          onPress: () => startAuthFromGuest('Account', 'signup', 'SignUp'),
        },
      ];

  const run = (fn: () => void) => {
    close();
    fn();
  };

  const selectPreview = (next: UserStatePreview | null) => {
    setPreview(next);
    // Keep the menu open so admins can flip states quickly.
  };

  const performResetBox = useCallback(async () => {
    setResettingBox(true);
    try {
      const result = await resetTesterBox(household?.id);
      await refresh({ silent: true });
      setOpen(false);
      setPreviewExpanded(false);
      // Signed-in users are routed into onboarding by RootNavigator after refresh.
      if (!result.restartedOnboarding) {
        navigation.navigate('StorefrontHome');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not reset box.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(message);
      } else {
        Alert.alert('Reset failed', message);
      }
    } finally {
      setResettingBox(false);
    }
  }, [household?.id, navigation, refresh]);

  const confirmResetBox = () => {
    if (resettingBox) return;
    const title = 'Reset box?';
    const body =
      'Clears your current Hanukkah box and curation progress so you can build again from scratch. Account and kids are kept.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${body}`)) {
        void performResetBox();
      }
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset box', style: 'destructive', onPress: () => void performResetBox() },
    ]);
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

  const activePreviewLabel =
    USER_STATE_PREVIEW_OPTIONS.find((opt) => opt.id === preview)?.label ?? 'Live (you)';
  const previewActive = Boolean(preview || previewNowIso);
  const previewHint = previewNowIso
    ? `${activePreviewLabel} · ${previewNowIso}`
    : activePreviewLabel;

  const previewSection = showPreviewControls ? (
    <View style={styles.previewSection}>
      <TouchableOpacity
        style={styles.previewToggle}
        onPress={() => setPreviewExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: previewExpanded }}
        accessibilityLabel={`Preview as, ${previewHint}`}
      >
        <View style={styles.previewToggleCopy}>
          <Text style={styles.previewHeading}>Preview as</Text>
          {!previewExpanded ? (
            <Text style={styles.previewActiveHint} numberOfLines={1}>
              {previewHint}
            </Text>
          ) : null}
        </View>
        <Icon
          icon={icons.chevronDown}
          size={12}
          color={semanticColors.goldMuted}
          style={previewExpanded ? styles.previewChevronOpen : undefined}
        />
      </TouchableOpacity>
      {previewExpanded ? (
        <>
          {USER_STATE_PREVIEW_OPTIONS.map((opt) => {
            const selected = preview === opt.id;
            return (
              <TouchableOpacity
                key={opt.id ?? 'live'}
                style={[styles.previewRow, selected && styles.previewRowSelected]}
                onPress={() => selectPreview(opt.id)}
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
                accessibilityLabel={`Preview as ${opt.label}`}
              >
                <View style={[styles.previewRadio, selected && styles.previewRadioOn]} />
                <View style={styles.previewCopy}>
                  <Text style={[styles.previewLabel, selected && styles.previewLabelSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.previewDesc}>{opt.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={styles.dateBlock}>
            <Text style={styles.previewHeading}>Preview date</Text>
            <Text style={styles.previewDesc}>
              Moves timeline pin and countdown copy. Live mode also uses this for lock.
            </Text>
            {datePresets.length ? (
              <View style={styles.datePresets}>
                {datePresets.map((p) => {
                  const selected = previewNowIso === p.iso;
                  return (
                    <TouchableOpacity
                      key={p.iso}
                      style={[styles.dateChip, selected && styles.dateChipSelected]}
                      onPress={() => setPreviewNowIso(p.iso)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Preview date ${p.label}`}
                    >
                      <Text style={[styles.dateChipText, selected && styles.dateChipTextSelected]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            <AdminPreviewCalendar
              valueIso={previewNowIso}
              onChangeIso={setPreviewNowIso}
              markerIsos={markerIsos}
            />
            {previewNowIso ? (
              <Text style={styles.previewDesc}>Previewing {previewNowIso}</Text>
            ) : (
              <Text style={styles.previewDesc}>Using real today</Text>
            )}
          </View>
        </>
      ) : null}
      <TouchableOpacity
        style={styles.previewRow}
        onPress={confirmResetBox}
        disabled={resettingBox}
        accessibilityRole="menuitem"
        accessibilityLabel="Reset box"
        accessibilityState={{ disabled: resettingBox }}
      >
        <Icon
          icon={icons.trash}
          size={14}
          color={semanticColors.goldMuted}
          style={styles.resetIcon}
        />
        <View style={styles.previewCopy}>
          <Text style={[styles.previewLabel, styles.resetLabel]}>
            {resettingBox ? 'Resetting…' : 'Reset box'}
          </Text>
          <Text style={styles.previewDesc}>
            Clear curated box and restart onboarding / reveal
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.menuDivider} />
    </View>
  ) : null;

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
          style={[styles.avatar, open && styles.avatarOpen, previewActive && styles.avatarPreview]}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={previewActive ? 'Account menu, preview active' : 'Account menu'}
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
              {previewSection}
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
              <View style={styles.drawerBody}>
                {previewSection}
                {menuItems}
              </View>
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
  avatarPreview: {
    borderWidth: 2,
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
    marginHorizontal: spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  menuLabel: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
  },
  menuLabelMuted: {
    color: semanticColors.goldMuted,
  },
  previewSection: {
    paddingTop: spacing.xs,
  },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  previewToggleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  previewHeading: {
    ...typeface('medium'),
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: semanticColors.goldMuted,
  },
  previewActiveHint: {
    ...typeface('regular'),
    fontSize: 13,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
  },
  previewChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  previewRowSelected: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
  },
  previewRadio: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: semanticColors.border,
    marginTop: 2,
  },
  previewRadioOn: {
    borderColor: semanticColors.brand,
    backgroundColor: semanticColors.brand,
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
  },
  previewLabel: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
  },
  previewLabelSelected: {
    ...typeface('medium'),
  },
  resetIcon: {
    marginTop: 2,
  },
  resetLabel: {
    color: semanticColors.goldMuted,
  },
  previewDesc: {
    ...typeface('regular'),
    fontSize: 12,
    color: semanticColors.goldMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  dateBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  datePresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  dateChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: semanticColors.bgDark,
  },
  dateChipSelected: {
    borderColor: semanticColors.brand,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
  },
  dateChipText: {
    ...typeface('regular'),
    fontSize: 11,
    color: semanticColors.goldMuted,
  },
  dateChipTextSelected: {
    ...typeface('medium'),
    color: semanticColors.logoDark,
  },
});
