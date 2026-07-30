import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typeface } from '../../constants/theme';

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

/**
 * Welcome Menorah overlay — matches box-feature “$80 / Free shipping”:
 * large white price + small white caption, no chip background.
 */
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
    alignItems: 'flex-start',
    gap: 2,
  },
  badgeCompact: {
    gap: 1,
  },
  price: {
    ...typeface('medium'),
    fontSize: 36,
    lineHeight: 40,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  priceCompact: {
    fontSize: 28,
    lineHeight: 30,
  },
  caption: {
    ...typeface('regular'),
    fontSize: 13,
    lineHeight: 16,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  captionCompact: {
    fontSize: 11,
    lineHeight: 13,
  },
});
