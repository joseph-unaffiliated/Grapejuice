import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../../stores/authStore';
import { useAuthFlowStore } from '../../../stores/authFlowStore';
import { semanticColors, spacing, typography } from '../../../constants/theme';
import type { MainStackParamList } from '../../../navigation/types';
import { GrapejuiceButton } from '../../../components/ui/GrapejuiceButton';

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

      <GrapejuiceButton
        label="Create account"
        variant="filled"
        onPress={() => startAuthForCheckout('signup')}
        style={styles.btn}
      />

      <GrapejuiceButton
        label="Log in"
        variant="pillOutline"
        onPress={() => startAuthForCheckout('signin')}
        style={styles.btn}
      />
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
  title: { fontSize: 24, fontWeight: '700', marginBottom: spacing.md, color: semanticColors.textPrimary },
  body: { fontSize: typography.lg, color: semanticColors.textSecondary, lineHeight: 22, marginBottom: spacing.xl },
  btn: { alignSelf: 'stretch', minWidth: undefined, marginBottom: spacing.md },
});
