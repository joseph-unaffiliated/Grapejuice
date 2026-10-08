import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import type { ShippingAddress } from '../../../types/pilot';
import type { ShippingAddressFieldErrors, ShippingRequiredField } from '../../../utils/formValidation';
import type { SuggestedAddress } from '../../../services/checkout/validateAddressRemote';
import { borderRadius, spacing, semanticColors, typeface, typography } from '../../../constants/theme';
import { checkoutUi } from './checkoutUi';

type Props = {
  address: ShippingAddress;
  onChange: (patch: Partial<ShippingAddress>) => void;
  /** Per-field errors after a failed submit attempt. */
  fieldErrors?: ShippingAddressFieldErrors;
  heading?: string;
  hint?: string;
  /** Corrected address from the deliverability check. */
  suggestion?: SuggestedAddress | null;
  onUseSuggestion?: () => void;
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
  suggestion,
  onUseSuggestion,
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
      {suggestion ? (
        <View style={styles.suggestion} accessibilityLiveRegion="polite">
          <Text style={styles.suggestionTitle}>Did you mean…?</Text>
          <Text style={styles.suggestionAddress}>
            {[suggestion.line1, suggestion.line2].filter(Boolean).join(', ')}
            {'\n'}
            {`${suggestion.city}, ${suggestion.stateProvince} ${suggestion.postalCode}`}
          </Text>
          <View style={styles.suggestionActions}>
            <TouchableOpacity
              onPress={onUseSuggestion}
              accessibilityRole="button"
              accessibilityLabel="Use this address"
              style={styles.suggestionButton}
            >
              <Text style={styles.suggestionButtonText}>Use this address</Text>
            </TouchableOpacity>
            <Text style={checkoutUi.hint}>Or press Continue to keep yours.</Text>
          </View>
        </View>
      ) : null}
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
  suggestion: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    backgroundColor: semanticColors.bgElevated,
    gap: spacing.xs,
  },
  suggestionTitle: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  suggestionAddress: {
    ...typeface('regular'),
    fontSize: typography.md,
    lineHeight: 20,
    color: semanticColors.textPrimary,
  },
  suggestionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  suggestionButton: {
    borderRadius: borderRadius.xl,
    backgroundColor: semanticColors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
    justifyContent: 'center',
  },
  suggestionButtonText: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
});
