import React, { type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  children: ReactNode;
  activeCategory?: string;
  onShopLook?: () => void;
};

export function StorefrontChrome({ children, activeCategory, onShopLook }: Props) {
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
    <View style={styles.root}>
      <StorefrontPromoStrip />
      <StorefrontHeader onLogoPress={goHome} />
      <StorefrontServicesNav onPress={onService} />
      <StorefrontCategoryNav activeSlug={activeCategory} onPress={goCategory} />
      {children}
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
    backgroundColor: semanticColors.bgPrimary,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: MOBILE_GUTTER,
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
