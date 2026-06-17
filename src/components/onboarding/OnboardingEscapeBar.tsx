import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../../context/ThemeContext';
import { spacing, typography } from '../../constants/theme';

type Props = {
  onExit: () => void;
  disabled?: boolean;
};

/** Persistent way out of the build-your-box onboarding flow. */
export function OnboardingEscapeBar({ onExit, disabled = false }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeMode();

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: Math.max(insets.top, spacing.sm),
          backgroundColor: colors.bgPrimary,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onExit}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Explore without building a box"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.label, { color: disabled ? colors.textTertiary : colors.goldMuted }]}>
          Explore without building a box
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
    alignItems: 'flex-end',
  },
  label: {
    fontSize: typography.sm,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
