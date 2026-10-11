import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../../constants/theme';
import { checkoutUi } from './checkoutUi';
import { useMobileLayout } from '../../../hooks/useMobileLayout';
import { MobileField } from '../../../components/mobile/MobileField';
import { m, mFont } from '../../../components/mobile/mobileTheme';
import { Icon } from '../../../components/ui/Icon';
import { icons } from '../../../constants/icons';

type Props = {
  phone: string;
  smsOptIn: boolean;
  onPhoneChange: (phone: string) => void;
  onSmsOptInChange: (optIn: boolean) => void;
};

export function CheckoutSmsOptIn({ phone, smsOptIn, onPhoneChange, onSmsOptInChange }: Props) {
  const mobileLayout = useMobileLayout();
  if (mobileLayout) {
    return (
      <View style={{ marginTop: 8 }}>
        <MobileField
          label="Mobile number (optional)"
          value={phone}
          onChangeText={onPhoneChange}
          placeholder="(555) 555-1234"
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <TouchableOpacity
          style={styles.mRow}
          onPress={() => onSmsOptInChange(!smsOptIn)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: smsOptIn }}
        >
          <View style={[styles.mBox, smsOptIn && styles.mBoxOn]}>
            {smsOptIn ? <Icon icon={icons.check} size={12} color={m.gold} /> : null}
          </View>
          <Text style={styles.mLabel}>Text me a reminder before my box locks</Text>
        </TouchableOpacity>
      </View>
    );
  }
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
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  mBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white },
  mBoxOn: { backgroundColor: m.ink, borderColor: m.ink },
  mLabel: { flex: 1, fontSize: 14, color: m.body, ...mFont(400) },
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
