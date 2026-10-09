/** Marketplace Stripe payment step: card form + pay button, inside the checkout page. */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { spacing } from '../../constants/theme';
import { metaEventIds, trackMeta } from '../../services/analytics/metaPixel';
import { PAYMENT_ELEMENT_OPTIONS } from '../main/checkout/stripeAppearance';
import { checkoutUi } from '../main/checkout/checkoutUi';

type Props = {
  totalCents: number;
  /** `payment` charges now; `setup` saves the card for the lock-day charge. */
  intent: 'payment' | 'setup';
  onPaid: () => void;
  onError: (title: string, message: string) => void;
};

export function MarketplacePaymentPanel({ totalCents, intent, onPaid, onError }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const chargeNow = intent === 'payment';

  const pay = async () => {
    if (!stripe || !elements) {
      onError('Payment not ready', 'Stripe is still loading. Wait a moment and try again.');
      return;
    }
    setPaying(true);
    try {
      const returnUrl = typeof window !== 'undefined' ? window.location.href : undefined;
      if (chargeNow) {
        const { error, paymentIntent } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: returnUrl },
          redirect: 'if_required',
        });
        if (error) {
          onError('Payment did not go through', error.message ?? 'Please try again.');
          return;
        }
        if (paymentIntent?.id) {
          trackMeta('AddPaymentInfo', undefined, metaEventIds.addPaymentInfo(paymentIntent.id));
        }
      } else {
        const { error, setupIntent } = await stripe.confirmSetup({
          elements,
          confirmParams: { return_url: returnUrl },
          redirect: 'if_required',
        });
        if (error) {
          onError('Could not save card', error.message ?? 'Please try again.');
          return;
        }
        if (setupIntent?.id) {
          trackMeta('AddPaymentInfo', undefined, metaEventIds.addPaymentInfo(setupIntent.id));
        }
      }
      onPaid();
    } finally {
      setPaying(false);
    }
  };

  const label = chargeNow ? `Pay ${formatDollars(totalCents)}` : 'Save card & place order';

  return (
    <View>
      <Text style={checkoutUi.sectionHeading}>Payment Method</Text>
      <View style={styles.paymentElementWrap}>
        <PaymentElement options={PAYMENT_ELEMENT_OPTIONS} />
      </View>
      <GrapejuiceButton
        label={label}
        variant="filled"
        onPress={() => void pay()}
        loading={paying}
        disabled={paying}
        style={[checkoutUi.button, styles.ctaSpacing]}
        textStyle={checkoutUi.buttonText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  paymentElementWrap: { minHeight: 120, marginTop: spacing.xs },
  ctaSpacing: { marginTop: spacing.xl },
});
