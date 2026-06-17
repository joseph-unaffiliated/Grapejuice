/** Figma rGzXYb1rNVxqGHz81835Jn — frame 16: giver picks items before pay (web). */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { MainStackParamList } from '../../navigation/types';
import { useGiftGiverBoxDraft } from '../../hooks/useGiftGiverBoxDraft';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { GiftGiverCustomizeContent } from './GiftGiverCustomizeContent';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';

type Route = RouteProp<MainStackParamList, 'GiftGiverCustomize'>;

function GiftGiverPaymentWeb({
  giftInviteId,
  recipientEmail,
  onSuccess,
  onCancel,
}: {
  giftInviteId: string;
  recipientEmail: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  const pay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: typeof window !== 'undefined' ? window.location.href : undefined },
        redirect: 'if_required',
      });
      if (error) {
        Alert.alert('Payment failed', error.message ?? 'Please try again.');
        return;
      }
      await completeGiftPurchase(giftInviteId, recipientEmail, onSuccess);
    } catch (e) {
      Alert.alert('Could not send gift', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={styles.paymentBlock}>
      <Text style={styles.paymentTitle}>Payment</Text>
      <View style={styles.paymentElementWrap}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </View>
      <TouchableOpacity style={styles.cta} onPress={() => void pay()} disabled={paying}>
        {paying ? (
          <ActivityIndicator color={semanticColors.textInverse} />
        ) : (
          <Text style={styles.ctaText}>Pay {formatDollars(DEFAULT_BOX_PRICE_CENTS)} & send</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} style={styles.cancel}>
        <Text style={styles.cancelText}>Back to box</Text>
      </TouchableOpacity>
    </View>
  );
}

export function GiftGiverCustomizeScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { form, childDrafts } = route.params;
  const { catalog, lineItems, children, loading, applySwap, swapOptionsFor } = useGiftGiverBoxDraft(childDrafts);
  const [submitting, setSubmitting] = useState(false);
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [giftInviteId, setGiftInviteId] = useState<string | null>(null);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  const pay = async () => {
    if (!stripeKey) {
      Alert.alert('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return;
    }
    setSubmitting(true);
    try {
      const childAgeGroups = childDrafts.map((c) => c.ageGroup);
      const result = await startGiftPurchase({
        form,
        customize: true,
        lineItems,
        childAgeGroups,
      });
      setGiftInviteId(result.giftInviteId);
      setPaymentSecret(result.clientSecret);
    } catch (e) {
      Alert.alert('Could not send gift', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const paymentSlot =
    paymentSecret && stripePromise && giftInviteId ? (
      <Elements stripe={stripePromise} options={{ clientSecret: paymentSecret, appearance: { theme: 'stripe' } }}>
        <GiftGiverPaymentWeb
          giftInviteId={giftInviteId}
          recipientEmail={form.recipientEmail.trim()}
          onSuccess={() => navigation.popToTop()}
          onCancel={() => {
            setPaymentSecret(null);
            setGiftInviteId(null);
          }}
        />
      </Elements>
    ) : null;

  return (
    <GiftGiverCustomizeContent
      form={form}
      catalog={catalog}
      lineItems={lineItems}
      kidProfiles={children}
      loading={loading}
      submitting={submitting}
      applySwap={applySwap}
      swapOptionsFor={swapOptionsFor}
      onPay={() => void pay()}
      paymentSlot={paymentSlot}
    />
  );
}

const styles = StyleSheet.create({
  paymentBlock: { marginTop: spacing.lg },
  paymentTitle: { fontSize: typography.xl, fontWeight: '700', marginBottom: spacing.sm },
  paymentElementWrap: { minHeight: 120, marginBottom: spacing.md },
  cta: {
    backgroundColor: semanticColors.brand,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  ctaText: { color: semanticColors.textInverse, fontWeight: '700', fontSize: typography.lg },
  cancel: { marginTop: spacing.md, alignItems: 'center' },
  cancelText: { color: semanticColors.textTertiary },
});
