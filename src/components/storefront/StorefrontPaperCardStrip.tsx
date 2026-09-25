import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { StorefrontPaperCardShell } from './StorefrontPaperCardShell';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

export type PaperCardCta = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

type Props = {
  headline: string;
  body?: string;
  primaryCta: PaperCardCta;
  /** Optional second button (outline). */
  secondaryCta?: PaperCardCta;
  /** Merged onto the outer maxWidth wrapper (e.g. strip-specific marginBottom). */
  style?: StyleProp<ViewStyle>;
};

/**
 * Shared cold-press paper promo card — grape mark only, centered copy + CTAs.
 * Shell matches Ask Rav / Our Story (radius, wash, maxWidth 1024).
 */
export function StorefrontPaperCardStrip({
  headline,
  body,
  primaryCta,
  secondaryCta,
  style,
}: Props) {
  return (
    <StorefrontPaperCardShell style={style} contentStyle={styles.innerGap}>
      <View style={styles.logoWrap}>
        <GrapejuiceBrandMark
          markOnly
          color={semanticColors.logoDark}
          decorative
        />
      </View>
      {headline ? <Text style={styles.headline}>{headline}</Text> : null}
      {body ? <Text style={styles.body}>{body}</Text> : null}
      <View style={styles.ctas}>
        <TouchableOpacity
          style={[
            styles.cta,
            styles.ctaPrimary,
            primaryCta.disabled && styles.ctaDisabled,
          ]}
          onPress={primaryCta.onPress}
          disabled={primaryCta.disabled}
          accessibilityRole="button"
          accessibilityLabel={primaryCta.label}
          accessibilityState={{ disabled: Boolean(primaryCta.disabled) }}
        >
          <Text style={styles.ctaPrimaryText}>{primaryCta.label}</Text>
        </TouchableOpacity>
        {secondaryCta ? (
          <TouchableOpacity
            style={[
              styles.cta,
              styles.ctaSecondary,
              secondaryCta.disabled && styles.ctaDisabled,
            ]}
            onPress={secondaryCta.onPress}
            disabled={secondaryCta.disabled}
            accessibilityRole="button"
            accessibilityLabel={secondaryCta.label}
            accessibilityState={{ disabled: Boolean(secondaryCta.disabled) }}
          >
            <Text style={styles.ctaSecondaryText}>{secondaryCta.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </StorefrontPaperCardShell>
  );
}

const styles = StyleSheet.create({
  innerGap: {
    gap: spacing.sm,
  },
  logoWrap: {
    marginBottom: spacing.md,
  },
  headline: {
    ...typeface('medium'),
    fontSize: 28,
    lineHeight: 34,
    color: semanticColors.logoDark,
    textAlign: 'center',
    maxWidth: 400,
    alignSelf: 'center',
  },
  body: {
    ...typeface('regular'),
    fontSize: 13,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  ctas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
    width: '100%',
  },
  cta: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimary: {
    backgroundColor: semanticColors.brand,
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  ctaSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: semanticColors.border,
  },
  ctaSecondaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  ctaDisabled: {
    opacity: 0.72,
  },
});
