import React, { useState } from 'react';
import { ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors, spacing } from '../../constants/theme';
import { GiftGiveForm } from './GiftGiveForm';
import { DEFAULT_GIFT_CHILDREN, type GiftGiveFormValues } from './giftGiveTypes';
import type { GiftChildDraft } from './giftGiveTypes';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';

export function GiftGiveScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'GiftGive'>>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [values, setValues] = useState<GiftGiveFormValues>({
    recipientEmail: '',
    giverName: '',
    message: '',
    giftPath: route.params?.initialGiftPath ?? 'customize',
  });
  const [childDrafts, setChildDrafts] = useState<GiftChildDraft[]>(DEFAULT_GIFT_CHILDREN);
  const [submitting, setSubmitting] = useState(false);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';

  const patchValues = (patch: Partial<GiftGiveFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  const submit = async () => {
    if (!values.recipientEmail.includes('@')) {
      Alert.alert('Email required', 'Enter the recipient family email.');
      return;
    }

    if (values.giftPath === 'customize') {
      navigation.navigate('GiftGiverCustomize', { form: values, childDrafts });
      return;
    }

    if (!stripeKey) {
      Alert.alert('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return;
    }

    setSubmitting(true);
    try {
      const result = await startGiftPurchase({ form: values, customize: false });

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

      await completeGiftPurchase(result.giftInviteId, values.recipientEmail.trim(), () => navigation.goBack());
      if (__DEV__) console.log('[gift] claim url', result.claimUrl);
    } catch (e) {
      Alert.alert('Could not send gift', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <GiftGiveForm
        values={values}
        childDrafts={childDrafts}
        onChange={patchValues}
        onChildDraftsChange={setChildDrafts}
        onBack={() => navigation.goBack()}
        onSubmit={() => void submit()}
        submitting={submitting}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: 120 },
});
