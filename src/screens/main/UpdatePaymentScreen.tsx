import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { ButtonLoadingLabel } from '../../components/brand/ButtonLoadingLabel';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
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

/**
 * Native: replace default payment method via PaymentSheet (setup mode).
 * Once lock has passed, saving a new card retries the failed box charge.
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
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'retrying' | 'done'>('idle');
  const [result, setResult] = useState<ChargeRetryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedBoxes, setFailedBoxes] = useState<FailedBoxSnapshot[]>([]);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';

  useEffect(() => {
    if (!household?.id) return;
    let cancelled = false;
    void snapshotFailedBoxCharges(household.id).then((failed) => {
      if (!cancelled) setFailedBoxes(failed);
    });
    return () => {
      cancelled = true;
    };
  }, [household?.id, phase]);

  const updateCard = async () => {
    if (!household?.id) return;
    setError(null);
    setResult(null);
    if (!stripeKey) {
      setError('Card update isn’t configured in this build.');
      return;
    }
    setBusy(true);
    try {
      const snapshots = await snapshotFailedBoxCharges(household.id);
      setFailedBoxes(snapshots);
      const { clientSecret } = await createPilotSetupIntent(household.id);
      if (!clientSecret) {
        setError('Could not start card update. Try again.');
        return;
      }
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Grapejuice',
        setupIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
      });
      if (initError) {
        setError(initError.message);
        return;
      }
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') setError(presentError.message);
        return;
      }
      setPhase('retrying');
      const next = await finishCardUpdate({
        householdId: household.id,
        previousCardOnFileAt: household.cardOnFileAt,
        previousPaymentMethodId: household.stripeDefaultPaymentMethodId,
        refresh: () => refreshSession({ silent: true }),
        snapshots,
      });
      setResult(next);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update card.');
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Sign in to update your payment method.</Text>
      </View>
    );
  }

  const retryingNow = failedBoxes.some((box) => box.lockPassed);

  return (
    <View style={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Text style={styles.backLink}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Update payment method</Text>
      <Text style={styles.sub}>
        {retryingNow
          ? 'Your last charge didn’t go through. Save a new card and we’ll try that charge again right away.'
          : 'Replace the card on file. You won’t be charged until your box locks.'}
      </Text>

      {phase === 'retrying' ? (
        <View style={styles.centered}>
          <BrandLoadingMark color={colors.brand} />
          <Text style={styles.hint}>Card saved. Retrying the charge…</Text>
        </View>
      ) : null}

      {phase === 'done' && result ? (
        <View style={styles.statusBlock}>
          <Text style={result.kind === 'declined' ? styles.error : styles.status}>
            {chargeRetryCopy(result)}
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {phase !== 'retrying' ? (
        <TouchableOpacity
          style={[styles.cta, busy && styles.ctaDisabled]}
          onPress={() => void updateCard()}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <BrandLoadingMark large={false} color={colors.goldMuted} />
          ) : (
            <ButtonLoadingLabel
              label={phase === 'done' && result?.kind === 'declined' ? 'Try another card' : 'Update card'}
              loading={false}
              loaderColor={colors.goldMuted}
              labelStyle={styles.ctaText}
            />
          )}
        </TouchableOpacity>
      ) : null}

      {phase === 'done' ? (
        <TouchableOpacity
          style={styles.secondaryCta}
          onPress={() => navigation.navigate('Orders')}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryCtaText}>Back to orders</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    content: { flex: 1, padding: spacing.lg, backgroundColor: colors.bgPrimary },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
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
    emptyText: { fontSize: typography.md, color: colors.textSecondary },
    hint: { fontSize: typography.sm, color: colors.textTertiary, marginTop: spacing.sm },
    error: { fontSize: typography.md, color: colors.textPrimary, marginBottom: spacing.md, lineHeight: 22 },
    statusBlock: { marginBottom: spacing.md },
    status: { fontSize: typography.md, color: colors.textPrimary, lineHeight: 22 },
    cta: {
      backgroundColor: colors.logoDark,
      borderRadius: borderRadius.md,
      paddingVertical: 14,
      alignItems: 'center',
      minHeight: 48,
      justifyContent: 'center',
    },
    ctaDisabled: { opacity: 0.6 },
    ctaText: { ...typeface('medium'), fontSize: typography.md, color: colors.textInverse },
    secondaryCta: {
      marginTop: spacing.sm,
      borderRadius: borderRadius.md,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryCtaText: { ...typeface('medium'), fontSize: typography.md, color: colors.textPrimary },
  });
}
