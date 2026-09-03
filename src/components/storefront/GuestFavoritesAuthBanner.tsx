import React, { useMemo, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';
import { borderRadius, shadows, shadowsWeb, spacing, typography } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import { useWishlist } from '../../hooks/useWishlist';
import { usePreviewedIsAuthenticated } from '../../hooks/useUserStatePreview';
import { useAuthFlowStore } from '../../stores/authFlowStore';

/**
 * Prompt wiring for the store surfaces that show hearts (store home, category,
 * product detail): visible only while signed out with at least one favorite, so
 * unfavoriting the last item drops it again. Feed the result to
 * StorefrontChrome's `floatingFooter`.
 */
export function useGuestFavoritesPrompt(): ReactNode {
  const isAuthenticated = usePreviewedIsAuthenticated();
  const { ids } = useWishlist();
  const startAuthInPlace = useAuthFlowStore((s) => s.startAuthInPlace);

  if (isAuthenticated || ids.length === 0) return null;
  return (
    <GuestFavoritesAuthBanner
      count={ids.length}
      onSignUp={() => startAuthInPlace('signup', 'SignUp')}
      onSignIn={() => startAuthInPlace('signin', 'SignInEmail')}
    />
  );
}

type Props = {
  /** Number of guest favorites — drives the "n saved" line. */
  count: number;
  onSignUp: () => void;
  onSignIn: () => void;
};

/**
 * Bottom prompt for signed-out shoppers who have favorited something. Guest
 * favorites only live in the session, so this is the nudge to claim them.
 * Rendered via StorefrontChrome's `floatingFooter` on the store page only.
 */
export function GuestFavoritesAuthBanner({ count, onSignUp, onSignIn }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[styles.card, Platform.OS === 'web' ? { boxShadow: shadowsWeb.md } : shadows.md]}
      testID="guest-favorites-auth-banner"
    >
      <View style={styles.copyCol}>
        <Text style={styles.title}>Sign up to access your favorites</Text>
        <Text style={styles.body}>
          {count === 1 ? '1 product saved' : `${count} products saved`} to this device — create an
          account to keep them on any device.
        </Text>
      </View>
      <View style={styles.ctaRow}>
        <Pressable
          style={({ pressed, hovered }) => [
            styles.primaryCta,
            (hovered || pressed) && styles.primaryCtaHover,
          ]}
          onPress={onSignUp}
          accessibilityRole="button"
        >
          {({ pressed, hovered }) => (
            <Text style={[styles.primaryText, (hovered || pressed) && styles.primaryTextHover]}>
              Sign up
            </Text>
          )}
        </Pressable>
        <TouchableOpacity onPress={onSignIn} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.signIn}>Sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    card: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      backgroundColor: colors.logoDark,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.goldMuted,
    },
    copyCol: {
      flexShrink: 1,
      flexGrow: 1,
      minWidth: 180,
      gap: 2,
    },
    title: {
      fontWeight: '700',
      fontSize: typography.sm,
      color: colors.textInverse,
      letterSpacing: -0.22,
    },
    body: {
      fontSize: typography.sm,
      lineHeight: 18,
      color: colors.goldMuted,
      letterSpacing: -0.22,
    },
    ctaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flexShrink: 0,
      marginLeft: 'auto',
    },
    primaryCta: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.brand,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.pill,
      alignItems: 'center',
      flexShrink: 0,
      ...(Platform.OS === 'web'
        ? ({
            cursor: 'pointer',
            transitionProperty: 'background-color, border-color',
            transitionDuration: '200ms',
            transitionTimingFunction: 'ease-in-out',
          } as object)
        : null),
    },
    primaryCtaHover: {
      backgroundColor: colors.brand,
    },
    primaryText: {
      fontWeight: '700',
      fontSize: typography.sm,
      color: colors.brand,
      letterSpacing: -0.22,
      ...(Platform.OS === 'web'
        ? ({
            transitionProperty: 'color',
            transitionDuration: '200ms',
            transitionTimingFunction: 'ease-in-out',
          } as object)
        : null),
    },
    primaryTextHover: { color: colors.logoDark },
    signIn: {
      fontWeight: '600',
      fontSize: typography.sm,
      color: colors.brand,
      letterSpacing: -0.22,
    },
  });
}
