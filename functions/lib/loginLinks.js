"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redeemLoginLink = exports.requestLoginLink = exports.revealBoxWithEmail = exports.CONNECT_GOOGLE_PATH = exports.SET_PASSWORD_PATH = void 0;
exports.safeNextPath = safeNextPath;
exports.hitRateLimit = hitRateLimit;
const logger = require("./logger");
const sentry_1 = require("./sentry");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
const email_1 = require("./email");
const guestSessions_1 = require("./guestSessions");
const geo_1 = require("./geo");
const metaCapi_1 = require("./metaCapi");
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
/** Staff addresses get admin rules by email, so the gate never hands out tokens for them. */
function isStaffEmail(email) {
    return /@unaffiliated\.co$/i.test(email);
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
async function enforceRateLimits(db, email, rawRequest) {
    const now = Date.now();
    const ip = (0, geo_1.requestIp)(rawRequest);
    const [ipLimited, emailLimited] = await Promise.all([
        ip ? hitRateLimit(db, `ip:${ip}`, IP_LIMIT_PER_WINDOW, now) : Promise.resolve(false),
        email ? hitRateLimit(db, `email:${email}`, EMAIL_LIMIT_PER_WINDOW, now) : Promise.resolve(false),
    ]);
    if (ipLimited || emailLimited) {
        throw new sentry_1.HttpsError('resource-exhausted', 'Too many requests. Try again later.');
    }
}
async function mintLoginToken(db, input) {
    const token = (0, crypto_1.randomBytes)(32).toString('base64url');
    const now = Date.now();
    await db.doc(`loginTokens/${(0, guestSessions_1.sha256Hex)(token)}`).set({
        uid: input.uid,
        emailHash: (0, guestSessions_1.emailHash)(input.email),
        purpose: input.purpose,
        next: input.next,
        visitorId: input.visitorId,
        createdAt: firestore_1.Timestamp.fromMillis(now),
        expiresAt: firestore_1.Timestamp.fromMillis(now + (input.purpose === 'save-box' ? SAVE_BOX_TOKEN_TTL_MS : LOGIN_TOKEN_TTL_MS)),
        usedAt: null,
    });
    return token;
}
function loginUrl(token, next) {
    const params = new URLSearchParams({ token });
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
function firstNameOf(raw) {
    var _a;
    if (typeof raw !== 'string')
        return undefined;
    const first = (_a = raw.trim().split(/\s+/)[0]) === null || _a === void 0 ? void 0 : _a.slice(0, 60);
    return first || undefined;
}
/**
 * Box builder email gate (src/screens/onboarding/RevealEmailScreen.tsx). Unauthenticated.
 * - New email: create a passwordless account and return a custom token.
 * - Existing account: email a link that signs in and saves this box. Never returns a token,
 *   so typing someone else's email cannot sign you into their account.
 */
exports.revealBoxWithEmail = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a, _b, _c;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const email = normalizeEmail(data.email);
    const visitorId = typeof data.visitorId === 'string' && guestSessions_1.VISITOR_ID_RE.test(data.visitorId) ? data.visitorId : null;
    const firstName = firstNameOf(data.name);
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
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/user-not-found')
            throw err;
    }
    if (!existing && !isStaffEmail(email)) {
        try {
            const created = await auth.createUser(Object.assign({ email, emailVerified: false }, (firstName ? { displayName: firstName } : {})));
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
                firstName: (_c = firstNameOf(existing.displayName)) !== null && _c !== void 0 ? _c : firstName,
            });
        }
        catch (err) {
            logger.error('revealBoxWithEmail: login link email failed', err);
        }
    }
    logger.info('revealBoxWithEmail: existing');
    return { status: 'existing' };
});
/** "Email me a login link" on sign-in. Always ok — never reveals whether the email has an account. */
exports.requestLoginLink = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const email = normalizeEmail(data.email);
    const db = (0, firestore_1.getFirestore)();
    await enforceRateLimits(db, email, request.rawRequest);
    try {
        const user = await (0, auth_1.getAuth)().getUserByEmail(email);
        await sendLoginLinkEmail(db, {
            uid: user.uid,
            email,
            purpose: 'login',
            next: safeNextPath(data.next),
            visitorId: null,
            firstName: firstNameOf(user.displayName),
        });
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/user-not-found') {
            logger.error('requestLoginLink failed', err);
        }
    }
    return { ok: true };
});
/** `/login?token=` (src/navigation/LoginLinkEffect.tsx). Unauthenticated; single use. */
exports.redeemLoginLink = (0, sentry_1.onCall)({ memory: '512MiB' }, async (request) => {
    var _a;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const token = data.token;
    if (typeof token !== 'string' || token.length < 32 || token.length > 128)
        return { status: 'invalid' };
    const db = (0, firestore_1.getFirestore)();
    await enforceRateLimits(db, null, request.rawRequest);
    const ref = db.doc(`loginTokens/${(0, guestSessions_1.sha256Hex)(token)}`);
    const now = Date.now();
    const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const tok = snap.data();
        if (!tok)
            return { status: 'invalid' };
        if (tok.usedAt)
            return { status: 'used' };
        const expires = tok.expiresAt instanceof firestore_1.Timestamp ? tok.expiresAt.toMillis() : 0;
        if (!expires || expires < now)
            return { status: 'expired' };
        tx.update(ref, { usedAt: firestore_1.Timestamp.fromMillis(now) });
        return {
            status: 'ok',
            uid: String(tok.uid),
            next: typeof tok.next === 'string' ? tok.next : null,
            visitorId: typeof tok.visitorId === 'string' ? tok.visitorId : null,
        };
    });
    if (claimed.status !== 'ok')
        return { status: claimed.status };
    const auth = (0, auth_1.getAuth)();
    // Clicking the link proves the inbox is theirs.
    await auth.updateUser(claimed.uid, { emailVerified: true }).catch((err) => {
        logger.warn('redeemLoginLink: emailVerified update failed', { err: String(err) });
    });
    const customToken = await auth.createCustomToken(claimed.uid, { via: 'email-link' });
    let snapshot = null;
    if (claimed.visitorId) {
        const session = (await db.doc(`guestSessions/${claimed.visitorId}`).get()).data();
        if (session && typeof session.snapshot === 'object' && session.snapshot && !session.convertedUid) {
            snapshot = session.snapshot;
        }
    }
    return { status: 'ok', customToken, next: claimed.next, snapshot };
});
//# sourceMappingURL=loginLinks.js.map