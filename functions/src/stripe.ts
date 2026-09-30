import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

/** Must belong to the same Stripe account/mode as STRIPE_SECRET_KEY; returned to clients with client secrets. */
export const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? '';

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-02-24.acacia' })
  : null;

export function verifyWebhook(rawBody: Buffer, signature: string): Stripe.Event {
  if (!stripe || !webhookSecret) {
    throw new Error('Stripe webhook not configured');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
