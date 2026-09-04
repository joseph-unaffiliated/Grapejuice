import React, { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { ShippingAddress } from '../../../types/pilot';
import type { ShippingAddressFieldErrors, ShippingRequiredField } from '../../../utils/formValidation';
import { spacing, typography, borderRadius, typeface } from '../../../constants/theme';
import { useThemeMode } from '../../../context/ThemeContext';
import type { SemanticColors } from '../../../constants/themeMode';

type Props = {
  address: ShippingAddress;
  onChange: (patch: Partial<ShippingAddress>) => void;
  /** Per-field errors after a failed submit attempt. */
  fieldErrors?: ShippingAddressFieldErrors;
};

function FieldLabel({
  label,
  required,
  styles,
}: {
  label: string;
  required?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Text style={styles.label}>
      {label}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );
}

export function CheckoutAddressFields({ address, onChange, fieldErrors }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const inputStyle = (key: ShippingRequiredField) => [
    styles.input,
    fieldErrors?.[key] ? styles.inputError : null,
  ];

  return (
    <>
      <Text style={styles.sectionTitle}>Shipping address</Text>
      <Text style={styles.requiredHint}>Fields marked * are required</Text>

      <FieldLabel label="Full name" required styles={styles} />
      <TextInput
        style={inputStyle('name')}
        value={address.name}
        onChangeText={(v) => onChange({ name: v })}
        placeholder="Jane Cohen"
        placeholderTextColor={colors.textTertiary}
        autoComplete="name"
        accessibilityLabel="Full name, required"
      />
      {fieldErrors?.name ? <Text style={styles.fieldError}>{fieldErrors.name}</Text> : null}

      <FieldLabel label="Address line 1" required styles={styles} />
      <TextInput
        style={inputStyle('line1')}
        value={address.line1}
        onChangeText={(v) => onChange({ line1: v })}
        placeholder="123 Main St"
        placeholderTextColor={colors.textTertiary}
        autoComplete="street-address"
        accessibilityLabel="Address line 1, required"
      />
      {fieldErrors?.line1 ? <Text style={styles.fieldError}>{fieldErrors.line1}</Text> : null}

      <FieldLabel label="Address line 2" styles={styles} />
      <TextInput
        style={styles.input}
        value={address.line2 ?? ''}
        onChangeText={(v) => onChange({ line2: v })}
        placeholder="Apt 4"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Address line 2, optional"
      />

      <FieldLabel label="City" required styles={styles} />
      <TextInput
        style={inputStyle('city')}
        value={address.city}
        onChangeText={(v) => onChange({ city: v })}
        placeholderTextColor={colors.textTertiary}
        autoComplete="postal-address-locality"
        accessibilityLabel="City, required"
      />
      {fieldErrors?.city ? <Text style={styles.fieldError}>{fieldErrors.city}</Text> : null}

      <View style={styles.row2}>
        <View style={styles.half}>
          <FieldLabel label="State / Province" required styles={styles} />
          <TextInput
            style={inputStyle('stateProvince')}
            value={address.stateProvince}
            onChangeText={(v) => onChange({ stateProvince: v })}
            placeholderTextColor={colors.textTertiary}
            autoComplete="postal-address-region"
            accessibilityLabel="State or province, required"
          />
          {fieldErrors?.stateProvince ? (
            <Text style={styles.fieldError}>{fieldErrors.stateProvince}</Text>
          ) : null}
        </View>
        <View style={styles.half}>
          <FieldLabel label="Postal code" required styles={styles} />
          <TextInput
            style={inputStyle('postalCode')}
            value={address.postalCode}
            onChangeText={(v) => onChange({ postalCode: v })}
            placeholderTextColor={colors.textTertiary}
            autoComplete="postal-code"
            accessibilityLabel="Postal code, required"
          />
          {fieldErrors?.postalCode ? (
            <Text style={styles.fieldError}>{fieldErrors.postalCode}</Text>
          ) : null}
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
      marginBottom: spacing.xs,
      ...typeface('medium'),
    },
    requiredHint: {
      fontSize: typography.sm,
      color: colors.textTertiary,
      marginBottom: spacing.sm,
      ...typeface('regular'),
    },
    label: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      marginBottom: 4,
      ...typeface('regular'),
    },
    requiredMark: {
      color: '#B42318',
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
      ...typeface('regular'),
    },
    inputError: {
      borderColor: '#B42318',
    },
    fieldError: {
      marginTop: 4,
      fontSize: typography.sm,
      color: '#B42318',
      ...typeface('medium'),
    },
    row2: { flexDirection: 'row', gap: spacing.sm },
    half: { flex: 1 },
  });
}
