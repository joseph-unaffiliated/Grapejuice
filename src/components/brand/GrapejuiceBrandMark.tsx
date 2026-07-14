import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GrapejuiceLogomarkSvg, LOGOMARK_ASPECT } from './GrapejuiceLogomarkSvg';

type Props = {
  compact?: boolean;
  markOnly?: boolean;
  /** Figma Rav welcome — compact sidebar wordmark */
  variant?: 'default' | 'footer' | 'sidebar';
  align?: 'left' | 'center';
  /** Decorative marks (e.g. sidebar) are not focusable and have no a11y label. */
  decorative?: boolean;
  /** Override mark color (defaults to black). */
  color?: string;
};

function sizeForVariant(
  variant: NonNullable<Props['variant']>,
  markOnly: boolean,
  compact: boolean
): { width: number; height: number } {
  if (variant === 'footer' || variant === 'sidebar') {
    const width = 16;
    return { width, height: width / LOGOMARK_ASPECT };
  }
  if (markOnly) {
    const width = compact ? 24 : 30;
    return { width, height: width / LOGOMARK_ASPECT };
  }
  const width = compact ? 61 : 75;
  return { width, height: width / LOGOMARK_ASPECT };
}

/** Grape cluster logomark — SVG mark used across home sidebar, Rav, auth, onboarding. */
export function GrapejuiceBrandMark({
  compact = false,
  markOnly = false,
  variant = 'default',
  align = 'center',
  decorative = variant === 'sidebar',
  color = '#000000',
}: Props) {
  const { width, height } = sizeForVariant(variant, markOnly, compact);

  return (
    <View
      style={[styles.wrap, align === 'left' && styles.wrapLeft]}
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : 'Grapejuice'}
      accessibilityRole={decorative ? undefined : 'image'}
    >
      <GrapejuiceLogomarkSvg width={width} height={height} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  wrapLeft: { alignItems: 'flex-start', alignSelf: 'flex-start' },
});
