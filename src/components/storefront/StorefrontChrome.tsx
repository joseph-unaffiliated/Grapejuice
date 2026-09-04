import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  View,
  StyleSheet,
  Platform,
  ScrollView,
  Animated,
  useWindowDimensions,
  RefreshControl,
  ActivityIndicator,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation, useIsFocused, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontPromoStrip } from './StorefrontPromoStrip';
import { StorefrontHeader } from './StorefrontHeader';
import { StorefrontServicesNav, type StorefrontServiceId } from './StorefrontServicesNav';
import { StorefrontCategoryNav } from './StorefrontCategoryNav';
import { StorefrontFooter } from './StorefrontFooter';
import { StorefrontRavDrawer } from './StorefrontRavDrawer';
import {
  StorefrontRavProvider,
  useStorefrontRav,
  isStorefrontRavOpenable,
  openStorefrontRav,
} from './storefrontRavContext';
import {
  StorefrontLeaveProvider,
  type StorefrontLeaveTarget,
} from './storefrontLeaveContext';
import type { MainStackParamList } from '../../navigation/types';
import { openBoxSurface } from '../../navigation/boxEntry';
import { usePreviewedHasStartedBox, usePreviewedIsAuthenticated } from '../../hooks/useUserStatePreview';
import { useSession } from '../../hooks/useSession';
import { LAYOUT, semanticColors, spacing } from '../../constants/theme';
import {
  STOREFRONT_SCROLL_CLASS,
  STOREFRONT_H_SCROLL_CLASS,
} from './storefrontScroll';

export { STOREFRONT_SCROLL_CLASS, STOREFRONT_H_SCROLL_CLASS } from './storefrontScroll';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  children: ReactNode;
  /** Highlights the active aisle in the product-type bar. */
  activeCategory?: string;
  onShopLook?: () => void;
  /** Optional ref to the page ScrollView (e.g. home “scroll to look”). */
  scrollRef?: Ref<ScrollView>;
  /**
   * Extra ScrollView contentContainerStyle. Avoid horizontal padding here —
   * it insets chrome + footer; put gutters on children instead (see /store).
   */
  contentContainerStyle?: object;
  /**
   * `scroll` (default): page ScrollView + footer.
   * `fill`: children own the body viewport (onboarding / box reveal wizard).
   */
  bodyMode?: 'scroll' | 'fill';
  /**
   * When set, chrome / header leave actions call this instead of MainStack
   * navigate — used while the root gate is still Onboarding.
   */
  onLeave?: (target: StorefrontLeaveTarget) => void;
  /**
   * Hide both the primary services strip and the secondary (category / slot) bar.
   */
  hideServicesNav?: boolean;
  /**
   * Mobile only: hide the search pill + Ask Rav row under the logo bar
   * (e.g. My Box / reveal — keep menu, mark, account, cart only).
   */
  hideSearchAndRav?: boolean;
  /**
   * Optional replacement for the black secondary bar only (e.g. My Box practice
   * section links). Primary `StorefrontServicesNav` still renders above it.
   * Pass `null` to keep the services strip and omit the secondary bar.
   * Omit / `undefined` to keep the default category nav.
   */
  servicesSlot?: ReactNode;
  /**
   * Card pinned above the page bottom (e.g. the guest favorites sign-up
   * prompt). Adds scroll clearance so it can't sit on top of the footer.
   */
  floatingFooter?: ReactNode;
};

type ChromeProps = {
  activeCategory?: string;
  onLogoPress: () => void;
  onService: (id: StorefrontServiceId) => void;
  onCategory: (slug: string) => void;
  hideServicesNav?: boolean;
  hideSearchAndRav?: boolean;
  servicesSlot?: ReactNode;
  showPromoStrip?: boolean;
  onHeaderStackLayout?: (height: number) => void;
  /** `sticky` — compact scroll overlay (menu · search · account · cart only). */
  chromeVariant?: 'full' | 'sticky';
};

/** Fallback when header stack hasn’t measured — ~promo-or-not + header row. */
const RAV_HEADER_FALLBACK_H = 96;

function StorefrontChromeBlocks({
  activeCategory,
  onLogoPress,
  onService,
  onCategory,
  hideServicesNav,
  hideSearchAndRav,
  servicesSlot,
  showPromoStrip = true,
  onHeaderStackLayout,
  chromeVariant = 'full',
}: ChromeProps) {
  if (chromeVariant === 'sticky') {
    return (
      <View
        style={styles.chromeInner}
        collapsable={false}
        onLayout={(e) => onHeaderStackLayout?.(e.nativeEvent.layout.height)}
      >
        <StorefrontHeader onLogoPress={onLogoPress} variant="sticky" />
      </View>
    );
  }

  return (
    <View style={styles.chromeInner}>
      <View
        collapsable={false}
        onLayout={(e) => onHeaderStackLayout?.(e.nativeEvent.layout.height)}
      >
        {showPromoStrip ? <StorefrontPromoStrip /> : null}
        <StorefrontHeader
          onLogoPress={onLogoPress}
          padTopSafeArea={!showPromoStrip}
          hideSearchAndRav={hideSearchAndRav}
        />
      </View>
      {hideServicesNav ? null : (
        <>
          <StorefrontServicesNav onPress={onService} />
          {servicesSlot !== undefined ? (
            servicesSlot == null ? null : (
              <View style={styles.secondaryBar}>{servicesSlot}</View>
            )
          ) : (
            <View style={styles.secondaryBar}>
              <StorefrontCategoryNav activeSlug={activeCategory} onPress={onCategory} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const SCROLL_DIR_THRESHOLD = 8;
/**
 * Overlay sticky only after scrolling past ~header stack (“fairly deep”).
 * Hysteresis between enable/disable avoids thrashing at the boundary.
 * Fallback when chrome hasn’t measured yet (~promo + logo + nav + category).
 */
const STICKY_FALLBACK_CHROME_H = 240;
const STICKY_ENABLE_EXTRA = 80;
const STICKY_DISABLE_BELOW = 40;
const DESKTOP_RAV_MAX = 380;
/** Match StorefrontRavDrawer close duration so pinned chrome stays until dock finishes. */
const RAV_CLOSE_LAYOUT_MS = 280;
/** Scroll padding so a `floatingFooter` card can't cover the footer's last row. */
const FLOATING_FOOTER_CLEARANCE = 104;

function stickyScrollThresholds(chromeH: number) {
  const base = chromeH > 0 ? chromeH : STICKY_FALLBACK_CHROME_H;
  return {
    /** Past this → arm hide-on-down / reveal-on-up overlay. */
    enableY: Math.max(base + STICKY_ENABLE_EXTRA, 280),
    /** Below this → disarm sticky behavior; overlay may still show until true top. */
    disableY: Math.max(base - STICKY_DISABLE_BELOW, 180),
  };
}

/**
 * Storefront shell chrome.
 *
 * Scroll mode: full chrome (promo + header + sub-nav) lives in the scroller.
 * A compact sticky bar (menu · search · account · cart) slides in on scroll-up
 * mid-page and dismisses near the top so only the in-flow chrome shows.
 *
 * Desktop Rav open: absolute scroll-away chrome tracks 1:1 with the spacer.
 *
 * Fill mode: chrome stays pinned above the body (wizards / My Box).
 */
export function StorefrontChrome(props: Props) {
  const chrome = (
    <StorefrontRavProvider>
      <StorefrontChromeInner {...props} />
    </StorefrontRavProvider>
  );
  if (!props.onLeave) return chrome;
  return <StorefrontLeaveProvider onLeave={props.onLeave}>{chrome}</StorefrontLeaveProvider>;
}

function StorefrontChromeInner({
  children,
  activeCategory,
  scrollRef,
  contentContainerStyle,
  bodyMode = 'scroll',
  onLeave,
  hideServicesNav,
  hideSearchAndRav,
  servicesSlot,
  floatingFooter,
}: Props) {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const route = useRoute();
  const isAuthenticated = usePreviewedIsAuthenticated();
  const hasOwnBox = usePreviewedHasStartedBox();
  const { refresh } = useSession();
  const { width: windowWidth } = useWindowDimensions();
  const compact = windowWidth < LAYOUT.BREAKPOINT_TABLET;
  const fillBody = bodyMode === 'fill';
  /** Mobile: free-shipping strip only on Home; desktop keeps it everywhere. */
  const showPromoStrip =
    !compact || route.name === 'Home' || route.name === 'StorefrontHome';
  const [refreshing, setRefreshing] = useState(false);
  const [pullPx, setPullPx] = useState(0);
  const pullStartY = useRef<number | null>(null);
  /** Promo + header only — Rav sits under this on mobile (not under services/category). */
  const [ravHeaderStackH, setRavHeaderStackH] = useState(0);
  const {
    visible: ravVisible,
    closeRav,
    initialMessage,
    initialMessageNonce,
  } = useStorefrontRav();

  /**
   * Desktop: full-width chrome above bodyRow while Rav is open (and through close
   * anim) so the header spans the viewport and Rav sits under it.
   */
  const [ravDockedLayout, setRavDockedLayout] = useState(false);
  useLayoutEffect(() => {
    if (compact || fillBody) {
      setRavDockedLayout(false);
      return;
    }
    if (ravVisible) {
      setRavDockedLayout(true);
      return;
    }
    if (!ravDockedLayout) return;
    const t = setTimeout(() => setRavDockedLayout(false), RAV_CLOSE_LAYOUT_MS);
    return () => clearTimeout(t);
  }, [ravVisible, compact, fillBody, ravDockedLayout]);

  const ravDockedLayoutRef = useRef(false);
  ravDockedLayoutRef.current = ravDockedLayout;

  /** Fill mode only — Rav-open uses absolute full-width scroll-away chrome instead. */
  const pinChromeAboveBody = fillBody;
  const useOverlaySticky = !fillBody;

  const lastY = useRef(0);
  const chromeHeight = useRef(0);
  const [chromeH, setChromeH] = useState(0);
  /** Compact sticky bar height — drives overlay slide distance. */
  const stickyChromeHeight = useRef(0);
  const [stickyChromeH, setStickyChromeH] = useState(0);
  /**
   * Mobile: when Rav opens mid-page, pin under the mini sticky bar instead of
   * the full in-flow header stack.
   */
  const [ravMobilePinSticky, setRavMobilePinSticky] = useState(false);
  const ravMobilePinStickyRef = useRef(false);
  ravMobilePinStickyRef.current = ravMobilePinSticky;
  const overlayArmed = useRef(false);
  /** Sticky compact bar starts dismissed — full in-flow chrome owns the top. */
  const overlayShown = useRef(false);
  const [overlayInteractive, setOverlayInteractive] = useState(false);
  const overlayProgress = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const overlayAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const topFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Full-width chrome while Rav is open — tracks scroll like static content (not the sticky overlay). */
  const scrollAwayY = useRef(new Animated.Value(0)).current;
  const [scrollAwayInteractive, setScrollAwayInteractive] = useState(false);
  /**
   * Shared top clearance for the body row while Rav is docked (page + Rav).
   * Plain number — Animated padding on the drawer was not reliably applying on web.
   */
  const [headerClearance, setHeaderClearance] = useState(0);
  /** Bumps to remount sticky overlay after snap (web native-driver can leave mid-translate). */
  const [overlayEpoch, setOverlayEpoch] = useState(0);
  /**
   * While compensating scroll for Rav open, ignore scroll-down dismiss so a
   * stale onScroll event can't collapse the header we just snapped open.
   */
  const suppressOverlayDismissRef = useRef(false);
  /** Mobile sheet top still uses Animated; desktop dock uses headerClearance on bodyRow. */
  const ravTopAnim = useRef(new Animated.Value(0)).current;

  const measuredChrome = () =>
    chromeHeight.current > 0 ? chromeHeight.current : STICKY_FALLBACK_CHROME_H;

  const ravWidth = compact
    ? windowWidth
    : Math.min(DESKTOP_RAV_MAX, Math.round(windowWidth * 0.36));

  const goHome = () => {
    if (onLeave) {
      onLeave({ type: 'home' });
      return;
    }
    navigation.navigate('StorefrontHome');
  };

  const goCategory = (slug: string) => {
    if (onLeave) {
      onLeave({ type: 'category', slug });
      return;
    }
    navigation.navigate('StorefrontCategory', { category: slug });
  };

  const startBox = () =>
    openBoxSurface(isAuthenticated, {
      leave: onLeave ? () => onLeave({ type: 'myBox' }) : undefined,
      hasOwnBox,
      refreshSession: refresh,
    });

  const onService = (id: StorefrontServiceId) => {
    if (onLeave) {
      onLeave({ type: 'service', id });
      return;
    }
    switch (id) {
      case 'shop':
        goCategory('collection');
        break;
      case 'box':
        startBox();
        break;
      case 'passover':
        navigation.navigate('StorefrontPassover');
        break;
      case 'story':
        navigation.navigate('StorefrontOurStory');
        break;
      default:
        break;
    }
  };

  const chromeProps: ChromeProps = {
    activeCategory,
    onLogoPress: goHome,
    onService,
    onCategory: goCategory,
    hideServicesNav,
    hideSearchAndRav,
    servicesSlot,
    showPromoStrip,
    onHeaderStackLayout: setRavHeaderStackH,
  };

  const onChromeLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    chromeHeight.current = h;
    setChromeH(h);
  };

  const onStickyChromeLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    stickyChromeHeight.current = h;
    setStickyChromeH(h);
  };

  const clearTopFadeTimer = useCallback(() => {
    if (topFadeTimerRef.current != null) {
      clearTimeout(topFadeTimerRef.current);
      topFadeTimerRef.current = null;
    }
  }, []);

  const localScrollRef = useRef<ScrollView>(null);
  const setScrollRef = useCallback(
    (node: ScrollView | null) => {
      localScrollRef.current = node;
      if (!scrollRef) return;
      if (typeof scrollRef === 'function') {
        scrollRef(node);
      } else {
        (scrollRef as React.MutableRefObject<ScrollView | null>).current = node;
      }
    },
    [scrollRef]
  );

  const syncScrollAwayChrome = useCallback(
    (y: number, overlayFullyShown: boolean) => {
      const h = measuredChrome();
      if (!ravDockedLayoutRef.current || overlayFullyShown) {
        scrollAwayY.setValue(-h);
        setScrollAwayInteractive(false);
        return;
      }
      const ty = -Math.min(Math.max(0, y), h);
      scrollAwayY.setValue(ty);
      setScrollAwayInteractive(ty > -h + 0.5);
    },
    [scrollAwayY]
  );

  const syncRavTop = useCallback(
    (y: number, overlayFullyShown: boolean) => {
      const h = measuredChrome();
      if (fillBody) {
        ravTopAnim.setValue(compact ? h : 0);
        setHeaderClearance(0);
        return;
      }
      const clearance = overlayFullyShown
        ? h
        : Math.max(0, h - Math.max(0, y));
      ravTopAnim.setValue(clearance);
      setHeaderClearance(clearance);
    },
    [compact, fillBody, ravTopAnim]
  );

  const snapOverlay = useCallback(
    (show: boolean, opts?: { remount?: boolean }) => {
      overlayAnimRef.current?.stop();
      if (show) {
        // Remounting an already-fully-shown native-driver overlay can reset
        // translateY to the collapsed end on web — only remount when recovering
        // from a mid-slide, or when explicitly requested.
        let progressBefore = 1;
        overlayProgress.stopAnimation((v) => {
          progressBefore = typeof v === 'number' ? v : 1;
        });
        overlayShown.current = true;
        overlayArmed.current = true;
        setOverlayInteractive(true);
        overlayOpacity.setValue(1);
        overlayProgress.setValue(1);
        syncScrollAwayChrome(lastY.current, true);
        syncRavTop(lastY.current, true);
        const shouldRemount =
          opts?.remount === true ||
          (opts?.remount !== false && progressBefore < 0.98);
        if (shouldRemount) {
          setOverlayEpoch((n) => n + 1);
        }
      } else {
        overlayShown.current = false;
        setOverlayInteractive(false);
        overlayOpacity.setValue(0);
        overlayProgress.setValue(0);
        syncScrollAwayChrome(lastY.current, false);
        syncRavTop(lastY.current, false);
      }
    },
    [overlayOpacity, overlayProgress, syncRavTop, syncScrollAwayChrome]
  );

  /** Full header above Rav — sticky overlay or scroll-away snapped to y=0. */
  const snapFullHeaderAboveRav = useCallback(() => {
    const h = measuredChrome();
    if (overlayShown.current) {
      snapOverlay(true);
      return;
    }
    // Partial static header (0 < y < h) → jump to top so chrome + Rav align cleanly.
    lastY.current = 0;
    localScrollRef.current?.scrollTo({ y: 0, animated: false });
    overlayShown.current = false;
    setOverlayInteractive(false);
    overlayOpacity.setValue(0);
    overlayProgress.setValue(0);
    scrollAwayY.setValue(0);
    setScrollAwayInteractive(true);
    ravTopAnim.setValue(h);
    setHeaderClearance(h);
  }, [
    overlayOpacity,
    overlayProgress,
    ravTopAnim,
    scrollAwayY,
    snapOverlay,
  ]);

  const animateOverlay = useCallback(
    (show: boolean, hideMode: 'slide' | 'fade' = 'slide') => {
      if (overlayShown.current === show) return;

      overlayAnimRef.current?.stop();
      const h = measuredChrome();
      const docked = ravDockedLayoutRef.current;
      const y = lastY.current;

      if (show) {
        clearTopFadeTimer();
        overlayShown.current = true;
        overlayArmed.current = true;
        setOverlayInteractive(true);
        overlayOpacity.setValue(1);
        syncScrollAwayChrome(y, true);
        setHeaderClearance(h);
        ravTopAnim.setValue(h);
        overlayAnimRef.current = Animated.timing(overlayProgress, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        });
        overlayAnimRef.current.start();
        return;
      }

      overlayShown.current = false;
      setOverlayInteractive(false);
      const clearanceTarget = Math.max(0, h - y);
      setHeaderClearance(clearanceTarget);
      ravTopAnim.setValue(clearanceTarget);

      if (hideMode === 'fade' && !docked) {
        overlayAnimRef.current = Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        });
        overlayAnimRef.current.start(({ finished }) => {
          if (!finished) return;
          overlayProgress.setValue(0);
          syncRavTop(lastY.current, false);
        });
        return;
      }

      // Keep scroll-away chrome hidden until the sticky overlay has finished leaving
      // when deep mid-page (avoids a second header popping in).
      if (docked && y >= h) {
        scrollAwayY.setValue(-h);
        setScrollAwayInteractive(false);
      } else {
        syncScrollAwayChrome(y, false);
      }
      overlayAnimRef.current = Animated.timing(overlayProgress, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      });
      overlayAnimRef.current.start(({ finished }) => {
        if (!finished) return;
        overlayOpacity.setValue(0);
        syncRavTop(lastY.current, false);
        if (ravDockedLayoutRef.current) {
          syncScrollAwayChrome(lastY.current, false);
        }
      });
    },
    [
      clearTopFadeTimer,
      overlayOpacity,
      overlayProgress,
      scrollAwayY,
      syncRavTop,
      syncScrollAwayChrome,
    ]
  );

  /** Near the top: dismiss the compact sticky so only full in-flow chrome shows. */
  const dismissStickyNearTop = useCallback(() => {
    if (!useOverlaySticky) return;
    clearTopFadeTimer();
    overlayArmed.current = false;
    if (!overlayShown.current) {
      syncScrollAwayChrome(lastY.current, false);
      syncRavTop(lastY.current, false);
      return;
    }
    overlayAnimRef.current?.stop();
    overlayShown.current = false;
    setOverlayInteractive(false);
    overlayOpacity.setValue(0);
    overlayProgress.setValue(0);
    syncScrollAwayChrome(lastY.current, false);
    syncRavTop(lastY.current, false);
  }, [
    clearTopFadeTimer,
    overlayOpacity,
    overlayProgress,
    syncRavTop,
    syncScrollAwayChrome,
    useOverlaySticky,
  ]);

  const dismissStickyIfNearTop = useCallback(() => {
    if (!useOverlaySticky) return;
    // Keep mini bar while Rav is pinned under it (open or closing).
    if (ravMobilePinStickyRef.current) return;
    const { disableY } = stickyScrollThresholds(chromeHeight.current);
    if (lastY.current < disableY) {
      dismissStickyNearTop();
    }
  }, [dismissStickyNearTop, useOverlaySticky]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!useOverlaySticky) return;
      const y = Math.max(0, e.nativeEvent.contentOffset.y);
      const dy = y - lastY.current;
      lastY.current = y;
      const { enableY, disableY } = stickyScrollThresholds(chromeHeight.current);

      // While Rav is pinned to the mini bar (including close anim), keep sticky up.
      if (ravMobilePinStickyRef.current) {
        if (!overlayShown.current) {
          animateOverlay(true);
        }
        return;
      }

      // Top band: full in-flow chrome is (or will be) visible — keep sticky away.
      if (y < disableY) {
        dismissStickyNearTop();
        return;
      }

      if (overlayShown.current && dy > SCROLL_DIR_THRESHOLD) {
        if (suppressOverlayDismissRef.current) return;
        animateOverlay(false, 'slide');
        return;
      }

      if (!overlayShown.current) {
        syncScrollAwayChrome(y, false);
        syncRavTop(y, false);
      }

      clearTopFadeTimer();

      if (y >= enableY) {
        overlayArmed.current = true;
      }

      if (!overlayArmed.current) {
        return;
      }

      if (dy < -SCROLL_DIR_THRESHOLD) {
        animateOverlay(true);
      }
    },
    [
      animateOverlay,
      clearTopFadeTimer,
      dismissStickyNearTop,
      syncRavTop,
      syncScrollAwayChrome,
      useOverlaySticky,
    ]
  );

  useEffect(() => {
    if (useOverlaySticky) {
      dismissStickyIfNearTop();
      return;
    }
    clearTopFadeTimer();
    overlayAnimRef.current?.stop();
    overlayShown.current = false;
    overlayArmed.current = false;
    setOverlayInteractive(false);
    overlayProgress.setValue(0);
    overlayOpacity.setValue(0);
    syncRavTop(0, false);
    setScrollAwayInteractive(false);
  }, [
    clearTopFadeTimer,
    dismissStickyIfNearTop,
    overlayOpacity,
    overlayProgress,
    syncRavTop,
    useOverlaySticky,
  ]);

  useLayoutEffect(() => {
    if (!ravDockedLayout) {
      setScrollAwayInteractive(false);
      scrollAwayY.setValue(-measuredChrome());
      return;
    }
    const y = lastY.current;
    const h = measuredChrome();
    clearTopFadeTimer();
    // Sticky overlay showing (or mid-animation): keep/snap fully open over Rav.
    // Opened from the overlaid Ask Rav control — header was already expanded.
    if (overlayShown.current || overlayInteractive) {
      if (y >= h) {
        const compensated = Math.max(0, y - h);
        suppressOverlayDismissRef.current = true;
        lastY.current = compensated;
        localScrollRef.current?.scrollTo({ y: compensated, animated: false });
        // Clear after the compensated scroll event(s) have had a chance to flush.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            suppressOverlayDismissRef.current = false;
          });
        });
      }
      snapOverlay(true, { remount: false });
      return;
    }
    // Header still in view (including partially) → full header above Rav.
    if (y < h) {
      snapFullHeaderAboveRav();
      return;
    }
    // Deep mid-page: no header, Rav full-bleed.
    // In-flow chrome leaves the scroller — pull offset back by chrome height.
    const compensated = Math.max(0, y - h);
    lastY.current = compensated;
    localScrollRef.current?.scrollTo({ y: compensated, animated: false });
    snapOverlay(false);
    scrollAwayY.setValue(-h);
    setScrollAwayInteractive(false);
    ravTopAnim.setValue(0);
    setHeaderClearance(0);
  }, [
    clearTopFadeTimer,
    overlayInteractive,
    ravDockedLayout,
    ravTopAnim,
    scrollAwayY,
    snapFullHeaderAboveRav,
    snapOverlay,
  ]);

  /**
   * Mobile: Rav height under the visible chrome —
   * full promo+header at the top, mini sticky bar mid-page.
   * Pin mode is held through the close animation so the taller sheet
   * doesn’t collapse under the full header while sliding out.
   */
  useLayoutEffect(() => {
    if (!compact || fillBody || !useOverlaySticky) {
      setRavMobilePinSticky(false);
      return;
    }
    if (!ravVisible) {
      const t = setTimeout(() => setRavMobilePinSticky(false), RAV_CLOSE_LAYOUT_MS);
      return () => clearTimeout(t);
    }

    const y = lastY.current;
    const h = measuredChrome();
    // Past the in-flow chrome (or sticky already up) → pin under mini bar.
    const pinSticky =
      overlayShown.current || overlayInteractive || y >= h;

    setRavMobilePinSticky(pinSticky);

    if (pinSticky) {
      snapOverlay(true, { remount: false });
      return;
    }

    // Partial scroll with full chrome still partly visible — snap to top so Rav
    // slots cleanly under the full header.
    if (y > 0 && y < h) {
      lastY.current = 0;
      localScrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    if (overlayShown.current) {
      dismissStickyNearTop();
    }
  }, [
    compact,
    dismissStickyNearTop,
    fillBody,
    overlayInteractive,
    ravVisible,
    snapOverlay,
    useOverlaySticky,
  ]);

  useEffect(() => {
    syncRavTop(lastY.current, overlayShown.current);
    syncScrollAwayChrome(lastY.current, overlayShown.current);
  }, [chromeH, syncRavTop, syncScrollAwayChrome]);

  useEffect(() => {
    if (!isFocused) {
      clearTopFadeTimer();
      overlayAnimRef.current?.stop();
      overlayShown.current = false;
      overlayArmed.current = false;
      setOverlayInteractive(false);
      overlayProgress.setValue(0);
      overlayOpacity.setValue(0);
      ravTopAnim.setValue(0);
      setScrollAwayInteractive(false);
    }
  }, [clearTopFadeTimer, isFocused, overlayOpacity, overlayProgress, ravTopAnim]);

  useEffect(() => () => clearTopFadeTimer(), [clearTopFadeTimer]);

  const overlayHideOffset =
    stickyChromeH > 0 ? stickyChromeH : Math.min(chromeH || STICKY_FALLBACK_CHROME_H, 96);
  const overlayTranslateY = overlayProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-overlayHideOffset, 0],
  });

  // Mobile: under full promo+header at top, or under mini sticky mid-page.
  // Desktop dock: clearance is on bodyRow; undocked uses scroll-synced headerClearance.
  const stickyInsetFallback =
    stickyChromeH > 0
      ? stickyChromeH
      : Math.min(chromeH || STICKY_FALLBACK_CHROME_H, 96);
  const fullHeaderInset =
    ravHeaderStackH > 0 ? ravHeaderStackH : RAV_HEADER_FALLBACK_H;
  const ravTopInset = compact
    ? ravMobilePinSticky
      ? stickyInsetFallback
      : fullHeaderInset
    : ravDockedLayout
      ? 0
      : headerClearance;

  const ravDrawer = (
    <StorefrontRavDrawer
      visible={ravVisible}
      onClose={closeRav}
      initialMessage={initialMessage}
      initialMessageNonce={initialMessageNonce}
      width={ravWidth}
      topInset={ravTopInset}
      docked={!compact}
    />
  );

  const runRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setPullPx(0);
    try {
      await refresh({ silent: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.reload();
        return;
      }
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshing]);

  const onPullTouchStart = useCallback(
    (e: { nativeEvent: { pageY: number } }) => {
      if (fillBody || refreshing) return;
      if (lastY.current > 4) {
        pullStartY.current = null;
        return;
      }
      pullStartY.current = e.nativeEvent.pageY;
    },
    [fillBody, refreshing]
  );

  const onPullTouchMove = useCallback(
    (e: { nativeEvent: { pageY: number } }) => {
      if (pullStartY.current == null || fillBody || refreshing) return;
      if (lastY.current > 4) {
        pullStartY.current = null;
        setPullPx(0);
        return;
      }
      const dy = e.nativeEvent.pageY - pullStartY.current;
      setPullPx(dy > 0 ? Math.min(dy * 0.45, 72) : 0);
    },
    [fillBody, refreshing]
  );

  const onPullTouchEnd = useCallback(() => {
    const shouldRefresh = pullPx >= 52;
    pullStartY.current = null;
    if (shouldRefresh) {
      void runRefresh();
      return;
    }
    setPullPx(0);
  }, [pullPx, runRefresh]);

  const pageScroll = (
    <ScrollView
      ref={setScrollRef}
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        contentContainerStyle,
        floatingFooter ? styles.scrollContentFloatClearance : null,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bounces
      alwaysBounceVertical
      overScrollMode="auto"
      refreshControl={
        fillBody ? undefined : (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void runRefresh();
            }}
            tintColor={semanticColors.brand}
            colors={[semanticColors.brand]}
          />
        )
      }
      onScroll={onScroll}
      onScrollEndDrag={dismissStickyIfNearTop}
      onMomentumScrollEnd={dismissStickyIfNearTop}
      onTouchStart={Platform.OS === 'web' ? onPullTouchStart : undefined}
      onTouchMove={Platform.OS === 'web' ? onPullTouchMove : undefined}
      onTouchEnd={Platform.OS === 'web' ? onPullTouchEnd : undefined}
      onTouchCancel={Platform.OS === 'web' ? onPullTouchEnd : undefined}
      scrollEventThrottle={16}
      // @ts-expect-error web className
      className={Platform.OS === 'web' ? STOREFRONT_SCROLL_CLASS : undefined}
      testID="storefront-vertical-scroll"
    >
      {Platform.OS === 'web' && !fillBody && (pullPx > 0 || refreshing) ? (
        <View style={[styles.pullHint, { height: Math.max(pullPx, refreshing ? 44 : 0) }]}>
          <ActivityIndicator color={semanticColors.brand} />
        </View>
      ) : null}
      {pinChromeAboveBody || ravDockedLayout ? null : (
        <View onLayout={onChromeLayout} collapsable={false}>
          <StorefrontChromeBlocks {...chromeProps} />
        </View>
      )}
      {children}
      <StorefrontFooter />
    </ScrollView>
  );

  return (
    <View style={styles.root} testID="storefront-scroll-host">
      {ravDockedLayout ? (
        <Animated.View
          style={[
            styles.scrollAwayChrome,
            {
              transform: [{ translateY: scrollAwayY }],
              opacity: scrollAwayInteractive ? 1 : 0,
            },
          ]}
          pointerEvents={scrollAwayInteractive ? 'auto' : 'none'}
          accessibilityElementsHidden={!scrollAwayInteractive}
        >
          <View onLayout={onChromeLayout} collapsable={false}>
            <StorefrontChromeBlocks {...chromeProps} />
          </View>
        </Animated.View>
      ) : null}

      {useOverlaySticky ? (
        <Animated.View
          key={`overlay-${overlayEpoch}`}
          style={[
            styles.chromeOverlay,
            !overlayInteractive ? styles.chromeOverlayHidden : null,
            {
              opacity: overlayOpacity,
              transform: [{ translateY: overlayTranslateY }],
            },
          ]}
          pointerEvents={overlayInteractive ? 'auto' : 'none'}
          accessibilityElementsHidden={!overlayInteractive}
          importantForAccessibility={overlayInteractive ? 'yes' : 'no-hide-descendants'}
        >
          <View onLayout={onStickyChromeLayout} collapsable={false}>
            <StorefrontChromeBlocks {...chromeProps} chromeVariant="sticky" />
          </View>
        </Animated.View>
      ) : null}

      {pinChromeAboveBody ? (
        <>
          <View style={styles.chromeFill} onLayout={onChromeLayout} collapsable={false}>
            <StorefrontChromeBlocks {...chromeProps} />
          </View>
          <View style={styles.bodyRow}>
            <View style={styles.fillBody}>{children}</View>
            {ravDrawer}
          </View>
        </>
      ) : (
        <View
          style={[
            styles.bodyRow,
            ravDockedLayout ? { paddingTop: headerClearance } : null,
          ]}
        >
          {pageScroll}
          {ravDrawer}
        </View>
      )}

      {floatingFooter ? (
        <View style={styles.floatingFooter} pointerEvents="box-none">
          <View style={styles.floatingFooterInner}>{floatingFooter}</View>
        </View>
      ) : null}
    </View>
  );
}

/** Shared CTA helpers for screens that need box / Rav without remounting chrome. */
export function useStorefrontActions() {
  const navigation = useNavigation<Nav>();
  const isAuthenticated = usePreviewedIsAuthenticated();
  const hasOwnBox = usePreviewedHasStartedBox();
  const { refresh } = useSession();

  return {
    startBox: () =>
      openBoxSurface(isAuthenticated, {
        hasOwnBox,
        refreshSession: refresh,
      }),
    askRav: (message?: string) => {
      // Prefer the storefront drawer — screens usually call this hook above Chrome,
      // so React context isn’t available; the provider registers a bridge instead.
      if (isStorefrontRavOpenable()) {
        openStorefrontRav(message);
        return;
      }
      navigation.navigate('MainTabs', {
        screen: 'Rav',
        params: {
          newChat: true,
          initialMessage: message ?? 'Help me plan my Hanukkah table',
        },
      });
    },
    goCategory: (slug: string, opts?: { q?: string }) => {
      navigation.navigate('StorefrontCategory', {
        category: slug,
        ...(opts?.q ? { q: opts.q } : null),
      });
    },
    goHome: () => navigation.navigate('StorefrontHome'),
    goEligibility: () => navigation.navigate('BoxDiscountEligibility'),
    goOurStory: () => navigation.navigate('StorefrontOurStory'),
    goPassover: () => navigation.navigate('StorefrontPassover'),
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: semanticColors.bgPrimary,
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100svh' } as object)
      : null),
  },
  /**
   * Compact sticky bar for scroll mode — menu · search · account · cart.
   * Full chrome (promo + sub-nav) stays in document flow.
   */
  chromeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: semanticColors.bgPrimary,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 4px 16px rgba(17, 2, 34, 0.1)',
        } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 6,
        }),
  },
  /**
   * Full-width chrome while Rav is docked — tracks scroll 1:1 with a spacer in
   * the page scroller so the header spans both columns and can leave normally.
   */
  scrollAwayChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 25,
    backgroundColor: semanticColors.logoDark,
  },
  chromeSpacer: {
    width: '100%',
  },
  /** Kill shadow/elevation while dismissed so offscreen translate can't leak. */
  chromeOverlayHidden: {
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: 'none',
        } as object)
      : {
          shadowOpacity: 0,
          elevation: 0,
        }),
  },
  /** Fill-mode chrome above the body viewport (not inside a page scroller). */
  chromeFill: {
    zIndex: 20,
    flexShrink: 0,
    backgroundColor: semanticColors.logoDark,
  },
  chromeInner: {
    // Dark base so the bottom edge of the stack can’t flash a light hairline
    // against the hero; promo / header / services paint opaque backgrounds above.
    backgroundColor: semanticColors.logoDark,
  },
  /** Black secondary bar host — no light bottom stroke under category / practice links. */
  secondaryBar: {
    backgroundColor: semanticColors.logoDark,
    borderBottomWidth: 0,
    borderTopWidth: 0,
    // Cover RN-web subpixel gaps under the dark bar (parent light bg seams).
    ...(Platform.OS === 'web'
      ? ({
          marginBottom: -1,
          paddingBottom: 1,
          boxShadow: 'none',
          outlineStyle: 'none',
        } as object)
      : null),
  },
  bodyRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    position: 'relative',
  },
  scroll: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    ...(Platform.OS === 'web'
      ? ({ overscrollBehaviorY: 'contain' } as object)
      : null),
  },
  pullHint: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.sm,
  },
  fillBody: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  scrollContent: {
    // flexGrow + StorefrontFooter marginTop:auto pins footer to viewport bottom
    // on short pages (empty space above the footer, not below).
    flexGrow: 1,
  },
  scrollContentFloatClearance: {
    paddingBottom: FLOATING_FOOTER_CLEARANCE,
  },
  floatingFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.md,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    zIndex: 20,
  },
  floatingFooterInner: {
    width: '100%',
    maxWidth: 720,
  },
});
