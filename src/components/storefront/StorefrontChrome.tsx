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
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Animated,
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
import type { MainStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import {
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import {
  STOREFRONT_SCROLL_CLASS,
  STOREFRONT_H_SCROLL_CLASS,
} from './storefrontScroll';

export { STOREFRONT_SCROLL_CLASS, STOREFRONT_H_SCROLL_CLASS } from './storefrontScroll';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  children: ReactNode;
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

function StorefrontFooter() {
  const navigation = useNavigation<Nav>();
  const goHome = () => navigation.navigate('StorefrontHome');

  return (
    <View style={styles.footer}>
      <TouchableOpacity onPress={goHome} accessibilityRole="button">
        <Text style={styles.footerLink}>Store home</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate('AboutHanukkah')}
        accessibilityRole="button"
      >
        <Text style={styles.footerLink}>About Hanukkah</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate('MainTabs', { screen: 'Account' })}
        accessibilityRole="button"
      >
        <Text style={styles.footerLink}>Account</Text>
      </TouchableOpacity>
    </View>
  );
}

const SCROLL_DIR_THRESHOLD = 6;

/**
 * Storefront shell: one page ScrollView.
 * Chrome scrolls away with the page; on scroll-up mid-page it reappears as a pinned bar
 * only after the in-flow chrome has fully left the viewport (avoids a double header).
 * Footer is normal document flow at the bottom of the page (never fixed).
 */
export function StorefrontChrome({
  children,
  activeCategory,
  onShopLook,
  scrollRef,
  contentContainerStyle,
}: Props) {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const lastY = useRef(0);
  const chromeHeight = useRef(0);
  const [chromeH, setChromeH] = useState(0);
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  const pinProgress = useRef(new Animated.Value(0)).current;
  const pinAnimRef = useRef<Animated.CompositeAnimation | null>(null);

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

  const askRav = () => {
    navigation.navigate('MainTabs', {
      screen: 'Rav',
      params: { newChat: true, initialMessage: 'Help me plan my Hanukkah table' },
    });
  };

  const onService = (id: StorefrontServiceId) => {
    switch (id) {
      case 'box':
        startBox();
        break;
      case 'rav':
        askRav();
        break;
      case 'new':
      case 'loved':
        onShopLook?.();
        break;
      case 'moments':
        goCategory(activeCategory ?? 'menorahs');
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
    chromeHeight.current = h;
    setChromeH(h);
  };

  const clearPinned = useCallback(() => {
    pinnedRef.current = false;
    pinAnimRef.current?.stop();
    pinProgress.setValue(0);
    setPinned(false);
  }, [pinProgress]);

  const animatePin = useCallback(
    (show: boolean) => {
      if (pinnedRef.current === show) return;
      pinnedRef.current = show;
      pinAnimRef.current?.stop();
      if (show) setPinned(true);
      pinAnimRef.current = Animated.timing(pinProgress, {
        toValue: show ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      });
      pinAnimRef.current.start(() => {
        // Clear even if `finished` is false (common on web) as long as we still
        // intend to be unpinned — avoids a stuck overlay stacked on in-flow chrome.
        if (!pinnedRef.current) setPinned(false);
      });
    },
    [pinProgress]
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastY.current;
      lastY.current = y;
      const h = chromeHeight.current;

      // In-flow chrome still on screen — never show the pinned copy (would double).
      // Require the full chrome height to scroll away before pin is allowed.
      if (y < Math.max(8, h - 4)) {
        clearPinned();
        return;
      }

      if (dy > SCROLL_DIR_THRESHOLD) {
        animatePin(false);
      } else if (dy < -SCROLL_DIR_THRESHOLD) {
        animatePin(true);
      }
    },
    [animatePin, clearPinned]
  );

  // Drop pinned overlay when this screen is covered (stack keeps prior screens mounted).
  useEffect(() => {
    if (!isFocused) clearPinned();
  }, [isFocused, clearPinned]);

  const pinSlide = pinProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-Math.max(chromeH, 80), 0],
  });

  const showPinned = pinned && isFocused;

  return (
    <View style={styles.root} testID="storefront-scroll-host">
      {showPinned ? (
        <Animated.View
          style={[
            styles.pinnedChrome,
            {
              transform: [{ translateY: pinSlide }],
            },
          ]}
          pointerEvents="box-none"
        >
          <StorefrontChromeBlocks {...chromeProps} />
        </Animated.View>
      ) : null}

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
        <View onLayout={onChromeLayout} collapsable={false}>
          <StorefrontChromeBlocks {...chromeProps} />
        </View>
        {children}
        <StorefrontFooter />
      </ScrollView>
    </View>
  );
}

/** Shared CTA helpers for screens that need box / Rav without remounting chrome. */
export function useStorefrontActions() {
  const navigation = useNavigation<Nav>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return {
    startBox: () => {
      if (!isAuthenticated) {
        useGuestSessionStore.getState().startBuildBox();
        return;
      }
      navigation.navigate('MyBox');
    },
    askRav: (message?: string) => {
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
  chromeInner: {
    backgroundColor: semanticColors.bgPrimary,
  },
  pinnedChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
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
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    // flexGrow pins footer to viewport bottom on short pages; no paddingBottom —
    // that would sit *below* StorefrontFooter (page-bg gap under the dark bar).
    flexGrow: 1,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: MOBILE_GUTTER,
    marginTop: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.border,
    backgroundColor: semanticColors.bgDark,
  },
  footerLink: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
  },
});
