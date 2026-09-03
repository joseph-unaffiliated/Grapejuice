import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useSession } from '../../hooks/useSession';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useAuthStore } from '../../stores/authStore';
import { createPilotSetupIntent } from '../../services/checkout/createPilotSetupIntent';
import { commitPilotBox } from '../../services/checkout/commitPilotBox';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { EXPEDITED_SHIPPING_CENTS } from '../../services/box/pricing';
import type { MainStackParamList } from '../../navigation/types';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { spacing, typography, borderRadius, typeface, shadowsWeb } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useCheckoutDraft, clearStoredCheckoutAddress } from './checkout/useCheckoutDraft';
import { CheckoutOrderSummary } from './checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from './checkout/CheckoutAddressFields';
import { CheckoutAuthGate } from './checkout/CheckoutAuthGate';
import { CheckoutSmsOptIn } from './checkout/CheckoutSmsOptIn';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { usePilotOrders } from '../../hooks/usePilotOrders';
import { householdsService } from '../../services/firestore/households';
import { CHECKOUT_PATH, checkoutPath, readCheckoutPaymentStepFromWindow } from '../../navigation/checkoutLink';
import { pushBrowserPath, replaceBrowserPath } from '../../navigation/webBrowserHistory';

/** Match My Box desktop top offset under sticky nav. */
const DESKTOP_CONTENT_TOP = 41;

function checkoutReturnUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${CHECKOUT_PATH}`;
}

/** Same dark pill CTA as My Box cart summary. */
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
  styles: ReturnType<typeof createCheckoutStyles>;
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

function SetupCardStep({
  onSaved,
  colors,
  styles,
}: {
  onSaved: () => void;
  colors: SemanticColors;
  styles: ReturnType<typeof createCheckoutStyles>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!stripe || !elements) return;
    setSaving(true);
    try {
      const { error } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: checkoutReturnUrl(),
        },
        redirect: 'if_required',
      });
      if (error) {
        Alert.alert('Could not save card', error.message ?? 'Please try again.');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.paymentBlock}>
      <Text style={styles.sectionTitle}>Payment method</Text>
      <View style={styles.paymentElementWrap}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </View>
      <CheckoutCta
        label="Save card"
        onPress={() => void handleSave()}
        loading={saving}
        disabled={saving}
        colors={colors}
        styles={styles}
      />
    </View>
  );
}

function CheckoutScreenBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, refresh: refreshSession } = useSession();
  const { isDesktop, widePanelMaxWidth } = useWebLayout();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createCheckoutStyles(colors, isDesktop), [colors, isDesktop]);
  const {
    lineItems,
    catalog,
    address,
    updateAddress,
    loading,
    locked,
    boxPriceCents,
    total,
    validateAddress,
    normalizedAddress,
    subtotal,
    shippingCents,
    taxCents,
    giftCreditApplied,
    platformCreditApplied,
    expeditedAvailable,
    expeditedShipping,
    setExpeditedShipping,
  } = useCheckoutDraft(household?.id);

  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  /** Keeps the SetupIntent secret across shipping ↔ payment browser history. */
  const setupSecretRef = useRef<string | null>(null);
  /**
   * True after the user saves a card, before the webhook has set cardOnFileAt.
   * Prevents flashing back to the "continue to payment" shipping step.
   */
  const [awaitingCardOnFile, setAwaitingCardOnFile] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const stripePromise = useMemo(
    () => (stripeKey ? loadStripe(stripeKey) : null),
    [stripeKey]
  );
  const cardOnFile = !!household?.cardOnFileAt;
  const skipShipStation = useMockFlowStore((s) => s.active);
  const { openOrder, loading: ordersLoading } = usePilotOrders(household?.id);

  useEffect(() => {
    if (ordersLoading || !openOrder) return;
    navigation.replace('OrderConfirmation', { orderId: openOrder.id });
  }, [ordersLoading, openOrder, navigation]);

  const handleCommit = useCallback(async () => {
    if (!user || !household?.id) return;
    if (locked) {
      Alert.alert('Box locked', 'The customization window has closed. Contact support for changes.');
      return;
    }
    if (!validateAddress()) return;

    setCommitting(true);
    try {
      const { orderId } = await commitPilotBox(household.id, normalizedAddress(), {
        expeditedShipping,
        contactPhone: contactPhone.trim() || undefined,
        smsOptIn: smsOptIn && contactPhone.trim().length > 0,
        skipShipStation,
      });
      clearStoredCheckoutAddress();
      navigation.replace('OrderConfirmation', { orderId });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not commit your box.');
    } finally {
      setCommitting(false);
    }
  }, [
    user,
    household?.id,
    locked,
    validateAddress,
    normalizedAddress,
    navigation,
    expeditedShipping,
    contactPhone,
    smsOptIn,
    skipShipStation,
  ]);

  const startSetup = async () => {
    if (!household?.id) return;
    if (!stripeKey) {
      Alert.alert('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return;
    }
    if (!validateAddress()) return;
    setPreparing(true);
    try {
      const result = await createPilotSetupIntent(household.id);
      if (!result.clientSecret) {
        Alert.alert('Error', 'No setup secret returned.');
        return;
      }
      setupSecretRef.current = result.clientSecret;
      setSetupClientSecret(result.clientSecret);
      // Own history entry so Back returns to shipping, not My Box.
      pushBrowserPath(checkoutPath('payment'));
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not start payment setup.');
    } finally {
      setPreparing(false);
    }
  };

  // Browser Back/Forward within /checkout ↔ /checkout?step=payment.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const syncStepFromUrl = () => {
      if (readCheckoutPaymentStepFromWindow()) {
        if (setupSecretRef.current) setSetupClientSecret(setupSecretRef.current);
        return;
      }
      setSetupClientSecret(null);
    };
    window.addEventListener('popstate', syncStepFromUrl);
    return () => window.removeEventListener('popstate', syncStepFromUrl);
  }, []);

  const onBack = () => {
    if (setupClientSecret) {
      if (
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        readCheckoutPaymentStepFromWindow()
      ) {
        window.history.back();
        return;
      }
      setSetupClientSecret(null);
      return;
    }
    navigation.goBack();
  };

  const onCardSaved = async () => {
    // Drop the payment history step without going "back" to shipping UX.
    replaceBrowserPath(CHECKOUT_PATH);
    setupSecretRef.current = null;
    setSetupClientSecret(null);
    setAwaitingCardOnFile(true);

    const householdId = household?.id;
    if (!householdId) {
      await refreshSession({ silent: true });
      return;
    }
    // Silent only — non-silent refresh flips RootNavigator into boot and remounts
    // Main onto /store (Checkout has no history path historically).
    for (let i = 0; i < 10; i += 1) {
      await refreshSession({ silent: true });
      const hh = await householdsService.get(householdId);
      if (hh?.cardOnFileAt) {
        setAwaitingCardOnFile(false);
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  // Stripe may redirect back to /checkout after 3DS — treat that as a successful save.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const redirectStatus = params.get('redirect_status');
    const setupIntent = params.get('setup_intent');
    if (!setupIntent || redirectStatus !== 'succeeded') return;
    replaceBrowserPath(CHECKOUT_PATH);
    setAwaitingCardOnFile(true);
    void (async () => {
      const householdId = household?.id;
      if (!householdId) {
        await refreshSession({ silent: true });
        return;
      }
      for (let i = 0; i < 10; i += 1) {
        await refreshSession({ silent: true });
        const hh = await householdsService.get(householdId);
        if (hh?.cardOnFileAt) {
          setAwaitingCardOnFile(false);
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
  }, [household?.id, refreshSession]);

  const expeditedToggle =
    expeditedAvailable ? (
      <TouchableOpacity
        style={styles.expeditedRow}
        onPress={() => setExpeditedShipping((v) => !v)}
        activeOpacity={0.85}
      >
        <View style={[styles.checkbox, expeditedShipping && styles.checkboxOn]} />
        <View style={styles.expeditedCopy}>
          <Text style={styles.expeditedTitle}>
            Expedited shipping (+{formatDollars(EXPEDITED_SHIPPING_CENTS)})
          </Text>
          <Text style={styles.expeditedBody}>Arrives sooner — for last-minute planners.</Text>
        </View>
      </TouchableOpacity>
    ) : null;

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
        boxPriceCents={boxPriceCents}
        catalog={catalog}
        giftCreditApplied={giftCreditApplied}
        platformCreditApplied={platformCreditApplied}
        expeditedShipping={expeditedShipping}
        compact
      />
      {expeditedToggle}
    </View>
  );

  const cardReady = cardOnFile || awaitingCardOnFile;

  const checkoutForm = cardReady ? (
    <>
      {awaitingCardOnFile && !cardOnFile ? (
        <View style={styles.savingCardRow}>
          <BrandLoadingMark large={false} color={colors.brand} />
          <Text style={styles.savingCardCopy}>Saving your card…</Text>
        </View>
      ) : (
        <Text style={styles.cardSavedCopy}>Card on file — confirm shipping and commit.</Text>
      )}
      <CheckoutAddressFields address={address} onChange={updateAddress} />
      <CheckoutSmsOptIn
        phone={contactPhone}
        smsOptIn={smsOptIn}
        onPhoneChange={setContactPhone}
        onSmsOptInChange={setSmsOptIn}
      />
      <CheckoutCta
        label="Commit to box"
        onPress={() => void handleCommit()}
        loading={committing}
        disabled={committing || locked || (awaitingCardOnFile && !cardOnFile)}
        colors={colors}
        styles={styles}
      />
    </>
  ) : setupClientSecret && stripePromise ? (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret: setupClientSecret, appearance: { theme: 'stripe' } }}
    >
      <SetupCardStep
        colors={colors}
        styles={styles}
        onSaved={() => void onCardSaved()}
      />
    </Elements>
  ) : (
    <>
      <CheckoutAddressFields address={address} onChange={updateAddress} />
      <CheckoutSmsOptIn
        phone={contactPhone}
        smsOptIn={smsOptIn}
        onPhoneChange={setContactPhone}
        onSmsOptInChange={setSmsOptIn}
      />
      <CheckoutCta
        label="Save and continue to payment"
        onPress={() => void startSetup()}
        loading={preparing}
        disabled={preparing || locked}
        colors={colors}
        styles={styles}
      />
    </>
  );

  const onPaymentStep = !!setupClientSecret && !cardReady;

  if (!isAuthenticated) {
    return <CheckoutAuthGate />;
  }

  if (loading || ordersLoading) {
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
          <Text style={styles.emptyText}>
            Your box is empty. Finish onboarding or add items in My Box.
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backLink}>Back to My Box</Text>
          </TouchableOpacity>
        </View>
      </WebContentPanel>
    );
  }

  const pageHeader = (
    <>
      <TouchableOpacity onPress={onBack} style={styles.backRow}>
        <Text style={styles.backLink}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>
        {onPaymentStep ? 'Payment' : cardReady ? 'Review & commit' : 'Shipping'}
      </Text>
      <Text style={styles.chargeBanner}>You won&apos;t be charged until your box ships.</Text>
      {!cardOnFile ? (
        <Text style={styles.pendingCopy}>
          Your box will not ship until you add payment information and a shipping address.
        </Text>
      ) : null}
      {locked ? (
        <Text style={styles.lockBanner}>Box customization is locked. Checkout is unavailable.</Text>
      ) : null}
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
          {pageHeader}

          {isDesktop ? (
            <View style={styles.desktopColumns}>
              <View style={styles.desktopMain}>{checkoutForm}</View>
              <View style={styles.desktopSummary}>{summaryCard}</View>
            </View>
          ) : (
            <>
              {summaryCard}
              {checkoutForm}
            </>
          )}
        </View>
      </ScrollView>
    </WebContentPanel>
  );
}

export function CheckoutScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <CheckoutScreenBody />
    </StorefrontChrome>
  );
}

function createCheckoutStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: {
      flex: 1,
      width: '100%',
      minHeight: 0,
      backgroundColor: colors.bgPrimary,
    },
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    desktopScrollContent: {
      flexGrow: 1,
      paddingBottom: 120,
    },
    mobileScrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: 120,
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
    pendingCopy: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      marginBottom: spacing.md,
      lineHeight: typography.sm * 1.45,
      ...typeface('regular'),
    },
    lockBanner: {
      backgroundColor: colors.brandLight,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
      fontSize: typography.md,
      ...typeface('regular'),
    },
    sectionTitle: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      letterSpacing: -0.32,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      ...typeface('medium'),
    },
    paymentBlock: { marginTop: spacing.md },
    paymentElementWrap: { minHeight: 120, marginBottom: spacing.md },
    savingCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    savingCardCopy: {
      fontSize: typography.md,
      color: colors.textSecondary,
      ...typeface('regular'),
    },
    cardSavedCopy: {
      fontSize: typography.md,
      color: colors.textSecondary,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      ...typeface('medium'),
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
    expeditedRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginTop: spacing.md,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      backgroundColor: colors.bgPrimary,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: colors.border,
      marginTop: 2,
    },
    checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    expeditedCopy: { flex: 1, gap: 4 },
    expeditedTitle: {
      fontSize: typography.md,
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    expeditedBody: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      lineHeight: typography.sm * 1.35,
      ...typeface('regular'),
    },
  });
}
