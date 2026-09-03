import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Alert, View, Platform, TouchableOpacity, Text } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, typeface } from '../../constants/theme';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useGiftIntentStore } from '../../stores/giftIntentStore';
import { GiftGiveForm } from './GiftGiveForm';
import { DEFAULT_GIFT_CHILDREN, type GiftGiveFormValues } from './giftGiveTypes';
import type { GiftChildDraft } from './giftGiveTypes';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';

function notify(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function GiftGiveScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <GiftGiveScreenBody />
    </StorefrontChrome>
  );
}

function GiftGiveScreenBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'GiftGive'>>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const startAuthForGiftGive = useAuthFlowStore((s) => s.startAuthForGiftGive);
  const restored = route.params?.form;
  const [values, setValues] = useState<GiftGiveFormValues>(() => {
    const path = route.params?.initialGiftPath ?? restored?.giftPath ?? null;
    if (restored) return { ...restored, giftPath: path };
    return { recipientEmail: '', giverName: '', message: '', giftPath: path };
  });
  const [childDrafts, setChildDrafts] = useState<GiftChildDraft[]>(
    route.params?.childDrafts ?? DEFAULT_GIFT_CHILDREN
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const autoStartedPayment = useRef(false);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const creditOnly = values.giftPath === 'credit_only';

  const patchValues = (patch: Partial<GiftGiveFormValues>) => {
    if (patch.recipientEmail !== undefined || patch.giftPath !== undefined) setFormError(null);
    setValues((current) => ({ ...current, ...patch }));
  };

  const requireAuth = (entry: 'signup' | 'signin') => {
    const email = values.recipientEmail.trim();
    if (!email.includes('@')) {
      setFormError('Enter the recipient family’s email to continue.');
      return;
    }
    if (values.giftPath !== 'credit_only') {
      setFormError('Choose “Let them choose” to send credit, or “Pick items for them” to curate.');
      return;
    }
    const draft = {
      form: { ...values, recipientEmail: email, giftPath: 'credit_only' as const },
      childDrafts,
    };
    useGiftIntentStore.getState().markIncomplete('credit_only', draft);
    startAuthForGiftGive(entry, draft);
  };

  const submit = async () => {
    const email = values.recipientEmail.trim();
    if (!email.includes('@')) {
      setFormError('Enter the recipient family’s email to continue.');
      return;
    }

    if (values.giftPath === 'credit_only') {
      if (!isAuthenticated) {
        requireAuth('signup');
        return;
      }

      if (!stripeKey) {
        notify('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
        return;
      }

      setSubmitting(true);
      try {
        useGiftIntentStore.getState().markIncomplete('credit_only', {
          form: { ...values, recipientEmail: email, giftPath: 'credit_only' },
          childDrafts,
        });
        const result = await startGiftPurchase({
          form: { ...values, recipientEmail: email, giftPath: 'credit_only' },
          customize: false,
        });

        const { error: initError } = await initPaymentSheet({
          paymentIntentClientSecret: result.clientSecret,
          merchantDisplayName: 'Grapejuice',
        });
        if (initError) {
          throw new Error(initError.message ?? 'Could not open payment.');
        }

        const { error: presentError } = await presentPaymentSheet();
        if (presentError) {
          if (presentError.code !== 'Canceled') {
            throw new Error(presentError.message ?? 'Payment failed.');
          }
          return;
        }

        const finalized = await completeGiftPurchase(result.giftInviteId);
        useGiftIntentStore.getState().markSent(email, 'credit_only');
        navigation.replace('GiftSentConfirmation', {
          recipientEmail: email,
          customize: false,
          giverName: values.giverName.trim() || undefined,
          amountCents: DEFAULT_BOX_PRICE_CENTS,
          claimUrl: finalized.claimUrl || result.claimUrl,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Try again.';
        notify('Could not send gift', msg);
        if (/unauthenticated|Sign in required/i.test(msg)) {
          requireAuth('signin');
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (values.giftPath === 'customize') {
      navigation.navigate('GiftGiverCustomize', {
        form: { ...values, recipientEmail: email, giftPath: 'customize' },
        childDrafts,
      });
      return;
    }

    setFormError('Choose “Let them choose” (credit) or “Pick items for them” (curated box).');
  };

  useEffect(() => {
    if (!route.params?.autoStartPayment || !isAuthenticated || autoStartedPayment.current) return;
    if (values.giftPath !== 'credit_only') return;
    autoStartedPayment.current = true;
    navigation.setParams({ autoStartPayment: undefined });
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on auth resume
  }, [isAuthenticated, route.params?.autoStartPayment]);

  const submitLabel =
    values.giftPath == null
      ? 'Choose how this gift works'
      : !creditOnly
        ? 'Pick their box'
        : !isAuthenticated
          ? 'Sign up to continue'
          : 'Continue to payment';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.shell}>
        <GiftGiveForm
          values={values}
          childDrafts={childDrafts}
          onChange={patchValues}
          onChildDraftsChange={setChildDrafts}
          onBack={() => navigation.goBack()}
          onSubmit={() => void submit()}
          submitting={submitting}
          submitLabel={submitLabel}
          error={formError}
        >
          {creditOnly && !isAuthenticated ? (
            <TouchableOpacity
              onPress={() => requireAuth('signin')}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.signInLink}
            >
              <Text style={styles.signInText}>Already have an account? Sign in</Text>
            </TouchableOpacity>
          ) : null}
        </GiftGiveForm>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: 120 },
    shell: { width: '100%', maxWidth: 560, alignSelf: 'center' },
    signInLink: { marginTop: spacing.md, alignSelf: 'center' },
    signInText: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: colors.brand,
      textAlign: 'center',
    },
  });
}
