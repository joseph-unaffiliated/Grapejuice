import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Alert, View, Text, Platform, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import type { MainStackParamList } from '../../navigation/types';
import { MOBILE_GUTTER, spacing, typography, typeface, semanticColors } from '../../constants/theme';
import { StorefrontChrome, useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useGiftIntentStore } from '../../stores/giftIntentStore';
import { GiftGiveForm } from './GiftGiveForm';
import { DEFAULT_GIFT_CHILDREN, type GiftGiveFormValues } from './giftGiveTypes';
import type { GiftChildDraft } from './giftGiveTypes';
import { GiftPaymentPanel, GIFT_STRIPE_APPEARANCE } from './GiftPaymentPanel.web';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';
import { isValidEmail } from '../../utils/formValidation';

function notify(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function GiftGiveBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'GiftGive'>>();
  const { goHome } = useStorefrontActions();
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
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [giftInviteId, setGiftInviteId] = useState<string | null>(null);
  const autoStartedPayment = useRef(false);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  const creditOnly = values.giftPath === 'credit_only';

  const patchValues = (patch: Partial<GiftGiveFormValues>) => {
    if (patch.recipientEmail !== undefined || patch.giftPath !== undefined) setFormError(null);
    setValues((current) => ({ ...current, ...patch }));
  };

  const requireAuth = (entry: 'signup' | 'signin') => {
    const email = values.recipientEmail.trim();
    if (!isValidEmail(email)) {
      setFormError('Enter a valid email (like name@example.com).');
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

  const preparePayment = async () => {
    const email = values.recipientEmail.trim();
    if (!isValidEmail(email)) {
      setFormError('Enter a valid email (like name@example.com).');
      return;
    }

    // Credit-only first — never fall through into the box editor.
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
        setGiftInviteId(result.giftInviteId);
        setPaymentSecret(result.clientSecret);
        if (__DEV__) console.log('[gift] prepared credit', result.claimUrl);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Try again.';
        notify('Could not start payment', msg);
        if (/unauthenticated|Sign in required/i.test(msg)) {
          requireAuth('signin');
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (values.giftPath === 'customize') {
      const form = { ...values, recipientEmail: email, giftPath: 'customize' as const };
      useGiftIntentStore.getState().markIncomplete('customize', { form, childDrafts });
      navigation.navigate('GiftGiverCustomize', {
        form,
        childDrafts,
      });
      return;
    }

    setFormError('Choose “Let them choose” (credit) or “Pick items for them” (curated box).');
  };

  // After signup from credit-only, skip the form and open Stripe checkout.
  useEffect(() => {
    if (!route.params?.autoStartPayment || !isAuthenticated || autoStartedPayment.current) return;
    if (values.giftPath !== 'credit_only') return;
    autoStartedPayment.current = true;
    navigation.setParams({ autoStartPayment: undefined });
    void preparePayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on auth resume
  }, [isAuthenticated, route.params?.autoStartPayment]);

  const resetPayment = () => {
    setPaymentSecret(null);
    setGiftInviteId(null);
  };

  const submitLabel =
    values.giftPath == null
      ? 'Choose how this gift works'
      : !creditOnly
        ? 'Pick their box'
        : !isAuthenticated
          ? 'Sign up to continue'
          : 'Continue to payment';

  const formProps = {
    values,
    childDrafts,
    onChange: patchValues,
    onChildDraftsChange: setChildDrafts,
    hideBack: true as const,
    error: formError,
  };

  return (
    <View style={styles.page}>
      <View style={styles.breadcrumb}>
        <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
          Store
        </Text>
        <Text style={styles.crumbSep}> / </Text>
        <Text style={styles.crumbCurrent}>Send a gift</Text>
      </View>

      <View style={styles.shell}>
        {paymentSecret && stripePromise && giftInviteId ? (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: paymentSecret, appearance: GIFT_STRIPE_APPEARANCE }}
          >
            <GiftPaymentPanel
              giftInviteId={giftInviteId}
              recipientEmail={values.recipientEmail.trim()}
              giverName={values.giverName}
              customize={false}
              onPaid={({ claimUrl }) => {
                useGiftIntentStore.getState().markSent(values.recipientEmail.trim(), 'credit_only');
                navigation.replace('GiftSentConfirmation', {
                  recipientEmail: values.recipientEmail.trim(),
                  customize: false,
                  giverName: values.giverName.trim() || undefined,
                  amountCents: DEFAULT_BOX_PRICE_CENTS,
                  claimUrl,
                });
              }}
              onCancel={resetPayment}
              onError={notify}
              cancelLabel="← Back to gift details"
              completePurchase={completeGiftPurchase}
            />
          </Elements>
        ) : (
          <GiftGiveForm
            {...formProps}
            onSubmit={() => void preparePayment()}
            submitting={submitting}
            submitLabel={submitLabel}
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
        )}
      </View>
    </View>
  );
}

export function GiftGiveScreen() {
  return (
    <StorefrontChrome hideServicesNav>
      <GiftGiveBody />
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  breadcrumb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  crumbLink: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.goldMuted,
  },
  crumbSep: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.goldMuted,
  },
  crumbCurrent: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  shell: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  signInLink: {
    marginTop: spacing.md,
    alignSelf: 'center',
  },
  signInText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.brand,
    textAlign: 'center',
  },
});
