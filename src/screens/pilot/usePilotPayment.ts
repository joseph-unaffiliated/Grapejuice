import { useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import { useSession } from '../../hooks/useSession';
import { householdsService } from '../../services/firestore/households';
import { getStripePromise, peekSavedCard, releaseSetupIntent, takeSetupIntent } from '../../services/checkout/checkoutPrefetch';
import { getSavedCardSummary, type SavedCardSummary } from '../../services/checkout/createMarketplaceCheckout';
import { commitPilotBox } from '../../services/checkout/commitPilotBox';
import { formatCatalogDollars, formatDollars } from '../../services/box/buildDefaultBox';
import { clearStoredCheckoutAddress, useCheckoutDraft } from '../main/checkout/useCheckoutDraft';
import { useAddressDeliverability } from '../main/checkout/useAddressDeliverability';
import type { ShippingAddress } from '../../types/pilot';
import type { ShippingAddressFieldErrors } from '../../utils/formValidation';

export type StripeHandles = { stripe: Stripe; elements: StripeElements };

type CardStamp = { at?: string; pm?: string };

function cardChanged(hh: { cardOnFileAt?: string; stripeDefaultPaymentMethodId?: string } | null, before: CardStamp): boolean {
  if (!hh?.cardOnFileAt) return false;
  if (!before.at && !before.pm) return true;
  if (before.pm && hh.stripeDefaultPaymentMethodId && hh.stripeDefaultPaymentMethodId !== before.pm) return true;
  return !!before.at && hh.cardOnFileAt !== before.at;
}

function money(cents: number): string {
  return cents % 100 === 0 ? formatCatalogDollars(cents) : formatDollars(cents);
}

/**
 * Shipping address and card for a family whose box isn't checked out yet. Joining saves the card
 * (SetupIntent), then the invite hook enrolls and commits the box, so a "yes" is a placed order.
 * `enabled` is false for preview tokens and for boxes that are already ordered.
 */
export function usePilotPayment({ enabled }: { enabled: boolean }) {
  const { household, refresh } = useSession();
  const householdId = household?.id;
  const draft = useCheckoutDraft(householdId);
  const [fieldErrors, setFieldErrors] = useState<ShippingAddressFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const onAddressChange = (patch: Partial<ShippingAddress>) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch)) delete next[key as keyof ShippingAddressFieldErrors];
      return next;
    });
    setFormError(null);
    draft.updateAddress(patch);
  };
  const deliverability = useAddressDeliverability(draft.address, onAddressChange);

  const stripeKey = (Constants.expoConfig?.extra as Record<string, string | undefined> | undefined)?.stripePublishableKey ?? '';
  const stripePromise = useMemo(() => getStripePromise(stripeKey), [stripeKey]);
  const cardOnFile = !!household?.cardOnFileAt;
  const [replacing, setReplacing] = useState(false);
  const needsCard = enabled && (!cardOnFile || replacing);
  const [secret, setSecret] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const stripeRef = useRef<StripeHandles | null>(null);

  useEffect(() => {
    if (!needsCard || secret || !householdId || !stripeKey) return;
    let alive = true;
    takeSetupIntent(householdId)
      .then((r) => {
        if (alive && r.clientSecret) setSecret(r.clientSecret);
      })
      .catch((e: unknown) => alive && setCardError(e instanceof Error ? e.message : 'Could not load the card form.'));
    return () => {
      alive = false;
    };
  }, [needsCard, secret, householdId, stripeKey]);

  const [savedCard, setSavedCard] = useState<SavedCardSummary | null>(null);
  useEffect(() => {
    if (!enabled || !cardOnFile || !householdId) return;
    let alive = true;
    void (peekSavedCard(householdId) ?? getSavedCardSummary(householdId))
      .then((card) => alive && setSavedCard(card))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [enabled, cardOnFile, householdId, household?.stripeDefaultPaymentMethodId]);

  /** Format check, then the deliverability check. Shows field errors; true when the address is good. */
  const validateShipping = async (): Promise<boolean> => {
    const local = draft.validateAddress();
    if (!local.ok) {
      setFieldErrors(local.fields);
      setFormError(local.message);
      return false;
    }
    const verdict = await deliverability.verify();
    if (verdict.ok) return true;
    setFieldErrors(verdict.fields);
    setFormError(verdict.message);
    return false;
  };

  /** Waits for the Stripe webhook to record the card on the household. */
  const waitForCard = async (before: CardStamp): Promise<boolean> => {
    if (!householdId) return false;
    for (let i = 0; i < 25; i += 1) {
      await refresh({ silent: true });
      if (cardChanged(await householdsService.get(householdId), before)) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  };

  /** Confirms the card form when one is needed. Returns an error to show, or null when the card is saved. */
  const saveCard = async (returnUrl: string): Promise<string | null> => {
    if (!needsCard) return null;
    const handles = stripeRef.current;
    if (!handles) return 'The card form is still loading. Try again in a moment.';
    const before: CardStamp = { at: household?.cardOnFileAt, pm: household?.stripeDefaultPaymentMethodId };
    const { error } = await handles.stripe.confirmSetup({
      elements: handles.elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    });
    if (error) return error.message ?? 'We couldn’t save your card. Try again.';
    if (householdId) releaseSetupIntent(householdId);
    setSecret(null);
    setReplacing(false);
    return (await waitForCard(before)) ? null : 'We couldn’t confirm your card yet. Try again in a moment.';
  };

  const commitBox = async () => {
    if (!householdId) throw new Error('Your account isn’t ready yet. Refresh and try again.');
    await commitPilotBox(householdId, draft.normalizedAddress());
    clearStoredCheckoutAddress();
  };

  return {
    enabled,
    address: draft.address,
    onAddressChange,
    fieldErrors,
    formError,
    deliverability,
    totalLabel: draft.loading && !draft.lineItems.length ? null : money(draft.total),
    stripePromise,
    secret,
    stripeRef,
    cardOnFile,
    savedCard,
    replacing,
    setReplacing,
    needsCard,
    cardComplete,
    setCardComplete,
    cardError,
    validateShipping,
    saveCard,
    waitForCard,
    commitBox,
  };
}

export type PilotPayment = ReturnType<typeof usePilotPayment>;
