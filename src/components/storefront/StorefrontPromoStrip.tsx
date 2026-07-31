import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const PROMO_COPY = 'Free shipping on Hanukkah box orders • Arrives by Nov 20';

/** Centered promo line; wraps as one unit if the viewport is too narrow. */
export function StorefrontPromoStrip() {
  return (
    <View style={styles.root}>
      <Text style={styles.line}>{PROMO_COPY}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
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
