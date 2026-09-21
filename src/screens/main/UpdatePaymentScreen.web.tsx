import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { ButtonLoadingLabel } from '../../components/brand/ButtonLoadingLabel';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { useWebLayout } from '../../hooks/useWebLayout';
import { createPilotSetupIntent } from '../../services/checkout/createPilotSetupIntent';
import { householdsService } from '../../services/firestore/households';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

function notify(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
}

function SaveCardForm({
  onSaved,
  colors,
  styles,
}: {
  onSaved: () => void;
  colors: SemanticColors;
  styles: ReturnType<typeof createStyles>;
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
          return_url:
            typeof window !== 'undefined'
              ? `${window.location.origin}/orders`
              : 'https://grapejuice-pilot.web.app/orders',
        },
        redirect: 'if_required',
      });
      if (error) {
        notify('Could not save card', error.message ?? 'Please try again.');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.paymentBlock}>
      <View style={styles.paymentElementWrap}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </View>
      <TouchableOpacity
        style={[styles.cta, saving && styles.ctaDisabled]}
        onPress={() => void handleSave()}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="Save new card"
      >
        <ButtonLoadingLabel
          label="Save new card"
          loading={saving}
          loaderColor={colors.goldMuted}
          labelStyle={styles.ctaText}
        />
      </TouchableOpacity>
    </View>
  );
}

/**
 * Replace the default payment method after a failed off-session charge.
 * Webhook updates stripeDefaultPaymentMethodId and clears chargeFailureMessage.
 */
export function UpdatePaymentScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <UpdatePaymentScreenBody />
    </StorefrontChrome>
  );
}

function UpdatePaymentScreenBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, refresh: refreshSession } = useSession();
  const { isDesktop } = useWebLayout();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  useEffect(() => {
    if (!isAuthenticated || !household?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await createPilotSetupIntent(household.id);
        if (cancelled) return;
        if (!result.clientSecret) {
          setError('No setup secret returned.');
          return;
        }
        setClientSecret(result.clientSecret);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not start card update.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, household?.id]);

  const onSaved = async () => {
    setAwaitingWebhook(true);
    const householdId = household?.id;
    if (householdId) {
      for (let i = 0; i < 12; i += 1) {
        await refreshSession({ silent: true });
        const hh = await householdsService.get(householdId);
        if (hh?.stripeDefaultPaymentMethodId) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    } else {
      await refreshSession({ silent: true });
    }
    setAwaitingWebhook(false);
    notify(
      'Card updated',
      'Your new card is on file. We’ll use it for the next charge attempt (or tap Dev: charge now in a dev build).'
    );
    navigation.navigate('Orders');
  };

  if (!isAuthenticated) {
    return (
      <WebContentPanel>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Sign in to update your payment method.</Text>
        </View>
      </WebContentPanel>
    );
  }

  return (
    <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
      <View style={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Update payment method</Text>
        <Text style={styles.sub}>
          Replace the card on file. You won&apos;t be charged until your box locks / ships.
        </Text>

        {loading || awaitingWebhook ? (
          <View style={styles.centered}>
            <BrandLoadingMark color={colors.brand} />
            <Text style={styles.hint}>
              {awaitingWebhook ? 'Saving your card…' : 'Preparing secure form…'}
            </Text>
          </View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !stripeKey || !stripePromise || !clientSecret ? (
          <Text style={styles.error}>Stripe is not configured.</Text>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: 'stripe' },
            }}
          >
            <SaveCardForm onSaved={() => void onSaved()} colors={colors} styles={styles} />
          </Elements>
        )}
      </View>
    </WebContentPanel>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    content: {
      padding: spacing.lg,
      paddingBottom: 120,
      maxWidth: 520,
      width: '100%',
      alignSelf: 'center',
    },
    centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
    backRow: { marginBottom: spacing.sm },
    backLink: { color: colors.brand, fontWeight: '600', fontSize: typography.md },
    title: { ...typeface('medium'), fontSize: 28, color: colors.textPrimary },
    sub: {
      fontSize: typography.md,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
      lineHeight: 22,
    },
    hint: { fontSize: typography.sm, color: colors.textTertiary },
    emptyText: { fontSize: typography.md, color: colors.textSecondary },
    error: { fontSize: typography.md, color: colors.textSecondary, marginTop: spacing.md },
    paymentBlock: { gap: spacing.md },
    paymentElementWrap: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      backgroundColor: colors.bgPrimary,
    },
    cta: {
      marginTop: spacing.sm,
      backgroundColor: colors.logoDark,
      borderRadius: borderRadius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    ctaDisabled: { opacity: 0.6 },
    ctaText: { ...typeface('medium'), fontSize: typography.md, color: colors.textInverse },
  });
}
