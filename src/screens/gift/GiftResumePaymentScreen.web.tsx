/** Finish paying for a gift started earlier (Orders → "Add Payment Info"). */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { SystemPage, SystemChip } from '../../components/layout/SystemPage';
import { GiftPaymentPanel } from './GiftPaymentPanel.web';
import { completeGiftPurchase } from './useGiftPayment';
import { resumePilotGiftPayment, type ResumeGiftPaymentResult } from '../../services/gift/pendingGift';
import { STRIPE_APPEARANCE, STRIPE_FONTS } from '../main/checkout/stripeAppearance';
import { checkoutUi } from '../main/checkout/checkoutUi';
import type { MainStackParamList } from '../../navigation/types';
import { spacing } from '../../constants/theme';

type Unpaid = Extract<ResumeGiftPaymentResult, { alreadyPaid: false }>;

function notify(title: string, message: string) {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
}

function GiftResumePaymentBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { giftInviteId } = useRoute<RouteProp<MainStackParamList, 'GiftResumePayment'>>().params;
  const [payment, setPayment] = useState<Unpaid | null>(null);
  const [error, setError] = useState<string | null>(null);

  const backToOrders = () => navigation.navigate('Orders');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await resumePilotGiftPayment(giftInviteId);
        if (cancelled) return;
        if (result.alreadyPaid) {
          notify('Already paid', 'This gift is paid for. We’ve emailed the recipient a link to claim it.');
          navigation.replace('Orders');
          return;
        }
        setPayment(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this gift. Try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [giftInviteId, navigation]);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = payment?.publishableKey || extra?.stripePublishableKey || '';
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  if (error) {
    return (
      <SystemPage narrow onBack={backToOrders}>
        <Text style={checkoutUi.title}>Payment</Text>
        <Text style={[checkoutUi.fieldError, styles.error]}>{error}</Text>
        <SystemChip label="Back to orders" onPress={backToOrders} />
      </SystemPage>
    );
  }

  if (!payment || !stripePromise) {
    return <SystemPage narrow loading onBack={backToOrders} />;
  }

  return (
    <SystemPage narrow onBack={backToOrders}>
      <Elements
        key={payment.clientSecret}
        stripe={stripePromise}
        options={{ clientSecret: payment.clientSecret, appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS }}
      >
        <GiftPaymentPanel
          giftInviteId={payment.giftInviteId}
          recipientEmail={payment.recipientEmail}
          giverName={payment.giverName}
          customize={payment.customize}
          amountCents={payment.creditCents}
          discountCents={payment.discountCents}
          amountDueCents={payment.amountDueCents}
          onPaid={({ claimUrl }) => {
            navigation.replace('GiftSentConfirmation', {
              recipientEmail: payment.recipientEmail,
              customize: payment.customize,
              giverName: payment.giverName.trim() || undefined,
              amountCents: payment.creditCents,
              claimUrl,
            });
          }}
          onError={notify}
          completePurchase={(id) => completeGiftPurchase(id, payment.claimToken || undefined)}
        />
      </Elements>
    </SystemPage>
  );
}

export function GiftResumePaymentScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <GiftResumePaymentBody />
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  error: { marginVertical: spacing.md },
});
