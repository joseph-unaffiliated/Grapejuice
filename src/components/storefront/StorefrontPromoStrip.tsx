import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const PROMO_COPY = 'Free shipping on Hanukkah box orders • Arrives by Nov 20';

/** Centered promo line; wraps as one unit if the viewport is too narrow. */
export function StorefrontPromoStrip() {
  const insets = useSafeAreaInsets();
  const paddingTop =
    Platform.OS === 'web'
      ? // Prefer CSS env so iPhone Safari notch clearance works even if RN insets lag.
        (`max(${spacing.sm}px, env(safe-area-inset-top, 0px))` as unknown as number)
      : spacing.sm + insets.top;

  return (
    <View style={[styles.root, { paddingTop }]}>
      <Text style={styles.line}>{PROMO_COPY}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: semanticColors.accentCream,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
  },
  line: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
});
