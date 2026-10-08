/** Figma rGzXYb1rNVxqGHz81835Jn — frame 16: giver curates the box between the email and note steps (web). */
import React from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../../navigation/types';
import { useGiftGiverBoxDraft } from '../../hooks/useGiftGiverBoxDraft';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { useAuthStore } from '../../stores/authStore';
import { isValidEmail } from '../../utils/formValidation';
import { useGiftIntentStore } from '../../stores/giftIntentStore';
import { pushBrowserPath } from '../../navigation/webBrowserHistory';
import { GIFT_GIVE_PATH } from '../../navigation/giftFlowLink';
import { GiftGiverCustomizeContent } from './GiftGiverCustomizeContent';
import { trackGiftStep } from '../../services/analytics/giftFunnel';
import type { GiftGiveFormValues } from './giftGiveTypes';

type Route = RouteProp<MainStackParamList, 'GiftGiverCustomize'>;

/** The note / send steps edit the saved draft; browser Back here keeps the stale route params. */
function latestCustomizeForm(fallback: GiftGiveFormValues): GiftGiveFormValues {
  const intent = useGiftIntentStore.getState();
  const saved = intent.status === 'incomplete' && intent.kind === 'customize' ? intent.draft?.form : null;
  return { ...fallback, ...(saved ?? {}), giftPath: 'customize' };
}

export function GiftGiverCustomizeScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { form, childDrafts, lineItems: restoredLineItems } = route.params;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const draftHydrated = useGiftIntentStore((s) => s._hasHydrated);
  // After a reload, wait for the session and saved draft before deciding the email is missing.
  const needsEmail =
    !authLoading &&
    draftHydrated &&
    !isAuthenticated &&
    !isValidEmail(latestCustomizeForm(form).giverEmail?.trim() ?? '');

  React.useEffect(() => {
    // Credit-only gifts never land on the box editor.
    if (form.giftPath === 'credit_only') {
      navigation.replace('GiftGive', {
        form: { ...form, giftPath: 'credit_only' },
        childDrafts,
        initialGiftPath: 'credit_only',
        step: 'note',
      });
      return;
    }
    // The box is revealed after the email step.
    if (needsEmail) {
      navigation.replace('GiftGive', {
        form: latestCustomizeForm(form),
        childDrafts,
        initialGiftPath: 'customize',
        step: 'email',
      });
      return;
    }
    trackGiftStep('GiftCustomize', 'customize');
  }, [form, childDrafts, navigation, needsEmail]);

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

  const cancelledRef = React.useRef(false);

  // Persist so refresh on /gift/customize can restore this draft.
  React.useEffect(() => {
    if (form.giftPath === 'credit_only' || cancelledRef.current || !draftHydrated) return;
    const intent = useGiftIntentStore.getState();
    intent.markIncomplete('customize', {
      form: latestCustomizeForm(form),
      childDrafts,
      lineItems,
      step: intent.draft?.step,
    });
  }, [form, childDrafts, lineItems, draftHydrated]);

  const continueToNote = () => {
    const nextForm = latestCustomizeForm(form);
    useGiftIntentStore.getState().markIncomplete('customize', {
      form: nextForm,
      childDrafts,
      lineItems,
      step: 'note',
    });
    // Own history entry, so browser Back from the note step returns to the box.
    pushBrowserPath(`${GIFT_GIVE_PATH}?step=note`);
    navigation.push('GiftGive', {
      form: nextForm,
      childDrafts,
      lineItems,
      initialGiftPath: 'customize',
      step: 'note',
    });
  };

  const cancelGift = () => {
    cancelledRef.current = true;
    useGiftIntentStore.getState().clear();
    navigation.navigate('StorefrontHome');
  };

  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav hideSearchAndRav>
      <GiftGiverCustomizeContent
        form={form}
        catalog={catalog}
        lineItems={lineItems}
        kidProfiles={children}
        loading={loading}
        submitting={false}
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
        onPay={continueToNote}
        onCancelGift={cancelGift}
      />
    </StorefrontChrome>
  );
}
