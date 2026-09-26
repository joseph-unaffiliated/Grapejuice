import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useSession } from '../../hooks/useSession';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useAuthStore } from '../../stores/authStore';
import { useMarketplaceCartStore } from '../../stores/marketplaceCartStore';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { createMarketplaceCheckout } from '../../services/checkout/createMarketplaceCheckout';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { MainStackParamList } from '../../navigation/types';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { ButtonLoadingLabel } from '../../components/brand/ButtonLoadingLabel';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { CheckoutOrderSummary } from '../main/checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { CheckoutSmsOptIn } from '../main/checkout/CheckoutSmsOptIn';
import { SystemPage, systemPageStyles as page } from '../../components/layout/SystemPage';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { useMarketplaceCheckout } from './useMarketplaceCheckout';
import { GIFT_STRIPE_APPEARANCE } from '../gift/GiftPaymentPanel.web';
import { isValidEmail, type ShippingAddressFieldErrors } from '../../utils/formValidation';
import type { ShippingAddress } from '../../types/pilot';
import { MarketplacePaymentPanel } from './MarketplacePaymentPanel.web';
import {
  marketplaceCheckoutErrorMessage,
  marketplaceCheckoutNotify,
} from './marketplaceCheckoutNotify';

const DESKTOP_CONTENT_TOP = 41;

function CheckoutCta({
  label,
  onPress,
  loading,
  disabled,
  colors,
  styles,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  colors: SemanticColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity
      style={[styles.cta, (disabled || loading) && styles.ctaDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <ButtonLoadingLabel
        label={label}
        loading={loading}
        loaderColor={semanticColors.logoDark}
        labelStyle={styles.ctaText}
      />
    </TouchableOpacity>
  );
}

function MarketplaceCheckoutBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, loading: sessionLoading } = useSession();
  const clearCart = useMarketplaceCartStore((s) => s.clear);
  const { isDesktop, widePanelMaxWidth } = useWebLayout();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
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

  const [preparing, setPreparing] = useState(false);
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [pendingTotalCents, setPendingTotalCents] = useState(0);
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
  const stripePromise = useMemo(
    () => (stripeKey ? loadStripe(stripeKey) : null),
    [stripeKey]
  );

  const finishOrder = useCallback(
    (orderId: string) => {
      clearCart();
      navigation.replace('OrderConfirmation', { orderId });
    },
    [clearCart, navigation]
  );

  const resetPayment = () => {
    setPaymentSecret(null);
    setPendingOrderId(null);
    setPendingTotalCents(0);
  };

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
        finishOrder(result.orderId);
        return;
      }

      if (!result.clientSecret) {
        setFormError('Payment could not be started. Try again.');
        return;
      }

      setPendingOrderId(result.orderId);
      setPendingTotalCents(result.totalCents);
      setPaymentSecret(result.clientSecret);
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
    lineItems,
    total,
    stripeKey,
    normalizedAddress,
    skipShipStation,
    finishOrder,
  ]);

  if (catalogLoading || (isAuthenticated && sessionLoading)) {
    return (
      <SystemPage loading onBack={() => navigation.goBack()} />
    );
  }

  if (!lineItems.length) {
    return (
      <SystemPage onBack={() => navigation.navigate('StorefrontCart')}>
        <Text style={page.title}>Shipping</Text>
        <Text style={page.lead}>Your cart is empty.</Text>
      </SystemPage>
    );
  }

  if (paymentSecret && pendingOrderId) {
    if (!stripePromise) {
      return (
        <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
          <View style={styles.centered}>
            <Text style={styles.emptyText}>
              Stripe is not configured. Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env.
            </Text>
            <TouchableOpacity onPress={resetPayment}>
              <Text style={styles.backLink}>← Back to shipping</Text>
            </TouchableOpacity>
          </View>
        </WebContentPanel>
      );
    }

    return (
      <WebContentPanel
        flush
        centerDesktop={isDesktop}
        omitDesktopTopPadding={isDesktop}
        style={styles.panel}
      >
        <ScrollView
          style={styles.root}
          contentContainerStyle={isDesktop ? styles.desktopScrollContent : styles.mobileScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.shell, isDesktop ? { maxWidth: widePanelMaxWidth } : null]}>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: paymentSecret,
                appearance: GIFT_STRIPE_APPEARANCE,
              }}
            >
              <MarketplacePaymentPanel
                lineItems={lineItems}
                totalCents={pendingTotalCents}
                onCancel={resetPayment}
                onError={marketplaceCheckoutNotify}
                onPaid={() => finishOrder(pendingOrderId)}
              />
            </Elements>
          </View>
        </ScrollView>
      </WebContentPanel>
    );
  }

  const summaryCard = (
    <View style={styles.summaryCard}>
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
        compact
      />
    </View>
  );

  const shippingForm = (
    <>
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
      <CheckoutCta
        label={total > 0 ? `Continue to payment · ${formatDollars(total)}` : 'Place order'}
        onPress={() => void startCheckout()}
        loading={preparing}
        disabled={preparing || sessionLoading}
        colors={colors}
        styles={styles}
      />
    </>
  );

  return (
    <SystemPage onBack={() => navigation.goBack()}>
      <Text style={page.title}>Shipping</Text>
      <Text style={page.lead}>
        {total > 0
          ? "We'll save your card and charge it when Hanukkah boxes lock. These items ship with that wave."
          : "Your credits cover this order. We'll hold it until boxes lock, then ship it with them."}
      </Text>
      {summaryCard}
      {shippingForm}
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

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: {
      flex: 1,
      width: '100%',
      minHeight: 0,
      backgroundColor: colors.bgPrimary,
    },
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    desktopScrollContent: { flexGrow: 1, paddingBottom: 120 },
    mobileScrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: 120,
    },
    authContent: {
      padding: spacing.lg,
      paddingTop: spacing.xxl,
      paddingBottom: 120,
      maxWidth: isDesktop ? 560 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    shell: {
      width: '100%',
      alignSelf: 'center',
      paddingTop: isDesktop ? DESKTOP_CONTENT_TOP : 0,
    },
    desktopColumns: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xl,
      marginTop: spacing.md,
      width: '100%',
      minWidth: 0,
    },
    desktopMain: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      maxWidth: 480,
      minWidth: 0,
    },
    desktopSummary: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 280,
      minWidth: 260,
      maxWidth: 400,
      alignSelf: 'flex-start',
      ...(Platform.OS === 'web'
        ? ({ position: 'sticky' as const, top: DESKTOP_CONTENT_TOP, zIndex: 1 } as object)
        : null),
    },
    summaryCard: {
      borderWidth: 1,
      borderColor: semanticColors.border,
      borderRadius: borderRadius.md,
      padding: spacing.lg,
      marginBottom: spacing.lg,
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
      marginBottom: spacing.md,
      fontSize: typography.md,
      lineHeight: typography.md * 1.4,
      ...typeface('regular'),
    },
    emailLabel: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      ...typeface('medium'),
    },
    emailInput: {
      borderWidth: 1,
      borderColor: semanticColors.border,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      fontSize: typography.md,
      color: semanticColors.textPrimary,
      backgroundColor: semanticColors.bgPrimary,
      marginBottom: spacing.xs,
      ...typeface('regular'),
    },
    emailHint: {
      fontSize: typography.sm,
      color: colors.textTertiary,
      marginBottom: spacing.lg,
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
      alignSelf: 'flex-start',
      marginTop: spacing.lg,
      minHeight: 40,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: semanticColors.brand,
      alignItems: 'center',
      justifyContent: 'center',
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: semanticColors.logoDark,
      letterSpacing: -0.2,
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
