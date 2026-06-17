import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { createPilotSetupIntent } from '../../services/checkout/createPilotSetupIntent';
import { commitPilotBox } from '../../services/checkout/commitPilotBox';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { EXPEDITED_SHIPPING_CENTS } from '../../services/box/pricing';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { useCheckoutDraft } from './checkout/useCheckoutDraft';
import { CheckoutOrderSummary } from './checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from './checkout/CheckoutAddressFields';
import { CheckoutAuthGate } from './checkout/CheckoutAuthGate';
import { CheckoutSmsOptIn } from './checkout/CheckoutSmsOptIn';

export function CheckoutScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, refresh: refreshSession } = useSession();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
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
  const [submitting, setSubmitting] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const cardOnFile = !!household?.cardOnFileAt;

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

  const handleCommit = async () => {
    if (!user || !household?.id) return;
    if (locked) {
      Alert.alert('Box locked', 'The customization window has closed. Contact support for changes.');
      return;
    }
    if (!validateAddress()) return;

    setSubmitting(true);
    try {
      let ready = cardOnFile;
      if (!ready) {
        ready = await handleSaveCard();
        if (!ready) return;
      }

      const { orderId } = await commitPilotBox(household.id, normalizedAddress(), {
        expeditedShipping,
        contactPhone: contactPhone.trim() || undefined,
        smsOptIn: smsOptIn && contactPhone.trim().length > 0,
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
        <Text style={styles.lockBanner}>Box customization is locked. Checkout may be unavailable.</Text>
      ) : null}

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
      />
      {expeditedAvailable ? (
        <TouchableOpacity
          style={styles.expeditedRow}
          onPress={() => setExpeditedShipping((v) => !v)}
          activeOpacity={0.85}
        >
          <View style={[styles.checkbox, expeditedShipping && styles.checkboxOn]} />
          <View style={styles.expeditedCopy}>
            <Text style={styles.expeditedTitle}>Expedited shipping (+{formatDollars(EXPEDITED_SHIPPING_CENTS)})</Text>
            <Text style={styles.expeditedBody}>Arrives sooner — for last-minute planners.</Text>
          </View>
        </TouchableOpacity>
      ) : null}
      <CheckoutAddressFields address={address} onChange={updateAddress} />
      <CheckoutSmsOptIn
        phone={contactPhone}
        smsOptIn={smsOptIn}
        onPhoneChange={setContactPhone}
        onSmsOptInChange={setSmsOptIn}
      />

      <TouchableOpacity
        style={[styles.payBtn, (submitting || locked) && styles.payBtnDisabled]}
        onPress={handleCommit}
        disabled={submitting || locked}
      >
        {submitting ? (
          <ActivityIndicator color={semanticColors.textInverse} />
        ) : (
          <Text style={styles.payBtnText}>
            {cardOnFile ? 'Commit to box' : 'Save card & commit to box'}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: 120,
    ...(Platform.OS === 'web' ? { width: '100%' as const } : {}),
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
  expeditedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: semanticColors.border,
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: semanticColors.brand, borderColor: semanticColors.brand },
  expeditedCopy: { flex: 1 },
  expeditedTitle: { fontSize: typography.md, fontWeight: '600' },
  expeditedBody: { fontSize: typography.sm, color: semanticColors.textSecondary, marginTop: 4, lineHeight: 18 },
});
