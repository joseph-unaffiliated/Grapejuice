import * as logger from './logger';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Signed-out storefront checkout: which account an order belongs to, when the buyer may be
 * signed in afterwards, and when a household's saved card may be charged.
 *
 * Binding rule: never return a sign-in token for an existing account based on email alone.
 */

export function guestHouseholdId(email: string): string {
  return `guest_${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`.slice(0, 140);
}

export function firstNameOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const first = raw.trim().split(/\s+/)[0]?.slice(0, 60);
  return first || undefined;
}

export type CheckoutAccount = {
  uid: string;
  householdId: string;
  /** True when anything was already filed under this email: the buyer gets an emailed link, never a token. */
  accountExisted: boolean;
};

async function guestHouseholdHasHistory(ref: FirebaseFirestore.DocumentReference): Promise<boolean> {
  const snap = await ref.get();
  if (!snap.exists) return false;
  const d = snap.data() ?? {};
  if (d.stripeDefaultPaymentMethodId || d.cardOnFileAt) return true;
  if ((Number(d.giftCreditCents) || 0) > 0 || (Number(d.platformCreditCents) || 0) > 0) return true;
  const orders = await ref.collection('orders').limit(1).get();
  return !orders.empty;
}

/** Make `uid` the owner of the email's guest household and point the profile at it (no-op if it has one). */
async function linkGuestHousehold(
  db: FirebaseFirestore.Firestore,
  uid: string,
  email: string,
  displayName: string | null
): Promise<string> {
  const householdId = guestHouseholdId(email);
  const hhRef = db.doc(`households/${householdId}`);
  const userRef = db.doc(`users/${uid}`);
  return db.runTransaction(async (tx) => {
    const [hhSnap, userSnap] = await Promise.all([tx.get(hhRef), tx.get(userRef)]);
    const profile = userSnap.data();
    const existingHouseholdId = typeof profile?.householdId === 'string' ? profile.householdId : '';
    if (existingHouseholdId && existingHouseholdId !== householdId) {
      const other = await tx.get(db.doc(`households/${existingHouseholdId}`));
      if (other.exists) return existingHouseholdId;
    }
    const now = new Date().toISOString();
    const hh = hhSnap.data() ?? {};
    tx.set(
      hhRef,
      {
        guest: true,
        guestEmail: email,
        name: typeof hh.name === 'string' ? hh.name : 'Our household',
        ownerId: typeof hh.ownerId === 'string' && hh.ownerId ? hh.ownerId : uid,
        memberIds: FieldValue.arrayUnion(uid),
        ...(Array.isArray(hh.childUserIds) ? {} : { childUserIds: [] }),
        ...(hhSnap.exists ? {} : { createdAt: now }),
        updatedAt: now,
      },
      { merge: true }
    );
    tx.set(
      userRef,
      {
        householdId,
        updatedAt: now,
        ...(userSnap.exists
          ? {}
          : {
              uid,
              email,
              displayName,
              role: 'parent',
              onboardingComplete: true,
              boxRevealComplete: true,
              createdAt: now,
            }),
      },
      { merge: true }
    );
    return householdId;
  });
}

/**
 * The account that owns a signed-out checkout for `email`. An existing account keeps its own
 * household; otherwise a passwordless account is created and the email's guest household is
 * linked to it. Never signs anyone in: callers decide from `accountExisted`.
 */
export async function accountForCheckoutEmail(
  db: FirebaseFirestore.Firestore,
  email: string,
  name: string | null
): Promise<CheckoutAccount> {
  const auth = getAuth();
  const firstName = firstNameOf(name);
  let uid: string | null = null;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
  } catch (err) {
    if ((err as { code?: string })?.code !== 'auth/user-not-found') throw err;
  }

  if (uid) {
    const profile = (await db.doc(`users/${uid}`).get()).data();
    const householdId = typeof profile?.householdId === 'string' ? profile.householdId : '';
    if (householdId && (await db.doc(`households/${householdId}`).get()).exists) {
      return { uid, householdId, accountExisted: true };
    }
    return {
      uid,
      householdId: await linkGuestHousehold(db, uid, email, firstName ?? null),
      accountExisted: true,
    };
  }

  const hadHistory = await guestHouseholdHasHistory(db.doc(`households/${guestHouseholdId(email)}`));
  let accountExisted = hadHistory;
  try {
    const created = await auth.createUser({
      email,
      // Must stay false: admin access by staff email requires a verified address.
      emailVerified: false,
      ...(firstName ? { displayName: firstName } : {}),
    });
    uid = created.uid;
    logger.info('accountForCheckoutEmail: created', { hadHistory });
  } catch (err) {
    if ((err as { code?: string })?.code !== 'auth/email-already-exists') throw err;
    uid = (await auth.getUserByEmail(email)).uid;
    accountExisted = true;
  }
  const householdId = await linkGuestHousehold(db, uid, email, firstName ?? null);
  return { uid, householdId, accountExisted };
}

export type SavedCardChargeInput = {
  authedUid: string | null | undefined;
  useSavedCard: unknown;
  householdMemberIds: unknown;
  householdCustomerId: unknown;
  householdPaymentMethodId: unknown;
  /** Customer the payment method is attached to, per Stripe. */
  paymentMethodCustomerId: string | null | undefined;
  /** Customer on the order's PaymentIntent, per Stripe. */
  paymentIntentCustomerId: string | null | undefined;
};

/** Why a saved-card charge is refused, or null when it is allowed. */
export function savedCardChargeDenial(input: SavedCardChargeInput): string | null {
  if (input.useSavedCard !== true) return 'useSavedCard must be true';
  if (!input.authedUid) return 'signed out';
  const members = Array.isArray(input.householdMemberIds) ? input.householdMemberIds : [];
  if (!members.includes(input.authedUid)) return 'not a household member';
  const customer = typeof input.householdCustomerId === 'string' ? input.householdCustomerId : '';
  const pm = typeof input.householdPaymentMethodId === 'string' ? input.householdPaymentMethodId : '';
  if (!customer || !pm) return 'no saved card';
  if (input.paymentMethodCustomerId !== customer) return 'card belongs to another customer';
  if (input.paymentIntentCustomerId !== customer) return 'payment belongs to another customer';
  return null;
}

/** Single-use secret handed to the browser that placed a checkout; only its hash is stored. */
export const CHECKOUT_CLAIM_TTL_MS = 60 * 60 * 1000;

export function mintCheckoutClaim(now: number = Date.now()): {
  claim: string;
  hash: string;
  expiresAt: string;
} {
  const claim = randomBytes(32).toString('base64url');
  return {
    claim,
    hash: createHash('sha256').update(claim).digest('hex'),
    expiresAt: new Date(now + CHECKOUT_CLAIM_TTL_MS).toISOString(),
  };
}

export type CheckoutClaimStatus = 'ok' | 'invalid' | 'used' | 'expired';

export function checkoutClaimStatus(
  order: { checkoutClaimHash?: unknown; checkoutClaimExpiresAt?: unknown; checkoutClaimUsedAt?: unknown },
  claim: unknown,
  now: number = Date.now()
): CheckoutClaimStatus {
  if (typeof claim !== 'string' || claim.length < 32 || claim.length > 128) return 'invalid';
  const stored = typeof order.checkoutClaimHash === 'string' ? order.checkoutClaimHash : '';
  if (!stored) return 'invalid';
  const given = createHash('sha256').update(claim).digest('hex');
  const a = Buffer.from(given, 'hex');
  const b = Buffer.from(stored, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'invalid';
  if (order.checkoutClaimUsedAt) return 'used';
  const expires = typeof order.checkoutClaimExpiresAt === 'string' ? Date.parse(order.checkoutClaimExpiresAt) : NaN;
  if (!Number.isFinite(expires) || expires < now) return 'expired';
  return 'ok';
}
