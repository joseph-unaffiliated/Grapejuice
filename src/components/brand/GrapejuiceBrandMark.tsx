import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  GrapejuiceLogomarkSvg,
  LOGOMARK_ASPECT,
  type GrapeWobbleTune,
} from './GrapejuiceLogomarkSvg';

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
  /** Per-grape wobble — used while Rav is generating a reply. */
  animating?: boolean;
  /** Loop the wobble while animating (default). Set false to play a single pass. */
  loop?: boolean;
  /** Override wobble timing / amplitude. */
  wobble?: GrapeWobbleTune;
  /** Explicit mark width (px). Overrides variant/compact sizing when set. */
  width?: number;
  /** Explicit mark height (px). Defaults from width ÷ aspect when omitted. */
  height?: number;
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
  animating = false,
  loop = true,
  wobble,
  width: widthProp,
  height: heightProp,
}: Props) {
  const fallback = sizeForVariant(variant, markOnly, compact);
  const width = widthProp ?? fallback.width;
  const height = heightProp ?? (widthProp != null ? width / LOGOMARK_ASPECT : fallback.height);

  return (
    <View
      style={[
        styles.wrap,
        align === 'left' && styles.wrapLeft,
        widthProp != null || heightProp != null
          ? { width, height, overflow: 'hidden' as const }
          : null,
      ]}
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : 'Grapejuice'}
      accessibilityRole={decorative ? undefined : 'image'}
    >
      <GrapejuiceLogomarkSvg
        width={width}
        height={height}
        color={color}
        animating={animating}
        loop={loop}
        wobble={wobble}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  wrapLeft: { alignItems: 'flex-start', alignSelf: 'flex-start' },
});
