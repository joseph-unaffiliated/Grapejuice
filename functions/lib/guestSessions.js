"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteGuestDataByEmail = exports.scheduledPurgeGuestSessions = exports.resumeGuestSession = exports.markGuestSessionConverted = exports.saveGuestSessionBeacon = exports.saveGuestSession = exports.VISITOR_ID_RE = exports.SNAPSHOT_MAX_BYTES = exports.RESUME_TOKEN_MAX_USES = exports.RESUME_TOKEN_TTL_DAYS = exports.GUEST_SESSION_TTL_DAYS = exports.GUEST_SESSION_SCHEMA_VERSION = void 0;
exports.appOrigin = appOrigin;
exports.sha256Hex = sha256Hex;
exports.emailHash = emailHash;
exports.summarizeSnapshot = summarizeSnapshot;
exports.validateSnapshot = validateSnapshot;
exports.validateVisitorId = validateVisitorId;
exports.saveGuestSessionRecord = saveGuestSessionRecord;
exports.scrubChildNames = scrubChildNames;
exports.mintResumeToken = mintResumeToken;
exports.resumeGuestSessionByToken = resumeGuestSessionByToken;
exports.purgeExpiredGuestData = purgeExpiredGuestData;
exports.isAdminEmail = isAdminEmail;
const logger = require("./logger");
const sentry_1 = require("./sentry");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
const untraditionalCio_1 = require("./untraditionalCio");
/**
 * Guest box recovery — server-side copy of a signed-out visitor's in-progress box.
 *
 * Collections (all client access denied in firestore.rules; functions only):
 *   guestSessions/{visitorId}      snapshot + summary flags, TTL on `expireAt` (60 days)
 *   guestResumeTokens/{sha256}     one-click resume links minted by retentionLead (30 days)
 *   retentionLeadEvents/{sha256}   dedupe + audit for forwarded Retention leads
 *
 * TTL policy (one-time, not part of `firebase deploy`):
 *   gcloud firestore fields ttls update expireAt --collection-group=guestSessions --project=grapejuice-pilot
 *   gcloud firestore fields ttls update expiresAt --collection-group=guestResumeTokens --project=grapejuice-pilot
 */
exports.GUEST_SESSION_SCHEMA_VERSION = 1;
exports.GUEST_SESSION_TTL_DAYS = 60;
exports.RESUME_TOKEN_TTL_DAYS = 30;
/** Resume links are meant for one person; cap re-use so a leaked link cannot be hammered. */
exports.RESUME_TOKEN_MAX_USES = 25;
exports.SNAPSHOT_MAX_BYTES = 50000;
const SAVE_MIN_INTERVAL_MS = 2000;
exports.VISITOR_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SNAPSHOT_TOP_LEVEL_KEYS = new Set(['v', 'guest', 'gift', 'entry', 'path']);
const APP_ORIGIN = ((_a = process.env.GJ_APP_ORIGIN) === null || _a === void 0 ? void 0 : _a.trim()) || 'https://grapejuice.co';
function appOrigin() {
    return APP_ORIGIN;
}
function sha256Hex(value) {
    return (0, crypto_1.createHash)('sha256').update(value).digest('hex');
}
function emailHash(email) {
    return sha256Hex(email.trim().toLowerCase());
}
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function arrayLen(v) {
    return Array.isArray(v) ? v.length : 0;
}
/** Derive the flags the lead function and campaigns key off. Mirrors src/stores/guestSessionStore.ts. */
function summarizeSnapshot(snapshot) {
    const guest = isRecord(snapshot.guest) ? snapshot.guest : {};
    const gift = isRecord(snapshot.gift) ? snapshot.gift : null;
    const giftDraft = gift && isRecord(gift.draft) ? gift.draft : null;
    const lineItems = arrayLen(guest.lineItems);
    const giftItems = giftDraft ? arrayLen(giftDraft.lineItems) : 0;
    const kids = Array.isArray(guest.childDrafts)
        ? guest.childDrafts.filter((c) => isRecord(c) && c.role !== 'adult').length
        : 0;
    const hasBox = lineItems > 0 || guest.boxRevealComplete === true || guest.onboardingComplete === true;
    const hasGiftDraft = !!giftDraft && ((gift === null || gift === void 0 ? void 0 : gift.status) === 'incomplete' || giftItems > 0);
    return {
        hasBox,
        hasGiftDraft,
        boxItemCount: lineItems || giftItems,
        kidCount: kids,
        onboardingStep: typeof guest.onboardingStep === 'string' ? guest.onboardingStep : null,
    };
}
function validateSnapshot(raw) {
    if (!isRecord(raw))
        throw new sentry_1.HttpsError('invalid-argument', 'snapshot must be an object.');
    for (const key of Object.keys(raw)) {
        if (!SNAPSHOT_TOP_LEVEL_KEYS.has(key)) {
            throw new sentry_1.HttpsError('invalid-argument', `snapshot: unknown key "${key}".`);
        }
    }
    if (raw.v !== exports.GUEST_SESSION_SCHEMA_VERSION) {
        throw new sentry_1.HttpsError('invalid-argument', 'snapshot: unsupported version.');
    }
    if (raw.guest !== undefined && !isRecord(raw.guest)) {
        throw new sentry_1.HttpsError('invalid-argument', 'snapshot.guest must be an object.');
    }
    if (raw.gift !== undefined && raw.gift !== null && !isRecord(raw.gift)) {
        throw new sentry_1.HttpsError('invalid-argument', 'snapshot.gift must be an object or null.');
    }
    if (raw.entry !== undefined && raw.entry !== null && !isRecord(raw.entry)) {
        throw new sentry_1.HttpsError('invalid-argument', 'snapshot.entry must be an object or null.');
    }
    if (raw.path !== undefined && typeof raw.path !== 'string') {
        throw new sentry_1.HttpsError('invalid-argument', 'snapshot.path must be a string.');
    }
    const bytes = Buffer.byteLength(JSON.stringify(raw), 'utf8');
    if (bytes > exports.SNAPSHOT_MAX_BYTES) {
        throw new sentry_1.HttpsError('invalid-argument', `snapshot too large (${bytes} bytes).`);
    }
    return raw;
}
function validateVisitorId(raw) {
    if (typeof raw !== 'string' || !exports.VISITOR_ID_RE.test(raw)) {
        throw new sentry_1.HttpsError('invalid-argument', 'Invalid visitorId.');
    }
    return raw;
}
function expireAtFrom(now, days) {
    return firestore_1.Timestamp.fromMillis(now.getTime() + days * 24 * 60 * 60 * 1000);
}
/**
 * Upsert guestSessions/{visitorId}. Rate-limited per visitor; preserves createdAt,
 * convertedUid and lead linkage across saves.
 */
async function saveGuestSessionRecord(db, visitorId, snapshot, now = new Date()) {
    var _a, _b, _c, _d, _e, _f;
    const summary = summarizeSnapshot(snapshot);
    const ref = db.doc(`guestSessions/${visitorId}`);
    const snap = await ref.get();
    const prior = snap.data();
    const priorUpdated = (prior === null || prior === void 0 ? void 0 : prior.updatedAt) instanceof firestore_1.Timestamp ? prior.updatedAt.toMillis() : 0;
    if (priorUpdated && now.getTime() - priorUpdated < SAVE_MIN_INTERVAL_MS) {
        return { ok: true, skipped: 'rate_limited' };
    }
    const entry = isRecord(snapshot.entry) ? snapshot.entry : null;
    await ref.set(Object.assign(Object.assign({ schemaVersion: exports.GUEST_SESSION_SCHEMA_VERSION, snapshot }, summary), { path: typeof snapshot.path === 'string' ? snapshot.path.slice(0, 200) : null, entry, createdAt: (_a = prior === null || prior === void 0 ? void 0 : prior.createdAt) !== null && _a !== void 0 ? _a : firestore_1.Timestamp.fromDate(now), updatedAt: firestore_1.Timestamp.fromDate(now), expireAt: expireAtFrom(now, exports.GUEST_SESSION_TTL_DAYS), convertedUid: (_b = prior === null || prior === void 0 ? void 0 : prior.convertedUid) !== null && _b !== void 0 ? _b : null, convertedAt: (_c = prior === null || prior === void 0 ? void 0 : prior.convertedAt) !== null && _c !== void 0 ? _c : null, lastLeadEmailHash: (_d = prior === null || prior === void 0 ? void 0 : prior.lastLeadEmailHash) !== null && _d !== void 0 ? _d : null, lastLeadAt: (_e = prior === null || prior === void 0 ? void 0 : prior.lastLeadAt) !== null && _e !== void 0 ? _e : null, resumeCount: (_f = prior === null || prior === void 0 ? void 0 : prior.resumeCount) !== null && _f !== void 0 ? _f : 0, saveCount: firestore_1.FieldValue.increment(1) }), { merge: true });
    return { ok: true };
}
/** Callable used by the debounced client sync (src/hooks/useGuestSessionSync.ts). Unauthenticated. */
exports.saveGuestSession = (0, sentry_1.onCall)(async (request) => {
    var _a;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const visitorId = validateVisitorId(data.visitorId);
    const snapshot = validateSnapshot(data.snapshot);
    return saveGuestSessionRecord((0, firestore_1.getFirestore)(), visitorId, snapshot);
});
const BEACON_ORIGINS = [
    'https://grapejuice.co',
    'https://www.grapejuice.co',
    'https://app.grapejuice.co',
    'https://grapejuice-pilot.web.app',
    'https://grapejuice-pilot.firebaseapp.com',
];
/**
 * `navigator.sendBeacon` target for the last edit before the tab closes. Body is text/plain
 * JSON (a "simple" request, so no CORS preflight is needed at pagehide). Same validation
 * as the callable; the client never reads the response.
 */
exports.saveGuestSessionBeacon = (0, sentry_1.onRequest)({ cors: BEACON_ORIGINS }, async (req, res) => {
    var _a, _b;
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    try {
        const raw = typeof req.body === 'string' ? req.body : (_b = (_a = req.rawBody) === null || _a === void 0 ? void 0 : _a.toString('utf8')) !== null && _b !== void 0 ? _b : '';
        const parsed = (raw ? JSON.parse(raw) : isRecord(req.body) ? req.body : {});
        const visitorId = validateVisitorId(parsed.visitorId);
        const snapshot = validateSnapshot(parsed.snapshot);
        await saveGuestSessionRecord((0, firestore_1.getFirestore)(), visitorId, snapshot);
        res.status(204).send('');
    }
    catch (err) {
        const code = err instanceof sentry_1.HttpsError ? 400 : 500;
        if (code === 500)
            logger.error('saveGuestSessionBeacon failed', err);
        res.status(code).send('');
    }
});
/** Strip children's first names from a saved snapshot (the account now holds them). */
function scrubChildNames(snapshot) {
    const guest = isRecord(snapshot.guest) ? snapshot.guest : null;
    if (!guest || !Array.isArray(guest.childDrafts))
        return snapshot;
    return Object.assign(Object.assign({}, snapshot), { guest: Object.assign(Object.assign({}, guest), { childDrafts: guest.childDrafts.map((c) => (isRecord(c) ? Object.assign(Object.assign({}, c), { name: '' }) : c)) }) });
}
/**
 * Called by persistGuestToAccount after sign-up: records the account so recovery emails stop,
 * and scrubs child names from the stored snapshot.
 */
exports.markGuestSessionConverted = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const visitorId = validateVisitorId(data.visitorId);
    const db = (0, firestore_1.getFirestore)();
    const ref = db.doc(`guestSessions/${visitorId}`);
    const snap = await ref.get();
    if (!snap.exists)
        return { ok: true, found: false };
    const stored = (_c = snap.data()) !== null && _c !== void 0 ? _c : {};
    const scrubbed = isRecord(stored.snapshot) ? scrubChildNames(stored.snapshot) : null;
    await ref.set(Object.assign({ convertedUid: request.auth.uid, convertedAt: firestore_1.FieldValue.serverTimestamp() }, (scrubbed ? { snapshot: scrubbed } : null)), { merge: true });
    return { ok: true, found: true };
});
/** Mint a one-click resume link; only the SHA-256 of the token is stored. */
async function mintResumeToken(db, visitorId, leadEmail, now = new Date()) {
    const token = (0, crypto_1.randomBytes)(32).toString('base64url');
    const hash = sha256Hex(token);
    await db.doc(`guestResumeTokens/${hash}`).set({
        visitorId,
        emailHash: emailHash(leadEmail),
        createdAt: firestore_1.Timestamp.fromDate(now),
        expiresAt: expireAtFrom(now, exports.RESUME_TOKEN_TTL_DAYS),
        usedCount: 0,
        lastUsedAt: null,
    });
    return { token, hash, url: `${APP_ORIGIN}/?resume=${token}` };
}
async function resumeGuestSessionByToken(db, token, now = new Date()) {
    var _a;
    if (typeof token !== 'string' || token.length < 32 || token.length > 128)
        return { status: 'invalid' };
    const tokenRef = db.doc(`guestResumeTokens/${sha256Hex(token)}`);
    const tokenSnap = await tokenRef.get();
    const tok = tokenSnap.data();
    if (!tok)
        return { status: 'invalid' };
    const expires = tok.expiresAt instanceof firestore_1.Timestamp ? tok.expiresAt.toMillis() : 0;
    if (!expires || expires < now.getTime())
        return { status: 'expired' };
    if (((_a = tok.usedCount) !== null && _a !== void 0 ? _a : 0) >= exports.RESUME_TOKEN_MAX_USES)
        return { status: 'expired' };
    const visitorId = tok.visitorId;
    const sessionRef = db.doc(`guestSessions/${visitorId}`);
    const sessionSnap = await sessionRef.get();
    const session = sessionSnap.data();
    if (!session || !isRecord(session.snapshot))
        return { status: 'gone' };
    await Promise.all([
        tokenRef.set({ usedCount: firestore_1.FieldValue.increment(1), lastUsedAt: firestore_1.Timestamp.fromDate(now) }, { merge: true }),
        sessionRef.set({
            resumeCount: firestore_1.FieldValue.increment(1),
            lastResumedAt: firestore_1.Timestamp.fromDate(now),
            // A click means the box is still wanted — give it another full window.
            expireAt: expireAtFrom(now, exports.GUEST_SESSION_TTL_DAYS),
        }, { merge: true }),
    ]);
    return {
        status: 'ok',
        visitorId,
        snapshot: session.snapshot,
        converted: typeof session.convertedUid === 'string' && session.convertedUid.length > 0,
        hasBox: session.hasBox === true,
    };
}
/** `?resume=TOKEN` → saved snapshot (src/navigation/ResumeLinkEffect.tsx). Unauthenticated. */
/** Kept warm: a cold start leaves an email click on the storefront for seconds before the box opens. */
exports.resumeGuestSession = (0, sentry_1.onCall)({ minInstances: 1 }, async (request) => {
    var _a;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    if (typeof data.token !== 'string')
        throw new sentry_1.HttpsError('invalid-argument', 'token required.');
    return resumeGuestSessionByToken((0, firestore_1.getFirestore)(), data.token);
});
/**
 * Daily purge of expired sessions and tokens. A Firestore TTL policy on `expireAt` /
 * `expiresAt` (see header) does the same thing natively; this keeps retention honest even
 * before that policy is enabled.
 */
async function purgeExpiredGuestData(db, now = new Date()) {
    const cutoff = firestore_1.Timestamp.fromDate(now);
    const counts = { sessions: 0, tokens: 0 };
    for (const [collection, field, key] of [
        ['guestSessions', 'expireAt', 'sessions'],
        ['guestResumeTokens', 'expiresAt', 'tokens'],
    ]) {
        // Bounded per run; the schedule picks up the rest tomorrow.
        const snap = await db.collection(collection).where(field, '<=', cutoff).limit(400).get();
        if (snap.empty)
            continue;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        counts[key] = snap.size;
    }
    return counts;
}
exports.scheduledPurgeGuestSessions = (0, sentry_1.onSchedule)('every day 04:00', async () => {
    const counts = await purgeExpiredGuestData((0, firestore_1.getFirestore)());
    logger.info('scheduledPurgeGuestSessions', counts);
});
/** Mirrors firestore.rules isAdmin() — pilot ops allowlist with plus-aliases. */
function isAdminEmail(email) {
    if (!email)
        return false;
    return /^(brendan|joseph|maya)(\+[^@]*)?@unaffiliated\.co$/i.test(email.trim());
}
/**
 * Data-rights path: remove everything we hold for a lead email — guest sessions linked to it,
 * resume tokens, lead events, and the Untraditional Customer.io person. Admin only.
 */
exports.deleteGuestDataByEmail = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!isAdminEmail((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.email)) {
        throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
    }
    const data = ((_c = request.data) !== null && _c !== void 0 ? _c : {});
    if (typeof data.email !== 'string' || !data.email.includes('@')) {
        throw new sentry_1.HttpsError('invalid-argument', 'email required.');
    }
    const hash = emailHash(data.email);
    const db = (0, firestore_1.getFirestore)();
    const [sessions, tokens, events] = await Promise.all([
        db.collection('guestSessions').where('lastLeadEmailHash', '==', hash).get(),
        db.collection('guestResumeTokens').where('emailHash', '==', hash).get(),
        db.collection('retentionLeadEvents').where('emailHash', '==', hash).get(),
    ]);
    const batch = db.batch();
    for (const d of [...sessions.docs, ...tokens.docs, ...events.docs])
        batch.delete(d.ref);
    await batch.commit();
    let customerio = false;
    try {
        customerio = await (0, untraditionalCio_1.untraditionalDeletePerson)(data.email);
    }
    catch (err) {
        logger.error('deleteGuestDataByEmail: Customer.io delete failed', err);
    }
    logger.info('deleteGuestDataByEmail', {
        by: (_e = (_d = request.auth) === null || _d === void 0 ? void 0 : _d.token) === null || _e === void 0 ? void 0 : _e.email,
        sessions: sessions.size,
        tokens: tokens.size,
        events: events.size,
        customerio,
    });
    return { sessions: sessions.size, tokens: tokens.size, events: events.size, customerio };
});
//# sourceMappingURL=guestSessions.js.map