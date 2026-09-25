import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { useMarketplaceCartStore } from '../../stores/marketplaceCartStore';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { createMarketplaceCheckout } from '../../services/checkout/createMarketplaceCheckout';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { MainStackParamList } from '../../navigation/types';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { ButtonLoadingLabel } from '../../components/brand/ButtonLoadingLabel';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { CheckoutOrderSummary } from '../main/checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { CheckoutSmsOptIn } from '../main/checkout/CheckoutSmsOptIn';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { useMarketplaceCheckout } from './useMarketplaceCheckout';
import { isValidEmail, type ShippingAddressFieldErrors } from '../../utils/formValidation';
import type { ShippingAddress } from '../../types/pilot';
import {
  marketplaceCheckoutErrorMessage,
  marketplaceCheckoutNotify,
} from './marketplaceCheckoutNotify';

export function MarketplaceCheckoutScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <MarketplaceCheckoutBody />
    </StorefrontChrome>
  );
}

function MarketplaceCheckoutBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
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
  const [guestEmail, setGuestEmail] = useState('');

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
        finishOrder(result.orderId);
        return;
      }

      if (!result.clientSecret) {
        setFormError('Payment could not be started. Try again.');
        return;
      }

      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: result.clientSecret,
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

  if (catalogLoading || (isAuthenticated && sessionLoading)) {
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
          ? "We'll save your card and charge it when Hanukkah boxes lock. These items ship with that wave."
          : "Your credits cover this order. We'll hold it until boxes lock, then ship it with them."}
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

      {!isAuthenticated ? (
        <>
          <Text style={styles.emailLabel}>Email</Text>
          <TextInput
            style={styles.emailInput}
            value={guestEmail}
            onChangeText={(value) => {
              setGuestEmail(value);
              setFormError(null);
            }}
            placeholder="you@email.com"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel="Email, required"
          />
          <Text style={styles.emailHint}>
            No account needed for this order. A Hanukkah box still needs an account.
          </Text>
        </>
      ) : null}
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
        <ButtonLoadingLabel
          label={total > 0 ? `Place order · ${formatDollars(total)}` : 'Place order'}
          loading={submitting}
          loaderColor={colors.goldMuted}
          labelStyle={styles.ctaText}
        />
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
    emailLabel: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
      ...typeface('medium'),
    },
    emailInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: typography.md,
      color: colors.textPrimary,
      backgroundColor: colors.bgElevated,
      marginBottom: spacing.xs,
      ...typeface('regular'),
    },
    emailHint: {
      fontSize: typography.sm,
      color: colors.textTertiary,
      marginBottom: spacing.md,
      lineHeight: typography.sm * 1.4,
      ...typeface('regular'),
    },
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
      borderRadius: borderRadius.md,
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
