import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Platform, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import { orderSubtotalCents } from '../../services/box/pricing';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { usePromo } from '../../services/promo/usePromo';
import { useBoxLockPassed } from '../../hooks/useBoxLockDay';
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
import { GiftCreditKidsField, GiftPathCards } from './GiftGiveForm';
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

/** `box` is the curated box editor, its own route between `email` and `note`. */
type FlowTarget = GiftStep | 'box';

function stepAfter(step: GiftStep, path: GiftPath | null, signedIn: boolean): FlowTarget {
  switch (step) {
    case 'type':
      return 'kids';
    case 'kids':
      return path === 'customize' ? (signedIn ? 'box' : 'email') : 'note';
    case 'email':
      return 'box';
    case 'note':
      return 'send';
    case 'send':
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
  if (!path) return 'type';
  if (step === 'email' && path !== 'customize') return 'kids';
  const afterBox = step === 'note' || step === 'send' || step === 'pay';
  if (afterBox && path === 'customize' && !hasLineItems) return 'box';
  if (step === 'pay' && !hasPayment) return 'send';
  return step;
}

function giftStepUrl(step: GiftStep): string {
  return step === 'type' ? GIFT_GIVE_PATH : `${GIFT_GIVE_PATH}?step=${step}`;
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
  /** Chose a path on an earlier page (e.g. /gift CTAs): skip the type step. */
  const skippedType = useRef(!params?.step && !!params?.initialGiftPath);
  const step: GiftStep =
    params?.step ?? (params?.autoStartPayment ? 'send' : skippedType.current ? 'kids' : 'type');

  const [values, setValues] = useState<GiftGiveFormValues>(() => {
    const base: GiftGiveFormValues = restored
      ? { ...restored, giftPath: entryGiftPath }
      : { recipientEmail: '', giverName: '', message: '', giftPath: entryGiftPath };
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

  const giftPath = values.giftPath;
  const customize = giftPath === 'customize';
  const boxesClosed = useBoxLockPassed();
  const amountCents = customize
    ? orderSubtotalCents(lineItems ?? [], listBoxCentsForKids(Math.max(1, childDrafts.length)))
    : listBoxCentsForKids(values.creditKids ?? 1);
  const promo = usePromo(amountCents);
  /** Curated path collects the giver's email before the box; ask again only if we don't have it. */
  const askGiverEmailOnSend =
    !isAuthenticated && !(customize && isValidEmail(values.giverEmail?.trim() ?? ''));

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
        await useAuthStore.getState().signInWithToken(result.customToken, { stayOnSurface: true });
      }
    } catch (e) {
      console.warn('[gift] giver sign-in skipped', e);
    }
  };

  const continueFromType = () => {
    if (!giftPath) {
      setStepError('Choose one to continue.');
      revealField(pathRef.current, { focus: false });
      return;
    }
    goTo(stepAfter('type', giftPath, isAuthenticated));
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
      if (askGiverEmailOnSend) await signInGiver(giverEmail);

      const form: GiftGiveFormValues = {
        ...values,
        recipientEmail,
        giverEmail: giverEmail || undefined,
        shippingAddress: address,
      };
      const signedIn = useAuthStore.getState().isAuthenticated;
      const key = JSON.stringify([form, childDrafts, lineItems, amountCents, signedIn, promo.request() ?? null]);
      if (payment?.key === key) {
        goTo('pay');
        return;
      }
      const result = await startGiftPurchase({
        form,
        customize,
        lineItems: customize ? lineItems : undefined,
        childAgeGroups: customize ? childDrafts.map((c) => c.ageGroup) : undefined,
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
      goTo('pay', form);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Try again.';
      notify('Could not start payment', /failed-precondition|Stripe is not configured/i.test(msg)
        ? 'Payments are not configured yet. Ask the team to enable Stripe.'
        : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onContinue = () => {
    switch (step) {
      case 'type':
        continueFromType();
        return;
      case 'kids':
        recordGiftFunnelStep('family', { path: giftPath });
        goTo(stepAfter('kids', giftPath, isAuthenticated));
        return;
      case 'email':
        void continueFromEmail();
        return;
      case 'note':
        goTo('send');
        return;
      case 'send':
        void continueFromSend();
        return;
      case 'pay':
        return;
    }
  };

  const cancelGift = () => {
    cancelledRef.current = true;
    useGiftIntentStore.getState().clear();
    setPayment(null);
    goHome();
  };

  const renderStep = () => {
    switch (step) {
      case 'type':
        return (
          <>
            <Text style={checkoutUi.title}>Send a gift</Text>
            <Text style={checkoutUi.lead}>Two ways to give. Choose one.</Text>
            <View ref={pathRef} style={styles.section}>
              <GiftPathCards
                giftPath={giftPath}
                onChange={(path) => patchValues({ giftPath: path })}
                boxesClosed={boxesClosed}
                hasError={!!stepError}
              />
            </View>
          </>
        );
      case 'kids':
        return (
          <>
            <Text style={checkoutUi.title}>{customize ? 'Every box is unique' : 'Their family'}</Text>
            <Text style={checkoutUi.lead}>
              {customize
                ? 'Tell us who we’re building for and we’ll pick books and presents that are age-appropriate.'
                : 'How many kids are in their family? The credit covers a Hanukkah box for all of them.'}
            </Text>
            <View style={checkoutUi.divider} />
            {customize ? (
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
  return (
    <SystemPage
      narrow
      footer={
        <>
          <View style={styles.footerGap} />
          <StorefrontFooter />
        </>
      }
    >
      <View ref={topRef} style={styles.topSpacer} />
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
          {stepError ? <Text style={[checkoutUi.fieldError, styles.stepError]}>{stepError}</Text> : null}
          <GrapejuiceButton
            label="Continue"
            onPress={onContinue}
            variant="filled"
            loading={submitting || deliverability.checking}
            disabled={submitting || deliverability.checking}
            style={[checkoutUi.button, styles.ctaSpacing]}
            textStyle={checkoutUi.buttonText}
          />
          {step !== 'type' ? (
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
