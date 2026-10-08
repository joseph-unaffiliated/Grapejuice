import * as logger from './logger';
import { onCall, HttpsError } from './sentry';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { sendEmail } from './email';
import { appOrigin, emailHash, sha256Hex, VISITOR_ID_RE } from './guestSessions';
import { requestIp } from './geo';
import { metaContextFromCallable, sendMetaEvent } from './metaCapi';

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
const RATE_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_LIMIT_PER_WINDOW = 6;
const IP_LIMIT_PER_WINDOW = 30;

type LoginPurpose = 'save-box' | 'login' | 'invite';

export const SET_PASSWORD_PATH = '/account/set-password';
export const CONNECT_GOOGLE_PATH = '/account/connect-google';

function normalizeEmail(raw: unknown): string {
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

async function enforceRateLimits(
  db: FirebaseFirestore.Firestore,
  email: string | null,
  rawRequest: unknown
): Promise<void> {
  const now = Date.now();
  const ip = requestIp(rawRequest);
  const [ipLimited, emailLimited] = await Promise.all([
    ip ? hitRateLimit(db, `ip:${ip}`, IP_LIMIT_PER_WINDOW, now) : Promise.resolve(false),
    email ? hitRateLimit(db, `email:${email}`, EMAIL_LIMIT_PER_WINDOW, now) : Promise.resolve(false),
  ]);
  if (ipLimited || emailLimited) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Try again later.');
  }
}

const TOKEN_TTL_MS: Record<LoginPurpose, number> = {
  'save-box': SAVE_BOX_TOKEN_TTL_MS,
  login: LOGIN_TOKEN_TTL_MS,
  invite: INVITE_TOKEN_TTL_MS,
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
  }
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  await db.doc(`loginTokens/${sha256Hex(token)}`).set({
    uid: input.uid,
    emailHash: emailHash(input.email),
    purpose: input.purpose,
    next: input.next,
    visitorId: input.visitorId,
    invitePath: input.invitePath ?? null,
    createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + TOKEN_TTL_MS[input.purpose]),
    usedAt: null,
  });
  return token;
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
): Promise<string | null> {
  const inviteRef = db.doc(invitePath);
  const invite = (await inviteRef.get()).data();
  const email = String(invite?.invitedEmail ?? '').trim().toLowerCase();
  if (!invite || !email || emailHash(email) !== tokenEmailHash) return null;
  if (invite.status !== 'pending' && invite.status !== 'accepted') return null;

  const auth = getAuth();
  const user =
    (await auth.getUserByEmail(email).catch(() => null)) ??
    (await auth.createUser({ email, emailVerified: true }));
  if (invite.status === 'accepted') return user.uid;

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
  return user.uid;
}

function loginUrl(token: string, next: string | null): string {
  const params = new URLSearchParams({ token });
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

function firstNameOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const first = raw.trim().split(/\s+/)[0]?.slice(0, 60);
  return first || undefined;
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

/** "Email me a login link" on sign-in. Always ok — never reveals whether the email has an account. */
export const requestLoginLink = onCall(
  { memory: '512MiB' },
  async (request): Promise<{ ok: true }> => {
    const data = (request.data ?? {}) as { email?: unknown; next?: unknown };
    const email = normalizeEmail(data.email);
    const db = getFirestore();
    await enforceRateLimits(db, email, request.rawRequest);
    try {
      const user = await getAuth().getUserByEmail(email);
      await sendLoginLinkEmail(db, {
        uid: user.uid,
        email,
        purpose: 'login',
        next: safeNextPath(data.next),
        visitorId: null,
        firstName: firstNameOf(user.displayName),
      });
    } catch (err) {
      if ((err as { code?: string })?.code !== 'auth/user-not-found') {
        logger.error('requestLoginLink failed', err);
      }
    }
    return { ok: true };
  }
);

export type RedeemLoginLinkResult =
  | { status: 'ok'; customToken: string; next: string | null; snapshot: Record<string, unknown> | null }
  | { status: 'invalid' | 'expired' | 'used' };

/** `/login?token=` (src/navigation/LoginLinkEffect.tsx). Unauthenticated; single use. */
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
      if (!tok) return { status: 'invalid' as const };
      if (tok.usedAt) return { status: 'used' as const };
      const expires = tok.expiresAt instanceof Timestamp ? tok.expiresAt.toMillis() : 0;
      if (!expires || expires < now) return { status: 'expired' as const };
      tx.update(ref, { usedAt: Timestamp.fromMillis(now) });
      return {
        status: 'ok' as const,
        uid: typeof tok.uid === 'string' ? tok.uid : null,
        emailHash: String(tok.emailHash ?? ''),
        invitePath: typeof tok.invitePath === 'string' ? tok.invitePath : null,
        next: typeof tok.next === 'string' ? tok.next : null,
        visitorId: typeof tok.visitorId === 'string' ? tok.visitorId : null,
      };
    });
    if (claimed.status !== 'ok') return { status: claimed.status };

    const uid = claimed.invitePath
      ? await acceptInviteFromLink(db, claimed.invitePath, claimed.emailHash)
      : claimed.uid;
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
    return { status: 'ok', customToken, next: claimed.next, snapshot };
  }
);