import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GrapejuiceBrandMark } from './GrapejuiceBrandMark';
import { LOGOMARK_ASPECT } from './GrapejuiceLogomarkSvg';
import { semanticColors, typography } from '../../constants/theme';

type Props = {
  /** Larger mark for full-screen boots (default). */
  large?: boolean;
  color?: string;
};

/**
 * Match typical CTA label line height so swapping label → grape never grows the button.
 * (GrapejuiceButton / checkout CTAs use ~lg type inside padded pills.)
 */
const BUTTON_LOADER_HEIGHT = typography.lg;
const BUTTON_LOADER_WIDTH = BUTTON_LOADER_HEIGHT * LOGOMARK_ASPECT;

/** Gold grape wobble — replaces ActivityIndicator for branded loading states. */
export function BrandLoadingMark({ large = true, color = semanticColors.brand }: Props) {
  if (large) {
    return (
      <View style={styles.large} accessibilityElementsHidden>
        <GrapejuiceBrandMark markOnly animating decorative color={color} />
      </View>
    );
  }

  return (
    <View style={styles.buttonSlot} accessibilityElementsHidden>
      <GrapejuiceBrandMark
        markOnly
        animating
        decorative
        color={color}
        width={BUTTON_LOADER_WIDTH}
        height={BUTTON_LOADER_HEIGHT}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  large: {
    transform: [{ scale: 1.75 }],
  },
  buttonSlot: {
    width: BUTTON_LOADER_WIDTH,
    height: BUTTON_LOADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
