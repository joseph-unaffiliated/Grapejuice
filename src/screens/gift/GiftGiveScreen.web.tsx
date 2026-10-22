import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { StyleSheet, Platform, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { getStripePromise } from '../../services/checkout/checkoutPrefetch';
import { Elements } from '@stripe/react-stripe-js';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import { orderSubtotalCents } from '../../services/box/pricing';
import { formatCatalogDollars, formatDollars } from '../../services/box/buildDefaultBox';
import { useCatalog } from '../../hooks/useCatalog';
import { primaryPhoto } from '../../components/mobile/catalogPhotos';
import { coalesceLinesByItemId } from '../../components/box/boxLineDisplay';
import { usePromo } from '../../services/promo/usePromo';
import { useBoxLockDay, useBoxLockPassed } from '../../hooks/useBoxLockDay';
import { MobileGiftCredit, MobileGiftFamily, MobileGiftNote, MobileGiftSave, MobileGiftSend } from '../mobile/MobileGiftSteps';
import type { MainStackParamList } from '../../navigation/types';
import {
  GIFT_CUSTOMIZE_PATH,
  GIFT_GIVE_PATH,
  giftStepFromSearch,
  isGiftGivePath,
} from '../../navigation/giftFlowLink';
import { pushBrowserPath, replaceBrowserPath } from '../../navigation/webBrowserHistory';
import { StorefrontFooter } from '../../components/storefront/StorefrontFooter';
import { StorefrontChrome, useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { SystemPage } from '../../components/layout/SystemPage';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { STRIPE_APPEARANCE, STRIPE_FONTS } from '../main/checkout/stripeAppearance';
import { checkoutUi } from '../main/checkout/checkoutUi';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { DiscountCodeField } from '../main/checkout/DiscountCodeField';
import { emptyShippingAddress } from '../main/checkout/useCheckoutDraft';
import { useAddressDeliverability } from '../main/checkout/useAddressDeliverability';
import { spacing, typography, typeface, semanticColors } from '../../constants/theme';
import { useAuthStore } from '../../stores/authStore';
import { giftPathToKind, useGiftIntentStore } from '../../stores/giftIntentStore';
import { signInGiftGiver } from '../../services/auth/loginLinks';
import { queueWelcomeAccountToast } from '../../services/auth/welcomeAccountToast';
import { GiftCreditKidsField, GiftPathCards } from './GiftGiveForm';
import { MobileGiftPathTabs } from '../mobile/MobileGiftPathCards';
import { balanceProps, m, mFont, mGutter } from '../../components/mobile/mobileTheme';
import { StickyBar } from '../../components/mobile/StickyBar';
import { GiftGiverChildrenFields } from './GiftGiverChildrenFields';
import {
  DEFAULT_GIFT_CHILDREN,
  hasGiverAddress,
  type GiftChildDraft,
  type GiftGiveFormValues,
  type GiftPath,
  type GiftStep,
} from './giftGiveTypes';
import { GiftPaymentPanel } from './GiftPaymentPanel.web';
import { completeGiftPurchase, startGiftPurchase } from './useGiftPayment';
import {
  isValidEmail,
  validateShippingAddress,
  type ShippingAddressFieldErrors,
} from '../../utils/formValidation';
import { revealField, scrollContainerToTop } from '../../utils/revealField';
import { recordGiftFunnelStep, trackGiftStep } from '../../services/analytics/giftFunnel';

/** `box` is the curated box editor, its own route between family and note. */
type FlowTarget = GiftStep | 'box';

function stepAfter(step: GiftStep, path: GiftPath | null): FlowTarget {
  switch (step) {
    case 'type':
    case 'kids':
      return path === 'customize' ? 'box' : 'send';
    case 'email':
      return 'box';
    case 'send':
      return 'note';
    case 'note':
    case 'pay':
      return 'pay';
  }
}

/** Steps that can't show yet (reload, deep link) fall back to the nearest one that can. */
function reachableStep(
  step: GiftStep,
  path: GiftPath | null,
  hasLineItems: boolean,
  hasPayment: boolean
): FlowTarget {
  // Path is chosen via tabs on the kids/amount screen — never a solo step.
  if (step === 'type' || !path) return 'kids';
  // Retired pre-box email URLs/drafts skip directly to the curated box.
  if (step === 'email') return path === 'customize' ? 'box' : 'kids';
  const afterBox = step === 'note' || step === 'send' || step === 'pay';
  if (afterBox && path === 'customize' && !hasLineItems) return 'box';
  if (step === 'pay' && !hasPayment) return 'note';
  if (step === 'note' && path === 'customize' && !hasLineItems) return 'box';
  return step;
}

function giftStepUrl(step: GiftStep): string {
  const resolved = step === 'type' ? 'kids' : step;
  return resolved === 'kids' ? GIFT_GIVE_PATH : `${GIFT_GIVE_PATH}?step=${resolved}`;
}

function notify(title: string, message: string) {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
}

type FieldErrors = { email?: string; giverEmail?: string; recipientEmail?: string };

type GiftPayment = {
  key: string;
  clientSecret: string;
  giftInviteId: string;
  claimToken?: string;
  publishableKey: string | null;
  discountCents?: number;
  discountLabel?: string;
  amountDueCents?: number;
};

/** Outlives remounts (StorefrontChrome re-parents the body when the layout breakpoint flips). */
let startedPayment: GiftPayment | null = null;

function GiftGiveBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'GiftGive'>>();
  const isFocused = useIsFocused();
  const { goHome } = useStorefrontActions();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const signedInEmail = useAuthStore((s) => s.user?.email ?? null);
  const params = route.params;
  const restored = params?.form;
  const entryGiftPath = params?.initialGiftPath ?? restored?.giftPath ?? null;
  const lineItems = params?.lineItems;
  const step: GiftStep =
    params?.step === 'type'
      ? 'kids'
      : (params?.step ?? (params?.autoStartPayment ? 'send' : 'kids'));

  const [values, setValues] = useState<GiftGiveFormValues>(() => {
    const defaultPath: GiftPath = entryGiftPath ?? 'customize';
    const base: GiftGiveFormValues = restored
      ? { ...restored, giftPath: restored.giftPath ?? defaultPath }
      : { recipientEmail: '', giverName: '', message: '', giftPath: defaultPath };
    // Mid-flow (remount or reload): later steps' answers live in the saved draft.
    const intent = useGiftIntentStore.getState();
    const saved = intent.status === 'incomplete' ? intent.draft?.form : null;
    return params?.step && saved && saved.giftPath === base.giftPath ? { ...base, ...saved } : base;
  });
  const [childDrafts, setChildDrafts] = useState<GiftChildDraft[]>(
    params?.childDrafts ?? DEFAULT_GIFT_CHILDREN
  );
  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressFieldErrors, setAddressFieldErrors] = useState<ShippingAddressFieldErrors>({});
  const [showAddress, setShowAddress] = useState(() => hasGiverAddress(restored?.shippingAddress));
  const [payment, setPaymentState] = useState<GiftPayment | null>(() => startedPayment);
  const setPayment = (next: GiftPayment | null) => {
    startedPayment = next;
    setPaymentState(next);
  };
  const cancelledRef = useRef(false);
  const topRef = useRef<View>(null);
  const pathRef = useRef<View>(null);
  const emailRef = useRef<TextInput>(null);
  const giverEmailRef = useRef<TextInput>(null);
  const recipientRef = useRef<TextInput>(null);
  const addressRef = useRef<View>(null);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';
  const activeStripeKey = payment?.publishableKey || stripeKey;
  const stripePromise = useMemo(
    () => (activeStripeKey ? loadStripe(activeStripeKey) : null),
    [activeStripeKey]
  );

  const boxesClosed = useBoxLockPassed();
  const giftPath = values.giftPath;
  const activePath: GiftPath = giftPath ?? (boxesClosed ? 'credit_only' : 'customize');
  const customize = activePath === 'customize';
  const amountCents = customize
    ? orderSubtotalCents(lineItems ?? [], listBoxCentsForKids(Math.max(1, childDrafts.length)))
    : listBoxCentsForKids(values.creditKids ?? 1);
  const promo = usePromo(amountCents);
  const { items: catalogItems } = useCatalog();
  const payThumbs = useMemo(() => {
    if (!lineItems?.length) return [];
    const byId = new Map(catalogItems.map((c) => [c.id, c]));
    return coalesceLinesByItemId(lineItems).map((r) => ({ id: r.itemId, imageUrl: primaryPhoto(byId.get(r.itemId)), count: r.quantity > 1 ? r.quantity : undefined }));
  }, [lineItems, catalogItems]);
  /** Signed-out givers create their account alongside the recipient details, after curation. */
  const askGiverEmailOnSend = !isAuthenticated;

  useEffect(() => {
    if (boxesClosed && values.giftPath === 'customize') {
      setValues((current) => ({ ...current, giftPath: 'credit_only' }));
    }
  }, [boxesClosed, values.giftPath]);

  useEffect(() => {
    trackGiftStep('GiftStart');
    recordGiftFunnelStep('start');
    // Only count a path the visitor actually chose (on /gift or here), never a default.
    if (entryGiftPath) {
      trackGiftStep('GiftPathChosen', entryGiftPath);
      recordGiftFunnelStep('path', { path: entryGiftPath });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry only; later picks go through patchValues
  }, []);

  // Back here from a later step: pick up what the note / send steps saved.
  const focusedBefore = useRef(false);
  useEffect(() => {
    if (!isFocused) return;
    if (!focusedBefore.current) {
      focusedBefore.current = true;
      return;
    }
    const intent = useGiftIntentStore.getState();
    const saved = intent.status === 'incomplete' ? intent.draft?.form : null;
    if (saved && saved.giftPath === values.giftPath) setValues((current) => ({ ...current, ...saved }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refocus only
  }, [isFocused]);

  // A restore can arrive after mount (draft hydrates late): adopt it.
  const lastRestored = useRef(restored);
  useEffect(() => {
    if (!restored || restored === lastRestored.current) return;
    lastRestored.current = restored;
    setValues({ ...restored, giftPath: params?.initialGiftPath ?? restored.giftPath ?? null });
    if (params?.childDrafts) setChildDrafts(params.childDrafts);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- new restore only
  }, [restored]);

  // Cold load can mount before the saved draft hydrates: merge it in before saving over it.
  const draftHydrated = useGiftIntentStore((s) => s._hasHydrated);
  const [draftAdopted, setDraftAdopted] = useState(() => useGiftIntentStore.getState()._hasHydrated);
  useEffect(() => {
    if (!draftHydrated || draftAdopted) return;
    const intent = useGiftIntentStore.getState();
    const draft = intent.status === 'incomplete' ? intent.draft : null;
    if (draft?.form && (!values.giftPath || draft.form.giftPath === values.giftPath)) {
      setValues((current) => ({ ...current, ...draft.form }));
      if (draft.childDrafts) setChildDrafts(draft.childDrafts);
      if (!lineItems && draft.lineItems) navigation.setParams({ lineItems: draft.lineItems });
    }
    setDraftAdopted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on hydration
  }, [draftHydrated]);

  // Persist each step so a reload resumes here.
  useEffect(() => {
    if (cancelledRef.current || !isFocused || !values.giftPath || !draftAdopted) return;
    useGiftIntentStore.getState().markIncomplete(giftPathToKind(values.giftPath), {
      form: values,
      childDrafts,
      lineItems,
      step,
    });
  }, [values, childDrafts, lineItems, step, isFocused, draftAdopted]);

  // Browser Back / Forward between steps of this screen.
  useEffect(() => {
    if (Platform.OS !== 'web' || !isFocused) return;
    const onPopState = () => {
      if (!isGiftGivePath(window.location.pathname)) return;
      navigation.setParams({ step: giftStepFromSearch(window.location.search) ?? 'type' });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isFocused, navigation]);

  useEffect(() => {
    setStepError(null);
    setFieldErrors({});
    scrollContainerToTop(topRef.current);
  }, [step]);

  const boxParams = (form: GiftGiveFormValues = values): MainStackParamList['GiftGiverCustomize'] => {
    const intent = useGiftIntentStore.getState();
    // Keep box edits unless the kids changed underneath them.
    const savedLines =
      intent.status === 'incomplete' &&
      intent.kind === 'customize' &&
      JSON.stringify(intent.draft?.childDrafts) === JSON.stringify(childDrafts)
        ? intent.draft?.lineItems
        : undefined;
    return {
      form: { ...form, giftPath: 'customize' },
      childDrafts,
      lineItems: lineItems ?? savedLines,
    };
  };

  const showStep = (next: GiftStep, mode: 'push' | 'replace') => {
    if (mode === 'push') pushBrowserPath(giftStepUrl(next));
    else replaceBrowserPath(giftStepUrl(next));
    navigation.setParams({ step: next });
  };

  const goTo = (target: FlowTarget, form: GiftGiveFormValues = values) => {
    if (target === 'box') {
      const next = boxParams(form);
      useGiftIntentStore.getState().markIncomplete('customize', { ...next, step });
      pushBrowserPath(GIFT_CUSTOMIZE_PATH);
      navigation.navigate('GiftGiverCustomize', next);
      return;
    }
    showStep(target, 'push');
  };

  // Mirror the implied first step into params so the URL says ?step=.
  useEffect(() => {
    if (!params?.step) navigation.setParams({ step });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Reloads and deep links can land on a step that isn't ready yet.
  useEffect(() => {
    if (!isFocused || cancelledRef.current || !draftAdopted) return;
    const target = reachableStep(step, giftPath, !!lineItems?.length, payment != null);
    if (target === step) return;
    if (target === 'box') navigation.replace('GiftGiverCustomize', boxParams());
    else showStep(target, 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check when the step, focus, payment or draft changes
  }, [step, isFocused, payment == null, draftAdopted]);

  useEffect(() => {
    if (!isFocused || cancelledRef.current || !draftAdopted) return;
    if (step !== 'note' && step !== 'send') return;
    if (reachableStep(step, giftPath, !!lineItems?.length, payment != null) !== step) return;
    recordGiftFunnelStep(step, { path: giftPath });
  }, [step, isFocused, draftAdopted, giftPath, lineItems, payment]);

  // Warm Stripe.js while they write the note so pay isn't a blank wait.
  useEffect(() => {
    if (step !== 'note' || !stripeKey) return;
    void getStripePromise(stripeKey)?.catch(() => undefined);
  }, [step, stripeKey]);

  const patchValues = (patch: Partial<GiftGiveFormValues>) => {
    setStepError(null);
    if (patch.giftPath) {
      trackGiftStep('GiftPathChosen', patch.giftPath);
      recordGiftFunnelStep('path', { path: patch.giftPath });
    }
    if (patch.giverEmail !== undefined) setFieldErrors((e) => ({ ...e, email: undefined, giverEmail: undefined }));
    if (patch.recipientEmail !== undefined) setFieldErrors((e) => ({ ...e, recipientEmail: undefined }));
    if ('shippingAddress' in patch) {
      setAddressError(null);
      setAddressFieldErrors({});
    }
    setValues((current) => ({ ...current, ...patch }));
  };

  const giverAddress = values.shippingAddress ?? emptyShippingAddress;
  const deliverability = useAddressDeliverability(giverAddress, (patch) =>
    patchValues({ shippingAddress: { ...giverAddress, ...patch } })
  );

  /** A new email becomes a signed-in account; an existing one stays a guest checkout filed under it. */
  const signInGiver = async (email: string) => {
    if (useAuthStore.getState().isAuthenticated) return;
    try {
      const result = await signInGiftGiver({ email, name: values.giverName.trim() || undefined });
      if (result.status === 'created') {
        queueWelcomeAccountToast(email);
        await useAuthStore.getState().signInWithToken(result.customToken, { stayOnSurface: true });
      }
    } catch (e) {
      console.warn('[gift] giver sign-in skipped', e);
    }
  };

  const continueFromEmail = async () => {
    if (isAuthenticated) {
      recordGiftFunnelStep('email', { path: giftPath });
      goTo('box');
      return;
    }
    const email = values.giverEmail?.trim() ?? '';
    if (!isValidEmail(email)) {
      setFieldErrors({ email: 'Enter your email (like name@example.com).' });
      revealField(emailRef.current);
      return;
    }
    recordGiftFunnelStep('email', { path: giftPath });
    setSubmitting(true);
    try {
      await signInGiver(email);
      goTo('box', { ...values, giverEmail: email });
    } finally {
      setSubmitting(false);
    }
  };

  /** Validate contact + start PaymentIntent so the note step can warm Stripe before pay. */
  const continueFromSend = async () => {
    const giverEmail = values.giverEmail?.trim() ?? '';
    const recipientEmail = values.recipientEmail.trim();
    const errors: FieldErrors = {};
    if (askGiverEmailOnSend && !isValidEmail(giverEmail)) {
      errors.giverEmail = 'Enter your email (like name@example.com).';
    }
    if (!isValidEmail(recipientEmail)) {
      errors.recipientEmail = 'Enter their email (like name@example.com).';
    }
    setFieldErrors(errors);
    if (errors.giverEmail) {
      revealField(giverEmailRef.current);
      return;
    }
    if (errors.recipientEmail) {
      revealField(recipientRef.current);
      return;
    }

    const address = customize && hasGiverAddress(values.shippingAddress) ? values.shippingAddress : undefined;
    if (address) {
      const check = validateShippingAddress(address);
      if (!check.ok) {
        setAddressFieldErrors(check.fields);
        setAddressError(check.message ? `${check.message} Or remove it to skip.` : 'Or remove the address to skip.');
        revealField(addressRef.current, { focus: false });
        return;
      }
    }
    if (!stripeKey) {
      notify('Not configured', 'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env');
      return;
    }

    setSubmitting(true);
    try {
      if (address) {
        const verdict = await deliverability.verify(address);
        if (!verdict.ok) {
          setAddressFieldErrors(verdict.fields);
          const fieldError = Object.keys(verdict.fields).length > 0;
          setAddressError(
            verdict.message ? `${verdict.message} Or remove it to skip.` : fieldError ? 'Or remove the address to skip.' : null
          );
          revealField(addressRef.current, { focus: false });
          return;
        }
      }
      if (giftPath) trackGiftStep('GiftDetails', giftPath);
      if (askGiverEmailOnSend) {
        recordGiftFunnelStep('email', { path: giftPath });
        await signInGiver(giverEmail);
      }

      const form: GiftGiveFormValues = {
        ...values,
        recipientEmail,
        giverEmail: giverEmail || undefined,
        shippingAddress: address,
      };
      const signedIn = useAuthStore.getState().isAuthenticated;
      const key = JSON.stringify([form, childDrafts, lineItems, amountCents, signedIn, promo.request() ?? null]);
      if (payment?.key !== key) {
        const result = await startGiftPurchase({
          form,
          customize,
          lineItems: customize ? lineItems : undefined,
          childAgeGroups: customize ? childDrafts.map((c) => c.ageGroup) : undefined,
          giftChildren: customize ? childDrafts : undefined,
          amountCents,
        });
        setPayment({
          key,
          clientSecret: result.clientSecret,
          giftInviteId: result.giftInviteId,
          claimToken: result.claimToken,
          publishableKey: result.publishableKey,
          discountCents: result.discountCents,
          discountLabel: promo.discountLabel,
          amountDueCents: result.amountDueCents,
        });
        recordGiftFunnelStep('checkout', { path: giftPath, inviteId: result.giftInviteId });
      }
      goTo('note', form);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Try again.';
      notify('Could not start payment', /failed-precondition|Stripe is not configured/i.test(msg)
        ? 'Payments are not configured yet. Ask the team to enable Stripe.'
        : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const continueFromNote = () => {
    if (!payment) {
      void continueFromSend();
      return;
    }
    goTo('pay');
  };

  const onContinue = () => {
    switch (step) {
      case 'kids': {
        const path = giftPath ?? (boxesClosed ? 'credit_only' : 'customize');
        if (!giftPath) patchValues({ giftPath: path });
        recordGiftFunnelStep('family', { path });
        recordGiftFunnelStep('path', { path });
        if (path === 'customize') {
          void import('../../services/firestore/catalog').then((m) => {
            void m.catalogService.getAll().catch(() => undefined);
          });
        }
        if (stripeKey) void getStripePromise(stripeKey)?.catch(() => undefined);
        goTo(stepAfter('kids', path));
        return;
      }
      case 'email':
        void continueFromEmail();
        return;
      case 'send':
        void continueFromSend();
        return;
      case 'note':
        continueFromNote();
        return;
      case 'pay':
        return;
    }
  };

  const mobileLayout = useMobileLayout();
  const lockDay = useBoxLockDay();
  const cancelGift = () => {
    cancelledRef.current = true;
    useGiftIntentStore.getState().clear();
    setPayment(null);
    goHome();
  };

  const setGiftPath = (path: GiftPath) => patchValues({ giftPath: path });

  const renderMobileStep = () => {
    switch (step) {
      case 'kids':
        return (
          <View>
            <View style={kidsHeadStyles.head}>
              <Text style={kidsHeadStyles.h1} role="heading" aria-level={1} {...balanceProps}>
                {activePath === 'customize' ? 'Who is it for?' : 'How much credit?'}
              </Text>
              <Text style={kidsHeadStyles.lede} {...balanceProps}>
                {activePath === 'customize'
                  ? 'We pick a book and a present for each kid, based on their age.'
                  : 'They build their own box with it. Credit matches a box for their family.'}
              </Text>
            </View>
            <View ref={pathRef}>
              <MobileGiftPathTabs
                giftPath={activePath}
                onChange={setGiftPath}
                boxesClosed={boxesClosed}
                hasError={!!stepError}
              />
            </View>
            {activePath === 'customize' ? (
              <MobileGiftFamily
                kids={childDrafts}
                adults={values.giftAdults ?? 1}
                onChange={setChildDrafts}
                onAdults={(giftAdults) => patchValues({ giftAdults })}
                hideHead
              />
            ) : (
              <MobileGiftCredit
                creditKids={values.creditKids ?? 1}
                onChange={(creditKids) => patchValues({ creditKids })}
                hideHead
              />
            )}
          </View>
        );
      case 'email':
        return (
          <MobileGiftSave
            ref={emailRef}
            name={values.giverName}
            email={values.giverEmail ?? ''}
            onName={(giverName) => patchValues({ giverName })}
            onEmail={(giverEmail) => patchValues({ giverEmail })}
            error={fieldErrors.email}
            signedIn={isAuthenticated}
            signedInEmail={signedInEmail}
            onSubmit={onContinue}
            busy={submitting}
          />
        );
      case 'note':
        return (
          <MobileGiftNote
            name={values.giverName}
            message={values.message}
            onName={(giverName) => patchValues({ giverName })}
            onMessage={(message) => patchValues({ message })}
            customize={customize}
          />
        );
      case 'send':
        return (
          <MobileGiftSend
            customize={customize}
            lockShort={lockDay}
            askGiverEmail={askGiverEmailOnSend}
            giverEmail={values.giverEmail ?? ''}
            onGiverEmail={(giverEmail) => patchValues({ giverEmail })}
            giverEmailError={fieldErrors.giverEmail}
            recipientEmail={values.recipientEmail}
            onRecipientEmail={(recipientEmail) => patchValues({ recipientEmail })}
            recipientError={fieldErrors.recipientEmail}
            busy={submitting}
            surprise={showAddress}
            onSurprise={(on) => {
              setShowAddress(on);
              if (!on) patchValues({ shippingAddress: undefined });
            }}
            address={
              <CheckoutAddressFields
                address={giverAddress}
                onChange={(patch) => patchValues({ shippingAddress: { ...giverAddress, ...patch } })}
                fieldErrors={addressFieldErrors}
                suggestion={deliverability.suggestion}
                onUseSuggestion={deliverability.fieldsProps.onUseSuggestion}
                heading=""
                hint=""
              />
            }
            addressError={addressError}
            discount={<DiscountCodeField promo={promo} disabled={submitting} />}
            discountNote={
              promo.discountCents > 0
                ? `${promo.discountLabel}: you pay ${formatDollars(amountCents - promo.discountCents)}; they still get the full ${formatDollars(amountCents)} gift.`
                : null
            }
            giverEmailRef={giverEmailRef}
            recipientRef={recipientRef}
            addressRef={addressRef}
          />
        );
      default:
        return null;
    }
  };

  const renderStep = () => {
    if (mobileLayout && step !== 'pay') return renderMobileStep();
    switch (step) {
      case 'kids':
        return (
          <>
            <Text style={checkoutUi.title}>{activePath === 'customize' ? 'Every box is unique' : 'Gift them credit'}</Text>
            <Text style={checkoutUi.lead}>
              {activePath === 'customize'
                ? 'Tell us who we’re building for and we’ll pick books and presents that are age-appropriate.'
                : 'How many kids are in their family? The credit covers a Hanukkah box for all of them.'}
            </Text>
            <View ref={pathRef} style={styles.section}>
              <GiftPathCards
                giftPath={activePath}
                onChange={setGiftPath}
                boxesClosed={boxesClosed}
                hasError={!!stepError}
              />
            </View>
            <View style={checkoutUi.divider} />
            {activePath === 'customize' ? (
              <GiftGiverChildrenFields children={childDrafts} onChange={setChildDrafts} showHeading={false} />
            ) : (
              <GiftCreditKidsField
                creditKids={values.creditKids ?? 1}
                onChange={(creditKids) => patchValues({ creditKids })}
                boxesClosed={boxesClosed}
              />
            )}
          </>
        );
      case 'email':
        return (
          <>
            <Text style={checkoutUi.title}>Enter your email to start curating</Text>
            <Text style={checkoutUi.lead}>
              We’ll give you a jumping off point, but then add or swap whatever you like.
            </Text>
            <View style={checkoutUi.divider} />
            {isAuthenticated ? (
              <Text style={checkoutUi.hint}>
                {signedInEmail ? `Signed in as ${signedInEmail}.` : 'You’re signed in.'}
              </Text>
            ) : (
              <>
                <Text style={checkoutUi.label}>
                  Your email
                  <Text style={styles.requiredMark}> *</Text>
                </Text>
                <TextInput
                  ref={emailRef}
                  style={[checkoutUi.input, fieldErrors.email ? checkoutUi.inputError : null]}
                  value={values.giverEmail ?? ''}
                  onChangeText={(giverEmail) => patchValues({ giverEmail })}
                  onSubmitEditing={onContinue}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  placeholder="you@example.com"
                  placeholderTextColor={semanticColors.textTertiary}
                  editable={!submitting}
                  accessibilityLabel="Your email, required"
                />
                {fieldErrors.email ? (
                  <Text style={checkoutUi.fieldError}>{fieldErrors.email}</Text>
                ) : null}
              </>
            )}
          </>
        );
      case 'note':
        return (
          <>
            <Text style={checkoutUi.title}>Your note</Text>
            <Text style={checkoutUi.lead}>They see this when they open your gift.</Text>
            <View style={checkoutUi.divider} />
            <Text style={checkoutUi.label}>Your name (on the gift)</Text>
            <TextInput
              style={checkoutUi.input}
              value={values.giverName}
              onChangeText={(giverName) => patchValues({ giverName })}
              autoComplete="name"
              placeholder="Grandma"
              placeholderTextColor={semanticColors.textTertiary}
              accessibilityLabel="Your name on the gift"
            />
            <Text style={checkoutUi.label}>Message (optional)</Text>
            <TextInput
              style={[checkoutUi.input, styles.textArea]}
              value={values.message}
              onChangeText={(message) => patchValues({ message })}
              multiline
              placeholder="Happy Hanukkah!"
              placeholderTextColor={semanticColors.textTertiary}
              accessibilityLabel="Gift message"
            />
          </>
        );
      case 'send':
        return (
          <>
            <Text style={checkoutUi.title}>Where should we send it?</Text>
            <Text style={checkoutUi.lead}>We email them a link to claim your gift.</Text>
            <View style={checkoutUi.divider} />
            <Text style={[checkoutUi.hint, styles.requiredHint]}>Fields marked * are required</Text>
            {askGiverEmailOnSend ? (
              <>
                <Text style={checkoutUi.label}>
                  Your email
                  <Text style={styles.requiredMark}> *</Text>
                </Text>
                <TextInput
                  ref={giverEmailRef}
                  style={[checkoutUi.input, fieldErrors.giverEmail ? checkoutUi.inputError : null]}
                  value={values.giverEmail ?? ''}
                  onChangeText={(giverEmail) => patchValues({ giverEmail })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  placeholder="you@example.com"
                  placeholderTextColor={semanticColors.textTertiary}
                  editable={!submitting}
                  accessibilityLabel="Your email, required"
                />
                {fieldErrors.giverEmail ? (
                  <Text style={checkoutUi.fieldError}>{fieldErrors.giverEmail}</Text>
                ) : (
                  <Text style={checkoutUi.hint}>For your receipt. We save your gift here.</Text>
                )}
              </>
            ) : null}
            <Text style={checkoutUi.label}>
              Their email
              <Text style={styles.requiredMark}> *</Text>
            </Text>
            <TextInput
              ref={recipientRef}
              style={[checkoutUi.input, fieldErrors.recipientEmail ? checkoutUi.inputError : null]}
              value={values.recipientEmail}
              onChangeText={(recipientEmail) => patchValues({ recipientEmail })}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="parent@example.com"
              placeholderTextColor={semanticColors.textTertiary}
              editable={!submitting}
              accessibilityLabel="Their email, required"
            />
            {fieldErrors.recipientEmail ? (
              <Text style={checkoutUi.fieldError}>{fieldErrors.recipientEmail}</Text>
            ) : null}
            {customize ? (
              <View ref={addressRef}>
                <View style={checkoutUi.divider} />
                {showAddress ? (
                  <>
                    <CheckoutAddressFields
                      address={giverAddress}
                      onChange={(patch) => patchValues({ shippingAddress: { ...giverAddress, ...patch } })}
                      fieldErrors={addressFieldErrors}
                      suggestion={deliverability.suggestion}
                      onUseSuggestion={deliverability.fieldsProps.onUseSuggestion}
                      heading="Their Mailing Address (optional)"
                      hint="Add it and they can keep the box a surprise: it ships without them seeing what's inside. They can still correct it."
                    />
                    {addressError ? <Text style={checkoutUi.fieldError}>{addressError}</Text> : null}
                    <TouchableOpacity
                      onPress={() => {
                        setShowAddress(false);
                        patchValues({ shippingAddress: undefined });
                      }}
                      disabled={submitting}
                      accessibilityRole="button"
                      hitSlop={8}
                      style={styles.addressToggle}
                    >
                      <Text style={styles.addressToggleText}>Remove address</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowAddress(true)}
                    disabled={submitting}
                    accessibilityRole="button"
                    hitSlop={8}
                    style={styles.addressToggle}
                  >
                    <Text style={styles.addressToggleText}>Know their address? Add it (optional)</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
            <View style={checkoutUi.divider} />
            <DiscountCodeField promo={promo} disabled={submitting} />
            {promo.discountCents > 0 ? (
              <Text style={checkoutUi.hint}>
                {promo.discountLabel}: you pay {formatDollars(amountCents - promo.discountCents)}; they still get the
                full {formatDollars(amountCents)} gift.
              </Text>
            ) : null}
          </>
        );
      case 'pay':
        return null;
    }
  };

  const paymentReady = step === 'pay' && payment && stripePromise;
  const taskStep = giftTaskStep(step, !!payment, customize);
  const firstStep = step === 'kids';
  const mobileHeader = mobileLayout ? (
    <TaskHeader
      back={firstStep ? { label: 'Cancel', onPress: cancelGift } : { label: 'Back', onPress: () => (navigation.canGoBack() ? navigation.goBack() : cancelGift()) }}
      title="Send a gift"
      right={`Step ${taskStep.index + 1} of ${taskStep.labels.length}`}
      steps={taskStep.labels}
      on={taskStep.index}
    />
  ) : null;
  const busy = submitting || deliverability.checking;
  const kidCount = Math.max(1, childDrafts.length);
  const beforeBox = activePath === 'customize' && !lineItems?.length;
  const shownCents = beforeBox ? listBoxCentsForKids(kidCount) : amountCents;
  const barLabel =
    !customize
      ? 'Hanukkah credit'
      : beforeBox
        ? `Gift box for ${kidCount} ${kidCount === 1 ? 'kid' : 'kids'}`
        : 'Their box';
  const barTotal = formatCatalogDollars(shownCents);
  const barCta =
    firstStep && activePath === 'customize'
      ? 'Pick their box'
      : firstStep
        ? 'Continue'
        : step === 'email'
          ? 'Pick their box'
          : step === 'send'
            ? 'Continue to note'
            : step === 'note'
              ? 'Continue to payment'
              : 'Continue';
  const mobileBar = mobileLayout ? (
    <StickyBar
      layout="stack"
      label={barLabel}
      total={barTotal}
      cta={{ label: barCta, onPress: onContinue, busy, disabled: busy }}
    />
  ) : null;
  return (
    <SystemPage
      narrow
      bleed={mobileLayout && step !== 'pay'}
      header={mobileHeader}
      footer={
        mobileLayout ? (
          <View style={{ height: 120 }} />
        ) : (
          <>
            <View style={styles.footerGap} />
            <StorefrontFooter />
          </>
        )
      }
    >
      <View ref={topRef} style={mobileLayout ? null : styles.topSpacer} />
      {paymentReady ? (
        <Elements
          key={payment.clientSecret}
          stripe={stripePromise}
          options={{ clientSecret: payment.clientSecret, appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS }}
        >
          <GiftPaymentPanel
            giftInviteId={payment.giftInviteId}
            recipientEmail={values.recipientEmail.trim()}
            giverName={values.giverName}
            customize={customize}
            amountCents={amountCents}
            discountCents={payment.discountCents}
            discountLabel={payment.discountLabel}
            amountDueCents={payment.amountDueCents}
            thumbs={payThumbs}
            boxCents={listBoxCentsForKids(Math.max(1, childDrafts.length))}
            kidCount={Math.max(1, childDrafts.length)}
            hasNote={!!values.message.trim()}
            onPaid={({ claimUrl }) => {
              recordGiftFunnelStep('paid', { path: giftPath, inviteId: payment.giftInviteId });
              cancelledRef.current = true;
              startedPayment = null;
              useGiftIntentStore
                .getState()
                .markSent(values.recipientEmail.trim(), giftPathToKind(giftPath ?? 'credit_only'));
              navigation.replace('GiftSentConfirmation', {
                recipientEmail: values.recipientEmail.trim(),
                customize,
                giverName: values.giverName.trim() || undefined,
                familyName: values.familyName?.trim() || undefined,
                amountCents,
                claimUrl,
              });
            }}
            onCancelGift={cancelGift}
            onError={notify}
            completePurchase={(id) => completeGiftPurchase(id, payment.claimToken)}
          />
        </Elements>
      ) : step === 'pay' ? null : (
        <>
          {renderStep()}
          {stepError ? <Text style={[checkoutUi.fieldError, styles.stepError, mobileLayout && { paddingHorizontal: 16 }]}>{stepError}</Text> : null}
          {mobileLayout ? (
            mobileBar
          ) : (
            <GrapejuiceButton
              label="Continue"
              onPress={onContinue}
              variant="filled"
              loading={busy}
              disabled={busy}
              style={[checkoutUi.button, styles.ctaSpacing]}
              textStyle={checkoutUi.buttonText}
            />
          )}
          {!mobileLayout ? (
            <TouchableOpacity
              onPress={cancelGift}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Cancel gift"
              hitSlop={8}
              style={styles.cancelGift}
            >
              <Text style={styles.cancelGiftText}>Cancel gift</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </SystemPage>
  );
}

export function GiftGiveScreen() {
  const mobileLayout = useMobileLayout();
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav hideSearchAndRav={mobileLayout} fillChromeHidden={mobileLayout}>
      <GiftGiveBody />
    </StorefrontChrome>
  );
}

/** Phone: which of the four mockup steps a GiftGive step belongs to. */
export function giftTaskStep(step: string, hasPayment: boolean, customize = true): { index: number; labels: string[] } {
  if (!customize) {
    const labels = ['Amount', 'Send', 'Note', 'Pay'];
    const index =
      step === 'type' || step === 'kids' ? 0 : step === 'send' ? 1 : step === 'note' ? 2 : 3;
    return { index: hasPayment || step !== 'pay' ? index : 2, labels };
  }
  const labels = ['Their family', 'Their box', 'Send', 'Pay'];
  const index =
    step === 'type' || step === 'kids' || step === 'email'
      ? 0
      : step === 'customize'
        ? 1
        : step === 'send' || step === 'note'
          ? 2
          : 3;
  return { index: hasPayment || step !== 'pay' ? index : 2, labels };
}

const kidsHeadStyles = StyleSheet.create({
  head: { paddingHorizontal: mGutter, paddingTop: 24, paddingBottom: 14, gap: 10 },
  h1: { fontSize: 27, lineHeight: 31, letterSpacing: -0.8, color: m.ink, ...mFont(400) },
  lede: { fontSize: 15, lineHeight: 22, color: m.body, ...mFont(300) },
});

const styles = StyleSheet.create({
  footerGap: {
    height: 80,
  },
  topSpacer: { height: spacing.xl },
  section: { marginTop: spacing.md },
  requiredHint: { marginBottom: spacing.xs },
  requiredMark: {
    color: semanticColors.error,
    ...typeface('regular'),
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  stepError: { marginTop: spacing.sm },
  ctaSpacing: { marginTop: spacing.xl },
  addressToggle: { alignSelf: 'flex-start', marginTop: spacing.xs },
  addressToggleText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.brand,
  },
  cancelGift: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  cancelGiftText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
    textDecorationLine: 'underline',
  },
});
