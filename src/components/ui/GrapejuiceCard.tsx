import React, { type ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';
import { designPresets } from '../../constants/designPresets';

type Variant = 'hero' | 'surface' | 'bordered';

type Props = {
  children: ReactNode;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
};

export function GrapejuiceCard({ children, variant = 'hero', style }: Props) {
  const { colors } = useThemeMode();

  const preset =
    variant === 'surface'
      ? designPresets.cardSurface(colors)
      : variant === 'bordered'
        ? designPresets.cardBordered(colors)
        : designPresets.cardHero(colors);

  return <View style={[preset, styles.base, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});
