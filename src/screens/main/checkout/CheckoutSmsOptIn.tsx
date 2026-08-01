import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, typography, borderRadius, typeface } from '../../../constants/theme';
import { useThemeMode } from '../../../context/ThemeContext';
import type { SemanticColors } from '../../../constants/themeMode';

type Props = {
  phone: string;
  smsOptIn: boolean;
  onPhoneChange: (phone: string) => void;
  onSmsOptInChange: (optIn: boolean) => void;
};

export function CheckoutSmsOptIn({ phone, smsOptIn, onPhoneChange, onSmsOptInChange }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Text reminders (optional)</Text>
      <Text style={styles.hint}>Get a nudge before the box lock date with a link to My Box.</Text>
      <Text style={styles.label}>Mobile number</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={onPhoneChange}
        placeholder="+1 647 555 1234"
        placeholderTextColor={colors.textTertiary}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <TouchableOpacity style={styles.row} onPress={() => onSmsOptInChange(!smsOptIn)}>
        <View style={[styles.checkbox, smsOptIn && styles.checkboxOn]} />
        <Text style={styles.checkboxLabel}>Text me lock reminders</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    wrap: { marginTop: spacing.lg },
    sectionTitle: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      letterSpacing: -0.32,
      marginBottom: spacing.xs,
      ...typeface('medium'),
    },
    hint: {
      fontSize: typography.md,
      color: colors.textSecondary,
      marginBottom: spacing.md,
      lineHeight: typography.md * 1.4,
      ...typeface('regular'),
    },
    label: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      ...typeface('medium'),
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.bgPrimary,
      marginBottom: spacing.md,
      ...typeface('regular'),
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.bgPrimary,
    },
    checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    checkboxLabel: {
      fontSize: typography.md,
      flex: 1,
      color: colors.textPrimary,
      ...typeface('regular'),
    },
  });
}
