"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redeemLoginCode = exports.requestLoginCode = exports.redeemLoginLink = exports.requestLoginLink = exports.signInGiftGiver = exports.revealBoxWithEmail = exports.CONNECT_GOOGLE_PATH = exports.SET_PASSWORD_PATH = void 0;
exports.normalizeEmail = normalizeEmail;
exports.safeNextPath = safeNextPath;
exports.hitRateLimit = hitRateLimit;
exports.enforceRateLimits = enforceRateLimits;
exports.mintOrderViewUrl = mintOrderViewUrl;
exports.orderViewUrl = orderViewUrl;
exports.mintInventoryAlertUrl = mintInventoryAlertUrl;
exports.mintInviteAcceptUrl = mintInviteAcceptUrl;
exports.giverUidForEmail = giverUidForEmail;
const logger = require("./logger");
const sentry_1 = require("./sentry");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
const email_1 = require("./email");
const guestSessions_1 = require("./guestSessions");
const geo_1 = require("./geo");
const metaCapi_1 = require("./metaCapi");
const checkoutAccount_1 = require("./checkoutAccount");
const loginTokenRules_1 = require("./loginTokenRules");
const loginCodeRules_1 = require("./loginCodeRules");
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
exports.SET_PASSWORD_PATH = '/account/set-password';
exports.CONNECT_GOOGLE_PATH = '/account/connect-google';
function normalizeEmail(raw) {
    if (typeof raw !== 'string')
        throw new sentry_1.HttpsError('invalid-argument', 'Email required.');
    const email = raw.trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        throw new sentry_1.HttpsError('invalid-argument', 'Enter a valid email address.');
    }
    return email;
}
/** Only same-site paths; anything else falls back to the default destination. */
function safeNextPath(raw) {
    if (typeof raw !== 'string')
        return null;
    const next = raw.trim();
    if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.length > 200) {
        return null;
    }
    return next;
}
async function hitRateLimit(db, key, limit, now) {
    const ref = db.doc(`rateLimits/${(0, guestSessions_1.sha256Hex)(key)}`);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data();
        const windowStart = (data === null || data === void 0 ? void 0 : data.windowStart) instanceof firestore_1.Timestamp ? data.windowStart.toMillis() : 0;
        const expiresAt = firestore_1.Timestamp.fromMillis(now + RATE_WINDOW_MS);
        if (!windowStart || now - windowStart >= RATE_WINDOW_MS) {
            tx.set(ref, { windowStart: firestore_1.Timestamp.fromMillis(now), count: 1, expiresAt });
            return false;
        }
        const count = typeof (data === null || data === void 0 ? void 0 : data.count) === 'number' ? data.count : 0;
        if (count >= limit)
            return true;
        tx.set(ref, { count: count + 1, expiresAt }, { merge: true });
        return false;
    });
}
/** `scope` keeps separate counters per flow, so gift checkout retries don't use up the email gate's budget. */
async function enforceRateLimits(db, email, rawRequest, scope = '') {
    const now = Date.now();
    const ip = (0, geo_1.requestIp)(rawRequest);
    const [ipLimited, emailLimited] = await Promise.all([
        ip ? hitRateLimit(db, `${scope}ip:${ip}`, IP_LIMIT_PER_WINDOW, now) : Promise.resolve(false),
        email ? hitRateLimit(db, `${scope}email:${email}`, EMAIL_LIMIT_PER_WINDOW, now) : Promise.resolve(false),
    ]);
    if (ipLimited || emailLimited) {
        throw new sentry_1.HttpsError('resource-exhausted', 'Too many requests. Try again later.');
    }
}
const TOKEN_TTL_MS = {
    'save-box': SAVE_BOX_TOKEN_TTL_MS,
    login: LOGIN_TOKEN_TTL_MS,
    invite: INVITE_TOKEN_TTL_MS,
    order: loginTokenRules_1.ORDER_TOKEN_TTL_MS,
    'inventory-alert': INVENTORY_ALERT_TOKEN_TTL_MS,
};
async function mintLoginToken(db, input) {
    var _a, _b;
    const token = (0, crypto_1.randomBytes)(32).toString('base64url');
    const now = Date.now();
    const signInUntil = now + TOKEN_TTL_MS[input.purpose];
    const isOrder = input.purpose === 'order';
    await db.doc(`loginTokens/${(0, guestSessions_1.sha256Hex)(token)}`).set(Object.assign(Object.assign({ uid: input.uid, emailHash: (0, guestSessions_1.emailHash)(input.email), purpose: input.purpose, next: input.next, visitorId: input.visitorId, invitePath: (_a = input.invitePath) !== null && _a !== void 0 ? _a : null, createdAt: firestore_1.Timestamp.fromMillis(now), 
        // `expiresAt` drives the daily purge; order links stay readable past sign-in expiry to prefill the email.
        expiresAt: firestore_1.Timestamp.fromMillis(isOrder ? signInUntil + loginTokenRules_1.ORDER_TOKEN_RETAIN_MS : signInUntil), usedAt: null }, (input.emailLogId ? { emailLogId: input.emailLogId } : {})), (isOrder
        ? {
            signInUntil: firestore_1.Timestamp.fromMillis(signInUntil),
            orderPath: (_b = input.orderPath) !== null && _b !== void 0 ? _b : null,
            emailHint: input.email,
            useCount: 0,
        }
        : {})));
    return token;
}
/**
 * Signed "View my order" link for an order confirmation email. The email goes to the order's
 * account, so the link signs the reader in as that account and opens Orders.
 */
async function mintOrderViewUrl(db, input) {
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
async function orderViewUrl(db, input) {
    const fallback = `${(0, guestSessions_1.appOrigin)()}/orders?utm_source=transactional&utm_medium=email`;
    if (!input.uid)
        return fallback;
    try {
        return await mintOrderViewUrl(db, Object.assign(Object.assign({}, input), { uid: input.uid }));
    }
    catch (err) {
        logger.error('orderViewUrl: could not mint order link', { err: String(err) });
        return fallback;
    }
}
/**
 * Signed links for the inventory emails ("Secure my box" → checkout, "Customize my box" → My Box).
 * They go to the household owner's own address, so the link signs that account in. Single use,
 * so each button gets its own token.
 */
async function mintInventoryAlertUrl(db, input) {
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
async function mintInviteAcceptUrl(db, input) {
    var _a;
    const existing = await (0, auth_1.getAuth)()
        .getUserByEmail(input.email)
        .catch(() => null);
    const token = await mintLoginToken(db, {
        uid: (_a = existing === null || existing === void 0 ? void 0 : existing.uid) !== null && _a !== void 0 ? _a : null,
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
async function acceptInviteFromLink(db, invitePath, tokenEmailHash) {
    var _a;
    const inviteRef = db.doc(invitePath);
    const invite = (await inviteRef.get()).data();
    const email = String((_a = invite === null || invite === void 0 ? void 0 : invite.invitedEmail) !== null && _a !== void 0 ? _a : '').trim().toLowerCase();
    if (!invite || !email || (0, guestSessions_1.emailHash)(email) !== tokenEmailHash)
        return null;
    if (invite.status !== 'pending' && invite.status !== 'accepted')
        return null;
    const auth = (0, auth_1.getAuth)();
    const existing = await auth.getUserByEmail(email).catch(() => null);
    const accountCreated = !existing;
    const user = existing !== null && existing !== void 0 ? existing : (await auth.createUser({ email, emailVerified: true }));
    if (invite.status === 'accepted')
        return { uid: user.uid, accountCreated: false, email };
    const householdId = String(invite.householdId);
    const now = new Date().toISOString();
    const userRef = db.doc(`users/${user.uid}`);
    const profileExists = (await userRef.get()).exists;
    await db.doc(`households/${householdId}`).update({
        memberIds: firestore_1.FieldValue.arrayUnion(user.uid),
        updatedAt: now,
    });
    await userRef.set(Object.assign({ householdId, onboardingComplete: true, boxRevealComplete: true, updatedAt: now }, (profileExists
        ? {}
        : { uid: user.uid, email, displayName: null, role: 'parent', createdAt: now })), { merge: true });
    await inviteRef.update({ status: 'accepted', acceptedByUid: user.uid });
    return { uid: user.uid, accountCreated, email };
}
function loginUrl(token, next, query) {
    const params = new URLSearchParams(Object.assign(Object.assign({}, query), { token }));
    if (next)
        params.set('next', next);
    return `${(0, guestSessions_1.appOrigin)()}/login?${params.toString()}`;
}
/**
 * Email a login link. Each button gets its own single-use token so clicking one does not burn
 * the others.
 */
async function sendLoginLinkEmail(db, input) {
    var _a;
    const defaultNext = input.purpose === 'save-box' ? '/box' : input.next;
    const [loginToken, passwordToken, googleToken] = await Promise.all([
        mintLoginToken(db, Object.assign(Object.assign({}, input), { next: defaultNext })),
        mintLoginToken(db, Object.assign(Object.assign({}, input), { next: exports.SET_PASSWORD_PATH })),
        mintLoginToken(db, Object.assign(Object.assign({}, input), { next: exports.CONNECT_GOOGLE_PATH })),
    ]);
    return (0, email_1.sendEmail)({
        to: input.email,
        template: 'login-link',
        data: {
            variant: input.purpose,
            displayName: (_a = input.firstName) !== null && _a !== void 0 ? _a : '',
            login_url: loginUrl(loginToken, defaultNext),
            set_password_url: loginUrl(passwordToken, exports.SET_PASSWORD_PATH),
            google_url: loginUrl(googleToken, exports.CONNECT_GOOGLE_PATH),
        },
    });
}
/**
 * A gate account nobody ever finished: never verified, no password or Google, nothing ordered,
 * gifted, saved, or shared. Returns its households when it qualifies, else null.
 */
async function unfinishedGateAccountHouseholds(db, user) {
    if (user.disabled || user.emailVerified || user.providerData.length > 0 || user.passwordHash)
        return null;
    if (user.customClaims && Object.keys(user.customClaims).length > 0)
        return null;
    const [households, gifts] = await Promise.all([
        db.collection('households').where('memberIds', 'array-contains', user.uid).get(),
        db.collection('giftInvites').where('giverUid', '==', user.uid).limit(1).get(),
    ]);
    if (!gifts.empty)
        return null;
    for (const hh of households.docs) {
        const d = hh.data();
        const members = Array.isArray(d.memberIds) ? d.memberIds : [];
        const kids = Array.isArray(d.childUserIds) ? d.childUserIds : [];
        if (members.length !== 1 || kids.length > 0 || d.ownerId !== user.uid)
            return null;
        if (d.cardOnFileAt || d.stripeDefaultPaymentMethodId)
            return null;
        if ((Number(d.giftCreditCents) || 0) > 0 || (Number(d.platformCreditCents) || 0) > 0)
            return null;
        const [orders, received] = await Promise.all([
            hh.ref.collection('orders').limit(1).get(),
            hh.ref.collection('receivedGifts').limit(1).get(),
        ]);
        if (!orders.empty || !received.empty)
            return null;
    }
    return households.docs.map((hh) => hh.ref);
}
/**
 * Signed-out gift checkout: the uid that owns gifts bought with this email. Existing accounts are
 * reused as-is; otherwise a passwordless one is created. Never signs anyone in — the giver logs in
 * later with an emailed link, so typing someone else's email only files the gift under them.
 */
async function giverUidForEmail(email, name) {
    const auth = (0, auth_1.getAuth)();
    try {
        return (await auth.getUserByEmail(email)).uid;
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/user-not-found')
            throw err;
    }
    const firstName = (0, checkoutAccount_1.firstNameOf)(name);
    try {
        const created = await auth.createUser(Object.assign({ email, 
            // Must stay false: admin access by staff email requires a verified address.
            emailVerified: false }, (firstName ? { displayName: firstName } : {})));
        logger.info('giverUidForEmail: created');
        return created.uid;
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/email-already-exists')
            throw err;
        return (await auth.getUserByEmail(email)).uid;
    }
}
/**
 * Box builder email gate (src/screens/onboarding/RevealEmailScreen.tsx). Unauthenticated.
 * - New email: create a passwordless account and return a custom token.
 * - Unfinished gate account (see unfinishedGateAccountHouseholds): erase it, then same as new.
 * - Any other existing account: email a link that signs in and saves this box. Never returns a
 *   token, so typing someone else's email cannot sign you into their account.
 */
exports.revealBoxWithEmail = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a, _b, _c;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const email = normalizeEmail(data.email);
    const visitorId = typeof data.visitorId === 'string' && guestSessions_1.VISITOR_ID_RE.test(data.visitorId) ? data.visitorId : null;
    const firstName = (0, checkoutAccount_1.firstNameOf)(data.name);
    const db = (0, firestore_1.getFirestore)();
    await enforceRateLimits(db, email, request.rawRequest);
    if (visitorId) {
        await db
            .doc(`guestSessions/${visitorId}`)
            .set({ gateEmailHash: (0, guestSessions_1.emailHash)(email), gateEmailAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
    }
    const meta = (0, metaCapi_1.metaContextFromCallable)(request);
    if (!meta.skip) {
        void (0, metaCapi_1.sendMetaEvent)({
            eventName: 'BoxEmail',
            eventId: (_b = meta.eventId) !== null && _b !== void 0 ? _b : `boxemail_${(0, crypto_1.randomBytes)(8).toString('hex')}`,
            context: meta,
            user: { email },
            customData: { content_name: 'Hanukkah box' },
        }).catch(() => undefined);
    }
    const auth = (0, auth_1.getAuth)();
    let existing = null;
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
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/user-not-found')
            throw err;
    }
    if (!existing) {
        try {
            const created = await auth.createUser(Object.assign({ email, 
                // Must stay false: admin access by staff email requires a verified address.
                emailVerified: false }, (firstName ? { displayName: firstName } : {})));
            const customToken = await auth.createCustomToken(created.uid, { via: 'gate' });
            logger.info('revealBoxWithEmail: created');
            return { status: 'created', customToken };
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/email-already-exists')
                throw err;
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
                firstName: (_c = (0, checkoutAccount_1.firstNameOf)(existing.displayName)) !== null && _c !== void 0 ? _c : firstName,
            });
        }
        catch (err) {
            logger.error('revealBoxWithEmail: login link email failed', err);
        }
    }
    logger.info('revealBoxWithEmail: existing');
    return { status: 'existing' };
});
/**
 * Gift flow email step (src/screens/gift/GiftGiveScreen.web.tsx). Unauthenticated.
 * - New email: create a passwordless account that skips box onboarding and return a custom token.
 *   They get back in with an emailed login link (or set a password / Google later).
 * - Existing account: no token (typing someone else's email must not sign you in). The gift
 *   still files under that account via purchasePilotGift's guest giverEmail.
 */
exports.signInGiftGiver = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const email = normalizeEmail(data.email);
    const firstName = (0, checkoutAccount_1.firstNameOf)(data.name);
    const db = (0, firestore_1.getFirestore)();
    await enforceRateLimits(db, email, request.rawRequest, 'giftsignin:');
    const auth = (0, auth_1.getAuth)();
    try {
        await auth.getUserByEmail(email);
        logger.info('signInGiftGiver: existing');
        return { status: 'existing' };
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/user-not-found')
            throw err;
    }
    let uid;
    try {
        const created = await auth.createUser(Object.assign({ email, 
            // Must stay false: admin access by staff email requires a verified address.
            emailVerified: false }, (firstName ? { displayName: firstName } : {})));
        uid = created.uid;
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) === 'auth/email-already-exists')
            return { status: 'existing' };
        throw err;
    }
    const now = new Date().toISOString();
    await db.doc(`users/${uid}`).set({
        uid,
        email,
        displayName: firstName !== null && firstName !== void 0 ? firstName : null,
        role: 'parent',
        onboardingComplete: true,
        boxRevealComplete: true,
        createdAt: now,
        updatedAt: now,
    }, { merge: true });
    const customToken = await auth.createCustomToken(uid, { via: 'gift' });
    logger.info('signInGiftGiver: created');
    return { status: 'created', customToken };
});
/**
 * Storefront orders placed signed out before accounts were created at checkout live only in the
 * email's guest household. Give that household an account so a login link can reach it.
 */
async function legacyGuestCheckoutUser(db, email) {
    const guestRef = db.doc(`households/${(0, checkoutAccount_1.guestHouseholdId)(email)}`);
    if (!(await guestRef.get()).exists)
        return null;
    if ((await guestRef.collection('orders').limit(1).get()).empty)
        return null;
    const { uid } = await (0, checkoutAccount_1.accountForCheckoutEmail)(db, email, null);
    logger.info('requestLoginLink: linked guest checkout household');
    return (0, auth_1.getAuth)().getUser(uid);
}
/** "Email me a login link" on sign-in. Always ok — never reveals whether the email has an account. */
exports.requestLoginLink = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const email = normalizeEmail(data.email);
    const db = (0, firestore_1.getFirestore)();
    await enforceRateLimits(db, email, request.rawRequest);
    try {
        let user = null;
        try {
            user = await (0, auth_1.getAuth)().getUserByEmail(email);
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/user-not-found')
                throw err;
            user = await legacyGuestCheckoutUser(db, email);
        }
        if (user) {
            await sendLoginLinkEmail(db, {
                uid: user.uid,
                email,
                purpose: 'login',
                next: safeNextPath(data.next),
                visitorId: null,
                firstName: (0, checkoutAccount_1.firstNameOf)(user.displayName),
            });
        }
    }
    catch (err) {
        logger.error('requestLoginLink failed', err);
    }
    return { ok: true };
});
/** `/login?token=` (src/navigation/LoginLinkEffect.tsx). Unauthenticated; single use except order links. */
exports.redeemLoginLink = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a, _b;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const token = data.token;
    if (typeof token !== 'string' || token.length < 32 || token.length > 128)
        return { status: 'invalid' };
    const db = (0, firestore_1.getFirestore)();
    await enforceRateLimits(db, null, request.rawRequest);
    const ref = db.doc(`loginTokens/${(0, guestSessions_1.sha256Hex)(token)}`);
    const now = Date.now();
    const claimed = await db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(ref);
        const tok = snap.data();
        const status = (0, loginTokenRules_1.loginTokenStatus)(tok, now);
        if (status !== 'ok' || !tok) {
            const email = status === 'expired' && typeof (tok === null || tok === void 0 ? void 0 : tok.emailHint) === 'string' ? tok.emailHint : undefined;
            return Object.assign({ status: status === 'ok' ? 'invalid' : status }, (email ? { email } : {}));
        }
        tx.update(ref, tok.purpose === 'order'
            ? { useCount: firestore_1.FieldValue.increment(1), usedAt: firestore_1.Timestamp.fromMillis(now) }
            : { usedAt: firestore_1.Timestamp.fromMillis(now) });
        return {
            status: 'ok',
            uid: typeof tok.uid === 'string' ? tok.uid : null,
            emailHash: String((_a = tok.emailHash) !== null && _a !== void 0 ? _a : ''),
            invitePath: typeof tok.invitePath === 'string' ? tok.invitePath : null,
            next: typeof tok.next === 'string' ? tok.next : null,
            visitorId: typeof tok.visitorId === 'string' ? tok.visitorId : null,
            emailLogId: tok.emailLogId,
        };
    });
    if (claimed.status !== 'ok')
        return claimed;
    await (0, guestSessions_1.recordInventoryEmailClick)(db, claimed.emailLogId, new Date(now));
    const accepted = claimed.invitePath
        ? await acceptInviteFromLink(db, claimed.invitePath, claimed.emailHash)
        : null;
    const uid = (_b = accepted === null || accepted === void 0 ? void 0 : accepted.uid) !== null && _b !== void 0 ? _b : claimed.uid;
    if (!uid)
        return { status: 'invalid' };
    const auth = (0, auth_1.getAuth)();
    // Clicking the link proves the inbox is theirs.
    try {
        await auth.updateUser(uid, { emailVerified: true });
    }
    catch (err) {
        // Account erased since the link was sent; a custom token would recreate it with no email.
        if ((err === null || err === void 0 ? void 0 : err.code) === 'auth/user-not-found')
            return { status: 'invalid' };
        logger.warn('redeemLoginLink: emailVerified update failed', { err: String(err) });
    }
    const customToken = await auth.createCustomToken(uid, { via: 'email-link' });
    let snapshot = null;
    if (claimed.visitorId) {
        const session = (await db.doc(`guestSessions/${claimed.visitorId}`).get()).data();
        if (session && typeof session.snapshot === 'object' && session.snapshot && !session.convertedUid) {
            snapshot = session.snapshot;
        }
    }
    return Object.assign({ status: 'ok', customToken,
        uid, next: claimed.next, snapshot }, ((accepted === null || accepted === void 0 ? void 0 : accepted.accountCreated) ? { accountCreated: true, email: accepted.email } : {}));
});
/* ------------------------------------------------------------------------------------------------
 * Sign-in by emailed code (mobile checkout gate, sign-in and sign-up screens).
 *
 *   loginCodes/{emailHash}   one live code per email: salted sha256 of the code, uid, expiry,
 *                            attempt count, usedAt. Replaced on every request. Functions only.
 *
 * The code proves the person owns the inbox, so no token is ever returned on email alone.
 * ---------------------------------------------------------------------------------------------- */
const LOGIN_CODE_EMAIL_LIMIT_PER_WINDOW = 8;
/** Always ok. Never reveals whether the email has an account. */
exports.requestLoginCode = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a, _b;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const email = normalizeEmail(data.email);
    const db = (0, firestore_1.getFirestore)();
    await enforceRateLimits(db, email, request.rawRequest, 'logincode:');
    const emailKey = (0, guestSessions_1.emailHash)(email);
    // On top of the shared email/IP limits: at most 8 codes per address per hour.
    if (await hitRateLimit(db, `logincode-email:${emailKey}`, LOGIN_CODE_EMAIL_LIMIT_PER_WINDOW, Date.now())) {
        logger.warn('requestLoginCode: too many codes for one email');
        return { ok: true };
    }
    try {
        let user = null;
        try {
            user = await (0, auth_1.getAuth)().getUserByEmail(email);
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/user-not-found')
                throw err;
            user = await legacyGuestCheckoutUser(db, email);
        }
        if (!user && data.createIfMissing === true) {
            const name = typeof data.firstName === 'string' ? data.firstName.trim().slice(0, 80) : null;
            const { uid } = await (0, checkoutAccount_1.accountForCheckoutEmail)(db, email, name);
            user = await (0, auth_1.getAuth)().getUser(uid);
        }
        if (user) {
            const code = (0, loginCodeRules_1.generateLoginCode)();
            const now = Date.now();
            await db.doc(`loginCodes/${emailKey}`).set({
                codeHash: (0, loginCodeRules_1.hashLoginCode)(code, emailKey),
                uid: user.uid,
                expiresAt: firestore_1.Timestamp.fromMillis(now + loginCodeRules_1.LOGIN_CODE_TTL_MS),
                attempts: 0,
                usedAt: null,
                createdAt: firestore_1.Timestamp.fromMillis(now),
                purpose: data.purpose === 'save-box' ? 'save-box' : 'login',
            });
            await (0, email_1.sendEmail)({
                to: email,
                template: 'login-code',
                data: {
                    variant: data.purpose === 'save-box' ? 'save-box' : 'login',
                    displayName: (_b = (0, checkoutAccount_1.firstNameOf)(user.displayName)) !== null && _b !== void 0 ? _b : '',
                    code_spaced: (0, loginCodeRules_1.spacedLoginCode)(code),
                },
            });
        }
    }
    catch (err) {
        logger.error('requestLoginCode failed', err);
    }
    return { ok: true };
});
/** Unauthenticated. One live code per email; five wrong guesses lock it until a new one is requested. */
exports.redeemLoginCode = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const email = normalizeEmail(data.email);
    const code = (0, loginCodeRules_1.normalizeLoginCode)(data.code);
    const db = (0, firestore_1.getFirestore)();
    await enforceRateLimits(db, email, request.rawRequest, 'logincode-redeem:');
    if (!code)
        return { status: 'invalid' };
    const emailKey = (0, guestSessions_1.emailHash)(email);
    const ref = db.doc(`loginCodes/${emailKey}`);
    const now = Date.now();
    const guessHash = (0, loginCodeRules_1.hashLoginCode)(code, emailKey);
    const result = await db.runTransaction(async (tx) => {
        var _a, _b;
        const snap = await tx.get(ref);
        const checked = (0, loginCodeRules_1.checkLoginCode)(snap.data(), guessHash, now);
        if (checked.next) {
            tx.update(ref, checked.status === 'ok' ? { usedAt: firestore_1.Timestamp.fromMillis(now) } : checked.next);
        }
        return { status: checked.status, uid: checked.status === 'ok' ? String((_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.uid) !== null && _b !== void 0 ? _b : '') : null };
    });
    if (result.status !== 'ok' || !result.uid)
        return { status: (0, loginCodeRules_1.clientStatusFor)(result.status) };
    const auth = (0, auth_1.getAuth)();
    // Typing the code proves the inbox is theirs.
    try {
        await auth.updateUser(result.uid, { emailVerified: true });
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) === 'auth/user-not-found')
            return { status: 'invalid' };
        logger.warn('redeemLoginCode: emailVerified update failed', { err: String(err) });
    }
    const customToken = await auth.createCustomToken(result.uid, { via: 'email-code' });
    return { status: 'ok', customToken, uid: result.uid };
});
//# sourceMappingURL=loginLinks.js.map