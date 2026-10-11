import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StickyBar, STICKY_BAR_CLEARANCE } from '../../components/mobile/StickyBar';
import { OrderSummary, type OrderLine } from '../../components/mobile/OrderSummary';
import { coalesceLinesByItemId } from '../../components/box/boxLineDisplay';
import { primaryPhoto } from '../../components/mobile/catalogPhotos';
import { m, mFont, mGutter, mType, balanceProps } from '../../components/mobile/mobileTheme';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
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
import { useAddressDeliverability } from '../main/checkout/useAddressDeliverability';
import { CheckoutOrderSummary } from '../main/checkout/CheckoutOrderSummary';
import { DiscountCodeField } from '../main/checkout/DiscountCodeField';
import { usePromo } from '../../services/promo/usePromo';
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
import {
  PAYMENT_ELEMENT_OPTIONS,
  STRIPE_APPEARANCE,
  STRIPE_FONTS,
} from '../main/checkout/stripeAppearance';
import type { MainStackParamList } from '../../navigation/types';
import type { ShippingAddress } from '../../types/pilot';
import {
  normalizeShippingAddress,
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
        <PaymentElement options={PAYMENT_ELEMENT_OPTIONS} />
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
  const mobileLayoutForHeader = useMobileLayout();
  const mobileHeader = (back: string, onPress: () => void) =>
    mobileLayoutForHeader ? <TaskHeader back={{ label: back, onPress }} title="Checkout" right="Secure" /> : undefined;
  const route = useRoute<Route>();
  const { giftInviteId, surprise = false } = route.params;
  const { household, refresh: refreshSession } = useSession();
  const { gifts, loading: giftsLoading, refresh } = useReceivedGifts();
  const { items: catalog } = useCatalog();
  const skipShipStation = useMockFlowStore((s) => s.active);

  const gift = gifts.find((g) => g.giftInviteId === giftInviteId);
  const lineItems = gift?.lineItems ?? [];
  const giverName = gift?.giverName?.trim() || 'The giver';
  const [address, setAddress] = useState<ShippingAddress>(emptyShippingAddress);
  const giverAddress = gift?.giverShippingAddress;
  useEffect(() => {
    if (giverAddress) setAddress((a) => (a.line1 ? a : { ...emptyShippingAddress, ...giverAddress }));
  }, [giverAddress]);
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
  const deliverability = useAddressDeliverability(address, onAddressChange);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  const subtotal = recipientGiftUpgradeCents(
    lineItems,
    resolveGiftPrepaidAddOnCents(gift ?? {})
  );
  const shippingCents = SHIPPING_FLAT_CENTS;
  const promo = usePromo(subtotal);
  const priced = checkoutTotalsAfterCredit({
    merchandiseCents: subtotal + shippingCents,
    giftCreditCents: household?.giftCreditCents ?? 0,
    platformCreditCents: household?.platformCreditCents ?? 0,
    discountCents: promo.discountCents,
  });
  const { taxCents, giftCreditApplied, platformCreditApplied, totalCents: total } = priced;

  const finish = useCallback(
    async (orderId: string) => {
      await refresh();
      await refreshSession({ silent: true });
      if (surprise) navigation.replace('MyGifts');
      else navigation.replace('OrderConfirmation', { orderId });
    },
    [navigation, refresh, refreshSession, surprise]
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
    const verdict = await deliverability.verify();
    if (!verdict.ok) {
      setAddressFieldErrors(verdict.fields);
      setFormError(verdict.message);
      return;
    }
    const acceptedWithoutCheckout = gift?.status === 'accepted' && !gift.checkoutOrderId;
    if (!gift || (gift.status !== 'available' && !acceptedWithoutCheckout)) {
      setFormError('This gift is no longer available for checkout.');
      return;
    }

    setPreparing(true);
    try {
      const result = await createReceivedGiftCheckout(
        giftInviteId,
        normalizeShippingAddress(address),
        lineItems,
        { skipShipStation, surprise }
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

  const backToGiftBox = () =>
    surprise ? navigation.navigate('MyGifts') : navigation.navigate('GiftBox', { giftInviteId });

  if (giftsLoading || !gift) {
    return <SystemPage narrow loading onBack={backToGiftBox} header={mobileHeader('Your box', backToGiftBox)} />;
  }

  if (paymentSecret && stripePromise && pendingOrderId) {
    return (
      <SystemPage narrow onBack={() => setPaymentSecret(null)} header={mobileHeader('Back', () => setPaymentSecret(null))}>
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

  if (mobileLayoutForHeader) {
    const fields = (
      <>
        <CheckoutAddressFields address={address} onChange={onAddressChange} fieldErrors={addressFieldErrors} {...deliverability.fieldsProps} />
        {formError ? <Text style={checkoutUi.fieldError}>{formError}</Text> : null}
      </>
    );
    const busy = preparing || deliverability.checking;
    if (surprise) {
      return (
        <View style={{ flex: 1, backgroundColor: m.white }}>
          <TaskHeader back={{ label: 'Back', onPress: backToGiftBox }} title="Your gift" />
          <ScrollView contentContainerStyle={{ paddingHorizontal: mGutter, paddingTop: 24, paddingBottom: STICKY_BAR_CLEARANCE + 24 }} keyboardShouldPersistTaps="handled">
            <Text style={[mType.h1, { fontSize: 27 }]}>Where should we send it?</Text>
            <Text style={mStyles.sub} {...balanceProps}>
              {giverAddress ? `${giverName} added this address. Check it, and that's all we need.` : "It's a surprise, so that's all we need."}
            </Text>
            {fields}
          </ScrollView>
          <StickyBar layout="stack" label={`Covered by ${giverName}`} total="$0 to you" cta={{ label: 'Ship my gift', onPress: () => void startCheckout(), busy }} />
        </View>
      );
    }
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const thumbs = coalesceLinesByItemId(lineItems).map((r) => ({ id: r.itemId, imageUrl: primaryPhoto(byId.get(r.itemId)) }));
    const lines: OrderLine[] = [
      { label: 'Hanukkah box', value: 'Covered' },
      ...(subtotal > 0 ? [{ label: 'Your extras', value: formatDollars(subtotal) }] : []),
      ...(priced.discountApplied > 0 ? [{ label: promo.discountLabel || 'Discount', value: `−${formatDollars(priced.discountApplied)}` }] : []),
      ...(giftCreditApplied > 0 ? [{ label: 'Gift credit', value: `−${formatDollars(giftCreditApplied)}` }] : []),
      ...(platformCreditApplied > 0 ? [{ label: 'Credit', value: `−${formatDollars(platformCreditApplied)}` }] : []),
      { label: 'Shipping', value: shippingCents > 0 ? formatDollars(shippingCents) : 'Free' },
      ...(taxCents > 0 ? [{ label: 'Estimated tax', value: formatDollars(taxCents) }] : []),
    ];
    return (
      <View style={{ flex: 1, backgroundColor: m.white }}>
        <TaskHeader back={{ label: 'Box', onPress: backToGiftBox }} title="Your box" right="Secure" />
        <ScrollView contentContainerStyle={{ paddingHorizontal: mGutter, paddingTop: 16, paddingBottom: STICKY_BAR_CLEARANCE + 24 }} keyboardShouldPersistTaps="handled">
          <View style={mStyles.assure}>
            <Icon icon={icons.gift} size={14} color={m.goldDark} />
            <Text style={mStyles.assureText}>
              Your box is covered by {giverName}.{total > 0 ? ' Only what you added goes on your card.' : ''}
            </Text>
          </View>
          <View style={{ marginTop: 14 }}>
            <OrderSummary sub={`Covered by ${giverName}`} items={thumbs} lines={lines} totalLabel={total > 0 ? 'Paid today' : 'You pay'} total={formatDollars(total)} />
          </View>
          {subtotal > 0 ? <View style={{ marginTop: 12 }}><DiscountCodeField promo={promo} /></View> : null}
          <View style={mStyles.sectionHead}>
            <Text style={mType.h2}>Shipping</Text>
            <Text style={mType.small}>U.S. only</Text>
          </View>
          {fields}
        </ScrollView>
        <StickyBar
          layout="stack"
          label={total > 0 ? 'Paid today' : `Covered by ${giverName}`}
          total={total > 0 ? formatDollars(total) : '$0 to you'}
          cta={{ label: total > 0 ? 'Continue to payment' : 'Confirm my box', onPress: () => void startCheckout(), busy }}
        />
      </View>
    );
  }

  if (surprise) {
    return (
      <SystemPage narrow onBack={backToGiftBox} header={mobileHeader('Your box', backToGiftBox)}>
        <Text style={checkoutUi.title}>Where should it go?</Text>
        <Text style={checkoutUi.lead}>
          {giverAddress
            ? `${giverName} added this address. Check it, and we'll ship the box exactly as they picked it. You won't see what's inside until it arrives.`
            : `We'll ship the box exactly as ${giverName} picked it. You won't see what's inside until it arrives.`}
        </Text>
        <View style={checkoutUi.divider} />
        <CheckoutAddressFields
          address={address}
          onChange={onAddressChange}
          fieldErrors={addressFieldErrors}
          {...deliverability.fieldsProps}
        />
        {formError ? <Text style={checkoutUi.fieldError}>{formError}</Text> : null}
        <GrapejuiceButton
          label="Ship my surprise"
          variant="filled"
          onPress={() => void startCheckout()}
          loading={preparing || deliverability.checking}
          style={[checkoutUi.button, styles.ctaSpacing]}
          textStyle={checkoutUi.buttonText}
        />
      </SystemPage>
    );
  }

  return (
    <SystemPage narrow onBack={backToGiftBox} header={mobileHeader('Your box', backToGiftBox)}>
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
        discountCents={priced.discountApplied}
        discountLabel={promo.discountLabel}
        marketplaceOnly
      />
      {subtotal > 0 ? <DiscountCodeField promo={promo} /> : null}
      <View style={checkoutUi.divider} />
      <CheckoutAddressFields
        address={address}
        onChange={onAddressChange}
        fieldErrors={addressFieldErrors}
        {...deliverability.fieldsProps}
      />
      {formError ? <Text style={checkoutUi.fieldError}>{formError}</Text> : null}
      <GrapejuiceButton
        label={total > 0 ? `Continue to payment · ${formatDollars(total)}` : 'Confirm gift box'}
        variant="filled"
        onPress={() => void startCheckout()}
        loading={preparing || deliverability.checking}
        style={[checkoutUi.button, styles.ctaSpacing]}
        textStyle={checkoutUi.buttonText}
      />
    </SystemPage>
  );
}

export function GiftBoxCheckoutScreen() {
  const mobileLayout = useMobileLayout();
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav hideSearchAndRav={mobileLayout} fillChromeHidden={mobileLayout}>
      <GiftBoxCheckoutBody />
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  paymentElementWrap: { minHeight: 120, marginTop: spacing.xs },
  ctaSpacing: { marginTop: spacing.xl },
});

const mStyles = StyleSheet.create({
  sub: { fontSize: 15.5, lineHeight: 23, color: m.body, marginTop: 8, marginBottom: 20, ...mFont(300) },
  assure: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: m.beige, borderRadius: 12, padding: 12 },
  assureText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: m.ink, ...mFont(400) },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 26, marginBottom: 12 },
});
