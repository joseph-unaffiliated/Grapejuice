import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Alert, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { GiftGiveForm } from './GiftGiveForm';
import { DEFAULT_GIFT_CHILDREN, type GiftGiveFormValues } from './giftGiveTypes';
import type { GiftChildDraft } from './giftGiveTypes';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';

function GiftPaymentStep({
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
        confirmParams: {
          return_url: typeof window !== 'undefined' ? window.location.href : undefined,
        },
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
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

export function GiftGiveScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'GiftGive'>>();
  const [values, setValues] = useState<GiftGiveFormValues>({
    recipientEmail: '',
    giverName: '',
    message: '',
    giftPath: route.params?.initialGiftPath ?? 'customize',
  });
  const [childDrafts, setChildDrafts] = useState<GiftChildDraft[]>(DEFAULT_GIFT_CHILDREN);
  const [submitting, setSubmitting] = useState(false);
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [giftInviteId, setGiftInviteId] = useState<string | null>(null);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  const patchValues = (patch: Partial<GiftGiveFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  const preparePayment = async () => {
    if (!values.recipientEmail.includes('@')) {
      Alert.alert('Email required', 'Enter the recipient family email.');
      return;
    }

    if (values.giftPath === 'customize') {
      navigation.navigate('GiftGiverCustomize', { form: values, childDrafts });
      return;
    }

    if (!stripeKey) {
      Alert.alert('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return;
    }

    setSubmitting(true);
    try {
      const result = await startGiftPurchase({ form: values, customize: false });
      setGiftInviteId(result.giftInviteId);
      setPaymentSecret(result.clientSecret);
      if (__DEV__) console.log('[gift] prepared', result.claimUrl);
    } catch (e) {
      Alert.alert('Could not start payment', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetPayment = () => {
    setPaymentSecret(null);
    setGiftInviteId(null);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {paymentSecret && stripePromise && giftInviteId ? (
        <Elements stripe={stripePromise} options={{ clientSecret: paymentSecret, appearance: { theme: 'stripe' } }}>
          <GiftGiveForm
            values={values}
            childDrafts={childDrafts}
            onChange={patchValues}
            onChildDraftsChange={setChildDrafts}
            onBack={() => navigation.goBack()}
            onSubmit={() => {}}
            submitting
            submitLabel="Complete payment below"
          >
            <GiftPaymentStep
              giftInviteId={giftInviteId}
              recipientEmail={values.recipientEmail.trim()}
              onSuccess={() => navigation.goBack()}
              onCancel={resetPayment}
            />
          </GiftGiveForm>
        </Elements>
      ) : (
        <GiftGiveForm
          values={values}
          childDrafts={childDrafts}
          onChange={patchValues}
          onChildDraftsChange={setChildDrafts}
          onBack={() => navigation.goBack()}
          onSubmit={() => void preparePayment()}
          submitting={submitting}
          submitLabel={values.giftPath === 'customize' ? 'Pick their box' : 'Continue to payment'}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: 120 },
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
