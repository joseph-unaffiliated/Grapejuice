import React, {
  useCallback,
  useEffect,
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
 * Sticky hide/show only after scrolling past ~header stack (“fairly deep”).
 * Hysteresis between enable/disable avoids thrashing at the boundary.
 * Fallback when chrome hasn’t measured yet (~promo + logo + nav + category).
 */
const STICKY_FALLBACK_CHROME_H = 240;
const STICKY_ENABLE_EXTRA = 80;
const STICKY_DISABLE_BELOW = 40;
const DESKTOP_RAV_MAX = 520;

function stickyScrollThresholds(chromeH: number) {
  const base = chromeH > 0 ? chromeH : STICKY_FALLBACK_CHROME_H;
  return {
    /** Past this → arm hide-on-down / reveal-on-up. */
    enableY: Math.max(base + STICKY_ENABLE_EXTRA, 280),
    /** Below this → disarm; chrome stays fully visible like static top content. */
    disableY: Math.max(base - STICKY_DISABLE_BELOW, 180),
  };
}

/**
 * Storefront shell: one shared chrome band above the page + Rav row.
 *
 * Near the top the band stays fully expanded (no hide/show fighting scroll).
 * Only after scrolling past ~header height does reveal-on-up / hide-on-down arm.
 * Same chrome node always — no dual in-flow/sticky stacks — so return to y=0 never snaps.
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
  onShopLook,
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

  const lastY = useRef(0);
  const chromeHeight = useRef(0);
  const [chromeH, setChromeH] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const chromeShown = useRef(true);
  /** When false, chrome stays fully visible (static top); when true, hide/show-on-direction. */
  const stickyArmed = useRef(false);
  const [chromeExpanded, setChromeExpanded] = useState(true);
  const chromeProgress = useRef(new Animated.Value(1)).current;
  const chromeAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const ravWidth = compact
    ? windowWidth
    : Math.min(DESKTOP_RAV_MAX, Math.round(windowWidth * 0.48));

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

  const animateChrome = useCallback(
    (show: boolean) => {
      if (chromeShown.current === show) return;
      chromeShown.current = show;
      setChromeExpanded(show);
      chromeAnimRef.current?.stop();
      chromeAnimRef.current = Animated.timing(chromeProgress, {
        toValue: show ? 1 : 0,
        duration: 240,
        useNativeDriver: false, // animating height
      });
      chromeAnimRef.current.start();
    },
    [chromeProgress]
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (fillBody) return;
      const y = Math.max(0, e.nativeEvent.contentOffset.y);
      const dy = y - lastY.current;
      lastY.current = y;
      setScrollY(y);

      const { enableY, disableY } = stickyScrollThresholds(chromeHeight.current);

      // Near top / below hysteresis exit — static fully-visible chrome (no hide).
      if (y < disableY) {
        stickyArmed.current = false;
        animateChrome(true);
        return;
      }

      if (y >= enableY) {
        stickyArmed.current = true;
      }

      if (!stickyArmed.current) {
        animateChrome(true);
        return;
      }

      if (dy > SCROLL_DIR_THRESHOLD) {
        animateChrome(false);
      } else if (dy < -SCROLL_DIR_THRESHOLD) {
        animateChrome(true);
      }
    },
    [animateChrome, fillBody]
  );

  useEffect(() => {
    if (!isFocused) {
      chromeShown.current = true;
      stickyArmed.current = false;
      setChromeExpanded(true);
      chromeProgress.setValue(1);
    }
  }, [isFocused, chromeProgress]);

  const chromeHostHeight =
    !fillBody && chromeH > 0
      ? chromeProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, chromeH],
        })
      : undefined;

  const { disableY: stickyDisableY } = stickyScrollThresholds(chromeH);
  const chromeElevated =
    !fillBody && chromeExpanded && scrollY >= stickyDisableY;

  return (
    <View style={styles.root} testID="storefront-scroll-host">
      <Animated.View
        style={[
          styles.chromeHost,
          chromeHostHeight != null ? { height: chromeHostHeight } : null,
          chromeElevated ? styles.chromeElevated : null,
        ]}
        pointerEvents={chromeExpanded ? 'auto' : 'none'}
      >
        <View onLayout={onChromeLayout} collapsable={false}>
          <StorefrontChromeBlocks {...chromeProps} />
        </View>
      </Animated.View>

      <View style={styles.bodyRow}>
        {fillBody ? (
          <View style={styles.fillBody}>{children}</View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
            // @ts-expect-error web className
            className={Platform.OS === 'web' ? STOREFRONT_SCROLL_CLASS : undefined}
            testID="storefront-vertical-scroll"
          >
            {children}
            <StorefrontFooter />
          </ScrollView>
        )}

        <StorefrontRavDrawer
          visible={ravVisible}
          onClose={closeRav}
          initialMessage={initialMessage}
          initialMessageNonce={initialMessageNonce}
          width={ravWidth}
          topInset={0}
          docked={!compact}
        />
      </View>
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
  chromeHost: {
    zIndex: 20,
    overflow: 'hidden',
    backgroundColor: semanticColors.bgPrimary,
    flexShrink: 0,
  },
  chromeElevated: {
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
  chromeInner: {
    backgroundColor: semanticColors.bgPrimary,
  },
  /** Black secondary bar host — no light bottom stroke under category / practice links. */
  secondaryBar: {
    backgroundColor: semanticColors.logoDark,
    borderBottomWidth: 0,
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
  },
  fillBody: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  scrollContent: {
    // flexGrow pins footer to viewport bottom on short pages; no paddingBottom —
    // that would sit *below* StorefrontFooter (page-bg gap under the dark bar).
    flexGrow: 1,
  },
});
