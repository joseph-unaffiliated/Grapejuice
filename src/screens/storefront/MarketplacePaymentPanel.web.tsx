/** Marketplace Stripe payment step: card form + pay button, inside the checkout page. */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { semanticColors, spacing, typeface, typography, borderRadius } from '../../constants/theme';
import { metaEventIds, trackMeta } from '../../services/analytics/metaPixel';
import type { SavedCardSummary } from '../../services/checkout/createMarketplaceCheckout';
import { PAYMENT_ELEMENT_OPTIONS } from '../main/checkout/stripeAppearance';
import { checkoutUi } from '../main/checkout/checkoutUi';

const BRAND_LABELS: Record<string, string> = {
  amex: 'Amex',
  diners: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  mastercard: 'Mastercard',
  unionpay: 'UnionPay',
  visa: 'Visa',
};

export function savedCardLabel(card: SavedCardSummary): string {
  const brand = BRAND_LABELS[card.brand] ?? (card.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : 'Card');
  return `${brand} •••• ${card.last4}`;
}

type Props = {
  totalCents: number;
  /** `payment` charges now; `setup` saves the card for the lock-day charge. */
  intent: 'payment' | 'setup';
  /** Signed-in buyers: the household's saved card, preselected. */
  savedCard?: SavedCardSummary | null;
  /** Charges the saved card on the server; resolves false when it was declined. */
  onPaySaved?: () => Promise<boolean>;
  onPaid: () => void;
  onError: (title: string, message: string) => void;
};

export function MarketplacePaymentPanel({
  totalCents,
  intent,
  savedCard,
  onPaySaved,
  onPaid,
  onError,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const chargeNow = intent === 'payment';
  const canUseSaved = chargeNow && !!savedCard && !!onPaySaved;
  const [useSaved, setUseSaved] = useState(canUseSaved);
  const payingWithSaved = canUseSaved && useSaved;

  const paySaved = async () => {
    if (!onPaySaved) return;
    setPaying(true);
    try {
      if (!(await onPaySaved())) setUseSaved(false);
    } finally {
      setPaying(false);
    }
  };

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
      {canUseSaved && savedCard ? (
        <Pressable
          onPress={() => setUseSaved(true)}
          disabled={paying}
          accessibilityRole="radio"
          accessibilityState={{ checked: useSaved }}
          style={[styles.savedCard, useSaved && styles.savedCardSelected]}
        >
          <View style={[styles.radio, useSaved && styles.radioSelected]} />
          <Text style={styles.savedCardText}>{savedCardLabel(savedCard)}</Text>
        </Pressable>
      ) : null}
      {canUseSaved && useSaved ? (
        <Pressable onPress={() => setUseSaved(false)} disabled={paying} accessibilityRole="button">
          <Text style={styles.switchLink}>Use a different card</Text>
        </Pressable>
      ) : (
        <View style={styles.paymentElementWrap}>
          <PaymentElement options={PAYMENT_ELEMENT_OPTIONS} />
        </View>
      )}
      <GrapejuiceButton
        label={label}
        variant="filled"
        onPress={() => void (payingWithSaved ? paySaved() : pay())}
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
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.xl,
  },
  savedCardSelected: { borderColor: semanticColors.brand },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semanticColors.border,
  },
  radioSelected: { borderColor: semanticColors.brand, borderWidth: 5 },
  savedCardText: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textPrimary,
  },
  switchLink: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    textDecorationLine: 'underline',
    marginTop: spacing.sm,
  },
});
