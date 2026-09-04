import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { CheckoutOrderSummary } from '../main/checkout/CheckoutOrderSummary';
import { useReceivedGifts } from '../../hooks/useReceivedGifts';
import { useSession } from '../../hooks/useSession';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { useCatalog } from '../../hooks/useCatalog';
import { createReceivedGiftCheckout } from '../../services/gift/giftFlow';
import { formatDollars } from '../../services/box/buildDefaultBox';
import {
  resolveGiftPrepaidAddOnCents,
  recipientGiftUpgradeCents,
  SHIPPING_FLAT_CENTS,
} from '../../services/box/pricing';
import { emptyShippingAddress } from '../main/checkout/useCheckoutDraft';
import { GIFT_STRIPE_APPEARANCE } from './GiftPaymentPanel.web';
import type { MainStackParamList } from '../../navigation/types';
import type { ShippingAddress } from '../../types/pilot';
import {
  validateShippingAddress,
  type ShippingAddressFieldErrors,
} from '../../utils/formValidation';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Route = RouteProp<MainStackParamList, 'GiftBoxCheckout'>;

function notify(title: string, message: string) {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
}

function WebPayStep({
  onPaid,
  styles,
  colors,
}: {
  onPaid: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: SemanticColors;
}) {
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
    <View style={styles.payBlock}>
      <Text style={styles.sectionTitle}>Payment</Text>
      <PaymentElement options={{ layout: 'tabs' }} />
      <TouchableOpacity
        style={[styles.cta, paying && styles.ctaDisabled]}
        onPress={() => void pay()}
        disabled={paying}
      >
        {paying ? (
          <BrandLoadingMark large={false} color={colors.goldMuted} />
        ) : (
          <Text style={styles.ctaText}>Pay & confirm gift box</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function GiftBoxCheckoutBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { giftInviteId } = route.params;
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
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
  const taxCents = Math.round((subtotal + shippingCents) * 0.075);
  const preCredit = subtotal + shippingCents + taxCents;
  const giftCreditApplied = Math.min(household?.giftCreditCents ?? 0, preCredit);
  const platformCreditApplied = Math.min(
    household?.platformCreditCents ?? 0,
    preCredit - giftCreditApplied
  );
  const total = preCredit - giftCreditApplied - platformCreditApplied;

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

  if (giftsLoading || !gift) {
    return (
      <View style={styles.centered}>
        <BrandLoadingMark color={colors.brand} />
      </View>
    );
  }

  if (paymentSecret && stripePromise && pendingOrderId) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => setPaymentSecret(null)} style={styles.backRow}>
          <Text style={styles.backLink}>← Back to shipping</Text>
        </TouchableOpacity>
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: paymentSecret, appearance: GIFT_STRIPE_APPEARANCE }}
        >
          <WebPayStep
            colors={colors}
            styles={styles}
            onPaid={() => void finish(pendingOrderId)}
          />
        </Elements>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity
        onPress={() => navigation.navigate('GiftBox', { giftInviteId })}
        style={styles.backRow}
      >
        <Text style={styles.backLink}>← Back to gift box</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Gift box checkout</Text>
      <Text style={styles.lead}>
        The curated box was already paid by the giver. You only pay for add-ons you added (gift
        credit applies).
      </Text>
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
      <CheckoutAddressFields
        address={address}
        onChange={onAddressChange}
        fieldErrors={addressFieldErrors}
      />
      {formError ? <Text style={styles.formError}>{formError}</Text> : null}
      <TouchableOpacity
        style={[styles.cta, preparing && styles.ctaDisabled]}
        onPress={() => void startCheckout()}
        disabled={preparing}
      >
        {preparing ? (
          <BrandLoadingMark large={false} color={colors.goldMuted} />
        ) : (
          <Text style={styles.ctaText}>
            {total > 0 ? `Continue to payment · ${formatDollars(total)}` : 'Confirm gift box'}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

export function GiftBoxCheckoutScreen() {
  const { isDesktop } = useWebLayout();
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
        <GiftBoxCheckoutBody />
      </WebContentPanel>
    </StorefrontChrome>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingBottom: 120,
      maxWidth: isDesktop ? 560 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    backRow: { marginBottom: spacing.md },
    backLink: { color: colors.brand, fontWeight: '600', fontSize: typography.md },
    title: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      ...typeface('regular'),
      marginBottom: spacing.sm,
    },
    lead: {
      fontSize: typography.md,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: spacing.lg,
      ...typeface('regular'),
    },
    sectionTitle: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      ...typeface('medium'),
    },
    payBlock: { marginTop: spacing.md, gap: spacing.md },
    formError: { marginTop: spacing.md, color: '#B91C1C', fontSize: typography.md },
    cta: {
      marginTop: spacing.lg,
      backgroundColor: colors.textPrimary,
      padding: spacing.md,
      borderRadius: borderRadius.pill,
      alignItems: 'center',
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: { color: colors.goldMuted, fontWeight: '700' },
  });
}
