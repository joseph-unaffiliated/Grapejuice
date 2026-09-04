import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';
import { designPresets } from '../../constants/designPresets';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';

type Variant = 'pill' | 'pillOutline' | 'filled';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

export function GrapejuiceButton({
  label,
  onPress,
  variant = 'pill',
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
}: Props) {
  const { colors } = useThemeMode();

  const preset =
    variant === 'filled'
      ? designPresets.buttonFilled(colors)
      : variant === 'pillOutline'
        ? designPresets.buttonPillSecondary(colors)
        : designPresets.buttonPillPrimary(colors);

  const labelColor = variant === 'filled' ? colors.textInverse : colors.textPrimary;
  /** Brand gold on light pills; white on gold fill (same contrast as the old spinner). */
  const loaderColor = variant === 'filled' ? colors.textInverse : colors.brand;

  return (
    <TouchableOpacity
      style={[preset, styles.base, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <GrapejuiceBrandMark
          markOnly
          compact
          animating
          decorative
          color={loaderColor}
        />
      ) : (
        <Text style={[designPresets.textPillLabel(colors), { color: labelColor }, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Full-width by default so auth/modals stay centered; callers can override.
  // Avoid fixed minWidth — on narrow phones it overflows the card and looks right-skewed.
  base: { width: '100%', alignSelf: 'center' },
  disabled: { opacity: 0.5 },
});
