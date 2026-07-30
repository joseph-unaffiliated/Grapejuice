import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
} from '../../constants/theme';

/** Catalog id for the Welcome Menorah (Airtable "Welcome Menorah"). */
export const WELCOME_MENORAH_ID = 'welcome-menorah';

export function isWelcomeMenorah(item: { id?: string; name?: string }): boolean {
  if (item.id === WELCOME_MENORAH_ID) return true;
  return /welcome\s*menorah/i.test(item.name ?? '');
}

type Props = {
  /** Compact for product tiles; default for PDP hero. */
  compact?: boolean;
};

/** Special storefront badge: big $18 + small “for subscribers”. */
export function WelcomeSubscriberBadge({ compact }: Props) {
  return (
    <View
      style={[styles.badge, compact && styles.badgeCompact]}
      accessibilityLabel="$18 for subscribers"
      pointerEvents="none"
    >
      <Text style={[styles.price, compact && styles.priceCompact]}>$18</Text>
      <Text style={[styles.caption, compact && styles.captionCompact]}>for subscribers</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'flex-start',
    maxWidth: 140,
  },
  badgeCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    maxWidth: 108,
  },
  price: {
    ...typeface('medium'),
    fontSize: 28,
    lineHeight: 32,
    color: semanticColors.logoDark,
  },
  priceCompact: {
    fontSize: 22,
    lineHeight: 24,
  },
  caption: {
    ...typeface('regular'),
    fontSize: 11,
    lineHeight: 14,
    color: semanticColors.goldMuted,
    marginTop: 2,
  },
  captionCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
});
