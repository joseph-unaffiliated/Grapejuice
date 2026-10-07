import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { ShippingAddress } from '../../../types/pilot';
import type { ShippingAddressFieldErrors, ShippingRequiredField } from '../../../utils/formValidation';
import { spacing, semanticColors, typeface } from '../../../constants/theme';
import { checkoutUi } from './checkoutUi';

type Props = {
  address: ShippingAddress;
  onChange: (patch: Partial<ShippingAddress>) => void;
  /** Per-field errors after a failed submit attempt. */
  fieldErrors?: ShippingAddressFieldErrors;
  heading?: string;
  hint?: string;
};

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={checkoutUi.label}>
      {label}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );
}

export function CheckoutAddressFields({
  address,
  onChange,
  fieldErrors,
  heading = 'Shipping Address',
  hint = 'Fields marked * are required',
}: Props) {
  const inputStyle = (key: ShippingRequiredField) => [
    checkoutUi.input,
    fieldErrors?.[key] ? checkoutUi.inputError : null,
  ];

  return (
    <>
      <Text style={checkoutUi.sectionHeading}>{heading}</Text>
      <Text style={[checkoutUi.hint, styles.requiredHint]}>{hint}</Text>

      <FieldLabel label="Full name" required />
      <TextInput
        style={inputStyle('name')}
        value={address.name}
        onChangeText={(v) => onChange({ name: v })}
        placeholder="Jane Cohen"
        placeholderTextColor={semanticColors.textTertiary}
        autoComplete="name"
        accessibilityLabel="Full name, required"
      />
      {fieldErrors?.name ? <Text style={checkoutUi.fieldError}>{fieldErrors.name}</Text> : null}

      <FieldLabel label="Address line 1" required />
      <TextInput
        style={inputStyle('line1')}
        value={address.line1}
        onChangeText={(v) => onChange({ line1: v })}
        placeholder="123 Main St"
        placeholderTextColor={semanticColors.textTertiary}
        autoComplete="street-address"
        accessibilityLabel="Address line 1, required"
      />
      {fieldErrors?.line1 ? <Text style={checkoutUi.fieldError}>{fieldErrors.line1}</Text> : null}

      <FieldLabel label="Address line 2" />
      <TextInput
        style={checkoutUi.input}
        value={address.line2 ?? ''}
        onChangeText={(v) => onChange({ line2: v })}
        placeholder="Apt 4"
        placeholderTextColor={semanticColors.textTertiary}
        accessibilityLabel="Address line 2, optional"
      />

      <FieldLabel label="City" required />
      <TextInput
        style={inputStyle('city')}
        value={address.city}
        onChangeText={(v) => onChange({ city: v })}
        placeholderTextColor={semanticColors.textTertiary}
        autoComplete="postal-address-locality"
        accessibilityLabel="City, required"
      />
      {fieldErrors?.city ? <Text style={checkoutUi.fieldError}>{fieldErrors.city}</Text> : null}

      <View style={styles.row2}>
        <View style={styles.half}>
          <FieldLabel label="State" required />
          <TextInput
            style={inputStyle('stateProvince')}
            value={address.stateProvince}
            onChangeText={(v) => onChange({ stateProvince: v })}
            placeholderTextColor={semanticColors.textTertiary}
            autoComplete="postal-address-region"
            accessibilityLabel="State, required"
          />
          {fieldErrors?.stateProvince ? (
            <Text style={checkoutUi.fieldError}>{fieldErrors.stateProvince}</Text>
          ) : null}
        </View>
        <View style={styles.half}>
          <FieldLabel label="Zip Code" required />
          <TextInput
            style={inputStyle('postalCode')}
            value={address.postalCode}
            onChangeText={(v) => onChange({ postalCode: v })}
            placeholderTextColor={semanticColors.textTertiary}
            autoComplete="postal-code"
            accessibilityLabel="Zip code, required"
          />
          {fieldErrors?.postalCode ? (
            <Text style={checkoutUi.fieldError}>{fieldErrors.postalCode}</Text>
          ) : null}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  requiredHint: { marginBottom: spacing.xs },
  requiredMark: {
    color: semanticColors.error,
    ...typeface('regular'),
  },
  row2: { flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
  half: { flex: 1, minWidth: 0 },
});
