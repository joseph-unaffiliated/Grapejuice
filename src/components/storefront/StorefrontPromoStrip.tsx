import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import {
  LAYOUT,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const LINES = [
  'Free shipping on Hanukkah box orders',
  'Build a box · Ask Rav · arrives by Nov 20',
];

export function StorefrontPromoStrip() {
  const { width } = useWindowDimensions();
  const compact = width < LAYOUT.BREAKPOINT_TABLET;

  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      {LINES.map((line) => (
        <Text key={line} style={styles.line} numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: semanticColors.accentCream,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
  },
  rootCompact: {
    flexDirection: 'column',
    gap: 2,
  },
  line: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
});
