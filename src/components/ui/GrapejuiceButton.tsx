import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';
import { designPresets } from '../../constants/designPresets';
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

  return (
    <TouchableOpacity
      style={[preset, styles.base, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[designPresets.textPillLabel(colors), { color: labelColor }, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { minWidth: 220 },
  disabled: { opacity: 0.5 },
});
