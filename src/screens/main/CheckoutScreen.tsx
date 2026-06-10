import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { createPilotCheckout } from '../../services/checkout/createPilotCheckout';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { useCheckoutDraft } from './checkout/useCheckoutDraft';
import { CheckoutOrderSummary } from './checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from './checkout/CheckoutAddressFields';
import { CheckoutAuthGate } from './checkout/CheckoutAuthGate';

export function CheckoutScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household } = useSession();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const {
    lineItems,
    catalog,
    address,
    updateAddress,
    loading,
    locked,
    boxPriceCents,
    total,
    validateAddress,
    normalizedAddress,
    subtotal,
    shippingCents,
    taxCents,
  } = useCheckoutDraft(household?.id);
  const [paying, setPaying] = useState(false);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';

  const handlePay = async () => {
    if (!user || !household?.id) return;
    if (locked) {
      Alert.alert('Box locked', 'The customization window has closed. Contact support for changes.');
      return;
    }
    if (!validateAddress()) return;

    if (!stripeKey) {
      Alert.alert('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return;
    }

    setPaying(true);
    try {
      const { clientSecret, orderId } = await createPilotCheckout(household.id, normalizedAddress());

      if (!clientSecret) {
        Alert.alert('Error', 'No payment secret returned. Deploy createPilotCheckout Cloud Function.');
        return;
      }

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Grapejuice',
      });
      if (initError) {
        Alert.alert('Payment setup failed', initError.message ?? 'Could not initialize payment.');
        return;
      }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment failed', presentError.message ?? 'Payment could not be completed.');
        }
        return;
      }

      navigation.replace('OrderConfirmation', { orderId });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Checkout failed.';
      Alert.alert('Error', message);
    } finally {
      setPaying(false);
    }
  };

  if (!isAuthenticated) {
    return <CheckoutAuthGate />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={semanticColors.brand} />
      </View>
    );
  }

  if (!lineItems.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Your box is empty. Finish onboarding or add items in My Box.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Back to My Box</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Text style={styles.backLink}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Checkout</Text>
      {locked ? (
        <Text style={styles.lockBanner}>Box customization is locked. Checkout may be unavailable.</Text>
      ) : null}

      <CheckoutOrderSummary
        lineItems={lineItems}
        total={total}
        subtotal={subtotal}
        shippingCents={shippingCents}
        taxCents={taxCents}
        boxPriceCents={boxPriceCents}
        catalog={catalog}
      />
      <CheckoutAddressFields address={address} onChange={updateAddress} />

      <TouchableOpacity
        style={[styles.payBtn, (paying || locked) && styles.payBtnDisabled]}
        onPress={handlePay}
        disabled={paying || locked}
      >
        {paying ? (
          <ActivityIndicator color={semanticColors.textInverse} />
        ) : (
          <Text style={styles.payBtnText}>Pay {formatDollars(total)}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: 120,
    ...(Platform.OS === 'web' ? { width: '100%' as const } : {}),
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  backRow: { marginBottom: spacing.md },
  backLink: { color: semanticColors.brand, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: spacing.md },
  lockBanner: {
    backgroundColor: semanticColors.brandLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    color: semanticColors.textSecondary,
    marginBottom: spacing.lg,
  },
  payBtn: {
    backgroundColor: semanticColors.brand,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { fontWeight: '700', color: semanticColors.textInverse, fontSize: typography.lg },
  emptyText: { textAlign: 'center', color: semanticColors.textSecondary, marginBottom: spacing.md },
});
