import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import type { ShippingAddress } from '../../../types/pilot';
import type { ShippingAddressFieldErrors, ShippingRequiredField } from '../../../utils/formValidation';
import type { SuggestedAddress } from '../../../services/checkout/validateAddressRemote';
import { borderRadius, spacing, semanticColors, typeface, typography } from '../../../constants/theme';
import { checkoutUi } from './checkoutUi';
import { useMobileLayout } from '../../../hooks/useMobileLayout';
import { MobileField } from '../../../components/mobile/MobileField';
import { m, mFont, mType } from '../../../components/mobile/mobileTheme';

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
  const mobileLayout = useMobileLayout();
  if (mobileLayout) {
    return (
      <MobileAddressFields
        address={address}
        onChange={onChange}
        fieldErrors={fieldErrors}
        heading={heading}
        hint={hint === 'Fields marked * are required' ? '' : hint}
        suggestion={suggestion}
        onUseSuggestion={onUseSuggestion}
      />
    );
  }
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

/** Phone (mockups/checkout s=1): plain labels, the apartment line behind a link, city · state · ZIP on one row. */
function MobileAddressFields({ address, onChange, fieldErrors, heading, hint, suggestion, onUseSuggestion }: Props) {
  const [aptOpen, setAptOpen] = useState(() => !!address.line2);
  return (
    <View>
      {heading ? <Text style={[mType.h3, { marginBottom: hint ? 4 : 12 }]}>{heading}</Text> : null}
      {hint ? <Text style={[mType.small, { marginBottom: 12 }]}>{hint}</Text> : null}
      <MobileField label="Full name" value={address.name} onChangeText={(v) => onChange({ name: v })} autoComplete="name" error={fieldErrors?.name} />
      <MobileField label="Address" value={address.line1} onChangeText={(v) => onChange({ line1: v })} autoComplete="street-address" error={fieldErrors?.line1} />
      {aptOpen ? (
        <MobileField label="Apt, suite or floor" value={address.line2 ?? ''} onChangeText={(v) => onChange({ line2: v })} autoComplete="address-line2" />
      ) : (
        <Pressable onPress={() => setAptOpen(true)} accessibilityRole="button" style={styles.mAptLink}>
          <Text style={styles.mAptText}>+ Apt, suite or floor</Text>
        </Pressable>
      )}
      <View style={styles.mRow}>
        <MobileField style={{ flex: 1.6 }} label="City" value={address.city} onChangeText={(v) => onChange({ city: v })} autoComplete="postal-address-locality" error={fieldErrors?.city} />
        <MobileField style={{ flex: 0.8 }} label="State" value={address.stateProvince} onChangeText={(v) => onChange({ stateProvince: v })} autoComplete="postal-address-region" autoCapitalize="characters" error={fieldErrors?.stateProvince} />
        <MobileField style={{ flex: 1.1 }} label="ZIP" value={address.postalCode} onChangeText={(v) => onChange({ postalCode: v })} autoComplete="postal-code" keyboardType="number-pad" error={fieldErrors?.postalCode} />
      </View>
      {suggestion ? (
        <View style={styles.mSuggestion} accessibilityLiveRegion="polite">
          <Text style={[mType.bodyStrong, { fontSize: 14 }]}>Did you mean…?</Text>
          <Text style={[mType.body, { fontSize: 14 }]}>
            {[suggestion.line1, suggestion.line2].filter(Boolean).join(', ')}
            {'\n'}
            {`${suggestion.city}, ${suggestion.stateProvince} ${suggestion.postalCode}`}
          </Text>
          <Text style={styles.mAptText} onPress={onUseSuggestion} accessibilityRole="button">Use this address</Text>
          <Text style={mType.tiny}>Or continue to keep yours.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mAptLink: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', marginTop: -2, marginBottom: 8 },
  mAptText: { fontSize: 14, color: m.goldDark, ...mFont(400) },
  mRow: { flexDirection: 'row', gap: 8 },
  mSuggestion: { backgroundColor: m.beige, borderRadius: 12, padding: 12, gap: 6, marginBottom: 12 },
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
