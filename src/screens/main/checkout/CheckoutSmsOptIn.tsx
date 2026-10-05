import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../../constants/theme';
import { checkoutUi } from './checkoutUi';

type Props = {
  phone: string;
  smsOptIn: boolean;
  onPhoneChange: (phone: string) => void;
  onSmsOptInChange: (optIn: boolean) => void;
};

export function CheckoutSmsOptIn({ phone, smsOptIn, onPhoneChange, onSmsOptInChange }: Props) {
  return (
    <View>
      <Text style={checkoutUi.sectionHeading}>Text Reminders</Text>
      <Text style={checkoutUi.hint}>
        Optional. Get a nudge before the box lock date with a link to My Box.
      </Text>
      <Text style={checkoutUi.label}>Mobile number</Text>
      <TextInput
        style={checkoutUi.input}
        value={phone}
        onChangeText={onPhoneChange}
        placeholder="+1 647 555 1234"
        placeholderTextColor={semanticColors.textTertiary}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <TouchableOpacity
        style={styles.row}
        onPress={() => onSmsOptInChange(!smsOptIn)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: smsOptIn }}
      >
        <View style={[styles.checkbox, smsOptIn && styles.checkboxOn]} />
        <Text style={styles.checkboxLabel}>Text me lock reminders</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: semanticColors.brand,
    backgroundColor: semanticColors.bgPrimary,
  },
  checkboxOn: { backgroundColor: semanticColors.brand },
  checkboxLabel: {
    ...typeface('regular'),
    fontSize: typography.md,
    letterSpacing: -0.22,
    flex: 1,
    color: semanticColors.textPrimary,
  },
});
