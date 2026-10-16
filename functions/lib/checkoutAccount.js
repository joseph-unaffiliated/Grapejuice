"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHECKOUT_CLAIM_TTL_MS = void 0;
exports.guestHouseholdId = guestHouseholdId;
exports.firstNameOf = firstNameOf;
exports.accountForCheckoutEmail = accountForCheckoutEmail;
exports.savedCardChargeDenial = savedCardChargeDenial;
exports.mintCheckoutClaim = mintCheckoutClaim;
exports.checkoutClaimStatus = checkoutClaimStatus;
const logger = require("./logger");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
/**
 * Signed-out storefront checkout: which account an order belongs to, when the buyer may be
 * signed in afterwards, and when a household's saved card may be charged.
 *
 * Binding rule: never return a sign-in token for an existing account based on email alone.
 */
function guestHouseholdId(email) {
    return `guest_${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`.slice(0, 140);
}
function firstNameOf(raw) {
    var _a;
    if (typeof raw !== 'string')
        return undefined;
    const first = (_a = raw.trim().split(/\s+/)[0]) === null || _a === void 0 ? void 0 : _a.slice(0, 60);
    return first || undefined;
}
async function guestHouseholdHasHistory(ref) {
    var _a;
    const snap = await ref.get();
    if (!snap.exists)
        return false;
    const d = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
    if (d.stripeDefaultPaymentMethodId || d.cardOnFileAt)
        return true;
    if ((Number(d.giftCreditCents) || 0) > 0 || (Number(d.platformCreditCents) || 0) > 0)
        return true;
    const orders = await ref.collection('orders').limit(1).get();
    return !orders.empty;
}
/** Make `uid` the owner of the email's guest household and point the profile at it (no-op if it has one). */
async function linkGuestHousehold(db, uid, email, displayName) {
    const householdId = guestHouseholdId(email);
    const hhRef = db.doc(`households/${householdId}`);
    const userRef = db.doc(`users/${uid}`);
    return db.runTransaction(async (tx) => {
        var _a;
        const [hhSnap, userSnap] = await Promise.all([tx.get(hhRef), tx.get(userRef)]);
        const profile = userSnap.data();
        const existingHouseholdId = typeof (profile === null || profile === void 0 ? void 0 : profile.householdId) === 'string' ? profile.householdId : '';
        if (existingHouseholdId && existingHouseholdId !== householdId) {
            const other = await tx.get(db.doc(`households/${existingHouseholdId}`));
            if (other.exists)
                return existingHouseholdId;
        }
        const now = new Date().toISOString();
        const hh = (_a = hhSnap.data()) !== null && _a !== void 0 ? _a : {};
        tx.set(hhRef, Object.assign(Object.assign(Object.assign({ guest: true, guestEmail: email, name: typeof hh.name === 'string' ? hh.name : 'Our household', ownerId: typeof hh.ownerId === 'string' && hh.ownerId ? hh.ownerId : uid, memberIds: firestore_1.FieldValue.arrayUnion(uid) }, (Array.isArray(hh.childUserIds) ? {} : { childUserIds: [] })), (hhSnap.exists ? {} : { createdAt: now })), { updatedAt: now }), { merge: true });
        tx.set(userRef, Object.assign({ householdId, updatedAt: now }, (userSnap.exists
            ? {}
            : {
                uid,
                email,
                displayName,
                role: 'parent',
                onboardingComplete: true,
                boxRevealComplete: true,
                createdAt: now,
            })), { merge: true });
        return householdId;
    });
}
/**
 * The account that owns a signed-out checkout for `email`. An existing account keeps its own
 * household; otherwise a passwordless account is created and the email's guest household is
 * linked to it. Never signs anyone in: callers decide from `accountExisted`.
 */
async function accountForCheckoutEmail(db, email, name) {
    const auth = (0, auth_1.getAuth)();
    const firstName = firstNameOf(name);
    let uid = null;
    try {
        uid = (await auth.getUserByEmail(email)).uid;
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/user-not-found')
            throw err;
    }
    if (uid) {
        const profile = (await db.doc(`users/${uid}`).get()).data();
        const householdId = typeof (profile === null || profile === void 0 ? void 0 : profile.householdId) === 'string' ? profile.householdId : '';
        if (householdId && (await db.doc(`households/${householdId}`).get()).exists) {
            return { uid, householdId, accountExisted: true };
        }
        return {
            uid,
            householdId: await linkGuestHousehold(db, uid, email, firstName !== null && firstName !== void 0 ? firstName : null),
            accountExisted: true,
        };
    }
    const hadHistory = await guestHouseholdHasHistory(db.doc(`households/${guestHouseholdId(email)}`));
    let accountExisted = hadHistory;
    try {
        const created = await auth.createUser(Object.assign({ email, 
            // Must stay false: admin access by staff email requires a verified address.
            emailVerified: false }, (firstName ? { displayName: firstName } : {})));
        uid = created.uid;
        logger.info('accountForCheckoutEmail: created', { hadHistory });
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/email-already-exists')
            throw err;
        uid = (await auth.getUserByEmail(email)).uid;
        accountExisted = true;
    }
    const householdId = await linkGuestHousehold(db, uid, email, firstName !== null && firstName !== void 0 ? firstName : null);
    return { uid, householdId, accountExisted };
}
/** Why a saved-card charge is refused, or null when it is allowed. */
function savedCardChargeDenial(input) {
    if (input.useSavedCard !== true)
        return 'useSavedCard must be true';
    if (!input.authedUid)
        return 'signed out';
    const members = Array.isArray(input.householdMemberIds) ? input.householdMemberIds : [];
    if (!members.includes(input.authedUid))
        return 'not a household member';
    const customer = typeof input.householdCustomerId === 'string' ? input.householdCustomerId : '';
    const pm = typeof input.householdPaymentMethodId === 'string' ? input.householdPaymentMethodId : '';
    if (!customer || !pm)
        return 'no saved card';
    if (input.paymentMethodCustomerId !== customer)
        return 'card belongs to another customer';
    if (input.paymentIntentCustomerId !== customer)
        return 'payment belongs to another customer';
    return null;
}
/** Single-use secret handed to the browser that placed a checkout; only its hash is stored. */
exports.CHECKOUT_CLAIM_TTL_MS = 60 * 60 * 1000;
function mintCheckoutClaim(now = Date.now()) {
    const claim = (0, crypto_1.randomBytes)(32).toString('base64url');
    return {
        claim,
        hash: (0, crypto_1.createHash)('sha256').update(claim).digest('hex'),
        expiresAt: new Date(now + exports.CHECKOUT_CLAIM_TTL_MS).toISOString(),
    };
}
function checkoutClaimStatus(order, claim, now = Date.now()) {
    if (typeof claim !== 'string' || claim.length < 32 || claim.length > 128)
        return 'invalid';
    const stored = typeof order.checkoutClaimHash === 'string' ? order.checkoutClaimHash : '';
    if (!stored)
        return 'invalid';
    const given = (0, crypto_1.createHash)('sha256').update(claim).digest('hex');
    const a = Buffer.from(given, 'hex');
    const b = Buffer.from(stored, 'hex');
    if (a.length !== b.length || !(0, crypto_1.timingSafeEqual)(a, b))
        return 'invalid';
    if (order.checkoutClaimUsedAt)
        return 'used';
    const expires = typeof order.checkoutClaimExpiresAt === 'string' ? Date.parse(order.checkoutClaimExpiresAt) : NaN;
    if (!Number.isFinite(expires) || expires < now)
        return 'expired';
    return 'ok';
}
//# sourceMappingURL=checkoutAccount.js.map