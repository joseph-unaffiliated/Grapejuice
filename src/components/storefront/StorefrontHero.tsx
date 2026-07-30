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
        {hero.body ? (
          <Text style={[styles.body, compact && styles.bodyCompact]}>{hero.body}</Text>
        ) : null}
        <View style={[styles.ctas, compact && styles.ctasCompact]}>
          <TouchableOpacity
            style={[styles.ctaPrimary, compact && styles.ctaCompact]}
            onPress={onShopLook}
            accessibilityRole="button"
            accessibilityLabel={hero.ctaLabel ?? 'Browse menorahs'}
          >
            <Text style={styles.ctaPrimaryText}>{hero.ctaLabel ?? 'Browse menorahs'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ctaSecondary, compact && styles.ctaCompact]}
            onPress={onBuildBox}
            accessibilityRole="button"
            accessibilityLabel="Build a box"
          >
            <Text style={styles.ctaSecondaryText}>Build a box</Text>
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
    fontSize: 36,
    lineHeight: 44,
    color: semanticColors.textInverse,
    textAlign: 'center',
    textTransform: 'lowercase',
    marginBottom: spacing.sm,
    textShadowColor: 'rgba(17, 2, 34, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  headlineCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  body: {
    ...typeface('regular'),
    fontSize: 16,
    color: semanticColors.textInverse,
    textAlign: 'center',
    maxWidth: 480,
    lineHeight: 24,
    opacity: 0.95,
    marginBottom: spacing.lg,
    textShadowColor: 'rgba(17, 2, 34, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  bodyCompact: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
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
    maxWidth: 320,
    alignSelf: 'center',
  },
  ctaPrimary: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  ctaCompact: {
    width: '100%',
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: 14,
    color: semanticColors.logoDark,
  },
  ctaSecondary: {
    backgroundColor: 'rgba(17, 2, 34, 0.65)',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
  },
  ctaSecondaryText: {
    ...typeface('medium'),
    fontSize: 14,
    color: semanticColors.textInverse,
  },
});
