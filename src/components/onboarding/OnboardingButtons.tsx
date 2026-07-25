import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { semanticColors, typography, borderRadius, typeface } from '../../constants/theme';

type PrimaryProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Figma 100:525 — black fill, gold label + hairline border, 8px radius. */
export function OnboardingPrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
}: PrimaryProps) {
  return (
    <TouchableOpacity
      style={[styles.primary, (disabled || loading) && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={semanticColors.brand} />
      ) : (
        <Text style={styles.primaryLabel}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

type SecondaryProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Figma 100:528 — gold outline, extralight label. */
export function OnboardingSecondaryButton({
  label,
  onPress,
  disabled = false,
  style,
}: SecondaryProps) {
  return (
    <TouchableOpacity
      style={[styles.secondary, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.secondaryLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  primary: {
    width: '100%',
    minHeight: 48,
    backgroundColor: '#000000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    ...typeface('regular'),
    fontSize: typography.xxl,
    color: semanticColors.brand,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  secondary: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    ...typeface('light'),
    fontSize: typography.sm,
    color: '#000000',
    letterSpacing: -0.22,
    textAlign: 'center',
  },
  disabled: { opacity: 0.5 },
});
