import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
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
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

/**
 * Native: replace default payment method via PaymentSheet (setup mode).
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

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';

  const updateCard = async () => {
    if (!household?.id) return;
    if (!stripeKey) {
      Alert.alert('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return;
    }
    setBusy(true);
    try {
      const { clientSecret } = await createPilotSetupIntent(household.id);
      if (!clientSecret) {
        Alert.alert('Error', 'No setup secret returned.');
        return;
      }
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Grapejuice',
        setupIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
      });
      if (initError) {
        Alert.alert('Could not open payment sheet', initError.message);
        return;
      }
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Could not save card', presentError.message);
        }
        return;
      }
      await refreshSession({ silent: true });
      Alert.alert(
        'Card updated',
        'Your new card is on file. We’ll use it for the next charge attempt.'
      );
      navigation.navigate('Orders');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update card.');
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

  return (
    <View style={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Text style={styles.backLink}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Update payment method</Text>
      <Text style={styles.sub}>
        Replace the card on file. You won&apos;t be charged until your box locks / ships.
      </Text>
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
            label="Update card"
            loading={false}
            loaderColor={colors.goldMuted}
            labelStyle={styles.ctaText}
          />
        )}
      </TouchableOpacity>
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
  });
}
