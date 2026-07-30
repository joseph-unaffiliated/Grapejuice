import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { StorefrontMediaPlaceholder } from './StorefrontMediaPlaceholder';
import { STOREFRONT_HERO } from '../../constants/storefrontMedia';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
} from '../../constants/theme';

type Props = {
  onShopLook: () => void;
  onBuildBox: () => void;
};

export function StorefrontHero({ onShopLook, onBuildBox }: Props) {
  const { height, width } = useWindowDimensions();
  const compact = width < 768;
  const heroHeight = Math.min(Math.max(height * (compact ? 0.48 : 0.55), compact ? 320 : 360), 560);
  const hero = STOREFRONT_HERO;

  return (
    <View style={[styles.root, { height: heroHeight }]}>
      <StorefrontMediaPlaceholder
        slot={hero}
        quiet
        fill
        style={styles.media}
      />
      {/* Bottom scrim only — keeps the photo clear above, text readable below */}
      <View style={styles.scrim} pointerEvents="none" />
      <View
        style={[styles.overlay, compact && styles.overlayCompact]}
        pointerEvents="box-none"
      >
        <Text style={[styles.headline, compact && styles.headlineCompact]}>{hero.headline}</Text>
        {hero.body || hero.bodySecondary ? (
          <View style={[styles.bodyBlock, compact && styles.bodyBlockCompact]}>
            {hero.body ? (
              <Text style={[styles.body, compact && styles.bodyCompact]}>{hero.body}</Text>
            ) : null}
            {hero.bodySecondary ? (
              <Text style={[styles.bodySecondary, compact && styles.bodySecondaryCompact]}>
                {hero.bodySecondary}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={[styles.ctas, compact && styles.ctasCompact]}>
          <TouchableOpacity
            style={[styles.ctaPrimary, compact && styles.ctaCompact]}
            onPress={onShopLook}
            accessibilityRole="button"
            accessibilityLabel={hero.ctaLabel ?? 'Browse the Collection'}
          >
            <Text style={styles.ctaPrimaryText}>{hero.ctaLabel ?? 'Browse the Collection'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ctaSecondary, compact && styles.ctaCompact]}
            onPress={onBuildBox}
            accessibilityRole="button"
            accessibilityLabel="Build your Box (starting at $80)"
          >
            <Text style={styles.ctaSecondaryText}>Build your Box (starting at $80)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    position: 'relative',
    backgroundColor: semanticColors.accentCream,
    overflow: 'hidden',
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
    borderWidth: 0,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '58%',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(to top, rgba(17, 2, 34, 0.72) 0%, rgba(17, 2, 34, 0.28) 55%, transparent 100%)',
        } as object)
      : { backgroundColor: 'rgba(17, 2, 34, 0.4)' }),
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  overlayCompact: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg,
  },
  headline: {
    ...typeface('light'),
    fontSize: 44,
    lineHeight: 54,
    letterSpacing: 0.6,
    color: semanticColors.textInverse,
    textAlign: 'center',
    marginBottom: spacing.sm,
    textShadowColor: 'rgba(17, 2, 34, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  headlineCompact: {
    fontSize: 34,
    lineHeight: 42,
  },
  bodyBlock: {
    alignItems: 'center',
    maxWidth: 480,
    marginBottom: spacing.lg,
    gap: 2,
  },
  bodyBlockCompact: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  body: {
    ...typeface('regular'),
    fontSize: 16,
    color: semanticColors.textInverse,
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.95,
    textShadowColor: 'rgba(17, 2, 34, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  bodyCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
  bodySecondary: {
    ...typeface('regular'),
    fontSize: 12,
    color: semanticColors.textInverse,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.68,
    textShadowColor: 'rgba(17, 2, 34, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  bodySecondaryCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  ctas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: '100%',
  },
  ctasCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    maxWidth: 280,
    alignSelf: 'center',
  },
  /** Collection — dark fill (primary CTA) */
  ctaPrimary: {
    backgroundColor: semanticColors.logoDark,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  ctaCompact: {
    width: '100%',
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: 12,
    color: semanticColors.textInverse,
  },
  /** Build a box — light fill */
  ctaSecondary: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  ctaSecondaryText: {
    ...typeface('medium'),
    fontSize: 12,
    color: semanticColors.logoDark,
  },
});
