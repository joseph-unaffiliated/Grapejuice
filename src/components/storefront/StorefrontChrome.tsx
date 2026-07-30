import React, { type ReactNode, type Ref } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
  contentContainerStyle?: object;
};

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

/**
 * Storefront shell: sticky chrome + one page ScrollView that includes the footer.
 * Screens pass page body only — do not nest another vertical ScrollView.
 */
export function StorefrontChrome({
  children,
  activeCategory,
  onShopLook,
  scrollRef,
  contentContainerStyle,
}: Props) {
  const navigation = useNavigation<Nav>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

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

  return (
    <View style={styles.root} testID="storefront-scroll-host">
      <View style={styles.chrome}>
        <StorefrontPromoStrip />
        <StorefrontHeader onLogoPress={goHome} />
        <StorefrontServicesNav onPress={onService} />
        <StorefrontCategoryNav activeSlug={activeCategory} onPress={goCategory} />
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // @ts-expect-error web className
        className={Platform.OS === 'web' ? STOREFRONT_SCROLL_CLASS : undefined}
        testID="storefront-vertical-scroll"
      >
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
  chrome: {
    flexShrink: 0,
    zIndex: 5,
    backgroundColor: semanticColors.bgPrimary,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
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
