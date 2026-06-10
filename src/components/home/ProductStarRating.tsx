import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { semanticColors, typography } from '../../constants/theme';

type Props = {
  count?: number;
  filled?: number;
};

/** Figma 384:497 — gold star row + review count. */
export function ProductStarRating({ count = 242, filled = 4 }: Props) {
  const stars = '★'.repeat(filled) + '☆'.repeat(5 - filled);
  return (
    <Text style={styles.row}>
      <Text style={styles.stars}>{stars}</Text>
      <Text style={styles.count}> ({count})</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  stars: {
    fontSize: typography.xs,
    fontWeight: '200',
    color: semanticColors.brand,
    letterSpacing: -0.2,
  },
  count: {
    fontSize: typography.xs,
    fontWeight: '200',
    color: semanticColors.textPrimary,
    letterSpacing: -0.2,
  },
});
