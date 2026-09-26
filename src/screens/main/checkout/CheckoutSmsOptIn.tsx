import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../../constants/theme';

type Props = {
  phone: string;
  smsOptIn: boolean;
  onPhoneChange: (phone: string) => void;
  onSmsOptInChange: (optIn: boolean) => void;
};

export function CheckoutSmsOptIn({ phone, smsOptIn, onPhoneChange, onSmsOptInChange }: Props) {
  const styles = useMemo(() => createStyles(), []);

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
        placeholderTextColor={semanticColors.textTertiary}
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

function createStyles() {
  return StyleSheet.create({
    wrap: { marginTop: spacing.lg },
    sectionTitle: {
      ...typeface('bold'),
      fontSize: typography.xl,
      color: semanticColors.textPrimary,
      marginBottom: spacing.xs,
    },
    hint: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: semanticColors.textSecondary,
      marginBottom: spacing.md,
      lineHeight: 20,
    },
    label: {
      ...typeface('medium'),
      fontSize: typography.sm,
      color: semanticColors.textSecondary,
      marginBottom: spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: semanticColors.border,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      fontSize: typography.md,
      color: semanticColors.textPrimary,
      backgroundColor: semanticColors.bgPrimary,
      marginBottom: spacing.md,
      ...typeface('regular'),
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: semanticColors.borderDark,
      backgroundColor: semanticColors.bgPrimary,
    },
    checkboxOn: { backgroundColor: semanticColors.brand, borderColor: semanticColors.brand },
    checkboxLabel: {
      ...typeface('regular'),
      fontSize: typography.md,
      flex: 1,
      color: semanticColors.textPrimary,
    },
  });
}
