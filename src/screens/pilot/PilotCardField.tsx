import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { borderRadius, semanticColors, spacing, typeface } from '../../constants/theme';
import { m, mFont } from '../../components/mobile/mobileTheme';
import { PAYMENT_ELEMENT_OPTIONS, STRIPE_APPEARANCE, STRIPE_FONTS } from '../main/checkout/stripeAppearance';
import { savedCardLabel } from '../storefront/MarketplacePaymentPanel.web';
import type { PilotPayment } from './usePilotPayment';

/** Hands the card form's Stripe handles to the join button, which lives outside this Elements tree. */
function StripeBridge({ pay }: { pay: PilotPayment }) {
  const stripe = useStripe();
  const elements = useElements();
  useEffect(() => {
    pay.stripeRef.current = stripe && elements ? { stripe, elements } : null;
    return () => {
      pay.stripeRef.current = null;
    };
  }, [stripe, elements, pay.stripeRef]);
  return null;
}

/** Saved card line, or the Stripe card form when there's no card yet (or a different one is wanted). */
export function PilotCardField({ pay, preview, mobile }: { pay: PilotPayment; preview: boolean; mobile?: boolean }) {
  const text = mobile ? styles.textMobile : styles.text;
  const link = mobile ? styles.linkMobile : styles.link;

  if (preview) {
    return (
      <View style={styles.placeholder}>
        <Text style={text}>The card form appears here on a live invite.</Text>
      </View>
    );
  }
  if (pay.cardOnFile && !pay.replacing) {
    return (
      <View style={styles.saved}>
        <Icon icon={icons.card} size={16} color={mobile ? m.goldDark : semanticColors.textSecondary} />
        <Text style={[text, styles.flex]} numberOfLines={1}>
          {pay.savedCard ? `${savedCardLabel(pay.savedCard)} · saved` : 'Card on file'}
        </Text>
        <Pressable onPress={() => pay.setReplacing(true)} accessibilityRole="button" hitSlop={8}>
          <Text style={link}>Use a different card</Text>
        </Pressable>
      </View>
    );
  }
  if (pay.cardError) return <Text style={[text, styles.error]}>{pay.cardError}</Text>;
  if (!pay.secret || !pay.stripePromise) {
    return (
      <View style={styles.saved}>
        <BrandLoadingMark large={false} color={semanticColors.brand} />
        <Text style={text}>Loading the card form…</Text>
      </View>
    );
  }
  return (
    <Elements key={pay.secret} stripe={pay.stripePromise} options={{ clientSecret: pay.secret, appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS }}>
      <StripeBridge pay={pay} />
      <View style={styles.element}>
        <PaymentElement options={PAYMENT_ELEMENT_OPTIONS} onChange={(e) => pay.setCardComplete(e.complete)} />
      </View>
      {pay.replacing ? (
        <Pressable
          onPress={() => {
            pay.setReplacing(false);
            pay.setCardComplete(false);
          }}
          accessibilityRole="button"
          style={styles.keep}
        >
          <Text style={link}>Keep my saved card</Text>
        </Pressable>
      ) : null}
    </Elements>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  text: { ...typeface('regular'), fontSize: 15, lineHeight: 21, color: semanticColors.logoDark },
  textMobile: { fontSize: 14.5, lineHeight: 20, color: m.ink, ...mFont(400) },
  link: { ...typeface('medium'), fontSize: 14, color: semanticColors.logoDark, textDecorationLine: 'underline' },
  linkMobile: { fontSize: 13.5, color: m.goldDark, textDecorationLine: 'underline', ...mFont(500) },
  error: { color: semanticColors.error },
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: semanticColors.border,
  },
  placeholder: {
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: semanticColors.border,
    alignItems: 'center',
  },
  element: { minHeight: 120 },
  keep: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
