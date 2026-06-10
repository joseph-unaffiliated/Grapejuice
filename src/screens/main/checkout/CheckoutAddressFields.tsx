import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import type { ShippingAddress } from '../../../types/pilot';
import { semanticColors, spacing, typography, borderRadius } from '../../../constants/theme';

export function CheckoutAddressFields({
  address,
  onChange,
}: {
  address: ShippingAddress;
  onChange: (patch: Partial<ShippingAddress>) => void;
}) {
  const setCountry = (c: 'US' | 'CA' | 'OTHER') => {
    if (c !== 'US') {
      onChange({ country: 'US' });
      return;
    }
    onChange({ country: c });
  };
  return (
    <>
      <Text style={styles.sectionTitle}>Shipping address</Text>
      <Text style={styles.label}>Full name</Text>
      <TextInput
        style={styles.input}
        value={address.name}
        onChangeText={(v) => onChange({ name: v })}
        placeholder="Jane Cohen"
        autoComplete="name"
      />
      <Text style={styles.label}>Address line 1</Text>
      <TextInput
        style={styles.input}
        value={address.line1}
        onChangeText={(v) => onChange({ line1: v })}
        placeholder="123 Main St"
        autoComplete="street-address"
      />
      <Text style={styles.label}>Address line 2 (optional)</Text>
      <TextInput
        style={styles.input}
        value={address.line2 ?? ''}
        onChangeText={(v) => onChange({ line2: v })}
        placeholder="Apt 4"
      />
      <Text style={styles.label}>City</Text>
      <TextInput
        style={styles.input}
        value={address.city}
        onChangeText={(v) => onChange({ city: v })}
        autoComplete="postal-address-locality"
      />
      <View style={styles.row2}>
        <View style={styles.half}>
          <Text style={styles.label}>State / Province</Text>
          <TextInput
            style={styles.input}
            value={address.stateProvince}
            onChangeText={(v) => onChange({ stateProvince: v })}
            autoComplete="postal-address-region"
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Postal code</Text>
          <TextInput
            style={styles.input}
            value={address.postalCode}
            onChangeText={(v) => onChange({ postalCode: v })}
            autoComplete="postal-code"
          />
        </View>
      </View>
      <Text style={styles.label}>Country</Text>
      <Text style={styles.pilotNote}>Our pilot is currently US-only — we will let you know when we expand.</Text>
      <View style={styles.countryRow}>
        {(['US', 'CA'] as const).map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.countryBtn, address.country === 'US' && c === 'US' && styles.countryBtnActive]}
            onPress={() => setCountry(c)}
          >
            <Text style={[styles.countryText, address.country === 'US' && c === 'US' && styles.countryTextActive]}>
              {c === 'US' ? 'United States' : 'Canada (pilot US-only)'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: typography.xl, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  label: { fontSize: typography.sm, color: semanticColors.textSecondary, marginTop: spacing.sm, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: 16,
    backgroundColor: semanticColors.bgPrimary,
  },
  row2: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  pilotNote: { fontSize: typography.sm, color: semanticColors.textTertiary, marginBottom: spacing.xs },
  countryRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  countryBtn: {
    flex: 1,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  countryBtnActive: { borderColor: semanticColors.brand, backgroundColor: semanticColors.brandLight },
  countryText: { fontSize: typography.md },
  countryTextActive: { fontWeight: '700', color: semanticColors.brand },
});
