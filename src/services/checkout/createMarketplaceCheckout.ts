import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { BoxLineItem, ShippingAddress } from '../../types/pilot';
import {
  attributionForServer,
  metaServerContext,
  type MetaServerContext,
} from '../analytics/metaPixel';
import type { AttributionSnapshot } from '../../stores/entryContextStore';
import { normalizeUsState, normalizeUsZip } from '../../utils/usAddress';
import { promoForServer, type PromoRequest } from '../promo/promoSession';

export type SavedCardSummary = { brand: string; last4: string };

/**
 * Signed-out checkout only. `token`: a brand-new account was created for the email, and the
 * claim can be exchanged for a session once paid. `email`: the email already had an account,
 * so the server emails a sign-in link instead.
 */
export type CheckoutSignIn =
  | { kind: 'token'; claim: string; householdId: string }
  | { kind: 'email' };

export type CreateMarketplaceCheckoutResult = {
  clientSecret: string | null;
  orderId: string;
  totalCents: number;
  /** `payment` charges at checkout; `setup` saves a card for the lock-day charge. */
  intent?: 'setup' | 'payment' | null;
  status: 'pending' | 'committed' | 'confirmed';
  /** Signed-in buyers only: the household's saved card, offered on the payment step. */
  savedCard?: SavedCardSummary | null;
  signIn?: CheckoutSignIn | null;
};

export type PayWithSavedCardResult =
  | { status: 'confirmed' }
  | { status: 'declined'; message: string };

/** Charge the household's saved card for a pending order. Signed-in buyers only. */
export async function payMarketplaceOrderWithSavedCard(
  householdId: string,
  orderId: string
): Promise<PayWithSavedCardResult> {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<
    { householdId: string; orderId: string; useSavedCard: true },
    PayWithSavedCardResult
  >(functions, 'payMarketplaceOrderWithSavedCard');
  const { data } = await callable({ householdId, orderId, useSavedCard: true });
  return data;
}

type ClaimSignInResult =
  | { status: 'ok'; customToken: string }
  | { status: 'pending' | 'invalid' | 'used' | 'expired' };

/** Exchange a new account's checkout claim for a custom token, retrying while payment settles. */
export async function claimMarketplaceCheckoutSignIn(
  householdId: string,
  orderId: string,
  claim: string
): Promise<string | null> {
  if (!functions) return null;
  const callable = httpsCallable<
    { householdId: string; orderId: string; claim: string },
    ClaimSignInResult
  >(functions, 'claimMarketplaceCheckoutSignIn');
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await callable({ householdId, orderId, claim });
    if (data.status === 'ok') return data.customToken;
    if (data.status !== 'pending') return null;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  return null;
}

export async function createMarketplaceCheckout(
  householdId: string | null,
  shippingAddress: ShippingAddress,
  lineItems: Pick<BoxLineItem, 'itemId' | 'quantity'>[],
  options?: { skipShipStation?: boolean; email?: string }
): Promise<CreateMarketplaceCheckoutResult> {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  // Firestore / callables reject undefined — omit empty optional line2.
  const address: ShippingAddress = {
    name: shippingAddress.name.trim(),
    line1: shippingAddress.line1.trim(),
    city: shippingAddress.city.trim(),
    stateProvince: normalizeUsState(shippingAddress.stateProvince) ?? shippingAddress.stateProvince.trim(),
    postalCode: normalizeUsZip(shippingAddress.postalCode) ?? shippingAddress.postalCode.trim(),
    country: 'US' as const,
  };
  const line2 = shippingAddress.line2?.trim();
  if (line2) address.line2 = line2;

  const callable = httpsCallable<
    {
      householdId?: string;
      email?: string;
      shippingAddress: ShippingAddress;
      lineItems: Pick<BoxLineItem, 'itemId' | 'quantity'>[];
      skipShipStation?: boolean;
      meta?: MetaServerContext;
      attribution?: AttributionSnapshot;
      promo?: PromoRequest;
    },
    CreateMarketplaceCheckoutResult
  >(functions, 'createMarketplaceCheckout');
  const promo = promoForServer();
  const { data } = await callable({
    ...(householdId ? { householdId } : {}),
    ...(options?.email ? { email: options.email } : {}),
    shippingAddress: address,
    lineItems,
    skipShipStation: options?.skipShipStation,
    meta: metaServerContext(),
    attribution: attributionForServer(),
    ...(promo ? { promo } : {}),
  });
  return data;
}
