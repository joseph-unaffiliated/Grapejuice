import React, { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { ShippingAddress } from '../../../types/pilot';
import type { ShippingAddressFieldErrors, ShippingRequiredField } from '../../../utils/formValidation';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../../constants/theme';

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
  const styles = useMemo(() => createStyles(), []);

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
        placeholderTextColor={semanticColors.textTertiary}
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
        placeholderTextColor={semanticColors.textTertiary}
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
        placeholderTextColor={semanticColors.textTertiary}
        accessibilityLabel="Address line 2, optional"
      />

      <FieldLabel label="City" required styles={styles} />
      <TextInput
        style={inputStyle('city')}
        value={address.city}
        onChangeText={(v) => onChange({ city: v })}
        placeholderTextColor={semanticColors.textTertiary}
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
            placeholderTextColor={semanticColors.textTertiary}
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
            placeholderTextColor={semanticColors.textTertiary}
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

function createStyles() {
  return StyleSheet.create({
    sectionTitle: {
      ...typeface('bold'),
      fontSize: typography.xl,
      color: semanticColors.textPrimary,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    requiredHint: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: semanticColors.textTertiary,
      marginBottom: spacing.sm,
    },
    label: {
      ...typeface('medium'),
      fontSize: typography.sm,
      color: semanticColors.textSecondary,
      marginTop: spacing.sm,
      marginBottom: 4,
    },
    requiredMark: {
      color: semanticColors.error,
      ...typeface('medium'),
    },
    input: {
      borderWidth: 1,
      borderColor: semanticColors.border,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      fontSize: typography.md,
      color: semanticColors.textPrimary,
      backgroundColor: semanticColors.bgPrimary,
      ...typeface('regular'),
    },
    inputError: {
      borderColor: semanticColors.error,
    },
    fieldError: {
      marginTop: 4,
      fontSize: typography.sm,
      color: semanticColors.error,
      ...typeface('medium'),
    },
    row2: { flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
    half: { flex: 1, minWidth: 0 },
  });
}
