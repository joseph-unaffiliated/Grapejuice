import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
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
import { formatDollars } from '../../services/box/buildDefaultBox';
import { EXPEDITED_SHIPPING_CENTS } from '../../services/box/pricing';
import type { MainStackParamList } from '../../navigation/types';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { useCheckoutDraft } from './checkout/useCheckoutDraft';
import { CheckoutOrderSummary } from './checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from './checkout/CheckoutAddressFields';
import { CheckoutAuthGate } from './checkout/CheckoutAuthGate';
import { CheckoutSmsOptIn } from './checkout/CheckoutSmsOptIn';

function SetupCardStep({ onSaved }: { onSaved: () => void }) {
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
          return_url: typeof window !== 'undefined' ? window.location.href : undefined,
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
      <TouchableOpacity
        style={[styles.payBtn, saving && styles.payBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={semanticColors.textInverse} />
        ) : (
          <Text style={styles.payBtnText}>Save card</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export function CheckoutScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, refresh: refreshSession } = useSession();
  const { isDesktop } = useWebLayout();
  const {
    lineItems,
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
      });
      navigation.replace('OrderConfirmation', { orderId });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not commit your box.');
    } finally {
      setCommitting(false);
    }
  }, [user, household?.id, locked, validateAddress, normalizedAddress, navigation, expeditedShipping, contactPhone, smsOptIn]);

  const startSetup = async () => {
    if (!household?.id) return;
    if (!stripeKey) {
      Alert.alert('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return;
    }
    setPreparing(true);
    try {
      const result = await createPilotSetupIntent(household.id);
      if (!result.clientSecret) {
        Alert.alert('Error', 'No setup secret returned.');
        return;
      }
      setSetupClientSecret(result.clientSecret);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not start payment setup.');
    } finally {
      setPreparing(false);
    }
  };

  const onCardSaved = async () => {
    setSetupClientSecret(null);
    await refreshSession();
  };

  const checkoutForm = cardOnFile ? (
    <>
      <CheckoutAddressFields address={address} onChange={updateAddress} />
      <CheckoutSmsOptIn
        phone={contactPhone}
        smsOptIn={smsOptIn}
        onPhoneChange={setContactPhone}
        onSmsOptInChange={setSmsOptIn}
      />
      <TouchableOpacity
        style={[styles.payBtn, (committing || locked) && styles.payBtnDisabled]}
        onPress={handleCommit}
        disabled={committing || locked}
      >
        {committing ? (
          <ActivityIndicator color={semanticColors.textInverse} />
        ) : (
          <Text style={styles.payBtnText}>Commit to box</Text>
        )}
      </TouchableOpacity>
    </>
  ) : setupClientSecret && stripePromise ? (
    <Elements stripe={stripePromise} options={{ clientSecret: setupClientSecret, appearance: { theme: 'stripe' } }}>
      <SetupCardStep
        onSaved={async () => {
          await onCardSaved();
          await handleCommit();
        }}
      />
      <CheckoutAddressFields address={address} onChange={updateAddress} />
      <CheckoutSmsOptIn
        phone={contactPhone}
        smsOptIn={smsOptIn}
        onPhoneChange={setContactPhone}
        onSmsOptInChange={setSmsOptIn}
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
      <TouchableOpacity
        style={[styles.payBtn, (preparing || locked) && styles.payBtnDisabled]}
        onPress={startSetup}
        disabled={preparing || locked}
      >
        {preparing ? (
          <ActivityIndicator color={semanticColors.textInverse} />
        ) : (
          <Text style={styles.payBtnText}>Save card & commit to box</Text>
        )}
      </TouchableOpacity>
    </>
  );

  if (!isAuthenticated) {
    return <CheckoutAuthGate />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={semanticColors.brand} />
      </View>
    );
  }

  if (!lineItems.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Your box is empty. Finish onboarding or add items in My Box.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Back to My Box</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <WebContentPanel wide>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Payment & shipping</Text>
        <Text style={styles.chargeBanner}>You won&apos;t be charged until your box ships.</Text>
        {!cardOnFile ? (
          <Text style={styles.pendingCopy}>
            Your box will not ship until you add payment information and a shipping address.
          </Text>
        ) : null}
        {locked ? (
          <Text style={styles.lockBanner}>Box customization is locked. Checkout is unavailable.</Text>
        ) : null}

        {isDesktop ? (
          <View style={styles.desktopColumns}>
            <View style={styles.desktopLeft}>
              <CheckoutOrderSummary
                lineItems={lineItems}
                total={total}
                subtotal={subtotal}
                shippingCents={shippingCents}
                taxCents={taxCents}
                boxPriceCents={boxPriceCents}
                giftCreditApplied={giftCreditApplied}
                platformCreditApplied={platformCreditApplied}
                expeditedShipping={expeditedShipping}
              />
              {expeditedAvailable ? (
                <TouchableOpacity
                  style={styles.expeditedRow}
                  onPress={() => setExpeditedShipping((v) => !v)}
                >
                  <Text style={styles.expeditedTitle}>
                    Expedited shipping (+{formatDollars(EXPEDITED_SHIPPING_CENTS)})
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.desktopRight}>{checkoutForm}</View>
          </View>
        ) : (
          <>
            <CheckoutOrderSummary
              lineItems={lineItems}
              total={total}
              subtotal={subtotal}
              shippingCents={shippingCents}
              taxCents={taxCents}
              boxPriceCents={boxPriceCents}
              giftCreditApplied={giftCreditApplied}
              platformCreditApplied={platformCreditApplied}
              expeditedShipping={expeditedShipping}
            />
            {expeditedAvailable ? (
              <TouchableOpacity
                style={styles.expeditedRow}
                onPress={() => setExpeditedShipping((v) => !v)}
              >
                <Text style={styles.expeditedTitle}>
                  Expedited shipping (+{formatDollars(EXPEDITED_SHIPPING_CENTS)})
                </Text>
              </TouchableOpacity>
            ) : null}
            {checkoutForm}
          </>
        )}
      </ScrollView>
    </WebContentPanel>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { paddingBottom: 120 },
  desktopColumns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  desktopLeft: { flex: 1, minWidth: 0 },
  desktopRight: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: semanticColors.border,
    paddingLeft: spacing.lg,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  backRow: { marginBottom: spacing.md },
  backLink: { color: semanticColors.brand, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: spacing.sm },
  chargeBanner: {
    backgroundColor: semanticColors.brandLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    color: semanticColors.textSecondary,
    marginBottom: spacing.md,
    fontSize: typography.md,
  },
  pendingCopy: {
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  lockBanner: {
    backgroundColor: semanticColors.brandLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    color: semanticColors.textSecondary,
    marginBottom: spacing.lg,
  },
  sectionTitle: { fontSize: typography.xl, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  paymentBlock: { marginTop: spacing.md },
  paymentElementWrap: { minHeight: 120, marginBottom: spacing.md },
  payBtn: {
    backgroundColor: semanticColors.brand,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { fontWeight: '700', color: semanticColors.textInverse, fontSize: typography.lg },
  emptyText: { textAlign: 'center', color: semanticColors.textSecondary, marginBottom: spacing.md },
  expeditedRow: { marginTop: spacing.md, marginBottom: spacing.md },
  expeditedTitle: { fontSize: typography.md, fontWeight: '600', color: semanticColors.brand },
});
