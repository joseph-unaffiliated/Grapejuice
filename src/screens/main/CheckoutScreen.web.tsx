import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import type { MainStackParamList } from '../../navigation/types';
import { SystemPage, systemPageStyles as page } from '../../components/layout/SystemPage';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { ButtonLoadingLabel } from '../../components/brand/ButtonLoadingLabel';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../constants/theme';
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
import type { ShippingAddressFieldErrors } from '../../utils/formValidation';

const SHIPPING_CONFIRMED_KEY = 'gj.checkout.shippingConfirmed';

function savedCardReplaced(
  hh: { cardOnFileAt?: string; stripeDefaultPaymentMethodId?: string } | null | undefined,
  before: { at?: string; pm?: string } | null
): boolean {
  if (!hh?.cardOnFileAt) return false;
  if (!before?.at && !before?.pm) return true;
  if (before.pm && hh.stripeDefaultPaymentMethodId && hh.stripeDefaultPaymentMethodId !== before.pm) {
    return true;
  }
  if (before.at && hh.cardOnFileAt !== before.at) return true;
  return false;
}

function notifyCheckout(title: string, body: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${body}`);
    return;
  }
  Alert.alert(title, body);
}

function formatSetupIntentError(e: unknown): string {
  const code =
    e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code ?? '') : '';
  const message = e instanceof Error ? e.message : 'Could not start payment setup.';
  if (
    code.includes('failed-precondition') ||
    /Stripe is not configured|STRIPE_SECRET_KEY/i.test(message)
  ) {
    return 'Stripe is not configured on the server. Add STRIPE_SECRET_KEY to functions/.env.grapejuice-pilot and redeploy functions.';
  }
  return message;
}

function readShippingConfirmed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(SHIPPING_CONFIRMED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeShippingConfirmed(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(SHIPPING_CONFIRMED_KEY, '1');
    else window.sessionStorage.removeItem(SHIPPING_CONFIRMED_KEY);
  } catch {
    // ignore
  }
}

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
      <ButtonLoadingLabel
        label={label}
        loading={loading}
        loaderColor={semanticColors.textInverse}
        labelStyle={styles.ctaText}
      />
    </TouchableOpacity>
  );
}

function SetupCardStep({
  onSaved,
  colors,
  styles,
  replacing,
}: {
  onSaved: () => void;
  colors: SemanticColors;
  styles: ReturnType<typeof createCheckoutStyles>;
  replacing?: boolean;
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
        notifyCheckout('Could not save card', error.message ?? 'Please try again.');
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
        label={replacing ? 'Save new card' : 'Save card'}
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
  const { isDesktop } = useWebLayout();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createCheckoutStyles(), []);
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
  } = useCheckoutDraft(household?.id);

  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  /** Keeps the SetupIntent secret across shipping ↔ payment browser history. */
  const setupSecretRef = useRef<string | null>(null);
  const cardBeforeSetupRef = useRef<{ at?: string; pm?: string } | null>(null);
  /**
   * True after the user saves a card, before the webhook has set cardOnFileAt.
   * Prevents flashing back to the "continue to payment" shipping step.
   */
  const [awaitingCardOnFile, setAwaitingCardOnFile] = useState(false);
  /** Set when shipping is confirmed and we move on to payment (or skip payment). */
  const [shippingConfirmed, setShippingConfirmedState] = useState(() => readShippingConfirmed());
  const setShippingConfirmed = (value: boolean) => {
    writeShippingConfirmed(value);
    setShippingConfirmedState(value);
  };
  const [preparing, setPreparing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [addressFieldErrors, setAddressFieldErrors] = useState<ShippingAddressFieldErrors>({});
  const [addressFormError, setAddressFormError] = useState<string | null>(null);

  const onAddressChange = (patch: Partial<import('../../types/pilot').ShippingAddress>) => {
    setAddressFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
        if (key in next) delete next[key as keyof ShippingAddressFieldErrors];
      }
      return next;
    });
    if (Object.keys(patch).length) setAddressFormError(null);
    updateAddress(patch);
  };

  const ensureAddressValid = (): boolean => {
    const result = validateAddress();
    if (result.ok) {
      setAddressFieldErrors({});
      setAddressFormError(null);
      return true;
    }
    setAddressFieldErrors(result.fields);
    setAddressFormError(result.message);
    return false;
  };

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
      notifyCheckout('Box locked', 'The customization window has closed. Contact support for changes.');
      return;
    }
    if (!ensureAddressValid()) return;

    setCommitting(true);
    try {
      const { orderId } = await commitPilotBox(household.id, normalizedAddress(), {
        contactPhone: contactPhone.trim() || undefined,
        smsOptIn: smsOptIn && contactPhone.trim().length > 0,
        skipShipStation,
      });
      clearStoredCheckoutAddress();
      writeShippingConfirmed(false);
      navigation.replace('OrderConfirmation', { orderId });
    } catch (e) {
      notifyCheckout('Error', e instanceof Error ? e.message : 'Could not commit your box.');
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
    contactPhone,
    smsOptIn,
    skipShipStation,
  ]);

  const startSetup = async () => {
    if (!household?.id) return;
    if (!stripeKey) {
      notifyCheckout('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return;
    }
    if (!ensureAddressValid()) return;
    cardBeforeSetupRef.current = {
      at: household.cardOnFileAt,
      pm: household.stripeDefaultPaymentMethodId,
    };
    const keepShipping = shippingConfirmed;
    setShippingConfirmed(true);
    setPreparing(true);
    try {
      const result = await createPilotSetupIntent(household.id);
      if (!result.clientSecret) {
        notifyCheckout('Error', 'No setup secret returned.');
        if (!keepShipping) setShippingConfirmed(false);
        return;
      }
      setupSecretRef.current = result.clientSecret;
      setSetupClientSecret(result.clientSecret);
      // Own history entry so Back returns to shipping, not My Box.
      pushBrowserPath(checkoutPath('payment'));
    } catch (e) {
      if (!keepShipping) setShippingConfirmed(false);
      notifyCheckout('Could not continue to payment', formatSetupIntentError(e));
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
      // Browser Back from payment → shipping form again.
      setShippingConfirmed(false);
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
      setShippingConfirmed(false);
      return;
    }
    if (shippingConfirmed && !setupClientSecret) {
      // Post-payment commit step — let them revisit shipping if needed.
      setShippingConfirmed(false);
      return;
    }
    navigation.goBack();
  };

  const onCardSaved = async () => {
    // Persist before URL/history changes so a remount still sees commit-only.
    setShippingConfirmed(true);
    setAwaitingCardOnFile(true);
    // Drop the payment history step without going "back" to shipping UX.
    replaceBrowserPath(CHECKOUT_PATH);
    setupSecretRef.current = null;
    setSetupClientSecret(null);

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
      if (savedCardReplaced(hh, cardBeforeSetupRef.current)) {
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
    setShippingConfirmed(true);
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
        if (savedCardReplaced(hh, cardBeforeSetupRef.current)) {
          setAwaitingCardOnFile(false);
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
  }, [household?.id, refreshSession]);

  const summaryCard = (
    <View style={styles.summaryCard}>
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
        compact
      />
    </View>
  );

  const cardReady = cardOnFile || awaitingCardOnFile;
  /** Address already collected this session — never re-open the form after card save. */
  const addressAlreadyCaptured = validateAddress().ok;
  /** After shipping → payment, don't re-ask for address; just commit. */
  const commitOnly = cardReady && (shippingConfirmed || addressAlreadyCaptured);
  /** Card already on file and no address yet — collect shipping once. */
  const shippingThenCommit = cardReady && !commitOnly;

  const checkoutForm = setupClientSecret && stripePromise ? (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret: setupClientSecret, appearance: { theme: 'stripe' } }}
    >
      <SetupCardStep
        colors={colors}
        styles={styles}
        replacing={cardOnFile}
        onSaved={() => void onCardSaved()}
      />
    </Elements>
  ) : commitOnly ? (
    <>
      {awaitingCardOnFile ? (
        <View style={styles.savingCardRow}>
          <BrandLoadingMark large={false} color={colors.brand} />
          <Text style={styles.savingCardCopy}>Saving your card…</Text>
        </View>
      ) : (
        <>
          <Text style={styles.cardSavedCopy}>Card saved. Commit when you&apos;re ready.</Text>
          <TouchableOpacity
            onPress={() => void startSetup()}
            disabled={preparing || locked}
            accessibilityRole="button"
            accessibilityLabel="Change card"
          >
            <Text style={page.link}>Change card</Text>
          </TouchableOpacity>
          {addressFormError ? <Text style={styles.addressFormError}>{addressFormError}</Text> : null}
        </>
      )}
      <CheckoutCta
        label="Commit to box"
        onPress={() => void handleCommit()}
        loading={committing}
        disabled={committing || locked || awaitingCardOnFile}
        colors={colors}
        styles={styles}
      />
    </>
  ) : shippingThenCommit ? (
    <>
      <Text style={styles.cardSavedCopy}>Card on file — add shipping and commit.</Text>
      <TouchableOpacity
        onPress={() => void startSetup()}
        disabled={preparing || locked}
        accessibilityRole="button"
        accessibilityLabel="Change card"
      >
        <Text style={page.link}>Change card</Text>
      </TouchableOpacity>
      <CheckoutAddressFields
        address={address}
        onChange={onAddressChange}
        fieldErrors={addressFieldErrors}
      />
      {addressFormError ? <Text style={styles.addressFormError}>{addressFormError}</Text> : null}
      <CheckoutSmsOptIn
        phone={contactPhone}
        smsOptIn={smsOptIn}
        onPhoneChange={setContactPhone}
        onSmsOptInChange={setSmsOptIn}
      />
      <CheckoutCta
        label="Commit to box"
        onPress={() => {
          if (!ensureAddressValid()) return;
          setShippingConfirmed(true);
          void handleCommit();
        }}
        loading={committing}
        disabled={committing || locked}
        colors={colors}
        styles={styles}
      />
    </>
  ) : (
    <>
      <CheckoutAddressFields
        address={address}
        onChange={onAddressChange}
        fieldErrors={addressFieldErrors}
      />
      {addressFormError ? <Text style={styles.addressFormError}>{addressFormError}</Text> : null}
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
      <SystemPage wide loading onBack={onBack} />
    );
  }

  if (!lineItems.length) {
    return (
      <SystemPage wide onBack={onBack}>
        <Text style={page.title}>Shipping</Text>
        <Text style={page.lead}>Your box is empty. Finish onboarding or add items in My Box.</Text>
      </SystemPage>
    );
  }

  return (
    <SystemPage wide onBack={onBack}>
      <Text style={page.title}>
        {onPaymentStep ? 'Payment' : commitOnly ? 'Commit' : 'Shipping'}
      </Text>
      <Text style={page.lead}>You won&apos;t be charged until your box ships.</Text>
      {!cardOnFile && !commitOnly ? (
        <Text style={page.sectionLead}>
          Your box will not ship until you add payment information and a shipping address.
        </Text>
      ) : null}
      {locked ? (
        <Text style={page.errorText}>Box customization is locked. Checkout is unavailable.</Text>
      ) : null}
      {isDesktop ? (
        <View style={styles.columns}>
          <View style={styles.formColumn}>{checkoutForm}</View>
          <View style={styles.summaryColumn}>{summaryCard}</View>
        </View>
      ) : (
        <>
          {checkoutForm}
          {summaryCard}
        </>
      )}
    </SystemPage>
  );
}

export function CheckoutScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <CheckoutScreenBody />
    </StorefrontChrome>
  );
}

function createCheckoutStyles() {
  return StyleSheet.create({
    summaryCard: {
      borderWidth: 1,
      borderColor: semanticColors.border,
      borderRadius: borderRadius.md,
      padding: spacing.lg,
    },
    columns: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xl,
    },
    formColumn: {
      flex: 1,
      minWidth: 0,
    },
    summaryColumn: {
      width: 400,
      flexShrink: 0,
      alignSelf: 'flex-start',
      ...(Platform.OS === 'web'
        ? ({ position: 'sticky' as const, top: spacing.lg } as object)
        : null),
    },
    sectionTitle: {
      ...typeface('bold'),
      fontSize: typography.xl,
      color: semanticColors.textPrimary,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
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
      ...typeface('regular'),
      fontSize: typography.md,
      color: semanticColors.textSecondary,
    },
    cardSavedCopy: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: semanticColors.textSecondary,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      lineHeight: 22,
    },
    addressFormError: {
      marginTop: spacing.sm,
      fontSize: typography.sm,
      color: semanticColors.error,
      ...typeface('medium'),
    },
    cta: {
      alignSelf: 'stretch',
      width: '100%',
      marginTop: spacing.lg,
      minHeight: 40,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: semanticColors.logoDark,
      alignItems: 'center',
      justifyContent: 'center',
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: semanticColors.textInverse,
      letterSpacing: -0.2,
    },
  });
}
