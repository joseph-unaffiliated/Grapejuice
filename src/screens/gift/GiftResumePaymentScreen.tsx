/** Finish paying for a gift started earlier (Orders → "Add Payment Info"). */
import React, { useEffect, useState } from 'react';
import { Text, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useStripe } from '@stripe/stripe-react-native';
import { SystemPage } from '../../components/layout/SystemPage';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { completeGiftPurchase } from './useGiftPayment';
import { resumePilotGiftPayment, type ResumeGiftPaymentResult } from '../../services/gift/pendingGift';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { checkoutUi } from '../main/checkout/checkoutUi';
import type { MainStackParamList } from '../../navigation/types';
import { spacing } from '../../constants/theme';

type Unpaid = Extract<ResumeGiftPaymentResult, { alreadyPaid: false }>;

export function GiftResumePaymentScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { giftInviteId } = useRoute<RouteProp<MainStackParamList, 'GiftResumePayment'>>().params;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [payment, setPayment] = useState<Unpaid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const backToOrders = () => navigation.navigate('Orders');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await resumePilotGiftPayment(giftInviteId);
        if (cancelled) return;
        if (result.alreadyPaid) {
          Alert.alert('Already paid', 'This gift is paid for. We’ve emailed the recipient a link to claim it.');
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

  const pay = async () => {
    if (!payment || paying) return;
    setPaying(true);
    try {
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: payment.clientSecret,
        merchantDisplayName: 'Grapejuice',
      });
      if (initError) throw new Error(initError.message ?? 'Could not open payment.');
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') throw new Error(presentError.message ?? 'Payment failed.');
        return;
      }
      const finalized = await completeGiftPurchase(payment.giftInviteId, payment.claimToken || undefined);
      navigation.replace('GiftSentConfirmation', {
        recipientEmail: payment.recipientEmail,
        customize: payment.customize,
        giverName: payment.giverName.trim() || undefined,
        amountCents: payment.creditCents,
        claimUrl: finalized.claimUrl,
      });
    } catch (e) {
      Alert.alert('Could not send gift', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setPaying(false);
    }
  };

  if (error) {
    return (
      <SystemPage narrow onBack={backToOrders}>
        <Text style={checkoutUi.title}>Payment</Text>
        <Text style={[checkoutUi.fieldError, styles.gap]}>{error}</Text>
      </SystemPage>
    );
  }
  if (!payment) return <SystemPage narrow loading onBack={backToOrders} />;

  return (
    <SystemPage narrow onBack={backToOrders}>
      <Text style={checkoutUi.title}>Payment</Text>
      <Text style={checkoutUi.lead}>
        Pay now to send your gift. We&apos;ll email {payment.recipientEmail} a link to claim it.
      </Text>
      <GrapejuiceButton
        label={`Pay ${formatDollars(payment.amountDueCents)}`}
        variant="filled"
        onPress={() => void pay()}
        loading={paying}
        style={[checkoutUi.button, styles.gap]}
        textStyle={checkoutUi.buttonText}
      />
    </SystemPage>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.lg },
});
