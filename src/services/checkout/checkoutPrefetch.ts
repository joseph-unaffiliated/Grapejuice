import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { createPilotSetupIntent, type CreatePilotSetupIntentResult } from './createPilotSetupIntent';
import { getSavedCardSummary, type SavedCardSummary } from './createMarketplaceCheckout';

/** SetupIntent secrets stay usable far longer, but a stale tab shouldn't reuse one. */
const SETUP_INTENT_TTL_MS = 20 * 60 * 1000;

let stripeKeyLoaded: string | null = null;
let stripePromise: Promise<Stripe | null> | null = null;

function stripePublishableKey(): string {
  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  return extra?.stripePublishableKey ?? '';
}

/** One Stripe.js load per key, shared by My Box (warm-up) and Checkout. */
export function getStripePromise(key: string): Promise<Stripe | null> | null {
  if (!key) return null;
  if (stripeKeyLoaded !== key || !stripePromise) {
    stripeKeyLoaded = key;
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

type PendingSetup = { householdId: string; at: number; promise: Promise<CreatePilotSetupIntentResult> };
let pendingSetup: PendingSetup | null = null;

/** Starts the SetupIntent Checkout will need so the card form is ready on arrival. */
export function prefetchSetupIntent(householdId: string): void {
  if (pendingSetup && pendingSetup.householdId === householdId && Date.now() - pendingSetup.at < SETUP_INTENT_TTL_MS) return;
  const promise = createPilotSetupIntent(householdId);
  promise.catch(() => {
    if (pendingSetup?.promise === promise) pendingSetup = null;
  });
  pendingSetup = { householdId, at: Date.now(), promise };
}

/**
 * Reuse the in-flight (or finished, unconfirmed) SetupIntent.
 * A confirmed intent is released by `releaseSetupIntent` — confirming twice fails.
 * The secret is not tied to the box total (the charge happens later, off-session),
 * so editing the box does not throw it away.
 */
export function takeSetupIntent(householdId: string): Promise<CreatePilotSetupIntentResult> {
  const p = pendingSetup;
  if (p && p.householdId === householdId && Date.now() - p.at < SETUP_INTENT_TTL_MS) {
    return p.promise.catch(() => {
      if (pendingSetup?.promise === p.promise) pendingSetup = null;
      prefetchSetupIntent(householdId);
      return pendingSetup && pendingSetup.householdId === householdId
        ? pendingSetup.promise
        : createPilotSetupIntent(householdId);
    });
  }
  prefetchSetupIntent(householdId);
  if (pendingSetup && pendingSetup.householdId === householdId) return pendingSetup.promise;
  return createPilotSetupIntent(householdId);
}

/** Call once the card is confirmed so the next visit mints a fresh SetupIntent. */
export function releaseSetupIntent(householdId: string): void {
  if (pendingSetup?.householdId === householdId) pendingSetup = null;
}

type PendingCard = {
  householdId: string;
  paymentMethodId: string;
  at: number;
  promise: Promise<SavedCardSummary | null>;
};
let pendingCard: PendingCard | null = null;

/** Brand and last four, so the saved-card line is filled in when checkout opens. */
export function prefetchSavedCard(householdId: string, paymentMethodId?: string): void {
  const pm = paymentMethodId ?? '';
  if (
    pendingCard &&
    pendingCard.householdId === householdId &&
    pendingCard.paymentMethodId === pm &&
    Date.now() - pendingCard.at < SETUP_INTENT_TTL_MS
  ) {
    return;
  }
  const promise = getSavedCardSummary(householdId).catch(() => null);
  promise.catch(() => {
    if (pendingCard?.promise === promise) pendingCard = null;
  });
  pendingCard = { householdId, paymentMethodId: pm, at: Date.now(), promise };
}

export function peekSavedCard(householdId: string): Promise<SavedCardSummary | null> | null {
  if (!pendingCard || pendingCard.householdId !== householdId) return null;
  if (Date.now() - pendingCard.at >= SETUP_INTENT_TTL_MS) return null;
  return pendingCard.promise;
}

/**
 * Warm Stripe.js, the SetupIntent (no card yet) or the saved-card lookup (card on file)
 * as soon as a draft box is on screen. Safe to call on every box edit.
 *
 * A SetupIntent only saves a card — the box is charged off-session at lock — so a total
 * change does not invalidate the secret. Checkout reads line items from the live draft
 * cache, which is rewritten on every edit, so the summary total stays current.
 * `totalCents` is part of the call so a box edit re-runs the warmup; the secret is kept.
 */
export function warmBoxCheckout(input: {
  householdId: string;
  cardOnFile: boolean;
  totalCents: number;
  paymentMethodId?: string;
}): void {
  if (!input.householdId || Platform.OS !== 'web') return;
  const key = stripePublishableKey();
  if (key) void getStripePromise(key)?.catch(() => undefined);
  if (input.cardOnFile) prefetchSavedCard(input.householdId, input.paymentMethodId);
  else prefetchSetupIntent(input.householdId);
}
