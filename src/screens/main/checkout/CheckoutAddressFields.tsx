import React, { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { ShippingAddress } from '../../../types/pilot';
import { spacing, typography, borderRadius, typeface } from '../../../constants/theme';
import { useThemeMode } from '../../../context/ThemeContext';
import type { SemanticColors } from '../../../constants/themeMode';

export function CheckoutAddressFields({
  address,
  onChange,
}: {
  address: ShippingAddress;
  onChange: (patch: Partial<ShippingAddress>) => void;
}) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      <Text style={styles.sectionTitle}>Shipping address</Text>
      <Text style={styles.label}>Full name</Text>
      <TextInput
        style={styles.input}
        value={address.name}
        onChangeText={(v) => onChange({ name: v })}
        placeholder="Jane Cohen"
        placeholderTextColor={colors.textTertiary}
        autoComplete="name"
      />
      <Text style={styles.label}>Address line 1</Text>
      <TextInput
        style={styles.input}
        value={address.line1}
        onChangeText={(v) => onChange({ line1: v })}
        placeholder="123 Main St"
        placeholderTextColor={colors.textTertiary}
        autoComplete="street-address"
      />
      <Text style={styles.label}>Address line 2 (optional)</Text>
      <TextInput
        style={styles.input}
        value={address.line2 ?? ''}
        onChangeText={(v) => onChange({ line2: v })}
        placeholder="Apt 4"
        placeholderTextColor={colors.textTertiary}
      />
      <Text style={styles.label}>City</Text>
      <TextInput
        style={styles.input}
        value={address.city}
        onChangeText={(v) => onChange({ city: v })}
        placeholderTextColor={colors.textTertiary}
        autoComplete="postal-address-locality"
      />
      <View style={styles.row2}>
        <View style={styles.half}>
          <Text style={styles.label}>State / Province</Text>
          <TextInput
            style={styles.input}
            value={address.stateProvince}
            onChangeText={(v) => onChange({ stateProvince: v })}
            placeholderTextColor={colors.textTertiary}
            autoComplete="postal-address-region"
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Postal code</Text>
          <TextInput
            style={styles.input}
            value={address.postalCode}
            onChangeText={(v) => onChange({ postalCode: v })}
            placeholderTextColor={colors.textTertiary}
            autoComplete="postal-code"
          />
        </View>
      </View>
    </>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    sectionTitle: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      letterSpacing: -0.32,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      ...typeface('medium'),
    },
    label: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      marginBottom: 4,
      ...typeface('regular'),
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.bgPrimary,
      ...typeface('regular'),
    },
    row2: { flexDirection: 'row', gap: spacing.sm },
    half: { flex: 1 },
  });
}
