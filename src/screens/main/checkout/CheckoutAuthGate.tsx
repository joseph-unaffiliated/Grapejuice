import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import type { MainStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<MainStackParamList, 'Checkout'>;

export function CheckoutAuthGate() {
  const navigation = useNavigation<Nav>();
  const startAuthForCheckout = useAuthFlowStore((s) => s.startAuthForCheckout);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Text style={styles.backLink}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Save your box to checkout</Text>
      <Text style={styles.body}>
        You built a great box. Create a free account to place your order — we will keep everything you
        picked.
      </Text>

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => startAuthForCheckout('signup')}
      >
        <Text style={styles.primaryText}>Create account</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => startAuthForCheckout('signin')}
      >
        <Text style={styles.secondaryText}>Log in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export function CheckoutAuthGateWithAuthCheck() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return null;
  return <CheckoutAuthGate />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: 120 },
  backRow: { marginBottom: spacing.md },
  backLink: { color: semanticColors.brand, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: spacing.md },
  body: { fontSize: typography.lg, color: semanticColors.textSecondary, lineHeight: 22, marginBottom: spacing.xl },
  primaryBtn: {
    backgroundColor: semanticColors.brand,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryText: { fontWeight: '700', color: semanticColors.textInverse, fontSize: typography.lg },
  secondaryBtn: { marginTop: spacing.md, alignItems: 'center', padding: spacing.md },
  secondaryText: { color: semanticColors.brand, fontWeight: '600', fontSize: typography.lg },
});
