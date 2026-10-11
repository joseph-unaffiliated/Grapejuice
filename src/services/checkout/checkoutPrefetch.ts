import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { createPilotSetupIntent, type CreatePilotSetupIntentResult } from './createPilotSetupIntent';

/** SetupIntent secrets stay usable far longer, but a stale tab shouldn't reuse one. */
const SETUP_INTENT_TTL_MS = 20 * 60 * 1000;

let stripeKeyLoaded: string | null = null;
let stripePromise: Promise<Stripe | null> | null = null;

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

/** Single use: a confirmed SetupIntent can't be confirmed again. */
export function takeSetupIntent(householdId: string): Promise<CreatePilotSetupIntentResult> {
  const p = pendingSetup;
  pendingSetup = null;
  if (p && p.householdId === householdId && Date.now() - p.at < SETUP_INTENT_TTL_MS) {
    return p.promise.catch(() => createPilotSetupIntent(householdId));
  }
  return createPilotSetupIntent(householdId);
}
