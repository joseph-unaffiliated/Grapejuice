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
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
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
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { usePreviewedIsAuthenticated } from '../../hooks/useUserStatePreview';
import { LAYOUT, semanticColors } from '../../constants/theme';
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
   * Optional replacement for the black secondary bar only (e.g. My Box practice
   * section links). Primary `StorefrontServicesNav` still renders above it.
   * Pass `null` to keep the services strip and omit the secondary bar.
   * Omit / `undefined` to keep the default category nav.
   */
  servicesSlot?: ReactNode;
};

type ChromeProps = {
  activeCategory?: string;
  onLogoPress: () => void;
  onService: (id: StorefrontServiceId) => void;
  onCategory: (slug: string) => void;
  hideServicesNav?: boolean;
  servicesSlot?: ReactNode;
};

function StorefrontChromeBlocks({
  activeCategory,
  onLogoPress,
  onService,
  onCategory,
  hideServicesNav,
  servicesSlot,
}: ChromeProps) {
  return (
    <View style={styles.chromeInner}>
      <StorefrontPromoStrip />
      <StorefrontHeader onLogoPress={onLogoPress} />
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
/** Fade overlay only once scroll has settled at the true top (not at disableY). */
const TOP_SETTLED_EPS = 4;
/** Brief dwell so a fling that clamps at 0 doesn't fade mid-momentum (esp. web wheel). */
const TOP_FADE_SETTLE_MS = 80;
const DESKTOP_RAV_MAX = 380;
/** Match StorefrontRavDrawer close duration so pinned chrome stays until dock finishes. */
const RAV_CLOSE_LAYOUT_MS = 280;

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
 * Storefront shell: static chrome in document flow + optional overlay clone.
 *
 * Scroll mode (Rav closed): chrome sits inside the page ScrollView and scrolls
 * away normally. After scrolling past ~header height, an absolute overlay clone
 * can reappear on upward scroll (no layout height). Overlay only fully opens or
 * fully closes — never a rest state at partial opacity / mid-slide.
 *
 * Desktop Rav open: a full-width absolute chrome tracks scroll 1:1 with a
 * matching spacer in the scroller (header spans the viewport; Rav’s top clears
 * it). Mid-page sticky overlay still only fully opens or fully closes; while it
 * is shown, the scroll-away chrome is hidden and Rav insets to the overlay.
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
  servicesSlot,
}: Props) {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const isAuthenticated = usePreviewedIsAuthenticated();
  const { width: windowWidth } = useWindowDimensions();
  const compact = windowWidth < LAYOUT.BREAKPOINT_TABLET;
  const fillBody = bodyMode === 'fill';
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
  const overlayArmed = useRef(false);
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

  const startBox = () => {
    if (onLeave) {
      onLeave({ type: 'myBox' });
      return;
    }
    if (!isAuthenticated) {
      useGuestSessionStore.getState().startBuildBox();
      return;
    }
    navigation.navigate('MyBox');
  };

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
    servicesSlot,
  };

  const onChromeLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    chromeHeight.current = h;
    setChromeH(h);
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

  const scheduleTopFade = useCallback(() => {
    overlayArmed.current = false;
    clearTopFadeTimer();
    topFadeTimerRef.current = setTimeout(() => {
      topFadeTimerRef.current = null;
      if (lastY.current <= TOP_SETTLED_EPS) {
        animateOverlay(false, 'fade');
      }
    }, TOP_FADE_SETTLE_MS);
  }, [animateOverlay, clearTopFadeTimer]);

  const fadeOverlayIfSettledAtTop = useCallback(() => {
    if (!useOverlaySticky) return;
    if (lastY.current > TOP_SETTLED_EPS) return;
    clearTopFadeTimer();
    overlayArmed.current = false;
    if (ravDockedLayoutRef.current) {
      snapFullHeaderAboveRav();
      return;
    }
    animateOverlay(false, 'fade');
  }, [
    animateOverlay,
    clearTopFadeTimer,
    snapFullHeaderAboveRav,
    useOverlaySticky,
  ]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!useOverlaySticky) return;
      const y = Math.max(0, e.nativeEvent.contentOffset.y);
      const dy = y - lastY.current;
      lastY.current = y;
      const docked = ravDockedLayoutRef.current;

      // Scroll-down always dismisses a shown sticky overlay — including inside
      // the disableY hysteresis band (that early-return was trapping it open).
      if (overlayShown.current && dy > SCROLL_DIR_THRESHOLD) {
        if (suppressOverlayDismissRef.current) return;
        animateOverlay(false, 'slide');
        return;
      }

      if (!overlayShown.current) {
        syncScrollAwayChrome(y, false);
        syncRavTop(y, false);
      }

      const { enableY, disableY } = stickyScrollThresholds(chromeHeight.current);

      if (y < disableY) {
        overlayArmed.current = false;
        if (y <= TOP_SETTLED_EPS) {
          if (docked) {
            clearTopFadeTimer();
            if (overlayShown.current) {
              // Hand off sticky → full scroll-away header at the top.
              overlayShown.current = false;
              setOverlayInteractive(false);
              overlayOpacity.setValue(0);
              overlayProgress.setValue(0);
              snapFullHeaderAboveRav();
            } else {
              syncScrollAwayChrome(y, false);
              syncRavTop(y, false);
            }
          } else {
            scheduleTopFade();
          }
        } else {
          clearTopFadeTimer();
        }
        return;
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
      overlayOpacity,
      overlayProgress,
      scheduleTopFade,
      snapFullHeaderAboveRav,
      syncRavTop,
      syncScrollAwayChrome,
      useOverlaySticky,
    ]
  );

  useEffect(() => {
    if (useOverlaySticky) return;
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

  const overlayHideOffset = chromeH > 0 ? chromeH : STICKY_FALLBACK_CHROME_H;
  const overlayTranslateY = overlayProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-overlayHideOffset, 0],
  });

  // Desktop dock: clearance is on bodyRow (both columns). Mobile sheet still uses top.
  const ravTopInset = fillBody
    ? compact
      ? chromeH > 0
        ? chromeH
        : STICKY_FALLBACK_CHROME_H
      : 0
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

  const pageScroll = (
    <ScrollView
      ref={setScrollRef}
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      onScroll={onScroll}
      onScrollEndDrag={fadeOverlayIfSettledAtTop}
      onMomentumScrollEnd={fadeOverlayIfSettledAtTop}
      scrollEventThrottle={16}
      // @ts-expect-error web className
      className={Platform.OS === 'web' ? STOREFRONT_SCROLL_CLASS : undefined}
      testID="storefront-vertical-scroll"
    >
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
          <View onLayout={onChromeLayout} collapsable={false}>
            <StorefrontChromeBlocks {...chromeProps} />
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
    </View>
  );
}

/** Shared CTA helpers for screens that need box / Rav without remounting chrome. */
export function useStorefrontActions() {
  const navigation = useNavigation<Nav>();
  const isAuthenticated = usePreviewedIsAuthenticated();

  return {
    startBox: () => {
      if (!isAuthenticated) {
        useGuestSessionStore.getState().startBuildBox();
        return;
      }
      navigation.navigate('MyBox');
    },
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
    goCategory: (slug: string) => {
      navigation.navigate('StorefrontCategory', { category: slug });
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
      ? ({ height: '100%', maxHeight: '100dvh' } as object)
      : null),
  },
  /**
   * Scroll-away sticky clone — out of document flow so it never pushes content.
   * Slides in/out via translateY while armed; fades opacity once settled at y≈0.
   * Hidden state must keep opacity 0 (translate alone still paints shadow / edge).
   * Binary only — never rest at partial progress / opacity.
   */
  chromeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    // Upper strips paint their own bg; dark secondary bar is last — keep host
    // dark so any subpixel seam under the category nav isn’t a white hairline.
    backgroundColor: semanticColors.logoDark,
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
      ? ({ overscrollBehavior: 'none' } as object)
      : null),
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
});
