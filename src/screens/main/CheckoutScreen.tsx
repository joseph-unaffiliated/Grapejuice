import React, { useCallback, useMemo, useState } from 'react';
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
import { useStripe } from '@stripe/stripe-react-native';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { createPilotSetupIntent } from '../../services/checkout/createPilotSetupIntent';
import { commitPilotBox } from '../../services/checkout/commitPilotBox';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { EXPEDITED_SHIPPING_CENTS } from '../../services/box/pricing';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { useCheckoutDraft } from './checkout/useCheckoutDraft';
import { CheckoutOrderSummary } from './checkout/CheckoutOrderSummary';
import { CheckoutAddressFields } from './checkout/CheckoutAddressFields';
import { CheckoutAuthGate } from './checkout/CheckoutAuthGate';
import { CheckoutSmsOptIn } from './checkout/CheckoutSmsOptIn';

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
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
      <View style={styles.centered}>
        <BrandLoadingMark color={colors.brand} />
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

      <Text style={styles.title}>Shipping</Text>
      <Text style={styles.chargeBanner}>You won&apos;t be charged until your box ships.</Text>
      {!cardOnFile ? (
        <Text style={styles.pendingCopy}>
          Your box will not ship until you add payment information and a shipping address.
        </Text>
      ) : null}
      {locked ? (
        <Text style={styles.lockBanner}>Box customization is locked. Checkout may be unavailable.</Text>
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
          expeditedShipping={expeditedShipping}
          compact
        />
      </View>

      {expeditedAvailable ? (
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
      ) : null}
      <CheckoutAddressFields address={address} onChange={updateAddress} />
      <CheckoutSmsOptIn
        phone={contactPhone}
        smsOptIn={smsOptIn}
        onPhoneChange={setContactPhone}
        onSmsOptInChange={setSmsOptIn}
      />

      <TouchableOpacity
        style={[styles.cta, (submitting || locked) && styles.ctaDisabled]}
        onPress={() => void handleCommit()}
        disabled={submitting || locked}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={cardOnFile ? 'Commit to box' : 'Save and continue to payment'}
      >
        {submitting ? (
          <BrandLoadingMark large={false} color={colors.goldMuted} />
        ) : (
          <Text style={styles.ctaText}>
            {cardOnFile ? 'Commit to box' : 'Save and continue to payment'}
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
      ...(Platform.OS === 'web' ? { width: '100%' as const } : {}),
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
    summaryCard: {
      backgroundColor: colors.accentCream,
      borderRadius: 16,
      padding: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.md,
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
