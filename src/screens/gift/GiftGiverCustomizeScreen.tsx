/** Figma rGzXYb1rNVxqGHz81835Jn — frame 16: giver picks items before pay (native). */
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import type { MainStackParamList } from '../../navigation/types';
import { useGiftGiverBoxDraft } from '../../hooks/useGiftGiverBoxDraft';
import { GiftGiverCustomizeContent } from './GiftGiverCustomizeContent';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';

type Route = RouteProp<MainStackParamList, 'GiftGiverCustomize'>;

export function GiftGiverCustomizeScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { form, childDrafts } = route.params;
  const { catalog, lineItems, children, loading, applySwap, swapOptionsFor } = useGiftGiverBoxDraft(childDrafts);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [submitting, setSubmitting] = useState(false);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';

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

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: result.clientSecret,
        merchantDisplayName: 'Grapejuice',
      });
      if (initError) throw new Error(initError.message ?? 'Could not open payment.');

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') throw new Error(presentError.message ?? 'Payment failed.');
        return;
      }

      await completeGiftPurchase(result.giftInviteId, form.recipientEmail.trim(), () => navigation.popToTop());
      if (__DEV__) console.log('[gift] claim url', result.claimUrl);
    } catch (e) {
      Alert.alert('Could not send gift', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
    />
  );
}
