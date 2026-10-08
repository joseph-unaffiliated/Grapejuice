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
import { useAuthStore } from '../../stores/authStore';
import { createPilotSetupIntent } from '../../services/checkout/createPilotSetupIntent';
import { commitPilotBox } from '../../services/checkout/commitPilotBox';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { metaEventIds, trackMeta } from '../../services/analytics/metaPixel';
import type { MainStackParamList } from '../../navigation/types';
import { SystemPage, systemPageStyles as page } from '../../components/layout/SystemPage';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { spacing, typography, typeface, semanticColors } from '../../constants/theme';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { checkoutUi } from './checkout/checkoutUi';
import { STRIPE_APPEARANCE, STRIPE_FONTS } from './checkout/stripeAppearance';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useCheckoutDraft, clearStoredCheckoutAddress } from './checkout/useCheckoutDraft';
import { editUntilLockNote } from '../../services/hanukkah/dates';
import { CheckoutOrderSummary } from './checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from './checkout/CheckoutAddressFields';
import { CheckoutAuthGate } from './checkout/CheckoutAuthGate';
import { CheckoutSmsOptIn } from './checkout/CheckoutSmsOptIn';
import { CheckoutCongratsOverlay } from './checkout/CheckoutCongratsOverlay';
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

/** Filled gold button, same as Account page actions. */
function CheckoutCta({
  label,
  onPress,
  loading,
  disabled,
  note,
  styles,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Small line under the button. */
  note?: string;
  colors: SemanticColors;
  styles: ReturnType<typeof createCheckoutStyles>;
}) {
  return (
    <>
      <GrapejuiceButton
        label={label}
        variant="filled"
        onPress={onPress}
        loading={loading}
        disabled={disabled}
        style={[checkoutUi.button, styles.ctaSpacing]}
        textStyle={checkoutUi.buttonText}
      />
      {note ? <Text style={styles.ctaNote}>{note}</Text> : null}
    </>
  );
}

function SetupCardStep({
  onSaved,
  colors,
  styles,
  replacing,
  note,
}: {
  onSaved: () => void;
  colors: SemanticColors;
  styles: ReturnType<typeof createCheckoutStyles>;
  replacing?: boolean;
  note?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!stripe || !elements) return;
    setSaving(true);
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
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
      if (setupIntent?.id) {
        trackMeta('AddPaymentInfo', undefined, metaEventIds.addPaymentInfo(setupIntent.id));
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={checkoutUi.sectionHeading}>Payment Method</Text>
      <View style={styles.paymentElementWrap}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </View>
      <CheckoutCta
        label="Continue"
        onPress={() => void handleSave()}
        loading={saving}
        disabled={saving}
        note={note}
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
  const { colors } = useThemeMode();
  const styles = useMemo(() => createCheckoutStyles(), []);
  const {
    lineItems,
    catalog,
    address,
    updateAddress,
    loading,
    locked,
    lockAt,
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
  const [showCongrats, setShowCongrats] = useState(false);
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
  /** Set once the box commits here — the congrats overlay owns the exit to My Box. */
  const [committedHere, setCommittedHere] = useState(false);

  useEffect(() => {
    if (ordersLoading || !openOrder || committedHere) return;
    navigation.replace('MyBox');
  }, [ordersLoading, openOrder, navigation, committedHere]);

  const handleCommit = useCallback(async () => {
    if (!user || !household?.id) return;
    if (locked) {
      notifyCheckout('Box locked', 'The customization window has closed. Contact support for changes.');
      return;
    }
    if (!ensureAddressValid()) return;

    setCommitting(true);
    setCommittedHere(true);
    try {
      const { orderId, totalCents } = await commitPilotBox(household.id, normalizedAddress(), {
        contactPhone: contactPhone.trim() || undefined,
        smsOptIn: smsOptIn && contactPhone.trim().length > 0,
        skipShipStation,
      });
      trackMeta(
        'Purchase',
        {
          value: totalCents / 100,
          currency: 'USD',
          order_id: orderId,
          content_name: 'Hanukkah box',
          content_type: 'product',
          num_items: lineItems.length,
        },
        metaEventIds.purchase(orderId)
      );
      clearStoredCheckoutAddress();
      writeShippingConfirmed(false);
      setShowCongrats(true);
    } catch (e) {
      setCommittedHere(false);
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
    lineItems.length,
  ]);

  const initiateCheckoutTracked = useRef(false);
  useEffect(() => {
    if (initiateCheckoutTracked.current || loading || !lineItems.length || openOrder) return;
    initiateCheckoutTracked.current = true;
    trackMeta('InitiateCheckout', {
      value: total / 100,
      currency: 'USD',
      content_name: 'Hanukkah box',
      content_type: 'product',
      num_items: lineItems.length,
    });
  }, [loading, lineItems.length, openOrder, total]);

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
    if (shippingConfirmed && (cardOnFile || awaitingCardOnFile) && !validateAddress().ok) {
      // Post-payment commit step — reopen shipping when that actually changes the view.
      setShippingConfirmed(false);
      return;
    }
    setShippingConfirmed(false);
    // Checkout is the stack root after a reload or direct link, so goBack would no-op.
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MyBox');
  };

  const handleCommitRef = useRef(handleCommit);
  handleCommitRef.current = handleCommit;

  /** Card saved → wait for the webhook to record it, then commit without another click. */
  const waitForCardThenCommit = async () => {
    const householdId = household?.id;
    if (!householdId) {
      await refreshSession({ silent: true });
      return;
    }
    // Silent only — non-silent refresh flips RootNavigator into boot and remounts
    // Main onto /store (Checkout has no history path historically).
    let saved = false;
    for (let i = 0; i < 20 && !saved; i += 1) {
      await refreshSession({ silent: true });
      const hh = await householdsService.get(householdId);
      saved = savedCardReplaced(hh, cardBeforeSetupRef.current);
      if (!saved) await new Promise((r) => setTimeout(r, 400));
    }
    setAwaitingCardOnFile(false);
    if (saved) await handleCommitRef.current();
  };

  const onCardSaved = async () => {
    // Persist before URL/history changes so a remount still sees commit-only.
    setShippingConfirmed(true);
    setAwaitingCardOnFile(true);
    // Drop the payment history step without going "back" to shipping UX.
    replaceBrowserPath(CHECKOUT_PATH);
    setupSecretRef.current = null;
    setSetupClientSecret(null);
    await waitForCardThenCommit();
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
    void waitForCardThenCommit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id, refreshSession]);

  const orderSummary = (
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
    />
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
      options={{ clientSecret: setupClientSecret, appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS }}
    >
      <SetupCardStep
        colors={colors}
        styles={styles}
        replacing={cardOnFile}
        note={locked ? undefined : editUntilLockNote(lockAt)}
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
          <Text style={checkoutUi.sectionHeading}>Payment Method</Text>
          <Text style={checkoutUi.hint}>Card saved.</Text>
          <TouchableOpacity
            onPress={() => void startSetup()}
            disabled={preparing || locked}
            accessibilityRole="button"
            accessibilityLabel="Change card"
            style={styles.changeCard}
          >
            <Text style={page.link}>Change card</Text>
          </TouchableOpacity>
          {addressFormError ? <Text style={checkoutUi.fieldError}>{addressFormError}</Text> : null}
        </>
      )}
      <CheckoutCta
        label="Continue"
        onPress={() => void handleCommit()}
        loading={committing}
        disabled={committing || locked || awaitingCardOnFile}
        colors={colors}
        styles={styles}
      />
    </>
  ) : shippingThenCommit ? (
    <>
      <Text style={checkoutUi.sectionHeading}>Payment Method</Text>
      <Text style={checkoutUi.hint}>Card on file. Add your shipping address to finish.</Text>
      <TouchableOpacity
        onPress={() => void startSetup()}
        disabled={preparing || locked}
        accessibilityRole="button"
        accessibilityLabel="Change card"
        style={styles.changeCard}
      >
        <Text style={page.link}>Change card</Text>
      </TouchableOpacity>
      <View style={checkoutUi.divider} />
      <CheckoutAddressFields
        address={address}
        onChange={onAddressChange}
        fieldErrors={addressFieldErrors}
      />
      {addressFormError ? <Text style={checkoutUi.fieldError}>{addressFormError}</Text> : null}
      <View style={checkoutUi.divider} />
      <CheckoutSmsOptIn
        phone={contactPhone}
        smsOptIn={smsOptIn}
        onPhoneChange={setContactPhone}
        onSmsOptInChange={setSmsOptIn}
      />
      <CheckoutCta
        label="Continue"
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
      {addressFormError ? <Text style={checkoutUi.fieldError}>{addressFormError}</Text> : null}
      <View style={checkoutUi.divider} />
      <CheckoutSmsOptIn
        phone={contactPhone}
        smsOptIn={smsOptIn}
        onPhoneChange={setContactPhone}
        onSmsOptInChange={setSmsOptIn}
      />
      <CheckoutCta
        label="Continue"
        onPress={() => void startSetup()}
        loading={preparing}
        disabled={preparing || locked}
        note={locked ? undefined : editUntilLockNote(lockAt)}
        colors={colors}
        styles={styles}
      />
    </>
  );

  const onPaymentStep = !!setupClientSecret && !cardReady;

  if (showCongrats) {
    return <CheckoutCongratsOverlay lockAt={lockAt} onDone={() => navigation.replace('MyBox')} />;
  }

  if (!isAuthenticated) {
    return <CheckoutAuthGate />;
  }

  if (loading || ordersLoading) {
    return (
      <SystemPage narrow loading onBack={onBack} />
    );
  }

  if (!lineItems.length) {
    return (
      <SystemPage narrow onBack={onBack}>
        <Text style={checkoutUi.title}>Shipping</Text>
        <Text style={checkoutUi.lead}>
          Your box is empty. Finish onboarding or add items in My Box.
        </Text>
      </SystemPage>
    );
  }

  return (
    <SystemPage narrow onBack={onBack}>
      <Text style={checkoutUi.title}>
        {onPaymentStep || commitOnly ? 'Payment' : 'Shipping'}
      </Text>
      <Text style={checkoutUi.lead}>
        You won&apos;t be charged until your box ships.
        {!cardOnFile && !commitOnly
          ? ' Your box will not ship until you add payment information and a shipping address.'
          : null}
      </Text>
      {locked ? (
        <Text style={[page.errorText, styles.centeredText]}>
          Box customization is locked. Checkout is unavailable.
        </Text>
      ) : null}
      <View style={checkoutUi.divider} />
      {orderSummary}
      <View style={checkoutUi.divider} />
      {checkoutForm}
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
    paymentElementWrap: { minHeight: 120, marginTop: spacing.xs },
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
    changeCard: { alignSelf: 'flex-start', marginTop: spacing.xs },
    centeredText: { textAlign: 'center' },
    ctaSpacing: { marginTop: spacing.xl },
    ctaNote: {
      ...typeface('regular'),
      fontSize: 12,
      lineHeight: 17,
      color: semanticColors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
}
