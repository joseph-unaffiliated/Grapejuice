import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

/** Must belong to the same Stripe account/mode as STRIPE_SECRET_KEY; returned to clients with client secrets. */
export const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? '';

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-02-24.acacia' })
  : null;

/**
 * Saves a card for a later off-session charge. Automatic payment methods offered Pix, Klarna and
 * Satispay, which can't be charged that way. Apple Pay / Google Pay ride on `card`; Link is dropped
 * if the account hasn't activated it.
 */
export async function createCardSetupIntent(
  params: Omit<Stripe.SetupIntentCreateParams, 'automatic_payment_methods' | 'payment_method_types'>
): Promise<Stripe.SetupIntent> {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.setupIntents.create({ ...params, payment_method_types: ['card', 'link'] });
  } catch (err) {
    if ((err as { param?: string })?.param !== 'payment_method_types') throw err;
    console.warn('createCardSetupIntent: Link unavailable, card only', (err as Error).message);
    return stripe.setupIntents.create({ ...params, payment_method_types: ['card'] });
  }
}

export function verifyWebhook(rawBody: Buffer, signature: string): Stripe.Event {
  if (!stripe || !webhookSecret) {
    throw new Error('Stripe webhook not configured');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
