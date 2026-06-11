import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useSession } from '../../hooks/useSession';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useAuthStore } from '../../stores/authStore';
import { createPilotCheckout } from '../../services/checkout/createPilotCheckout';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { MainStackParamList } from '../../navigation/types';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { useCheckoutDraft } from './checkout/useCheckoutDraft';
import { CheckoutOrderSummary } from './checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from './checkout/CheckoutAddressFields';
import { CheckoutAuthGate } from './checkout/CheckoutAuthGate';

function PaymentStep({
  total,
  onSuccess,
}: {
  total: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: typeof window !== 'undefined' ? window.location.href : undefined,
        },
        redirect: 'if_required',
      });
      if (error) {
        Alert.alert('Payment failed', error.message ?? 'Could not complete payment.');
        return;
      }
      onSuccess();
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={styles.paymentBlock}>
      <Text style={styles.sectionTitle}>Payment</Text>
      <View style={styles.paymentElementWrap}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </View>
      <TouchableOpacity
        style={[styles.payBtn, paying && styles.payBtnDisabled]}
        onPress={handlePay}
        disabled={paying}
      >
        {paying ? (
          <ActivityIndicator color={semanticColors.textInverse} />
        ) : (
          <Text style={styles.payBtnText}>Pay {formatDollars(total)}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export function CheckoutScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household } = useSession();
  const { isDesktop } = useWebLayout();
  const {
    lineItems,
    address,
    updateAddress,
    loading,
    locked,
    boxPriceCents,
    total,
    validateAddress,
    normalizedAddress,
  } = useCheckoutDraft(household?.id);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const stripePromise = useMemo(
    () => (stripeKey ? loadStripe(stripeKey) : null),
    [stripeKey]
  );

  const handleContinueToPayment = async () => {
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

    setPreparing(true);
    try {
      const result = await createPilotCheckout(household.id, normalizedAddress());
      if (!result.clientSecret) {
        Alert.alert('Error', 'No payment secret returned.');
        return;
      }
      setClientSecret(result.clientSecret);
      setOrderId(result.orderId);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Checkout failed.');
    } finally {
      setPreparing(false);
    }
  };

  const checkoutForm = !clientSecret ? (
    <>
      <CheckoutAddressFields address={address} onChange={updateAddress} />
      <TouchableOpacity
        style={[styles.payBtn, (preparing || locked) && styles.payBtnDisabled]}
        onPress={handleContinueToPayment}
        disabled={preparing || locked}
      >
        {preparing ? (
          <ActivityIndicator color={semanticColors.textInverse} />
        ) : (
          <Text style={styles.payBtnText}>Continue to payment</Text>
        )}
      </TouchableOpacity>
    </>
  ) : stripePromise && orderId ? (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
      <PaymentStep
        total={total}
        onSuccess={() => navigation.replace('OrderConfirmation', { orderId })}
      />
    </Elements>
  ) : null;

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
    <WebContentPanel wide>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Checkout</Text>
        {locked ? (
          <Text style={styles.lockBanner}>Box customization is locked. Checkout is unavailable.</Text>
        ) : null}

        {isDesktop ? (
          <View style={styles.desktopColumns}>
            <View style={styles.desktopLeft}>
              <CheckoutOrderSummary lineItems={lineItems} total={total} boxPriceCents={boxPriceCents} />
            </View>
            <View style={styles.desktopRight}>{checkoutForm}</View>
          </View>
        ) : (
          <>
            <CheckoutOrderSummary lineItems={lineItems} total={total} boxPriceCents={boxPriceCents} />
            {checkoutForm}
          </>
        )}
      </ScrollView>
    </WebContentPanel>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { paddingBottom: 120 },
  desktopColumns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  desktopLeft: { flex: 1, minWidth: 0 },
  desktopRight: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: semanticColors.border,
    paddingLeft: spacing.lg,
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
  sectionTitle: { fontSize: typography.xl, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  paymentBlock: { marginTop: spacing.md },
  paymentElementWrap: { minHeight: 120, marginBottom: spacing.md },
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
