import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { semanticColors, spacing, typography, typeface } from '../../constants/theme';

/** Message the building splash settles on — reused by the reveal's loading state
 *  so the hand-off shows no text swap or reflow. */
export const BUILD_LOADER_REST_MESSAGE = 'Almost there…';

/**
 * Shared grape + status line for the box-build flow. Used by both the building
 * splash and the reveal's loading state so the hand-off between them shows no
 * size or position shift (identical mark scale + status line height).
 */
export function OnboardingBuildLoader({ message }: { message: string }) {
  return (
    <View style={styles.column}>
      <View style={styles.markWrap}>
        <GrapejuiceBrandMark markOnly animating align="center" />
      </View>
      <Text style={styles.step}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markWrap: {
    transform: [{ scale: 1.75 }],
  },
  step: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: semanticColors.goldMuted,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
