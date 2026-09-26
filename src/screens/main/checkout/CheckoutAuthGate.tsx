import React from 'react';
import { Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../../stores/authStore';
import { useAuthFlowStore } from '../../../stores/authFlowStore';
import { borderRadius, semanticColors, spacing, typeface, typography } from '../../../constants/theme';
import type { MainStackParamList } from '../../../navigation/types';
import {
  SystemChip,
  SystemPage,
  systemPageStyles as page,
} from '../../../components/layout/SystemPage';

type Nav = StackNavigationProp<MainStackParamList, 'Checkout'>;

export function CheckoutAuthGate() {
  const navigation = useNavigation<Nav>();
  const startAuthForCheckout = useAuthFlowStore((s) => s.startAuthForCheckout);

  return (
    <SystemPage onBack={() => navigation.goBack()}>
      <Text style={page.title}>Save your box to checkout</Text>
      <Text style={page.lead}>
        You built a great box. Create a free account to place your order — we will keep everything you
        picked.
      </Text>
      <TouchableOpacity
        style={styles.primary}
        onPress={() => startAuthForCheckout('signup')}
        accessibilityRole="button"
        accessibilityLabel="Create account"
      >
        <Text style={styles.primaryText}>Create account</Text>
      </TouchableOpacity>
      <SystemChip label="Log in" onPress={() => startAuthForCheckout('signin')} />
    </SystemPage>
  );
}

export function CheckoutAuthGateWithAuthCheck() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return null;
  return <CheckoutAuthGate />;
}

const styles = StyleSheet.create({
  primary: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: semanticColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  primaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
  },
});
