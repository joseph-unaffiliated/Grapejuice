import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';
import { spacing, typography, borderRadius } from '../../constants/theme';

type Props = {
  onCreateAccount: () => void;
  onSignIn: () => void;
};

export function GuestBoxAuthBanner({ onCreateAccount, onSignIn }: Props) {
  const { colors } = useThemeMode();

  return (
    <View style={[styles.banner, { backgroundColor: colors.brandLight, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Sign in to customize your box</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        You can browse what we picked — create a free account to swap items, add extras, and check out.
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
          onPress={onCreateAccount}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryText, { color: colors.textInverse }]}>Create account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSignIn} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.brand }]}>Sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  title: { fontSize: typography.xl, fontWeight: '700' },
  body: { fontSize: typography.md, marginTop: spacing.xs, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  primaryBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.pill,
  },
  primaryText: { fontWeight: '700', fontSize: typography.lg },
  link: { fontWeight: '600', fontSize: typography.lg },
});
