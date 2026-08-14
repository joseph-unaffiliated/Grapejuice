import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

export type LandingStoryBandProps = {
  heading: string;
  body: string;
  image: ImageSourcePropType;
  /** Index drives alternate orientation: even = text left / photo right. */
  index: number;
  ctaLabel?: string;
  onCta?: () => void;
};

/**
 * Inset editorial break — gold panel + photo, floating in page margins.
 * Alternates text/photo sides by `index` (even: copy | photo; odd: photo | copy).
 * Desktop: ~two side-by-side squares (overall 2:1).
 */
export function LandingStoryBand({
  heading,
  body,
  image,
  index,
  ctaLabel,
  onCta,
}: LandingStoryBandProps) {
  const { width } = useWindowDimensions();
  const stacked = width < 768;
  /** Even = copy first; odd = photo first. Same order stacks top→bottom on mobile. */
  const photoFirst = index % 2 === 1;

  const copy = (
    <View style={[styles.copyCol, stacked && styles.copyColStacked]}>
      <Text style={styles.heading}>{heading}</Text>
      <View style={styles.divider} />
      <Text style={styles.body}>{body}</Text>
      {ctaLabel && onCta ? (
        <TouchableOpacity
          style={styles.cta}
          onPress={onCta}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const media = (
    <View style={[styles.mediaCol, stacked && styles.mediaColStacked]}>
      <Image source={image} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
    </View>
  );

  return (
    <View style={styles.shell}>
      <View style={[styles.root, stacked ? styles.rootStacked : styles.rootWide]}>
        {photoFirst ? (
          <>
            {media}
            {copy}
          </>
        ) : (
          <>
            {copy}
            {media}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: MOBILE_GUTTER,
    marginVertical: spacing.lg,
  },
  root: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    backgroundColor: semanticColors.accentCream,
    overflow: 'hidden',
  },
  /** Two equal columns ≈ square each → overall 2:1. */
  rootWide: {
    aspectRatio: 2,
    minHeight: 420,
  },
  rootStacked: {
    flexDirection: 'column',
    minHeight: 0,
  },
  copyCol: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  copyColStacked: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  mediaCol: {
    flex: 1,
    backgroundColor: semanticColors.accentCream,
  },
  mediaColStacked: {
    width: '100%',
    flex: undefined,
    aspectRatio: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  heading: {
    ...typeface('light'),
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.4,
    color: semanticColors.logoDark,
    textAlign: 'center',
    maxWidth: 360,
  },
  divider: {
    width: 56,
    height: 1.5,
    backgroundColor: semanticColors.logoDark,
    opacity: 0.55,
  },
  body: {
    ...typeface('light'),
    fontSize: typography.lg,
    lineHeight: 24,
    color: semanticColors.logoDark,
    opacity: 0.88,
    maxWidth: 360,
    textAlign: 'center',
  },
  cta: {
    alignSelf: 'center',
    marginTop: spacing.xs,
    backgroundColor: semanticColors.logoDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  ctaText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.accentCream,
  },
});
