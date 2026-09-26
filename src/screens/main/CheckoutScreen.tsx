import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { createPilotSetupIntent } from '../../services/checkout/createPilotSetupIntent';
import { commitPilotBox } from '../../services/checkout/commitPilotBox';
import { householdsService } from '../../services/firestore/households';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../constants/theme';
import { ButtonLoadingLabel } from '../../components/brand/ButtonLoadingLabel';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { SystemPage, systemPageStyles as page } from '../../components/layout/SystemPage';
import { useCheckoutDraft } from './checkout/useCheckoutDraft';
import { CheckoutOrderSummary } from './checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from './checkout/CheckoutAddressFields';
import { CheckoutAuthGate } from './checkout/CheckoutAuthGate';
import { CheckoutSmsOptIn } from './checkout/CheckoutSmsOptIn';
import type { ShippingAddressFieldErrors } from '../../utils/formValidation';
import type { ShippingAddress } from '../../types/pilot';

function savedCardReplaced(
  hh: { cardOnFileAt?: string; stripeDefaultPaymentMethodId?: string } | null | undefined,
  before: { at?: string; pm?: string },
): boolean {
  if (!hh?.cardOnFileAt) return false;
  if (before.pm && hh.stripeDefaultPaymentMethodId && hh.stripeDefaultPaymentMethodId !== before.pm) {
    return true;
  }
  if (before.at && hh.cardOnFileAt !== before.at) return true;
  return false;
}

export function CheckoutScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <CheckoutScreenBody />
    </StorefrontChrome>
  );
}

function CheckoutScreenBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, refresh: refreshSession } = useSession();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const styles = useMemo(() => createStyles(), []);
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
  const [submitting, setSubmitting] = useState(false);
  const [changingCard, setChangingCard] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [addressFieldErrors, setAddressFieldErrors] = useState<ShippingAddressFieldErrors>({});
  const [addressFormError, setAddressFormError] = useState<string | null>(null);

  const onAddressChange = (patch: Partial<ShippingAddress>) => {
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
  const cardOnFile = !!household?.cardOnFileAt;
  const skipShipStation = useMockFlowStore((s) => s.active);

  const handleSaveCard = useCallback(async (): Promise<boolean> => {
    if (!household?.id) return false;
    if (!stripeKey) {
      Alert.alert('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return false;
    }

    const { clientSecret } = await createPilotSetupIntent(household.id);
    if (!clientSecret) {
      Alert.alert('Error', 'No setup secret returned. Deploy createPilotSetupIntent Cloud Function.');
      return false;
    }

    const { error: initError } = await initPaymentSheet({
      setupIntentClientSecret: clientSecret,
      merchantDisplayName: 'Grapejuice',
    });
    if (initError) {
      Alert.alert('Payment setup failed', initError.message ?? 'Could not initialize payment.');
      return false;
    }

    const { error: presentError } = await presentPaymentSheet();
    if (presentError) {
      if (presentError.code !== 'Canceled') {
        Alert.alert('Payment failed', presentError.message ?? 'Could not save your card.');
      }
      return false;
    }

    await refreshSession();
    return true;
  }, [household?.id, stripeKey, initPaymentSheet, presentPaymentSheet, refreshSession]);

  const onChangeCard = async () => {
    if (!household?.id) return;
    const before = {
      at: household.cardOnFileAt,
      pm: household.stripeDefaultPaymentMethodId,
    };
    setChangingCard(true);
    try {
      const ok = await handleSaveCard();
      if (!ok) return;
      for (let i = 0; i < 10; i += 1) {
        const hh = await householdsService.get(household.id);
        if (savedCardReplaced(hh, before)) {
          await refreshSession();
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      setChangingCard(false);
    }
  };

  const handleCommit = async () => {
    if (!user || !household?.id) return;
    if (locked) {
      Alert.alert('Box locked', 'The customization window has closed. Contact support for changes.');
      return;
    }
    if (!ensureAddressValid()) return;

    setSubmitting(true);
    try {
      let ready = cardOnFile;
      if (!ready) {
        ready = await handleSaveCard();
        if (!ready) return;
      }

      const { orderId } = await commitPilotBox(household.id, normalizedAddress(), {
        contactPhone: contactPhone.trim() || undefined,
        smsOptIn: smsOptIn && contactPhone.trim().length > 0,
        skipShipStation,
      });
      navigation.replace('OrderConfirmation', { orderId });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Checkout failed.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return <CheckoutAuthGate />;
  }

  if (loading) {
    return (
      <SystemPage loading onBack={() => navigation.goBack()} />
    );
  }

  if (!lineItems.length) {
    return (
      <SystemPage onBack={() => navigation.goBack()}>
        <Text style={page.title}>Shipping</Text>
        <Text style={page.lead}>Your box is empty. Finish onboarding or add items in My Box.</Text>
      </SystemPage>
    );
  }

  return (
    <SystemPage onBack={() => navigation.goBack()}>
      <Text style={page.title}>Shipping</Text>
      <Text style={page.lead}>You won&apos;t be charged until your box ships.</Text>
      {!cardOnFile ? (
        <Text style={page.sectionLead}>
          Your box will not ship until you add payment information and a shipping address.
        </Text>
      ) : (
        <TouchableOpacity
          onPress={() => void onChangeCard()}
          disabled={changingCard || submitting || locked}
          accessibilityRole="button"
          accessibilityLabel="Change card"
        >
          <Text style={page.link}>{changingCard ? 'Updating card…' : 'Change card'}</Text>
        </TouchableOpacity>
      )}
      {locked ? (
        <Text style={page.errorText}>Box customization is locked. Checkout may be unavailable.</Text>
      ) : null}

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

      <TouchableOpacity
        style={[styles.cta, (submitting || locked || changingCard) && styles.ctaDisabled]}
        onPress={() => void handleCommit()}
        disabled={submitting || locked || changingCard}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={cardOnFile ? 'Commit to box' : 'Save and continue to payment'}
      >
        <ButtonLoadingLabel
          label={cardOnFile ? 'Commit to box' : 'Save and continue to payment'}
          loading={submitting}
          loaderColor={semanticColors.textInverse}
          labelStyle={styles.ctaText}
        />
      </TouchableOpacity>
    </SystemPage>
  );
}

function createStyles() {
  return StyleSheet.create({
    summaryCard: {
      borderWidth: 1,
      borderColor: semanticColors.border,
      borderRadius: borderRadius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
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
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: semanticColors.textInverse,
      letterSpacing: -0.2,
    },
    addressFormError: {
      marginTop: spacing.sm,
      fontSize: typography.sm,
      color: semanticColors.error,
      ...typeface('medium'),
    },
  });
}
