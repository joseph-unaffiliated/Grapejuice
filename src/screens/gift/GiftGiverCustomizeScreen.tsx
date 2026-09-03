/** Figma rGzXYb1rNVxqGHz81835Jn — frame 16: giver picks items before pay (native). */
import React, { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import type { MainStackParamList } from '../../navigation/types';
import { useGiftGiverBoxDraft } from '../../hooks/useGiftGiverBoxDraft';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useGiftIntentStore } from '../../stores/giftIntentStore';
import { GiftGiverCustomizeContent } from './GiftGiverCustomizeContent';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';

type Route = RouteProp<MainStackParamList, 'GiftGiverCustomize'>;

function notify(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function firebaseMessage(e: unknown): string {
  if (!(e instanceof Error)) return 'Try again.';
  const anyErr = e as Error & { code?: string; message?: string };
  const msg = anyErr.message ?? '';
  if (/unauthenticated|Sign in required/i.test(msg) || anyErr.code === 'functions/unauthenticated') {
    return 'Sign in to continue to payment.';
  }
  if (/failed-precondition|Stripe is not configured/i.test(msg)) {
    return 'Payments are not configured yet. Ask the team to enable Stripe.';
  }
  return msg || 'Try again.';
}

export function GiftGiverCustomizeScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <GiftGiverCustomizeBody />
    </StorefrontChrome>
  );
}

function GiftGiverCustomizeBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { form, childDrafts, lineItems: restoredLineItems } = route.params;

  // Credit-only gifts must never land on the box editor.
  React.useEffect(() => {
    if (form.giftPath === 'credit_only') {
      navigation.replace('GiftGive', {
        form: { ...form, giftPath: 'credit_only' },
        childDrafts,
        initialGiftPath: 'credit_only',
        autoStartPayment: true,
      });
    }
  }, [form, childDrafts, navigation]);

  const { catalog, lineItems, children, loading, applySwap, swapOptionsFor } = useGiftGiverBoxDraft(
    childDrafts,
    restoredLineItems
  );
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const startAuthForGiftCustomize = useAuthFlowStore((s) => s.startAuthForGiftCustomize);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';

  const requireAuth = (entry: 'signup' | 'signin') => {
    const draft = { form, childDrafts, lineItems };
    useGiftIntentStore.getState().markIncomplete('customize', draft);
    startAuthForGiftCustomize(entry, draft);
  };

  const pay = async () => {
    setPayError(null);
    if (!isAuthenticated) {
      setPayError('Sign in to continue to payment.');
      requireAuth('signin');
      return;
    }
    if (!stripeKey) {
      const msg = 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env and restart the app.';
      setPayError(msg);
      notify('Not configured', msg);
      return;
    }
    setSubmitting(true);
    try {
      useGiftIntentStore.getState().markIncomplete('customize', {
        form,
        childDrafts,
        lineItems,
      });
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

      const finalized = await completeGiftPurchase(result.giftInviteId);
      useGiftIntentStore.getState().markSent(form.recipientEmail.trim(), 'customize');
      navigation.replace('GiftSentConfirmation', {
        recipientEmail: form.recipientEmail.trim(),
        customize: true,
        giverName: form.giverName.trim() || undefined,
        amountCents: DEFAULT_BOX_PRICE_CENTS,
        claimUrl: finalized.claimUrl || result.claimUrl,
      });
    } catch (e) {
      const msg = firebaseMessage(e);
      setPayError(msg);
      notify('Could not send gift', msg);
      if (/Sign in/i.test(msg)) {
        requireAuth('signin');
      }
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
      onRequireAuth={requireAuth}
      payError={payError}
    />
  );
}
