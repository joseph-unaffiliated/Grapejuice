import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useSession } from '../../hooks/useSession';
import { usePilotOrders } from '../../hooks/usePilotOrders';
import { useArrivesByWithWait } from '../../hooks/useArrivesByWithWait';
import { useAuthStore } from '../../stores/authStore';
import { useMarketplaceCartStore } from '../../stores/marketplaceCartStore';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { metaEventIds, trackMeta } from '../../services/analytics/metaPixel';
import { createMarketplaceCheckout } from '../../services/checkout/createMarketplaceCheckout';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { MainStackParamList } from '../../navigation/types';
import type { PilotOrder } from '../../types/pilot';
import { spacing, semanticColors } from '../../constants/theme';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { CheckoutOrderSummary } from '../main/checkout/CheckoutOrderSummary';
import { DiscountCodeField } from '../main/checkout/DiscountCodeField';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { useAddressDeliverability } from '../main/checkout/useAddressDeliverability';
import { checkoutUi } from '../main/checkout/checkoutUi';
import { STRIPE_APPEARANCE, STRIPE_FONTS } from '../main/checkout/stripeAppearance';
import { SystemPage } from '../../components/layout/SystemPage';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { useMarketplaceCheckout } from './useMarketplaceCheckout';
import { isValidEmail, type ShippingAddressFieldErrors } from '../../utils/formValidation';
import type { ShippingAddress } from '../../types/pilot';
import { MarketplacePaymentPanel } from './MarketplacePaymentPanel.web';
import {
  marketplaceCheckoutErrorMessage,
  marketplaceCheckoutNotify,
} from './marketplaceCheckoutNotify';

/** Matches the server: households with a box pay for add-ons when boxes lock. */
function hasHanukkahBox(orders: PilotOrder[]): boolean {
  return orders.some(
    (o) =>
      o.orderType !== 'marketplace' &&
      o.orderType !== 'received_gift' &&
      (o.status === 'committed' ||
        o.status === 'confirmed' ||
        o.status === 'shipped' ||
        o.status === 'delivered')
  );
}

type PendingPayment = {
  orderId: string;
  totalCents: number;
  clientSecret: string;
  intent: 'payment' | 'setup';
};

function MarketplaceCheckoutBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, loading: sessionLoading } = useSession();
  const { orders, loading: ordersLoading } = usePilotOrders(
    isAuthenticated ? household?.id : undefined
  );
  const clearCart = useMarketplaceCartStore((s) => s.clear);
  const skipShipStation = useMockFlowStore((s) => s.active);
  const arrival = useArrivesByWithWait();

  const {
    lineItems,
    catalog,
    address,
    updateAddress,
    loading: catalogLoading,
    total,
    validateAddress,
    normalizedAddress,
    subtotal,
    shippingCents,
    taxCents,
    giftCreditApplied,
    platformCreditApplied,
    promo,
    discountCents,
  } = useMarketplaceCheckout();

  const [preparing, setPreparing] = useState(false);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [addressFieldErrors, setAddressFieldErrors] = useState<ShippingAddressFieldErrors>({});
  const [guestEmail, setGuestEmail] = useState('');

  const chargesAtLock = isAuthenticated && hasHanukkahBox(orders);

  const onAddressChange = (patch: Partial<ShippingAddress>) => {
    setAddressFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
        if (key in next) delete next[key as keyof ShippingAddressFieldErrors];
      }
      return next;
    });
    if (Object.keys(patch).length) setFormError(null);
    updateAddress(patch);
  };
  const deliverability = useAddressDeliverability(address, onAddressChange);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const stripePromise = useMemo(
    () => (stripeKey ? loadStripe(stripeKey) : null),
    [stripeKey]
  );

  const finishOrder = useCallback(
    (orderId: string, totalCents: number, charged: boolean) => {
      trackMeta(
        'Purchase',
        {
          value: totalCents / 100,
          currency: 'USD',
          order_id: orderId,
          content_name: 'Marketplace order',
          content_type: 'product',
          content_ids: lineItems.map((li) => li.itemId),
          num_items: lineItems.length,
        },
        metaEventIds.purchase(orderId)
      );
      clearCart();
      navigation.replace('OrderConfirmation', { orderId, charged });
    },
    [clearCart, navigation, lineItems]
  );

  const initiateCheckoutTracked = useRef(false);
  useEffect(() => {
    if (initiateCheckoutTracked.current || catalogLoading || !lineItems.length) return;
    initiateCheckoutTracked.current = true;
    trackMeta('InitiateCheckout', {
      value: total / 100,
      currency: 'USD',
      content_name: 'Marketplace order',
      content_type: 'product',
      content_ids: lineItems.map((li) => li.itemId),
      num_items: lineItems.length,
    });
  }, [catalogLoading, lineItems, total]);

  const startCheckout = useCallback(async () => {
    setFormError(null);

    if (isAuthenticated) {
      if (sessionLoading) {
        setFormError('Loading your account — try again in a moment.');
        return;
      }
      if (!household?.id) {
        setFormError('We could not load your household. Refresh and try again.');
        return;
      }
    } else if (!isValidEmail(guestEmail)) {
      setFormError('Enter a valid email so we can send your receipt.');
      return;
    }

    const addressResult = validateAddress();
    if (!addressResult.ok) {
      setAddressFieldErrors(addressResult.fields);
      setFormError(addressResult.message);
      return;
    }
    setAddressFieldErrors({});
    const verdict = await deliverability.verify();
    if (!verdict.ok) {
      setAddressFieldErrors(verdict.fields);
      setFormError(verdict.message);
      return;
    }
    if (!lineItems.length) {
      setFormError('Your cart is empty.');
      return;
    }

    if (total > 0 && !stripeKey) {
      marketplaceCheckoutNotify(
        'Not configured',
        'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env'
      );
      return;
    }

    setPreparing(true);
    try {
      const result = await createMarketplaceCheckout(
        isAuthenticated ? household?.id ?? null : null,
        normalizedAddress(),
        lineItems.map((li) => ({ itemId: li.itemId, quantity: li.quantity ?? 1 })),
        { skipShipStation, email: isAuthenticated ? undefined : guestEmail.trim() }
      );

      if (
        result.status === 'committed' ||
        result.status === 'confirmed' ||
        result.totalCents === 0
      ) {
        finishOrder(result.orderId, result.totalCents, result.status === 'confirmed');
        return;
      }

      if (!result.clientSecret) {
        setFormError('Payment could not be started. Try again.');
        return;
      }

      setPending({
        orderId: result.orderId,
        totalCents: result.totalCents,
        clientSecret: result.clientSecret,
        intent: result.intent === 'payment' ? 'payment' : 'setup',
      });
    } catch (e) {
      const msg = marketplaceCheckoutErrorMessage(e);
      setFormError(msg);
      marketplaceCheckoutNotify('Could not start payment', msg);
    } finally {
      setPreparing(false);
    }
  }, [
    isAuthenticated,
    guestEmail,
    sessionLoading,
    household?.id,
    validateAddress,
    deliverability.verify,
    lineItems,
    total,
    stripeKey,
    normalizedAddress,
    skipShipStation,
    finishOrder,
  ]);

  const onBack = () => navigation.goBack();

  if (catalogLoading || (isAuthenticated && (sessionLoading || ordersLoading))) {
    return <SystemPage narrow loading onBack={onBack} />;
  }

  if (!lineItems.length) {
    return (
      <SystemPage narrow onBack={() => navigation.navigate('StorefrontCart')}>
        <Text style={checkoutUi.title}>Shipping</Text>
        <Text style={checkoutUi.lead}>Your cart is empty.</Text>
      </SystemPage>
    );
  }

  const orderSummary = (
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
      discountCents={discountCents}
      discountLabel={promo.discountLabel}
      marketplaceOnly
    />
  );

  if (pending) {
    const chargeNow = pending.intent === 'payment';
    return (
      <SystemPage narrow onBack={() => setPending(null)}>
        <Text style={checkoutUi.title}>Payment</Text>
        <Text style={checkoutUi.lead}>
          {chargeNow
            ? `You'll be charged ${formatDollars(pending.totalCents)} today. ${arrival}`
            : `We'll save your card and charge ${formatDollars(pending.totalCents)} when Hanukkah boxes lock. These items ship with your box.`}
        </Text>
        <View style={checkoutUi.divider} />
        {orderSummary}
        <View style={checkoutUi.divider} />
        {stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: pending.clientSecret,
              appearance: STRIPE_APPEARANCE,
              fonts: STRIPE_FONTS,
            }}
          >
            <MarketplacePaymentPanel
              totalCents={pending.totalCents}
              intent={pending.intent}
              onError={marketplaceCheckoutNotify}
              onPaid={() => finishOrder(pending.orderId, pending.totalCents, chargeNow)}
            />
          </Elements>
        ) : (
          <Text style={checkoutUi.fieldError}>
            Stripe is not configured. Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env.
          </Text>
        )}
      </SystemPage>
    );
  }

  const lead = chargesAtLock
    ? total > 0
      ? "We'll save your card and charge it when Hanukkah boxes lock. These items ship with your box."
      : "Your credits cover this order. We'll ship it with your box."
    : `${arrival} These items ship with our Hanukkah boxes.`;

  return (
    <SystemPage narrow onBack={onBack}>
      <Text style={checkoutUi.title}>Shipping</Text>
      <Text style={checkoutUi.lead}>{lead}</Text>
      <View style={checkoutUi.divider} />
      {orderSummary}
      <DiscountCodeField promo={promo} disabled={preparing} />
      <View style={checkoutUi.divider} />
      {!isAuthenticated ? (
        <>
          <Text style={checkoutUi.sectionHeading}>Contact</Text>
          <Text style={checkoutUi.label}>Email</Text>
          <TextInput
            style={checkoutUi.input}
            value={guestEmail}
            onChangeText={(value) => {
              setGuestEmail(value);
              setFormError(null);
            }}
            placeholder="you@email.com"
            placeholderTextColor={semanticColors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel="Email, required"
          />
          <View style={checkoutUi.divider} />
        </>
      ) : null}
      <CheckoutAddressFields
        address={address}
        onChange={onAddressChange}
        fieldErrors={addressFieldErrors}
        {...deliverability.fieldsProps}
      />
      {formError ? <Text style={[checkoutUi.fieldError, styles.formError]}>{formError}</Text> : null}
      <GrapejuiceButton
        label={total > 0 ? `Continue to payment · ${formatDollars(total)}` : 'Place order'}
        variant="filled"
        onPress={() => void startCheckout()}
        loading={preparing || deliverability.checking}
        disabled={preparing || sessionLoading || deliverability.checking}
        style={[checkoutUi.button, styles.ctaSpacing]}
        textStyle={checkoutUi.buttonText}
      />
    </SystemPage>
  );
}

export function MarketplaceCheckoutScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <MarketplaceCheckoutBody />
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  formError: { marginTop: spacing.md },
  ctaSpacing: { marginTop: spacing.xl },
});
