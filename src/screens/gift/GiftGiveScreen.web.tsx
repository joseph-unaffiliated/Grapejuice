import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Alert, Text, Platform, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import { useBoxLockPassed } from '../../hooks/useBoxLockDay';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, typeface, semanticColors } from '../../constants/theme';
import { StorefrontFooter } from '../../components/storefront/StorefrontFooter';
import { StorefrontChrome, useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { SystemPage } from '../../components/layout/SystemPage';
import { STRIPE_APPEARANCE, STRIPE_FONTS } from '../main/checkout/stripeAppearance';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useGiftIntentStore } from '../../stores/giftIntentStore';
import { GiftGiveForm } from './GiftGiveForm';
import { DEFAULT_GIFT_CHILDREN, hasGiverAddress, type GiftGiveFormValues } from './giftGiveTypes';
import type { GiftChildDraft } from './giftGiveTypes';
import { GiftPaymentPanel } from './GiftPaymentPanel.web';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';
import {
  isValidEmail,
  validateShippingAddress,
  type ShippingAddressFieldErrors,
} from '../../utils/formValidation';
import { trackGiftStep } from '../../services/analytics/giftFunnel';

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
  const entryGiftPath = route.params?.initialGiftPath ?? restored?.giftPath ?? null;
  const [values, setValues] = useState<GiftGiveFormValues>(() => {
    const path = entryGiftPath ?? 'customize';
    if (restored) return { ...restored, giftPath: path };
    return { recipientEmail: '', giverName: '', message: '', giftPath: path };
  });
  const [childDrafts, setChildDrafts] = useState<GiftChildDraft[]>(
    route.params?.childDrafts ?? DEFAULT_GIFT_CHILDREN
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressFieldErrors, setAddressFieldErrors] = useState<ShippingAddressFieldErrors>({});
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [giftInviteId, setGiftInviteId] = useState<string | null>(null);
  const [serverStripeKey, setServerStripeKey] = useState<string | null>(null);
  const autoStartedPayment = useRef(false);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const activeStripeKey = serverStripeKey || stripeKey;
  const stripePromise = useMemo(
    () => (activeStripeKey ? loadStripe(activeStripeKey) : null),
    [activeStripeKey]
  );

  const creditOnly = values.giftPath === 'credit_only';
  const creditCents = listBoxCentsForKids(values.creditKids ?? 1);
  const boxesClosed = useBoxLockPassed();

  useEffect(() => {
    if (boxesClosed && values.giftPath === 'customize') {
      setValues((current) => ({ ...current, giftPath: 'credit_only' }));
    }
  }, [boxesClosed, values.giftPath]);

  useEffect(() => {
    trackGiftStep('GiftStart');
    // The default selection isn't a choice; only count paths the visitor arrived with.
    if (entryGiftPath) trackGiftStep('GiftPathChosen', entryGiftPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry only; later picks go through patchValues
  }, []);

  const patchValues = (patch: Partial<GiftGiveFormValues>) => {
    if (patch.recipientEmail !== undefined || patch.giftPath !== undefined) setFormError(null);
    if ('shippingAddress' in patch) {
      setAddressError(null);
      setAddressFieldErrors({});
    }
    if (patch.giftPath) trackGiftStep('GiftPathChosen', patch.giftPath);
    setValues((current) => ({ ...current, ...patch }));
  };

  const requireAuth = (entry: 'signup' | 'signin') => {
    const email = values.recipientEmail.trim();
    if (!isValidEmail(email)) {
      setFormError('Enter a valid email (like name@example.com).');
      return;
    }
    if (values.giftPath !== 'credit_only') {
      setFormError('Choose “Let them choose” to send credit, or “Pick it for them” to curate.');
      return;
    }
    const draft = {
      form: { ...values, recipientEmail: email, giftPath: 'credit_only' as const },
      childDrafts,
    };
    trackGiftStep('GiftSignupPrompt', 'credit_only');
    useGiftIntentStore.getState().markIncomplete('credit_only', draft);
    startAuthForGiftGive(entry, draft);
  };

  const preparePayment = async () => {
    const email = values.recipientEmail.trim();
    if (!isValidEmail(email)) {
      setFormError('Enter a valid email (like name@example.com).');
      return;
    }
    if (values.giftPath) {
      trackGiftStep('GiftPathChosen', values.giftPath);
      trackGiftStep('GiftDetails', values.giftPath);
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
          amountCents: creditCents,
        });
        setGiftInviteId(result.giftInviteId);
        setServerStripeKey(result.publishableKey);
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
      if (boxesClosed) {
        setFormError('Gift boxes for this Hanukkah have closed. Choose “Let them choose” to send gift credit.');
        return;
      }
      const address = hasGiverAddress(values.shippingAddress) ? values.shippingAddress : undefined;
      if (address) {
        const check = validateShippingAddress(address);
        if (!check.ok) {
          setAddressFieldErrors(check.fields);
          setAddressError(`${check.message ?? 'Finish their address.'} Or remove it to skip.`);
          return;
        }
      }
      const form = {
        ...values,
        shippingAddress: address,
        recipientEmail: email,
        giftPath: 'customize' as const,
      };
      useGiftIntentStore.getState().markIncomplete('customize', { form, childDrafts });
      navigation.navigate('GiftGiverCustomize', {
        form,
        childDrafts,
      });
      return;
    }

    setFormError('Choose “Pick it for them” (curated box) or “Let them choose” (credit).');
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

  const cancelGift = () => {
    useGiftIntentStore.getState().clear();
    resetPayment();
    setFormError(null);
    setValues({ recipientEmail: '', giverName: '', message: '', giftPath: boxesClosed ? 'credit_only' : 'customize' });
    setChildDrafts(DEFAULT_GIFT_CHILDREN);
    goHome();
  };

  const submitLabel =
    values.giftPath == null
      ? 'Choose how this gift works'
      : !creditOnly
        ? 'Curate what goes in their box'
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
    addressError,
    addressFieldErrors,
    onCancelGift: cancelGift,
    boxesClosed,
  };

  const paying = Boolean(paymentSecret && stripePromise && giftInviteId);
  return (
    <SystemPage
      narrow
      onBack={paying ? undefined : goHome}
      footer={
        <>
          <View style={styles.footerGap} />
          <StorefrontFooter />
        </>
      }
    >
      {paymentSecret && stripePromise && giftInviteId ? (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: paymentSecret, appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS }}
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
                amountCents: creditCents,
                claimUrl,
              });
            }}
            onCancel={resetPayment}
            onCancelGift={cancelGift}
            onError={notify}
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
    </SystemPage>
  );
}

export function GiftGiveScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <GiftGiveBody />
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  footerGap: {
    height: 80,
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
