import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Alert, View, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import type { MainStackParamList } from '../../navigation/types';
import { spacing } from '../../constants/theme';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { GiftGiveForm } from './GiftGiveForm';
import { DEFAULT_GIFT_CHILDREN, type GiftGiveFormValues } from './giftGiveTypes';
import type { GiftChildDraft } from './giftGiveTypes';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';

function notify(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function GiftGiveScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'GiftGive'>>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [values, setValues] = useState<GiftGiveFormValues>({
    recipientEmail: '',
    giverName: '',
    message: '',
    giftPath: route.params?.initialGiftPath ?? 'customize',
  });
  const [childDrafts, setChildDrafts] = useState<GiftChildDraft[]>(DEFAULT_GIFT_CHILDREN);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';

  const patchValues = (patch: Partial<GiftGiveFormValues>) => {
    if (patch.recipientEmail !== undefined) setFormError(null);
    setValues((current) => ({ ...current, ...patch }));
  };

  const submit = async () => {
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
      navigation.replace('GiftSentConfirmation', {
        recipientEmail: email,
        customize: false,
        giverName: values.giverName.trim() || undefined,
        amountCents: DEFAULT_BOX_PRICE_CENTS,
        claimUrl: finalized.claimUrl || result.claimUrl,
      });
    } catch (e) {
      notify('Could not send gift', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
          error={formError}
        />
      </View>
    </ScrollView>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: 120 },
    shell: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  });
}
