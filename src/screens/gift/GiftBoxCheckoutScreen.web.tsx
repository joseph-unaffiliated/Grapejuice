import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { SystemPage } from '../../components/layout/SystemPage';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { CheckoutOrderSummary } from '../main/checkout/CheckoutOrderSummary';
import { useReceivedGifts } from '../../hooks/useReceivedGifts';
import { useSession } from '../../hooks/useSession';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { useCatalog } from '../../hooks/useCatalog';
import { createReceivedGiftCheckout } from '../../services/gift/giftFlow';
import { formatDollars } from '../../services/box/buildDefaultBox';
import {
  resolveGiftPrepaidAddOnCents,
  recipientGiftUpgradeCents,
  SHIPPING_FLAT_CENTS,
  checkoutTotalsAfterCredit,
} from '../../services/box/pricing';
import { emptyShippingAddress } from '../main/checkout/useCheckoutDraft';
import { checkoutUi } from '../main/checkout/checkoutUi';
import { STRIPE_APPEARANCE, STRIPE_FONTS } from '../main/checkout/stripeAppearance';
import type { MainStackParamList } from '../../navigation/types';
import type { ShippingAddress } from '../../types/pilot';
import {
  validateShippingAddress,
  type ShippingAddressFieldErrors,
} from '../../utils/formValidation';
import { spacing } from '../../constants/theme';

type Route = RouteProp<MainStackParamList, 'GiftBoxCheckout'>;

function notify(title: string, message: string) {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
}

function WebPayStep({ onPaid }: { onPaid: () => void }) {
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
        notify('Payment failed', error.message ?? 'Please try again.');
        return;
      }
      onPaid();
    } finally {
      setPaying(false);
    }
  };

  return (
    <View>
      <Text style={checkoutUi.sectionHeading}>Payment Method</Text>
      <View style={styles.paymentElementWrap}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </View>
      <GrapejuiceButton
        label="Pay & confirm gift box"
        variant="filled"
        onPress={() => void pay()}
        loading={paying}
        style={[checkoutUi.button, styles.ctaSpacing]}
        textStyle={checkoutUi.buttonText}
      />
    </View>
  );
}

function GiftBoxCheckoutBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { giftInviteId } = route.params;
  const { household, refresh: refreshSession } = useSession();
  const { gifts, loading: giftsLoading, refresh } = useReceivedGifts();
  const { items: catalog } = useCatalog();
  const skipShipStation = useMockFlowStore((s) => s.active);

  const gift = gifts.find((g) => g.giftInviteId === giftInviteId);
  const lineItems = gift?.lineItems ?? [];
  const [address, setAddress] = useState<ShippingAddress>(emptyShippingAddress);
  const [preparing, setPreparing] = useState(false);
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [addressFieldErrors, setAddressFieldErrors] = useState<ShippingAddressFieldErrors>({});

  const onAddressChange = (patch: Partial<ShippingAddress>) => {
    setAddressFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
        if (key in next) delete next[key as keyof ShippingAddressFieldErrors];
      }
      return next;
    });
    if (Object.keys(patch).length) setFormError(null);
    setAddress((a) => ({ ...a, ...patch }));
  };

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  const subtotal = recipientGiftUpgradeCents(
    lineItems,
    resolveGiftPrepaidAddOnCents(gift ?? {})
  );
  const shippingCents = SHIPPING_FLAT_CENTS;
  const priced = checkoutTotalsAfterCredit({
    merchandiseCents: subtotal + shippingCents,
    giftCreditCents: household?.giftCreditCents ?? 0,
    platformCreditCents: household?.platformCreditCents ?? 0,
  });
  const { taxCents, giftCreditApplied, platformCreditApplied, totalCents: total } = priced;

  const finish = useCallback(
    async (orderId: string) => {
      await refresh();
      await refreshSession({ silent: true });
      navigation.replace('OrderConfirmation', { orderId });
    },
    [navigation, refresh, refreshSession]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startCheckout = async () => {
    setFormError(null);
    const addressResult = validateShippingAddress(address);
    if (!addressResult.ok) {
      setAddressFieldErrors(addressResult.fields);
      setFormError(addressResult.message);
      return;
    }
    setAddressFieldErrors({});
    if (!gift || gift.status !== 'available') {
      setFormError('This gift is no longer available for checkout.');
      return;
    }

    setPreparing(true);
    try {
      const result = await createReceivedGiftCheckout(
        giftInviteId,
        {
          ...address,
          name: address.name.trim(),
          line1: address.line1.trim(),
          line2: address.line2?.trim() || undefined,
          city: address.city.trim(),
          stateProvince: address.stateProvince.trim(),
          postalCode: address.postalCode.trim(),
        },
        lineItems,
        { skipShipStation }
      );

      if (result.status === 'confirmed' || result.totalCents === 0) {
        await finish(result.orderId);
        return;
      }
      if (!result.clientSecret) {
        setFormError('Payment could not be started.');
        return;
      }
      setPendingOrderId(result.orderId);
      setPaymentSecret(result.clientSecret);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Checkout failed.';
      setFormError(msg);
      notify('Could not start payment', msg);
    } finally {
      setPreparing(false);
    }
  };

  const backToGiftBox = () => navigation.navigate('GiftBox', { giftInviteId });

  if (giftsLoading || !gift) {
    return <SystemPage narrow loading onBack={backToGiftBox} />;
  }

  if (paymentSecret && stripePromise && pendingOrderId) {
    return (
      <SystemPage narrow onBack={() => setPaymentSecret(null)}>
        <Text style={checkoutUi.title}>Payment</Text>
        <Text style={checkoutUi.lead}>
          The giver already paid for the curated box. This covers the add-ons you picked.
        </Text>
        <View style={checkoutUi.divider} />
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: paymentSecret, appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS }}
        >
          <WebPayStep onPaid={() => void finish(pendingOrderId)} />
        </Elements>
      </SystemPage>
    );
  }

  return (
    <SystemPage narrow onBack={backToGiftBox}>
      <Text style={checkoutUi.title}>Shipping</Text>
      <Text style={checkoutUi.lead}>
        The curated box was already paid by the giver. You only pay for add-ons you added (gift
        credit applies).
      </Text>
      <View style={checkoutUi.divider} />
      <CheckoutOrderSummary
        lineItems={lineItems}
        total={total}
        subtotal={subtotal}
        shippingCents={shippingCents}
        taxCents={taxCents}
        boxPriceCents={0}
        catalog={catalog}
        giftCreditApplied={giftCreditApplied}
        platformCreditApplied={platformCreditApplied}
        marketplaceOnly
      />
      <View style={checkoutUi.divider} />
      <CheckoutAddressFields
        address={address}
        onChange={onAddressChange}
        fieldErrors={addressFieldErrors}
      />
      {formError ? <Text style={checkoutUi.fieldError}>{formError}</Text> : null}
      <GrapejuiceButton
        label={total > 0 ? `Continue to payment · ${formatDollars(total)}` : 'Confirm gift box'}
        variant="filled"
        onPress={() => void startCheckout()}
        loading={preparing}
        style={[checkoutUi.button, styles.ctaSpacing]}
        textStyle={checkoutUi.buttonText}
      />
    </SystemPage>
  );
}

export function GiftBoxCheckoutScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <GiftBoxCheckoutBody />
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  paymentElementWrap: { minHeight: 120, marginTop: spacing.xs },
  ctaSpacing: { marginTop: spacing.xl },
});
