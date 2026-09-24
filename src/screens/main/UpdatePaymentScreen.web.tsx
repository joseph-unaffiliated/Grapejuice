import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
import {
  chargeRetryCopy,
  finishCardUpdate,
  snapshotFailedBoxCharges,
  type ChargeRetryResult,
  type FailedBoxSnapshot,
} from '../../services/checkout/chargeRetry';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

function SaveCardForm({
  onSaved,
  onError,
  colors,
  styles,
}: {
  onSaved: () => void;
  onError: (message: string) => void;
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
        onError(error.message ?? 'Could not save card. Please try again.');
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
 * The webhook saves the card and, once lock has passed, charges the box again.
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
  const [phase, setPhase] = useState<'form' | 'retrying' | 'done'>('form');
  const [result, setResult] = useState<ChargeRetryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [failedBoxes, setFailedBoxes] = useState<FailedBoxSnapshot[]>([]);

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
        const setup = await createPilotSetupIntent(household.id);
        if (cancelled) return;
        if (!setup.clientSecret) {
          setError('No setup secret returned.');
          return;
        }
        setClientSecret(setup.clientSecret);
        const failed = await snapshotFailedBoxCharges(household.id);
        if (!cancelled) setFailedBoxes(failed);
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
  }, [isAuthenticated, household?.id, formKey]);

  const onSaved = async () => {
    if (!household?.id) return;
    setError(null);
    setPhase('retrying');
    const next = await finishCardUpdate({
      householdId: household.id,
      previousCardOnFileAt: household.cardOnFileAt,
      previousPaymentMethodId: household.stripeDefaultPaymentMethodId,
      refresh: () => refreshSession({ silent: true }),
      snapshots: failedBoxes,
    });
    setResult(next);
    setPhase('done');
  };

  const tryAnotherCard = () => {
    setResult(null);
    setError(null);
    setPhase('form');
    setClientSecret(null);
    setLoading(true);
    setFormKey((key) => key + 1);
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
          {failedBoxes.some((box) => box.lockPassed)
            ? 'Your last charge didn’t go through. Save a new card and we’ll try that charge again right away.'
            : 'Replace the card on file. You won’t be charged until your box locks.'}
        </Text>

        {phase === 'done' && result ? (
          <View style={styles.statusBlock}>
            <Text style={result.kind === 'declined' ? styles.error : styles.status}>
              {chargeRetryCopy(result)}
            </Text>
            {result.kind === 'declined' ? (
              <TouchableOpacity style={styles.cta} onPress={tryAnotherCard} accessibilityRole="button">
                <Text style={styles.ctaText}>Try another card</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={result.kind === 'declined' ? styles.secondaryCta : styles.cta}
              onPress={() => navigation.navigate('Orders')}
              accessibilityRole="button"
            >
              <Text style={result.kind === 'declined' ? styles.secondaryCtaText : styles.ctaText}>
                Back to orders
              </Text>
            </TouchableOpacity>
          </View>
        ) : loading || phase === 'retrying' ? (
          <View style={styles.centered}>
            <BrandLoadingMark color={colors.brand} />
            <Text style={styles.hint}>
              {phase === 'retrying' ? 'Card saved. Retrying the charge…' : 'Preparing secure form…'}
            </Text>
          </View>
        ) : !stripeKey || !stripePromise || !clientSecret ? (
          <Text style={styles.error}>{error ?? 'Stripe is not configured.'}</Text>
        ) : (
          <View style={styles.paymentBlock}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Elements
              key={formKey}
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: { theme: 'stripe' },
              }}
            >
              <SaveCardForm
                onSaved={() => void onSaved()}
                onError={setError}
                colors={colors}
                styles={styles}
              />
            </Elements>
          </View>
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
    error: { fontSize: typography.md, color: colors.textPrimary, marginTop: spacing.md, lineHeight: 22 },
    statusBlock: { gap: spacing.md },
    status: { fontSize: typography.md, color: colors.textPrimary, lineHeight: 22 },
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
    secondaryCta: {
      borderRadius: borderRadius.md,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryCtaText: { ...typeface('medium'), fontSize: typography.md, color: colors.textPrimary },
  });
}
