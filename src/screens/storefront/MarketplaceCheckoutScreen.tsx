import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useMarketplaceCartStore } from '../../stores/marketplaceCartStore';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { createMarketplaceCheckout } from '../../services/checkout/createMarketplaceCheckout';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { MainStackParamList } from '../../navigation/types';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { CheckoutOrderSummary } from '../main/checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { CheckoutSmsOptIn } from '../main/checkout/CheckoutSmsOptIn';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { useMarketplaceCheckout } from './useMarketplaceCheckout';
import type { ShippingAddressFieldErrors } from '../../utils/formValidation';
import type { ShippingAddress } from '../../types/pilot';
import {
  marketplaceCheckoutErrorMessage,
  marketplaceCheckoutNotify,
} from './marketplaceCheckoutNotify';

function MarketplaceCheckoutAuthGate() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const startAuth = useAuthFlowStore((s) => s.startAuthForMarketplaceCheckout);
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.authContent}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Text style={styles.backLink}>← Back to cart</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Sign in to checkout</Text>
      <Text style={styles.authBody}>
        Create a free account or log in to complete your order. Your cart will stay saved.
      </Text>
      <GrapejuiceButton
        label="Create account"
        variant="filled"
        onPress={() => startAuth('signup')}
        style={styles.authBtn}
      />
      <GrapejuiceButton
        label="Log in"
        variant="pillOutline"
        onPress={() => startAuth('signin')}
        style={styles.authBtn}
      />
    </ScrollView>
  );
}

export function MarketplaceCheckoutScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <MarketplaceCheckoutBody />
    </StorefrontChrome>
  );
}

function MarketplaceCheckoutBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, loading: sessionLoading } = useSession();
  const clearCart = useMarketplaceCartStore((s) => s.clear);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const skipShipStation = useMockFlowStore((s) => s.active);

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
  } = useMarketplaceCheckout();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
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
    updateAddress(patch);
  };

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';

  const finishOrder = useCallback(
    (orderId: string) => {
      clearCart();
      navigation.replace('OrderConfirmation', { orderId });
    },
    [clearCart, navigation]
  );

  const placeOrder = async () => {
    setFormError(null);

    if (!user) {
      setFormError('Sign in to continue.');
      return;
    }
    if (sessionLoading) {
      setFormError('Loading your account — try again in a moment.');
      return;
    }
    if (!household?.id) {
      setFormError('We could not load your household. Refresh and try again.');
      return;
    }

    const addressResult = validateAddress();
    if (!addressResult.ok) {
      setAddressFieldErrors(addressResult.fields);
      setFormError(addressResult.message);
      return;
    }
    setAddressFieldErrors({});
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

    setSubmitting(true);
    try {
      const result = await createMarketplaceCheckout(
        household.id,
        normalizedAddress(),
        lineItems.map((li) => ({ itemId: li.itemId, quantity: li.quantity ?? 1 })),
        { skipShipStation }
      );

      if (result.status === 'confirmed' || result.totalCents === 0) {
        finishOrder(result.orderId);
        return;
      }

      if (!result.clientSecret) {
        setFormError('Payment could not be started. Try again.');
        return;
      }

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: result.clientSecret,
        merchantDisplayName: 'Grapejuice',
      });
      if (initError) {
        throw new Error(initError.message ?? 'Could not open payment.');
      }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          throw new Error(presentError.message ?? 'Payment failed.');
        }
        return;
      }

      finishOrder(result.orderId);
    } catch (e) {
      const msg = marketplaceCheckoutErrorMessage(e);
      setFormError(msg);
      marketplaceCheckoutNotify('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return <MarketplaceCheckoutAuthGate />;
  }

  if (catalogLoading || sessionLoading) {
    return (
      <View style={styles.centered}>
        <BrandLoadingMark color={colors.brand} />
      </View>
    );
  }

  if (!lineItems.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Your cart is empty.</Text>
        <TouchableOpacity onPress={() => navigation.navigate('StorefrontCart')}>
          <Text style={styles.backLink}>Back to cart</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Text style={styles.backLink}>← Back to cart</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Checkout</Text>
      <Text style={styles.chargeBanner}>
        {total > 0
          ? 'You will be charged when you place your order.'
          : 'Your credits cover this order — no payment needed.'}
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
      <CheckoutSmsOptIn
        phone={contactPhone}
        smsOptIn={smsOptIn}
        onPhoneChange={setContactPhone}
        onSmsOptInChange={setSmsOptIn}
      />

      {formError ? <Text style={styles.formError}>{formError}</Text> : null}

      <TouchableOpacity
        style={[styles.cta, submitting && styles.ctaDisabled]}
        onPress={() => void placeOrder()}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Place order"
      >
        {submitting ? (
          <BrandLoadingMark large={false} color={colors.goldMuted} />
        ) : (
          <Text style={styles.ctaText}>
            {total > 0 ? `Place order · ${formatDollars(total)}` : 'Place order'}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.xxl,
      paddingBottom: 120,
    },
    authContent: {
      padding: spacing.lg,
      paddingTop: spacing.xxl,
      paddingBottom: 120,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      backgroundColor: colors.bgPrimary,
    },
    backRow: { marginBottom: spacing.md },
    backLink: {
      color: colors.brand,
      fontSize: typography.md,
      ...typeface('medium'),
    },
    title: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      letterSpacing: -0.32,
      marginBottom: spacing.sm,
      ...typeface('regular'),
    },
    chargeBanner: {
      backgroundColor: colors.brandLight,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
      fontSize: typography.md,
      lineHeight: typography.md * 1.4,
      ...typeface('regular'),
    },
    authBody: {
      fontSize: typography.lg,
      color: colors.textSecondary,
      lineHeight: typography.lg * 1.4,
      marginBottom: spacing.xl,
      ...typeface('regular'),
    },
    authBtn: { alignSelf: 'stretch', marginBottom: spacing.md },
    formError: {
      marginTop: spacing.md,
      fontSize: typography.md,
      color: colors.error ?? '#B91C1C',
      lineHeight: typography.md * 1.4,
      ...typeface('regular'),
    },
    cta: {
      backgroundColor: colors.textPrimary,
      padding: spacing.md,
      borderRadius: borderRadius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.lg,
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: {
      color: colors.goldMuted,
      fontWeight: '700',
    },
    emptyText: {
      textAlign: 'center',
      color: colors.textSecondary,
      marginBottom: spacing.md,
      fontSize: typography.md,
      ...typeface('regular'),
    },
  });
}
