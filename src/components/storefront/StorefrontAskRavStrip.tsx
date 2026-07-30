import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Props = {
  onPress: () => void;
};

export function StorefrontAskRavStrip({ onPress }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.inner}>
        <Text style={styles.eyebrow}>Need a guide?</Text>
        <Text style={styles.headline}>Ask Rav</Text>
        <Text style={styles.body}>
          Overwhelmed by options? Rav helps you navigate the store — what fits your household,
          what to skip, and what belongs in your box.
        </Text>
        <TouchableOpacity
          style={styles.cta}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Ask Rav for help browsing"
        >
          <Text style={styles.ctaText}>Get help browsing</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: semanticColors.bgPrimary,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
  },
  inner: {
    maxWidth: 640,
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headline: {
    ...typeface('medium'),
    fontSize: 28,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  body: {
    ...typeface('regular'),
    fontSize: 13,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  cta: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: semanticColors.logoDark,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  ctaText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
});
