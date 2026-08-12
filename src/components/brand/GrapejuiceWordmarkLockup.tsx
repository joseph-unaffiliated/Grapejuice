import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GrapejuiceBrandMark } from './GrapejuiceBrandMark';
import { semanticColors, spacing, typeface } from '../../constants/theme';

type Props = {
  /** Mark size — matches storefront header compact mark when true. */
  compact?: boolean;
  color?: string;
  /** Decorative for nested a11y (parent provides label). */
  decorative?: boolean;
};

/**
 * Vertical auth/marketing lockup: “Grapejuice” (storefront header type) over grape cluster.
 * Do not use the tall condensed all-caps display lockup here.
 */
export function GrapejuiceWordmarkLockup({
  compact = false,
  color = semanticColors.logoDark,
  decorative = false,
}: Props) {
  return (
    <View
      style={styles.wrap}
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : 'Grapejuice'}
      accessibilityRole={decorative ? undefined : 'header'}
    >
      <Text style={[styles.wordmark, { color }]} accessibilityElementsHidden={decorative}>
        Grapejuice
      </Text>
      <GrapejuiceBrandMark
        markOnly
        compact={compact}
        color={color}
        decorative
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  /** Match StorefrontHeader `wordmark` — DM Sans bold, ~22, navy. */
  wordmark: {
    ...typeface('bold'),
    fontSize: 22,
    letterSpacing: -0.5,
  },
});
