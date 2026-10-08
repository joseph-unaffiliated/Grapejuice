/** Figma rGzXYb1rNVxqGHz81835Jn — frame 16: giver picks items before pay (web). */
import React, { useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import type { MainStackParamList } from '../../navigation/types';
import { useGiftGiverBoxDraft } from '../../hooks/useGiftGiverBoxDraft';
import { orderSubtotalCents } from '../../services/box/pricing';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { useAuthStore } from '../../stores/authStore';
import { isValidEmail } from '../../utils/formValidation';
import { useGiftIntentStore } from '../../stores/giftIntentStore';
import { GiftGiverCustomizeContent } from './GiftGiverCustomizeContent';
import { GiftPaymentPanel } from './GiftPaymentPanel.web';
import { STRIPE_APPEARANCE, STRIPE_FONTS } from '../main/checkout/stripeAppearance';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';
import { trackGiftStep } from '../../services/analytics/giftFunnel';

type Route = RouteProp<MainStackParamList, 'GiftGiverCustomize'>;

function notify(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function firebaseMessage(e: unknown): string {
  if (!(e instanceof Error)) return 'Try again.';
  const anyErr = e as Error & { code?: string; message?: string };
  const msg = anyErr.message ?? '';
  if (/failed-precondition|Stripe is not configured/i.test(msg)) {
    return 'Payments are not configured yet. Ask the team to enable Stripe.';
  }
  return msg || 'Try again.';
}

export function GiftGiverCustomizeScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { form, childDrafts, lineItems: restoredLineItems } = route.params;

  // Credit-only gifts must never land on the box editor.
  React.useEffect(() => {
    if (form.giftPath === 'credit_only') {
      navigation.replace('GiftGive', {
        form: { ...form, giftPath: 'credit_only' },
        childDrafts,
        initialGiftPath: 'credit_only',
        autoStartPayment: true,
      });
      return;
    }
    trackGiftStep('GiftCustomize', 'customize');
  }, [form, childDrafts, navigation]);

  const {
    catalog,
    lineItems,
    children,
    loading,
    wrapSelectedItemIds,
    applySwap,
    swapToPreWrap,
    swapOptionsBySlot,
    removeCoalesced,
    addItem,
    addFreeItem,
    setKidGift,
    setKidBook,
    persistWrapSelection,
    setCashDonation,
  } = useGiftGiverBoxDraft(childDrafts, restoredLineItems);
  const giftAmountCents = useMemo(() => {
    const boxPriceCents = listBoxCentsForKids(Math.max(1, childDrafts.length));
    return orderSubtotalCents(lineItems, boxPriceCents);
  }, [childDrafts.length, lineItems]);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [giftInviteId, setGiftInviteId] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState<string | undefined>(undefined);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const [serverStripeKey, setServerStripeKey] = useState<string | null>(null);
  const activeStripeKey = serverStripeKey || stripeKey;
  const stripePromise = useMemo(
    () => (activeStripeKey ? loadStripe(activeStripeKey) : null),
    [activeStripeKey]
  );

  const cancelledRef = React.useRef(false);

  // Persist so refresh on /gift/customize can restore this draft.
  React.useEffect(() => {
    if (form.giftPath === 'credit_only' || cancelledRef.current) return;
    useGiftIntentStore.getState().markIncomplete('customize', {
      form: { ...form, giftPath: 'customize' },
      childDrafts,
      lineItems,
    });
  }, [form, childDrafts, lineItems]);

  const pay = async () => {
    setPayError(null);
    if (!isAuthenticated && !isValidEmail(form.giverEmail?.trim() ?? '')) {
      // Drafts saved before the email field existed: collect it on the gift form.
      navigation.navigate('GiftGive', {
        form,
        childDrafts,
        initialGiftPath: 'customize',
      });
      return;
    }
    if (!stripeKey) {
      const msg = 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env and restart the app.';
      setPayError(msg);
      notify('Not configured', msg);
      return;
    }
    setSubmitting(true);
    try {
      useGiftIntentStore.getState().markIncomplete('customize', {
        form,
        childDrafts,
        lineItems,
      });
      const childAgeGroups = childDrafts.map((c) => c.ageGroup);
      const result = await startGiftPurchase({
        form,
        customize: true,
        lineItems,
        childAgeGroups,
        amountCents: giftAmountCents,
      });
      setGiftInviteId(result.giftInviteId);
      setClaimToken(result.claimToken);
      setServerStripeKey(result.publishableKey);
      setPaymentSecret(result.clientSecret);
    } catch (e) {
      const msg = firebaseMessage(e);
      setPayError(msg);
      notify('Could not start payment', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelGift = () => {
    cancelledRef.current = true;
    useGiftIntentStore.getState().clear();
    setPaymentSecret(null);
    setGiftInviteId(null);
    setPayError(null);
    navigation.navigate('StorefrontHome');
  };

  const paymentSlot =
    paymentSecret && stripePromise && giftInviteId ? (
      <Elements
        stripe={stripePromise}
        options={{ clientSecret: paymentSecret, appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS }}
      >
        <GiftPaymentPanel
          giftInviteId={giftInviteId}
          recipientEmail={form.recipientEmail.trim()}
          giverName={form.giverName}
          customize
          amountCents={giftAmountCents}
          onPaid={({ claimUrl }) => {
            useGiftIntentStore.getState().markSent(form.recipientEmail.trim(), 'customize');
            navigation.replace('GiftSentConfirmation', {
              recipientEmail: form.recipientEmail.trim(),
              customize: true,
              giverName: form.giverName.trim() || undefined,
              amountCents: giftAmountCents,
              claimUrl,
            });
          }}
          onCancel={() => {
            setPaymentSecret(null);
            setGiftInviteId(null);
          }}
          onCancelGift={cancelGift}
          onError={notify}
          completePurchase={(id) => completeGiftPurchase(id, claimToken)}
        />
      </Elements>
    ) : null;

  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav hideSearchAndRav>
      <GiftGiverCustomizeContent
        form={form}
        catalog={catalog}
        lineItems={lineItems}
        kidProfiles={children}
        loading={loading}
        submitting={submitting}
        wrapSelectedItemIds={wrapSelectedItemIds}
        applySwap={applySwap}
        swapToPreWrap={swapToPreWrap}
        swapOptionsBySlot={swapOptionsBySlot}
        removeCoalesced={removeCoalesced}
        addItem={addItem}
        addFreeItem={addFreeItem}
        setKidGift={setKidGift}
        setKidBook={setKidBook}
        persistWrapSelection={persistWrapSelection}
        setCashDonation={setCashDonation}
        onPay={() => void pay()}
        onCancelGift={cancelGift}
        payError={payError}
        paymentSlot={paymentSlot}
      />
    </StorefrontChrome>
  );
}
