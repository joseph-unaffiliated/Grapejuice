import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';
import { BRAND_BYLINE } from '../../constants/themeMode';

export function ScreenShell({
  title,
  subtitle,
  children,
  style,
  showByline = false,
  variant = 'default',
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
  showByline?: boolean;
  /** Auth/onboarding: centered card on tablet+ desktop web */
  variant?: 'default' | 'auth-card';
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const useAuthCard = Platform.OS === 'web' && isDesktop && variant === 'auth-card';

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.bgPrimary,
          paddingTop: Platform.OS === 'web' ? spacing.lg : insets.top,
        },
        Platform.OS === 'web' && { width: '100%', flex: 1 },
        style,
      ]}
    >
      <View style={[styles.headerBlock, useAuthCard && styles.authCard, useAuthCard && styles.authCardShadow]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        ) : null}
        {showByline ? (
          <Text style={[styles.byline, { color: colors.textTertiary }]}>{BRAND_BYLINE}</Text>
        ) : null}
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.md },
  headerBlock: { flex: 1 },
  authCard: {
    maxWidth: 440,
    alignSelf: 'center',
    width: '100%',
    marginTop: spacing.xxl,
    padding: spacing.xl,
    borderRadius: borderRadius.xxl,
    backgroundColor: '#FFFFFF',
  },
  authCardShadow: Platform.OS === 'web' ? { boxShadow: shadowsWeb.card } : {},
  title: { fontSize: typography.headerLg, fontWeight: '700', marginTop: spacing.md },
  subtitle: { fontSize: typography.lg, marginTop: spacing.xs, marginBottom: spacing.sm },
  byline: { fontSize: typography.sm, marginTop: spacing.xs },
  body: { flex: 1, marginTop: spacing.md },
});
