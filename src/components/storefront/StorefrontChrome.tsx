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
};

type ChromeProps = {
  activeCategory?: string;
  onLogoPress: () => void;
  onService: (id: StorefrontServiceId) => void;
  onCategory: (slug: string) => void;
};

function StorefrontChromeBlocks({
  activeCategory,
  onLogoPress,
  onService,
  onCategory,
}: ChromeProps) {
  return (
    <View style={styles.chromeInner}>
      <StorefrontPromoStrip />
      <StorefrontHeader onLogoPress={onLogoPress} />
      <StorefrontServicesNav onPress={onService} />
      <StorefrontCategoryNav activeSlug={activeCategory} onPress={onCategory} />
    </View>
  );
}

const SCROLL_DIR_THRESHOLD = 6;
const TOP_SHOW_Y = 24;
const DESKTOP_RAV_MAX = 520;

/**
 * Storefront shell: one shared chrome band above the page + Rav row.
 *
 * There is no separate “in-flow” vs “sticky” copy — the same header collapses on
 * scroll-down and expands on scroll-up / at the top, so returning to y=0 never snaps
 * between two stacks. Chrome always sits above Rav (layout sibling, not an overlay race).
 */
export function StorefrontChrome(props: Props) {
  return (
    <StorefrontRavProvider>
      <StorefrontChromeInner {...props} />
    </StorefrontRavProvider>
  );
}

function StorefrontChromeInner({
  children,
  activeCategory,
  onShopLook,
  scrollRef,
  contentContainerStyle,
}: Props) {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const isAuthenticated = usePreviewedIsAuthenticated();
  const { width: windowWidth } = useWindowDimensions();
  const compact = windowWidth < LAYOUT.BREAKPOINT_TABLET;
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
  const [chromeExpanded, setChromeExpanded] = useState(true);
  const chromeProgress = useRef(new Animated.Value(1)).current;
  const chromeAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const ravWidth = compact
    ? windowWidth
    : Math.min(DESKTOP_RAV_MAX, Math.round(windowWidth * 0.48));

  const goHome = () => navigation.navigate('StorefrontHome');

  const goCategory = (slug: string) => {
    navigation.navigate('StorefrontCategory', { category: slug });
  };

  const startBox = () => {
    if (!isAuthenticated) {
      useGuestSessionStore.getState().startBuildBox();
      return;
    }
    navigation.navigate('MyBox');
  };

  const onService = (id: StorefrontServiceId) => {
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
        duration: 220,
        useNativeDriver: false, // animating height
      });
      chromeAnimRef.current.start();
    },
    [chromeProgress]
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastY.current;
      lastY.current = y;
      setScrollY(y);

      // Near the top — always keep the one chrome band open (no dual-stack handoff).
      if (y < TOP_SHOW_Y) {
        animateChrome(true);
        return;
      }

      if (dy > SCROLL_DIR_THRESHOLD) {
        animateChrome(false);
      } else if (dy < -SCROLL_DIR_THRESHOLD) {
        animateChrome(true);
      }
    },
    [animateChrome]
  );

  useEffect(() => {
    if (!isFocused) {
      chromeShown.current = true;
      setChromeExpanded(true);
      chromeProgress.setValue(1);
    }
  }, [isFocused, chromeProgress]);

  const chromeHostHeight =
    chromeH > 0
      ? chromeProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, chromeH],
        })
      : undefined;

  const chromeElevated = chromeExpanded && scrollY > TOP_SHOW_Y;

  return (
    <View style={styles.root} testID="storefront-scroll-host">
      <Animated.View
        style={[
          styles.chromeHost,
          chromeH > 0 ? { height: chromeHostHeight } : null,
          chromeElevated ? styles.chromeElevated : null,
        ]}
        pointerEvents={chromeExpanded ? 'auto' : 'none'}
      >
        <View onLayout={onChromeLayout} collapsable={false}>
          <StorefrontChromeBlocks {...chromeProps} />
        </View>
      </Animated.View>

      <View style={styles.bodyRow}>
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
  scrollContent: {
    // flexGrow pins footer to viewport bottom on short pages; no paddingBottom —
    // that would sit *below* StorefrontFooter (page-bg gap under the dark bar).
    flexGrow: 1,
  },
});
