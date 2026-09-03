import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
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
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useMarketplaceCartStore } from '../../stores/marketplaceCartStore';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { createMarketplaceCheckout } from '../../services/checkout/createMarketplaceCheckout';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { MainStackParamList } from '../../navigation/types';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { spacing, typography, borderRadius, typeface, shadowsWeb } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { CheckoutOrderSummary } from '../main/checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { CheckoutSmsOptIn } from '../main/checkout/CheckoutSmsOptIn';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { useMarketplaceCheckout } from './useMarketplaceCheckout';
import { GIFT_STRIPE_APPEARANCE } from '../gift/GiftPaymentPanel.web';
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
      {loading ? (
        <BrandLoadingMark large={false} color={colors.goldMuted} />
      ) : (
        <Text style={styles.ctaText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function MarketplaceCheckoutAuthGate() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const startAuth = useAuthFlowStore((s) => s.startAuthForMarketplaceCheckout);
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);

  return (
    <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
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
    </WebContentPanel>
  );
}

function MarketplaceCheckoutBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const user = useAuthStore((s) => s.user);
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

    const addressError = validateAddress();
    if (addressError) {
      setFormError(addressError);
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
    user,
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
      <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Your cart is empty.</Text>
          <TouchableOpacity onPress={() => navigation.navigate('StorefrontCart')}>
            <Text style={styles.backLink}>Back to cart</Text>
          </TouchableOpacity>
        </View>
      </WebContentPanel>
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
    <View
      style={[
        styles.summaryCard,
        Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.sm } as object) : null,
      ]}
    >
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
      <CheckoutAddressFields address={address} onChange={updateAddress} />
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
            <Text style={styles.backLink}>← Back to cart</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Shipping</Text>
          <Text style={styles.chargeBanner}>
            {total > 0
              ? 'You will be charged when you place your order.'
              : 'Your credits cover this order — no payment needed.'}
          </Text>

          {isDesktop ? (
            <View style={styles.desktopColumns}>
              <View style={styles.desktopMain}>{shippingForm}</View>
              <View style={styles.desktopSummary}>{summaryCard}</View>
            </View>
          ) : (
            <>
              {summaryCard}
              {shippingForm}
            </>
          )}
        </View>
      </ScrollView>
    </WebContentPanel>
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
    },
    desktopMain: {
      flexGrow: 0,
      flexShrink: 0,
      width: '100%',
      maxWidth: 480,
      minWidth: 0,
    },
    desktopSummary: {
      flex: 1,
      minWidth: 280,
      alignSelf: 'flex-start',
      ...(Platform.OS === 'web'
        ? ({ position: 'sticky' as const, top: DESKTOP_CONTENT_TOP, zIndex: 5 } as object)
        : null),
    },
    summaryCard: {
      backgroundColor: isDesktop ? colors.bgElevated : colors.accentCream,
      borderRadius: 16,
      padding: spacing.lg,
      marginTop: isDesktop ? 0 : spacing.md,
      marginBottom: isDesktop ? 0 : spacing.lg,
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
    authBody: {
      fontSize: typography.lg,
      color: colors.textSecondary,
      lineHeight: typography.lg * 1.4,
      marginBottom: spacing.xl,
      ...typeface('regular'),
    },
    authBtn: { alignSelf: 'stretch', minWidth: undefined, marginBottom: spacing.md },
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
      alignSelf: 'stretch',
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
