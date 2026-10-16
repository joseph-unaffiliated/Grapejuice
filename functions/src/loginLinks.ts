import * as logger from './logger';
import { onCall, HttpsError } from './sentry';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { sendEmail } from './email';
import { appOrigin, emailHash, recordInventoryEmailClick, sha256Hex, VISITOR_ID_RE } from './guestSessions';
import { requestIp } from './geo';
import { metaContextFromCallable, sendMetaEvent } from './metaCapi';
import { accountForCheckoutEmail, firstNameOf, guestHouseholdId } from './checkoutAccount';
import { loginTokenStatus, ORDER_TOKEN_RETAIN_MS, ORDER_TOKEN_TTL_MS } from './loginTokenRules';
import {
  checkLoginCode,
  clientStatusFor,
  generateLoginCode,
  hashLoginCode,
  LOGIN_CODE_TTL_MS,
  normalizeLoginCode,
  spacedLoginCode,
} from './loginCodeRules';

/**
 * Passwordless accounts for the box builder's email gate, plus emailed login links.
 *
 * Collections (client access denied in firestore.rules; functions only):
 *   loginTokens/{sha256}   single-use login links; only the hash is stored
 *   rateLimits/{sha256}    fixed-window counters keyed by email / IP hash
 *
 * Custom tokens need iam.serviceAccounts.signBlob: grant the functions runtime service account
 * "Service Account Token Creator" on itself (see docs/LOGIN_LINKS.md).
 */

/** Save-this-box links ride along with a fresh box, so they live longer than plain sign-in links. */
const SAVE_BOX_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_TOKEN_TTL_MS = 60 * 60 * 1000;
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Low-stock / swapped emails go out daily; a week covers anyone who opens one late. */
const INVENTORY_ALERT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_LIMIT_PER_WINDOW = 6;
const IP_LIMIT_PER_WINDOW = 30;

type LoginPurpose = 'save-box' | 'login' | 'invite' | 'order' | 'inventory-alert';

export const SET_PASSWORD_PATH = '/account/set-password';
export const CONNECT_GOOGLE_PATH = '/account/connect-google';

export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') throw new HttpsError('invalid-argument', 'Email required.');
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  return email;
}

/** Only same-site paths; anything else falls back to the default destination. */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const next = raw.trim();
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.length > 200) {
    return null;
  }
  return next;
}

export async function hitRateLimit(
  db: FirebaseFirestore.Firestore,
  key: string,
  limit: number,
  now: number
): Promise<boolean> {
  const ref = db.doc(`rateLimits/${sha256Hex(key)}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const windowStart = data?.windowStart instanceof Timestamp ? data.windowStart.toMillis() : 0;
    const expiresAt = Timestamp.fromMillis(now + RATE_WINDOW_MS);
    if (!windowStart || now - windowStart >= RATE_WINDOW_MS) {
      tx.set(ref, { windowStart: Timestamp.fromMillis(now), count: 1, expiresAt });
      return false;
    }
    const count = typeof data?.count === 'number' ? data.count : 0;
    if (count >= limit) return true;
    tx.set(ref, { count: count + 1, expiresAt }, { merge: true });
    return false;
  });
}

/** `scope` keeps separate counters per flow, so gift checkout retries don't use up the email gate's budget. */
export async function enforceRateLimits(
  db: FirebaseFirestore.Firestore,
  email: string | null,
  rawRequest: unknown,
  scope = ''
): Promise<void> {
  const now = Date.now();
  const ip = requestIp(rawRequest);
  const [ipLimited, emailLimited] = await Promise.all([
    ip ? hitRateLimit(db, `${scope}ip:${ip}`, IP_LIMIT_PER_WINDOW, now) : Promise.resolve(false),
    email ? hitRateLimit(db, `${scope}email:${email}`, EMAIL_LIMIT_PER_WINDOW, now) : Promise.resolve(false),
  ]);
  if (ipLimited || emailLimited) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Try again later.');
  }
}

const TOKEN_TTL_MS: Record<LoginPurpose, number> = {
  'save-box': SAVE_BOX_TOKEN_TTL_MS,
  login: LOGIN_TOKEN_TTL_MS,
  invite: INVITE_TOKEN_TTL_MS,
  order: ORDER_TOKEN_TTL_MS,
  'inventory-alert': INVENTORY_ALERT_TOKEN_TTL_MS,
};

async function mintLoginToken(
  db: FirebaseFirestore.Firestore,
  input: {
    /** Null only for invite tokens: the account is created when the invitee clicks. */
    uid: string | null;
    email: string;
    purpose: LoginPurpose;
    next: string | null;
    visitorId: string | null;
    invitePath?: string;
    orderPath?: string;
    emailLogId?: string;
  }
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const signInUntil = now + TOKEN_TTL_MS[input.purpose];
  const isOrder = input.purpose === 'order';
  await db.doc(`loginTokens/${sha256Hex(token)}`).set({
    uid: input.uid,
    emailHash: emailHash(input.email),
    purpose: input.purpose,
    next: input.next,
    visitorId: input.visitorId,
    invitePath: input.invitePath ?? null,
    createdAt: Timestamp.fromMillis(now),
    // `expiresAt` drives the daily purge; order links stay readable past sign-in expiry to prefill the email.
    expiresAt: Timestamp.fromMillis(isOrder ? signInUntil + ORDER_TOKEN_RETAIN_MS : signInUntil),
    usedAt: null,
    ...(input.emailLogId ? { emailLogId: input.emailLogId } : {}),
    ...(isOrder
      ? {
          signInUntil: Timestamp.fromMillis(signInUntil),
          orderPath: input.orderPath ?? null,
          emailHint: input.email,
          useCount: 0,
        }
      : {}),
  });
  return token;
}

/**
 * Signed "View my order" link for an order confirmation email. The email goes to the order's
 * account, so the link signs the reader in as that account and opens Orders.
 */
export async function mintOrderViewUrl(
  db: FirebaseFirestore.Firestore,
  input: { uid: string; email: string; householdId: string; orderId: string }
): Promise<string> {
  const next = '/orders';
  const token = await mintLoginToken(db, {
    uid: input.uid,
    email: input.email,
    purpose: 'order',
    next,
    visitorId: null,
    orderPath: `households/${input.householdId}/orders/${input.orderId}`,
  });
  return loginUrl(token, next);
}

/** `order_url` for confirmation emails; plain Orders link when the order has no account or minting fails. */
export async function orderViewUrl(
  db: FirebaseFirestore.Firestore,
  input: { uid: string | null | undefined; email: string; householdId: string; orderId: string }
): Promise<string> {
  const fallback = `${appOrigin()}/orders?utm_source=transactional&utm_medium=email`;
  if (!input.uid) return fallback;
  try {
    return await mintOrderViewUrl(db, { ...input, uid: input.uid });
  } catch (err) {
    logger.error('orderViewUrl: could not mint order link', { err: String(err) });
    return fallback;
  }
}

/**
 * Signed links for the inventory emails ("Secure my box" → checkout, "Customize my box" → My Box).
 * They go to the household owner's own address, so the link signs that account in. Single use,
 * so each button gets its own token.
 */
export async function mintInventoryAlertUrl(
  db: FirebaseFirestore.Firestore,
  input: {
    uid: string;
    email: string;
    next: '/checkout' | '/box';
    emailLogId?: string;
    /** Extra query params (UTMs) so the order's client attribution names the email. */
    query?: Record<string, string>;
  }
): Promise<string> {
  const { next } = input;
  const token = await mintLoginToken(db, {
    uid: input.uid,
    email: input.email,
    purpose: 'inventory-alert',
    next,
    visitorId: null,
    emailLogId: input.emailLogId,
  });
  return loginUrl(token, next, input.query);
}

/** Accept-invite link for a collaborator invite email (createPartnerInvite). */
export async function mintInviteAcceptUrl(
  db: FirebaseFirestore.Firestore,
  input: { householdId: string; inviteId: string; email: string }
): Promise<string> {
  const existing = await getAuth()
    .getUserByEmail(input.email)
    .catch(() => null);
  const token = await mintLoginToken(db, {
    uid: existing?.uid ?? null,
    email: input.email,
    purpose: 'invite',
    next: '/box',
    visitorId: null,
    invitePath: `households/${input.householdId}/partnerInvites/${input.inviteId}`,
  });
  return loginUrl(token, '/box');
}

/**
 * Join the inviting household. Returns the invitee's uid, creating a passwordless account
 * when the address has none (clicking the emailed link proves the inbox is theirs).
 */
async function acceptInviteFromLink(
  db: FirebaseFirestore.Firestore,
  invitePath: string,
  tokenEmailHash: string
): Promise<{ uid: string; accountCreated: boolean; email: string } | null> {
  const inviteRef = db.doc(invitePath);
  const invite = (await inviteRef.get()).data();
  const email = String(invite?.invitedEmail ?? '').trim().toLowerCase();
  if (!invite || !email || emailHash(email) !== tokenEmailHash) return null;
  if (invite.status !== 'pending' && invite.status !== 'accepted') return null;

  const auth = getAuth();
  const existing = await auth.getUserByEmail(email).catch(() => null);
  const accountCreated = !existing;
  const user = existing ?? (await auth.createUser({ email, emailVerified: true }));
  if (invite.status === 'accepted') return { uid: user.uid, accountCreated: false, email };

  const householdId = String(invite.householdId);
  const now = new Date().toISOString();
  const userRef = db.doc(`users/${user.uid}`);
  const profileExists = (await userRef.get()).exists;
  await db.doc(`households/${householdId}`).update({
    memberIds: FieldValue.arrayUnion(user.uid),
    updatedAt: now,
  });
  await userRef.set(
    {
      householdId,
      onboardingComplete: true,
      boxRevealComplete: true,
      updatedAt: now,
      ...(profileExists
        ? {}
        : { uid: user.uid, email, displayName: null, role: 'parent', createdAt: now }),
    },
    { merge: true }
  );
  await inviteRef.update({ status: 'accepted', acceptedByUid: user.uid });
  return { uid: user.uid, accountCreated, email };
}

function loginUrl(token: string, next: string | null, query?: Record<string, string>): string {
  const params = new URLSearchParams({ ...query, token });
  if (next) params.set('next', next);
  return `${appOrigin()}/login?${params.toString()}`;
}

/**
 * Email a login link. Each button gets its own single-use token so clicking one does not burn
 * the others.
 */
async function sendLoginLinkEmail(
  db: FirebaseFirestore.Firestore,
  input: { uid: string; email: string; purpose: LoginPurpose; next: string | null; visitorId: string | null; firstName?: string }
): Promise<'sent' | 'skipped'> {
  const defaultNext = input.purpose === 'save-box' ? '/box' : input.next;
  const [loginToken, passwordToken, googleToken] = await Promise.all([
    mintLoginToken(db, { ...input, next: defaultNext }),
    mintLoginToken(db, { ...input, next: SET_PASSWORD_PATH }),
    mintLoginToken(db, { ...input, next: CONNECT_GOOGLE_PATH }),
  ]);
  return sendEmail({
    to: input.email,
    template: 'login-link',
    data: {
      variant: input.purpose,
      displayName: input.firstName ?? '',
      login_url: loginUrl(loginToken, defaultNext),
      set_password_url: loginUrl(passwordToken, SET_PASSWORD_PATH),
      google_url: loginUrl(googleToken, CONNECT_GOOGLE_PATH),
    },
  });
}

/**
 * A gate account nobody ever finished: never verified, no password or Google, nothing ordered,
 * gifted, saved, or shared. Returns its households when it qualifies, else null.
 */
async function unfinishedGateAccountHouseholds(
  db: FirebaseFirestore.Firestore,
  user: UserRecord
): Promise<FirebaseFirestore.DocumentReference[] | null> {
  if (user.disabled || user.emailVerified || user.providerData.length > 0 || user.passwordHash) return null;
  if (user.customClaims && Object.keys(user.customClaims).length > 0) return null;

  const [households, gifts] = await Promise.all([
    db.collection('households').where('memberIds', 'array-contains', user.uid).get(),
    db.collection('giftInvites').where('giverUid', '==', user.uid).limit(1).get(),
  ]);
  if (!gifts.empty) return null;

  for (const hh of households.docs) {
    const d = hh.data();
    const members = Array.isArray(d.memberIds) ? d.memberIds : [];
    const kids = Array.isArray(d.childUserIds) ? d.childUserIds : [];
    if (members.length !== 1 || kids.length > 0 || d.ownerId !== user.uid) return null;
    if (d.cardOnFileAt || d.stripeDefaultPaymentMethodId) return null;
    if ((Number(d.giftCreditCents) || 0) > 0 || (Number(d.platformCreditCents) || 0) > 0) return null;
    const [orders, received] = await Promise.all([
      hh.ref.collection('orders').limit(1).get(),
      hh.ref.collection('receivedGifts').limit(1).get(),
    ]);
    if (!orders.empty || !received.empty) return null;
  }
  return households.docs.map((hh) => hh.ref);
}

/**
 * Signed-out gift checkout: the uid that owns gifts bought with this email. Existing accounts are
 * reused as-is; otherwise a passwordless one is created. Never signs anyone in — the giver logs in
 * later with an emailed link, so typing someone else's email only files the gift under them.
 */
export async function giverUidForEmail(email: string, name: string | null): Promise<string> {
  const auth = getAuth();
  try {
    return (await auth.getUserByEmail(email)).uid;
  } catch (err) {
    if ((err as { code?: string })?.code !== 'auth/user-not-found') throw err;
  }
  const firstName = firstNameOf(name);
  try {
    const created = await auth.createUser({
      email,
      // Must stay false: admin access by staff email requires a verified address.
      emailVerified: false,
      ...(firstName ? { displayName: firstName } : {}),
    });
    logger.info('giverUidForEmail: created');
    return created.uid;
  } catch (err) {
    if ((err as { code?: string })?.code !== 'auth/email-already-exists') throw err;
    return (await auth.getUserByEmail(email)).uid;
  }
}

export type RevealBoxWithEmailResult =
  | { status: 'created'; customToken: string }
  | { status: 'existing' };

/**
 * Box builder email gate (src/screens/onboarding/RevealEmailScreen.tsx). Unauthenticated.
 * - New email: create a passwordless account and return a custom token.
 * - Unfinished gate account (see unfinishedGateAccountHouseholds): erase it, then same as new.
 * - Any other existing account: email a link that signs in and saves this box. Never returns a
 *   token, so typing someone else's email cannot sign you into their account.
 */
export const revealBoxWithEmail = onCall(
  { memory: '512MiB' },
  async (request): Promise<RevealBoxWithEmailResult> => {
    const data = (request.data ?? {}) as { email?: unknown; visitorId?: unknown; name?: unknown };
    const email = normalizeEmail(data.email);
    const visitorId =
      typeof data.visitorId === 'string' && VISITOR_ID_RE.test(data.visitorId) ? data.visitorId : null;
    const firstName = firstNameOf(data.name);
    const db = getFirestore();
    await enforceRateLimits(db, email, request.rawRequest);

    if (visitorId) {
      await db
        .doc(`guestSessions/${visitorId}`)
        .set({ gateEmailHash: emailHash(email), gateEmailAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    const meta = metaContextFromCallable(request);
    if (!meta.skip) {
      void sendMetaEvent({
        eventName: 'BoxEmail',
        eventId: meta.eventId ?? `boxemail_${randomBytes(8).toString('hex')}`,
        context: meta,
        user: { email },
        customData: { content_name: 'Hanukkah box' },
      }).catch(() => undefined);
    }

    const auth = getAuth();
    let existing: { uid: string; displayName?: string } | null = null;
    try {
      const user = await auth.getUserByEmail(email);
      existing = { uid: user.uid, displayName: user.displayName };
      const unfinished = await unfinishedGateAccountHouseholds(db, user);
      if (unfinished) {
        // Start over under a new uid so no other device signed into the old account sees this box.
        await Promise.all([
          ...unfinished.map((ref) => db.recursiveDelete(ref)),
          db.recursiveDelete(db.doc(`users/${user.uid}`)),
        ]);
        await auth.deleteUser(user.uid);
        existing = null;
        logger.info('revealBoxWithEmail: replaced unfinished account');
      }
    } catch (err) {
      if ((err as { code?: string })?.code !== 'auth/user-not-found') throw err;
    }

    if (!existing) {
      try {
        const created = await auth.createUser({
          email,
          // Must stay false: admin access by staff email requires a verified address.
          emailVerified: false,
          ...(firstName ? { displayName: firstName } : {}),
        });
        const customToken = await auth.createCustomToken(created.uid, { via: 'gate' });
        logger.info('revealBoxWithEmail: created');
        return { status: 'created', customToken };
      } catch (err) {
        if ((err as { code?: string })?.code !== 'auth/email-already-exists') throw err;
        const user = await auth.getUserByEmail(email);
        existing = { uid: user.uid, displayName: user.displayName };
      }
    }

    if (existing) {
      try {
        await sendLoginLinkEmail(db, {
          uid: existing.uid,
          email,
          purpose: 'save-box',
          next: '/box',
          visitorId,
          firstName: firstNameOf(existing.displayName) ?? firstName,
        });
      } catch (err) {
        logger.error('revealBoxWithEmail: login link email failed', err);
      }
    }
    logger.info('revealBoxWithEmail: existing');
    return { status: 'existing' };
  }
);

export type SignInGiftGiverResult =
  | { status: 'created'; customToken: string }
  | { status: 'existing' };

/**
 * Gift flow email step (src/screens/gift/GiftGiveScreen.web.tsx). Unauthenticated.
 * - New email: create a passwordless account that skips box onboarding and return a custom token.
 *   They get back in with an emailed login link (or set a password / Google later).
 * - Existing account: no token (typing someone else's email must not sign you in). The gift
 *   still files under that account via purchasePilotGift's guest giverEmail.
 */
export const signInGiftGiver = onCall(
  { memory: '512MiB' },
  async (request): Promise<SignInGiftGiverResult> => {
    const data = (request.data ?? {}) as { email?: unknown; name?: unknown };
    const email = normalizeEmail(data.email);
    const firstName = firstNameOf(data.name);
    const db = getFirestore();
    await enforceRateLimits(db, email, request.rawRequest, 'giftsignin:');

    const auth = getAuth();
    try {
      await auth.getUserByEmail(email);
      logger.info('signInGiftGiver: existing');
      return { status: 'existing' };
    } catch (err) {
      if ((err as { code?: string })?.code !== 'auth/user-not-found') throw err;
    }

    let uid: string;
    try {
      const created = await auth.createUser({
        email,
        // Must stay false: admin access by staff email requires a verified address.
        emailVerified: false,
        ...(firstName ? { displayName: firstName } : {}),
      });
      uid = created.uid;
    } catch (err) {
      if ((err as { code?: string })?.code === 'auth/email-already-exists') return { status: 'existing' };
      throw err;
    }

    const now = new Date().toISOString();
    await db.doc(`users/${uid}`).set(
      {
        uid,
        email,
        displayName: firstName ?? null,
        role: 'parent',
        onboardingComplete: true,
        boxRevealComplete: true,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    const customToken = await auth.createCustomToken(uid, { via: 'gift' });
    logger.info('signInGiftGiver: created');
    return { status: 'created', customToken };
  }
);

/**
 * Storefront orders placed signed out before accounts were created at checkout live only in the
 * email's guest household. Give that household an account so a login link can reach it.
 */
async function legacyGuestCheckoutUser(db: FirebaseFirestore.Firestore, email: string): Promise<UserRecord | null> {
  const guestRef = db.doc(`households/${guestHouseholdId(email)}`);
  if (!(await guestRef.get()).exists) return null;
  if ((await guestRef.collection('orders').limit(1).get()).empty) return null;
  const { uid } = await accountForCheckoutEmail(db, email, null);
  logger.info('requestLoginLink: linked guest checkout household');
  return getAuth().getUser(uid);
}

/** "Email me a login link" on sign-in. Always ok — never reveals whether the email has an account. */
export const requestLoginLink = onCall(
  { memory: '512MiB' },
  async (request): Promise<{ ok: true }> => {
    const data = (request.data ?? {}) as { email?: unknown; next?: unknown };
    const email = normalizeEmail(data.email);
    const db = getFirestore();
    await enforceRateLimits(db, email, request.rawRequest);
    try {
      let user: UserRecord | null = null;
      try {
        user = await getAuth().getUserByEmail(email);
      } catch (err) {
        if ((err as { code?: string })?.code !== 'auth/user-not-found') throw err;
        user = await legacyGuestCheckoutUser(db, email);
      }
      if (user) {
        await sendLoginLinkEmail(db, {
          uid: user.uid,
          email,
          purpose: 'login',
          next: safeNextPath(data.next),
          visitorId: null,
          firstName: firstNameOf(user.displayName),
        });
      }
    } catch (err) {
      logger.error('requestLoginLink failed', err);
    }
    return { ok: true };
  }
);

export type RedeemLoginLinkResult =
  | {
      status: 'ok';
      customToken: string;
      uid: string;
      next: string | null;
      snapshot: Record<string, unknown> | null;
      /** True when this redeem just created a passwordless Auth user (invite / first join). */
      accountCreated?: boolean;
      email?: string;
    }
  /** `email` only for an expired order link, so the sign-in screen can offer a fresh link to that address. */
  | { status: 'invalid' | 'expired' | 'used'; email?: string };

/** `/login?token=` (src/navigation/LoginLinkEffect.tsx). Unauthenticated; single use except order links. */
export const redeemLoginLink = onCall(
  { memory: '512MiB' },
  async (request): Promise<RedeemLoginLinkResult> => {
    const data = (request.data ?? {}) as { token?: unknown };
    const token = data.token;
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) return { status: 'invalid' };
    const db = getFirestore();
    await enforceRateLimits(db, null, request.rawRequest);
    const ref = db.doc(`loginTokens/${sha256Hex(token)}`);
    const now = Date.now();
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const tok = snap.data();
      const status = loginTokenStatus(tok, now);
      if (status !== 'ok' || !tok) {
        const email = status === 'expired' && typeof tok?.emailHint === 'string' ? tok.emailHint : undefined;
        return { status: status === 'ok' ? ('invalid' as const) : status, ...(email ? { email } : {}) };
      }
      tx.update(
        ref,
        tok.purpose === 'order'
          ? { useCount: FieldValue.increment(1), usedAt: Timestamp.fromMillis(now) }
          : { usedAt: Timestamp.fromMillis(now) }
      );
      return {
        status: 'ok' as const,
        uid: typeof tok.uid === 'string' ? tok.uid : null,
        emailHash: String(tok.emailHash ?? ''),
        invitePath: typeof tok.invitePath === 'string' ? tok.invitePath : null,
        next: typeof tok.next === 'string' ? tok.next : null,
        visitorId: typeof tok.visitorId === 'string' ? tok.visitorId : null,
        emailLogId: tok.emailLogId,
      };
    });
    if (claimed.status !== 'ok') return claimed;
    await recordInventoryEmailClick(db, claimed.emailLogId, new Date(now));

    const accepted = claimed.invitePath
      ? await acceptInviteFromLink(db, claimed.invitePath, claimed.emailHash)
      : null;
    const uid = accepted?.uid ?? claimed.uid;
    if (!uid) return { status: 'invalid' };

    const auth = getAuth();
    // Clicking the link proves the inbox is theirs.
    try {
      await auth.updateUser(uid, { emailVerified: true });
    } catch (err) {
      // Account erased since the link was sent; a custom token would recreate it with no email.
      if ((err as { code?: string })?.code === 'auth/user-not-found') return { status: 'invalid' };
      logger.warn('redeemLoginLink: emailVerified update failed', { err: String(err) });
    }
    const customToken = await auth.createCustomToken(uid, { via: 'email-link' });

    let snapshot: Record<string, unknown> | null = null;
    if (claimed.visitorId) {
      const session = (await db.doc(`guestSessions/${claimed.visitorId}`).get()).data();
      if (session && typeof session.snapshot === 'object' && session.snapshot && !session.convertedUid) {
        snapshot = session.snapshot as Record<string, unknown>;
      }
    }
    return {
      status: 'ok',
      customToken,
      uid,
      next: claimed.next,
      snapshot,
      ...(accepted?.accountCreated ? { accountCreated: true, email: accepted.email } : {}),
    };
  }
);
/* ------------------------------------------------------------------------------------------------
 * Sign-in by emailed code (mobile checkout gate, sign-in and sign-up screens).
 *
 *   loginCodes/{emailHash}   one live code per email: salted sha256 of the code, uid, expiry,
 *                            attempt count, usedAt. Replaced on every request. Functions only.
 *
 * The code proves the person owns the inbox, so no token is ever returned on email alone.
 * ---------------------------------------------------------------------------------------------- */

const LOGIN_CODE_EMAIL_LIMIT_PER_WINDOW = 8;

export type RequestLoginCodeData = {
  email?: unknown;
  /** Sign-up: create a passwordless account for a new email so the code can sign it in. */
  createIfMissing?: unknown;
  firstName?: unknown;
  /** Shown in the email copy: "sign in" or "save your box". */
  purpose?: unknown;
};

/** Always ok. Never reveals whether the email has an account. */
export const requestLoginCode = onCall(
  { memory: '512MiB' },
  async (request): Promise<{ ok: true }> => {
    const data = (request.data ?? {}) as RequestLoginCodeData;
    const email = normalizeEmail(data.email);
    const db = getFirestore();
    await enforceRateLimits(db, email, request.rawRequest, 'logincode:');
    const emailKey = emailHash(email);
    // On top of the shared email/IP limits: at most 8 codes per address per hour.
    if (await hitRateLimit(db, `logincode-email:${emailKey}`, LOGIN_CODE_EMAIL_LIMIT_PER_WINDOW, Date.now())) {
      logger.warn('requestLoginCode: too many codes for one email');
      return { ok: true };
    }
    try {
      let user: UserRecord | null = null;
      try {
        user = await getAuth().getUserByEmail(email);
      } catch (err) {
        if ((err as { code?: string })?.code !== 'auth/user-not-found') throw err;
        user = await legacyGuestCheckoutUser(db, email);
      }
      if (!user && data.createIfMissing === true) {
        const name = typeof data.firstName === 'string' ? data.firstName.trim().slice(0, 80) : null;
        const { uid } = await accountForCheckoutEmail(db, email, name);
        user = await getAuth().getUser(uid);
      }
      if (user) {
        const code = generateLoginCode();
        const now = Date.now();
        await db.doc(`loginCodes/${emailKey}`).set({
          codeHash: hashLoginCode(code, emailKey),
          uid: user.uid,
          expiresAt: Timestamp.fromMillis(now + LOGIN_CODE_TTL_MS),
          attempts: 0,
          usedAt: null,
          createdAt: Timestamp.fromMillis(now),
          purpose: data.purpose === 'save-box' ? 'save-box' : 'login',
        });
        await sendEmail({
          to: email,
          template: 'login-code',
          data: {
            variant: data.purpose === 'save-box' ? 'save-box' : 'login',
            displayName: firstNameOf(user.displayName) ?? '',
            code_spaced: spacedLoginCode(code),
          },
        });
      }
    } catch (err) {
      logger.error('requestLoginCode failed', err);
    }
    return { ok: true };
  }
);

export type RedeemLoginCodeResult =
  | { status: 'ok'; customToken: string; uid: string }
  | { status: 'invalid' | 'expired' | 'locked' };

/** Unauthenticated. One live code per email; five wrong guesses lock it until a new one is requested. */
export const redeemLoginCode = onCall(
  { memory: '512MiB' },
  async (request): Promise<RedeemLoginCodeResult> => {
    const data = (request.data ?? {}) as { email?: unknown; code?: unknown };
    const email = normalizeEmail(data.email);
    const code = normalizeLoginCode(data.code);
    const db = getFirestore();
    await enforceRateLimits(db, email, request.rawRequest, 'logincode-redeem:');
    if (!code) return { status: 'invalid' };
    const emailKey = emailHash(email);
    const ref = db.doc(`loginCodes/${emailKey}`);
    const now = Date.now();
    const guessHash = hashLoginCode(code, emailKey);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const checked = checkLoginCode(snap.data(), guessHash, now);
      if (checked.next) {
        tx.update(ref, checked.status === 'ok' ? { usedAt: Timestamp.fromMillis(now) } : checked.next);
      }
      return { status: checked.status, uid: checked.status === 'ok' ? String(snap.data()?.uid ?? '') : null };
    });
    if (result.status !== 'ok' || !result.uid) return { status: clientStatusFor(result.status) as 'invalid' | 'expired' | 'locked' };

    const auth = getAuth();
    // Typing the code proves the inbox is theirs.
    try {
      await auth.updateUser(result.uid, { emailVerified: true });
    } catch (err) {
      if ((err as { code?: string })?.code === 'auth/user-not-found') return { status: 'invalid' };
      logger.warn('redeemLoginCode: emailVerified update failed', { err: String(err) });
    }
    const customToken = await auth.createCustomToken(result.uid, { via: 'email-code' });
    return { status: 'ok', customToken, uid: result.uid };
  }
);
