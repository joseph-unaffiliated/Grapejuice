import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GrapejuiceBrandMark } from './GrapejuiceBrandMark';
import { semanticColors } from '../../constants/theme';

type Props = {
  /** Larger mark for full-screen boots (default). */
  large?: boolean;
  color?: string;
};

/** Gold grape wobble — replaces ActivityIndicator for branded loading states. */
export function BrandLoadingMark({ large = true, color = semanticColors.brand }: Props) {
  return (
    <View style={large ? styles.large : undefined} accessibilityElementsHidden>
      <GrapejuiceBrandMark markOnly animating decorative color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  large: {
    transform: [{ scale: 1.75 }],
  },
});
