import React, { useMemo, useState } from 'react';
import { StyleSheet, Alert, View, Text, Platform } from 'react-native';
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
import { GiftGiveForm } from './GiftGiveForm';
import { DEFAULT_GIFT_CHILDREN, type GiftGiveFormValues } from './giftGiveTypes';
import type { GiftChildDraft } from './giftGiveTypes';
import { GiftPaymentPanel, GIFT_STRIPE_APPEARANCE } from './GiftPaymentPanel.web';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';

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
  const [values, setValues] = useState<GiftGiveFormValues>({
    recipientEmail: '',
    giverName: '',
    message: '',
    giftPath: route.params?.initialGiftPath ?? 'customize',
  });
  const [childDrafts, setChildDrafts] = useState<GiftChildDraft[]>(DEFAULT_GIFT_CHILDREN);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [giftInviteId, setGiftInviteId] = useState<string | null>(null);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  const patchValues = (patch: Partial<GiftGiveFormValues>) => {
    if (patch.recipientEmail !== undefined) setFormError(null);
    setValues((current) => ({ ...current, ...patch }));
  };

  const preparePayment = async () => {
    const email = values.recipientEmail.trim();
    if (!email.includes('@')) {
      setFormError('Enter the recipient family’s email to continue.');
      return;
    }

    if (values.giftPath === 'customize') {
      navigation.navigate('GiftGiverCustomize', {
        form: { ...values, recipientEmail: email },
        childDrafts,
      });
      return;
    }

    if (!stripeKey) {
      notify('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return;
    }

    setSubmitting(true);
    try {
      const result = await startGiftPurchase({
        form: { ...values, recipientEmail: email },
        customize: false,
      });
      setGiftInviteId(result.giftInviteId);
      setPaymentSecret(result.clientSecret);
      if (__DEV__) console.log('[gift] prepared', result.claimUrl);
    } catch (e) {
      notify('Could not start payment', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetPayment = () => {
    setPaymentSecret(null);
    setGiftInviteId(null);
  };

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
            submitLabel={values.giftPath === 'customize' ? 'Pick their box' : 'Continue to payment'}
          />
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
});
