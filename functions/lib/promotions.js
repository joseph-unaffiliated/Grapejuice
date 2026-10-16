"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminPromotions = exports.awardDebriefCredit = exports.checkPromo = exports.getMyInfluencerStats = void 0;
exports.findOrCreateAccountByEmail = findOrCreateAccountByEmail;
exports.resolveCheckoutPromo = resolveCheckoutPromo;
exports.applyResolvedPromo = applyResolvedPromo;
exports.recordPromoRedemption = recordPromoRedemption;
/**
 * Discount codes, direct credit grants and influencer links. Every collection here is server-only
 * (firestore.rules denies clients); admins work through adminPromotions.
 *
 * - discountCodes/{CODE}
 * - influencers/{slug}, influencerVisits/{slug}_{visitorId}, influencerPayouts/{id}
 * - creditGrants/{id}
 * - promoRedemptions/{sourcePath with / → _}: one per order or gift that carried a code or an
 *   influencer link. Usage and commission are read live from the source doc, so a cancelled or
 *   refunded order drops out on its own.
 */
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const guestSessions_1 = require("./guestSessions");
const loginLinks_1 = require("./loginLinks");
const promoPricing_1 = require("./promoPricing");
const HOLIDAY_ID = 'hanukkah-2026';
/** An unpaid checkout holds a limited code's slot this long (stale ones are cancelled anyway). */
const PENDING_HOLD_MS = 2 * 60 * 60 * 1000;
const MAX_GRANT_CENTS = 200000;
/** Matches src/services/box/pricing.ts DEBRIEF_PLATFORM_CREDIT_CENTS. */
const DEBRIEF_PLATFORM_CREDIT_CENTS = 8000;
const NO_PROMO = { code: null, influencer: null, selfReferral: false, buyerKey: null };
function termsOf(d) {
    return {
        percentOff: typeof (d === null || d === void 0 ? void 0 : d.percentOff) === 'number' ? d.percentOff : null,
        amountOffCents: typeof (d === null || d === void 0 ? void 0 : d.amountOffCents) === 'number' ? d.amountOffCents : null,
    };
}
function codeRecordOf(d) {
    var _a;
    return Object.assign(Object.assign({}, termsOf(d)), { code: String((_a = d.code) !== null && _a !== void 0 ? _a : ''), startsAt: typeof d.startsAt === 'string' ? d.startsAt : null, endsAt: typeof d.endsAt === 'string' ? d.endsAt : null, maxRedemptions: typeof d.maxRedemptions === 'number' ? d.maxRedemptions : null, onePerAccount: d.onePerAccount === true, active: d.active !== false, note: typeof d.note === 'string' ? d.note : null });
}
function influencerRecordOf(slug, d) {
    var _a, _b;
    return Object.assign(Object.assign({}, termsOf(d)), { slug, name: String((_a = d.name) !== null && _a !== void 0 ? _a : ''), email: String((_b = d.email) !== null && _b !== void 0 ? _b : ''), commissionPercent: typeof d.commissionPercent === 'number' ? d.commissionPercent : 0, active: d.active !== false });
}
function influencerLink(slug) {
    return `${(0, guestSessions_1.appOrigin)()}/r/${slug}`;
}
// ---------------------------------------------------------------------------
// Find or create an account by email (credit grants, influencers)
// ---------------------------------------------------------------------------
/**
 * Existing Firebase Auth user or a new passwordless one (unverified, like gift givers). Makes sure
 * the users doc and a household exist so credit has somewhere to live. Never mints a sign-in token:
 * the person signs in with "email me a link".
 */
async function findOrCreateAccountByEmail(db, email, displayName) {
    var _a, _b, _c;
    const auth = (0, auth_1.getAuth)();
    let uid = null;
    let accountCreated = false;
    try {
        uid = (await auth.getUserByEmail(email)).uid;
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/user-not-found')
            throw err;
    }
    if (!uid) {
        try {
            const created = await auth.createUser(Object.assign({ email, 
                // Must stay false: admin access by staff email requires a verified address.
                emailVerified: false }, (displayName ? { displayName } : {})));
            uid = created.uid;
            accountCreated = true;
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) !== 'auth/email-already-exists')
                throw err;
            uid = (await auth.getUserByEmail(email)).uid;
        }
    }
    const now = new Date().toISOString();
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    let householdId = typeof ((_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.householdId) === 'string' ? userSnap.data().householdId : '';
    if (householdId && !(await db.doc(`households/${householdId}`).get()).exists)
        householdId = '';
    if (!householdId) {
        const owned = await db.collection('households').where('ownerId', '==', uid).limit(1).get();
        householdId = (_c = (_b = owned.docs[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : '';
    }
    if (!householdId) {
        const hhRef = db.collection('households').doc();
        await hhRef.set({
            name: 'Our household',
            ownerId: uid,
            memberIds: [uid],
            childUserIds: [],
            createdAt: now,
            updatedAt: now,
        });
        householdId = hhRef.id;
    }
    await userRef.set(Object.assign({ householdId, updatedAt: now }, (userSnap.exists
        ? {}
        : {
            uid,
            email,
            displayName: displayName !== null && displayName !== void 0 ? displayName : null,
            role: 'parent',
            // Same landing as gift givers: the app, not the box-builder onboarding.
            onboardingComplete: true,
            boxRevealComplete: true,
            createdAt: now,
        })), { merge: true });
    return { uid, householdId, accountCreated };
}
async function withSources(db, docs) {
    const rows = docs.map((d) => ({ id: d.id, data: d.data(), source: null }));
    for (let i = 0; i < rows.length; i += 300) {
        const chunk = rows.slice(i, i + 300);
        const snaps = await db.getAll(...chunk.map((r) => db.doc(String(r.data.sourcePath))));
        snaps.forEach((s, j) => {
            var _a;
            chunk[j].source = s.exists ? (_a = s.data()) !== null && _a !== void 0 ? _a : null : null;
        });
    }
    return rows;
}
function rowCounted(row) {
    if (!row.source)
        return false;
    return row.data.kind === 'gift' ? (0, promoPricing_1.isCountedGift)(row.source) : (0, promoPricing_1.isCountedOrder)(row.source);
}
function rowPendingHold(row, nowMs) {
    if (!row.source)
        return false;
    const pending = row.data.kind === 'gift' ? row.source.paymentStatus === 'pending' : row.source.status === 'pending';
    const at = typeof row.data.createdAtMs === 'number' ? row.data.createdAtMs : 0;
    return pending && nowMs - at < PENDING_HOLD_MS;
}
function rowNetCents(row) {
    if (!row.source)
        return 0;
    return row.data.kind === 'gift' ? (0, promoPricing_1.giftNetCents)(row.source) : (0, promoPricing_1.orderNetCents)(row.source);
}
async function codeUsage(db, code, buyerKey, nowMs) {
    const snap = await db.collection('promoRedemptions').where('code', '==', code).get();
    const rows = await withSources(db, snap.docs);
    let used = 0;
    let usedByBuyer = 0;
    for (const row of rows) {
        const counted = rowCounted(row);
        if (counted || rowPendingHold(row, nowMs))
            used += 1;
        if (counted && buyerKey && row.data.buyerKey === buyerKey)
            usedByBuyer += 1;
    }
    return { used, usedByBuyer };
}
/** Validate an entered code for this buyer. Throws invalid-argument with a shopper-facing message. */
async function resolveCode(db, rawCode, buyerKey, nowMs) {
    const code = (0, promoPricing_1.normalizeCode)(rawCode);
    const snap = code ? await db.doc(`discountCodes/${code}`).get() : null;
    if (!code || !(snap === null || snap === void 0 ? void 0 : snap.exists)) {
        throw new sentry_1.HttpsError('invalid-argument', 'We don’t recognize that code.');
    }
    const record = codeRecordOf(snap.data());
    const usage = await codeUsage(db, code, buyerKey, nowMs);
    const check = (0, promoPricing_1.checkDiscountCode)(record, nowMs, usage);
    if (!check.ok)
        throw new sentry_1.HttpsError('invalid-argument', check.message);
    return { code, terms: termsOf(record) };
}
async function resolveInfluencer(db, rawRef, refAt, nowMs) {
    const slug = (0, promoPricing_1.normalizeSlug)(rawRef);
    if (!slug || !(0, promoPricing_1.referralStillValid)(refAt, nowMs))
        return null;
    const snap = await db.doc(`influencers/${slug}`).get();
    if (!snap.exists)
        return null;
    const record = influencerRecordOf(slug, snap.data());
    return record.active ? { slug, record } : null;
}
/**
 * Checkout entry point. A bad code throws (the shopper typed it); a stale or unknown influencer
 * link is ignored. `buyerEmail` drives one-per-account and self-referral.
 */
async function resolveCheckoutPromo(db, raw, buyerEmail) {
    if (!raw || typeof raw !== 'object')
        return NO_PROMO;
    const req = raw;
    const nowMs = Date.now();
    const buyerKey = buyerEmail ? (0, guestSessions_1.emailHash)(buyerEmail) : null;
    const rawCode = typeof req.code === 'string' ? req.code.trim() : '';
    const [code, influencer] = await Promise.all([
        rawCode ? resolveCode(db, rawCode, buyerKey, nowMs) : Promise.resolve(null),
        resolveInfluencer(db, req.ref, req.refAt, nowMs),
    ]);
    const selfReferral = Boolean(influencer && buyerEmail && influencer.record.email === buyerEmail.toLowerCase());
    return {
        code,
        influencer: influencer
            ? {
                slug: influencer.slug,
                terms: termsOf(influencer.record),
                commissionPercent: influencer.record.commissionPercent,
            }
            : null,
        selfReferral,
        buyerKey,
    };
}
/** Discount for `eligibleCents` (merchandise subtotal) and the snapshot to store on the order. */
function applyResolvedPromo(resolved, eligibleCents) {
    var _a, _b, _c, _d;
    const pick = (0, promoPricing_1.pickDiscount)(eligibleCents, resolved.code, resolved.influencer);
    const promo = (0, promoPricing_1.orderPromoSnapshot)({
        pick,
        code: (_b = (_a = resolved.code) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : null,
        influencerSlug: (_d = (_c = resolved.influencer) === null || _c === void 0 ? void 0 : _c.slug) !== null && _d !== void 0 ? _d : null,
        selfReferral: resolved.selfReferral,
    });
    return { discountCents: pick.discountCents, promo };
}
/** Count the order / gift toward its code and influencer. Best-effort: never fails a checkout. */
async function recordPromoRedemption(db, input) {
    var _a, _b;
    const { promo, resolved } = input;
    if (!promo)
        return;
    const code = promo.source === 'code' ? promo.code : null;
    const influencerSlug = promo.influencerSlug && !promo.selfReferral ? promo.influencerSlug : null;
    if (!code && !influencerSlug)
        return;
    try {
        await db.doc(`promoRedemptions/${input.sourcePath.replace(/\//g, '_')}`).set({
            sourcePath: input.sourcePath,
            kind: input.kind,
            code,
            influencerSlug,
            commissionPercent: influencerSlug ? (_b = (_a = resolved.influencer) === null || _a === void 0 ? void 0 : _a.commissionPercent) !== null && _b !== void 0 ? _b : 0 : null,
            buyerKey: resolved.buyerKey,
            householdId: input.householdId,
            createdAt: new Date().toISOString(),
            createdAtMs: Date.now(),
        });
    }
    catch (err) {
        logger.error('recordPromoRedemption failed', err instanceof Error ? err : String(err));
    }
}
function purchaseKind(row) {
    var _a, _b;
    if (row.data.kind === 'gift')
        return 'Gift';
    const t = String((_b = (_a = row.source) === null || _a === void 0 ? void 0 : _a.orderType) !== null && _b !== void 0 ? _b : '');
    if (t === 'hanukkah_box')
        return 'Box';
    if (t === 'marketplace')
        return 'Shop order';
    if (t === 'received_gift')
        return 'Gift box upgrade';
    return 'Order';
}
function statsFromRows(rows, fallbackPercent, paidOutCents) {
    var _a;
    let purchases = 0;
    let salesCents = 0;
    let earningsCents = 0;
    const recent = [];
    for (const row of rows) {
        if (!rowCounted(row))
            continue;
        const net = rowNetCents(row);
        const pct = typeof row.data.commissionPercent === 'number' ? row.data.commissionPercent : fallbackPercent;
        const commission = (0, promoPricing_1.commissionCents)(pct, net);
        purchases += 1;
        salesCents += net;
        earningsCents += commission;
        recent.push({
            date: String((_a = row.data.createdAt) !== null && _a !== void 0 ? _a : '').slice(0, 10),
            kind: purchaseKind(row),
            netCents: net,
            commissionCents: commission,
        });
    }
    recent.sort((a, b) => (a.date < b.date ? 1 : -1));
    return {
        purchases,
        salesCents,
        earningsCents,
        paidOutCents,
        owedCents: Math.max(0, earningsCents - paidOutCents),
        recent: recent.slice(0, 50),
    };
}
async function influencerStats(db, slug, fallbackPercent) {
    const [redemptions, payouts] = await Promise.all([
        db.collection('promoRedemptions').where('influencerSlug', '==', slug).get(),
        db.collection('influencerPayouts').where('slug', '==', slug).get(),
    ]);
    const rows = await withSources(db, redemptions.docs);
    const paid = payouts.docs.reduce((s, d) => s + (Number(d.data().amountCents) || 0), 0);
    return statsFromRows(rows, fallbackPercent, paid);
}
/** Signed-in influencers (verified email matches an influencer record) see only their own totals. */
exports.getMyInfluencerStats = (0, sentry_1.onCall)(async (request) => {
    var _a, _b;
    const token = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token;
    if (!((_b = request.auth) === null || _b === void 0 ? void 0 : _b.uid) || !token)
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const email = typeof token.email === 'string' ? token.email.trim().toLowerCase() : '';
    if (!email || token.email_verified !== true)
        return { influencers: [] };
    const db = (0, firestore_1.getFirestore)();
    const snap = await db.collection('influencers').where('email', '==', email).get();
    const influencers = await Promise.all(snap.docs.map(async (d) => {
        const rec = influencerRecordOf(d.id, d.data());
        const stats = await influencerStats(db, d.id, rec.commissionPercent);
        return Object.assign({ slug: d.id, name: rec.name, link: influencerLink(d.id), active: rec.active, discountLabel: (0, promoPricing_1.termsLabel)(rec), commissionPercent: rec.commissionPercent }, stats);
    }));
    return { influencers };
});
// ---------------------------------------------------------------------------
// checkPromo: the shopper-facing preview (and influencer link visits)
// ---------------------------------------------------------------------------
exports.checkPromo = (0, sentry_1.onCall)(async (request) => {
    var _a, _b;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const db = (0, firestore_1.getFirestore)();
    const nowMs = Date.now();
    const out = { code: null, influencer: null };
    const rawCode = typeof data.code === 'string' ? data.code.trim() : '';
    if (rawCode) {
        await (0, loginLinks_1.enforceRateLimits)(db, null, request.rawRequest, 'promo:');
        const email = typeof ((_b = request.auth) === null || _b === void 0 ? void 0 : _b.token.email) === 'string' ? request.auth.token.email.toLowerCase() : null;
        try {
            const code = await resolveCode(db, rawCode, email ? (0, guestSessions_1.emailHash)(email) : null, nowMs);
            out.code = Object.assign(Object.assign({ ok: true, code: code.code }, code.terms), { label: (0, promoPricing_1.termsLabel)(code.terms) });
        }
        catch (err) {
            if (!(err instanceof sentry_1.HttpsError))
                throw err;
            out.code = { ok: false, message: err.message };
        }
    }
    const influencer = await resolveInfluencer(db, data.ref, data.refAt, nowMs);
    if (influencer) {
        const terms = termsOf(influencer.record);
        out.influencer = Object.assign(Object.assign({ slug: influencer.slug, name: influencer.record.name }, terms), { label: (0, promoPricing_1.hasDiscount)(terms) ? (0, promoPricing_1.termsLabel)(terms) : '' });
        if (data.recordVisit === true) {
            await recordInfluencerVisit(db, influencer.slug, data.visitorId).catch((err) => logger.warn('recordInfluencerVisit failed', { err: String(err) }));
        }
    }
    return out;
});
async function recordInfluencerVisit(db, slug, rawVisitorId) {
    const visitorId = typeof rawVisitorId === 'string' && guestSessions_1.VISITOR_ID_RE.test(rawVisitorId) ? rawVisitorId : null;
    let unique = false;
    if (visitorId) {
        try {
            await db.doc(`influencerVisits/${slug}_${visitorId}`).create({ slug, at: new Date().toISOString() });
            unique = true;
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) !== 6)
                throw err; // ALREADY_EXISTS
        }
    }
    await db.doc(`influencers/${slug}`).update(Object.assign({ visitCount: firestore_1.FieldValue.increment(1) }, (unique ? { uniqueVisitorCount: firestore_1.FieldValue.increment(1) } : {})));
}
// ---------------------------------------------------------------------------
// awardDebriefCredit: the post-Hanukkah reflection credit, server-side so clients can't write credit
// ---------------------------------------------------------------------------
exports.awardDebriefCredit = (0, sentry_1.onCall)(async (request) => {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const db = (0, firestore_1.getFirestore)();
    const userSnap = await db.doc(`users/${uid}`).get();
    const householdId = typeof ((_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.householdId) === 'string' ? userSnap.data().householdId : '';
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    const reflection = await db.doc(`users/${uid}/reflection/${HOLIDAY_ID}`).get();
    if (!reflection.exists)
        throw new sentry_1.HttpsError('failed-precondition', 'Finish the debrief first.');
    const markerRef = db.doc(`creditAwards/debrief_${HOLIDAY_ID}_${uid}`);
    const hhRef = db.doc(`households/${householdId}`);
    const awarded = await db.runTransaction(async (tx) => {
        var _a, _b;
        const [marker, hh] = await Promise.all([tx.get(markerRef), tx.get(hhRef)]);
        if (marker.exists)
            return 0;
        const members = (_b = (_a = hh.data()) === null || _a === void 0 ? void 0 : _a.memberIds) !== null && _b !== void 0 ? _b : [];
        if (!hh.exists || !members.includes(uid))
            throw new sentry_1.HttpsError('permission-denied', 'Not a household member.');
        tx.set(markerRef, { uid, householdId, amountCents: DEBRIEF_PLATFORM_CREDIT_CENTS, createdAt: new Date().toISOString() });
        tx.update(hhRef, {
            platformCreditCents: firestore_1.FieldValue.increment(DEBRIEF_PLATFORM_CREDIT_CENTS),
            updatedAt: new Date().toISOString(),
        });
        return DEBRIEF_PLATFORM_CREDIT_CENTS;
    });
    return { awardedCents: awarded };
});
function fail(message) {
    throw new sentry_1.HttpsError('invalid-argument', message);
}
function unwrap(v) {
    if (v && typeof v === 'object' && 'error' in v)
        fail(v.error);
    return v;
}
async function listCodes(db) {
    var _a, _b, _c;
    const nowMs = Date.now();
    const [codes, redemptions] = await Promise.all([
        db.collection('discountCodes').get(),
        db.collection('promoRedemptions').where('code', '!=', null).get(),
    ]);
    const rows = await withSources(db, redemptions.docs);
    const byCode = new Map();
    for (const row of rows) {
        const code = String((_a = row.data.code) !== null && _a !== void 0 ? _a : '');
        const agg = (_b = byCode.get(code)) !== null && _b !== void 0 ? _b : { used: 0, pending: 0, discountCents: 0, salesCents: 0 };
        if (rowCounted(row)) {
            agg.used += 1;
            agg.discountCents += Number((_c = row.source) === null || _c === void 0 ? void 0 : _c.discountCents) || 0;
            agg.salesCents += rowNetCents(row);
        }
        else if (rowPendingHold(row, nowMs)) {
            agg.pending += 1;
        }
        byCode.set(code, agg);
    }
    return codes.docs
        .map((d) => {
        var _a, _b, _c;
        const data = d.data();
        const rec = codeRecordOf(data);
        const agg = (_a = byCode.get(d.id)) !== null && _a !== void 0 ? _a : { used: 0, pending: 0, discountCents: 0, salesCents: 0 };
        return Object.assign(Object.assign({}, rec), { code: d.id, label: (0, promoPricing_1.termsLabel)(rec), status: (0, promoPricing_1.codeStatus)(rec, nowMs, agg.used), used: agg.used, pending: agg.pending, remaining: rec.maxRedemptions == null ? null : Math.max(0, rec.maxRedemptions - agg.used), discountGivenCents: agg.discountCents, salesCents: agg.salesCents, createdAt: String((_b = data.createdAt) !== null && _b !== void 0 ? _b : ''), createdByEmail: String((_c = data.createdByEmail) !== null && _c !== void 0 ? _c : '') });
    })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
async function saveCode(db, actor, input) {
    const isNew = input.isNew === true;
    let code;
    if (isNew && input.generate === true) {
        code = null;
        for (let i = 0; i < 5 && !code; i += 1) {
            const candidate = (0, promoPricing_1.randomCode)(8);
            if (!(await db.doc(`discountCodes/${candidate}`).get()).exists)
                code = candidate;
        }
        if (!code)
            fail('Could not generate a unique code. Try again.');
    }
    else {
        code = (0, promoPricing_1.normalizeCode)(input.code);
        if (!code)
            fail('Codes are 3–32 letters, numbers, - or _.');
    }
    const terms = unwrap((0, promoPricing_1.parseTermsInput)(input, false));
    const startsAt = unwrap((0, promoPricing_1.parseIsoInput)(input.startsAt));
    const endsAt = unwrap((0, promoPricing_1.parseIsoInput)(input.endsAt));
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt))
        fail('The end date must be after the start date.');
    const maxRaw = input.maxRedemptions;
    const maxRedemptions = maxRaw == null || maxRaw === '' ? null : Math.floor(Number(maxRaw));
    if (maxRedemptions != null && (!Number.isFinite(maxRedemptions) || maxRedemptions < 1)) {
        fail('Max redemptions must be at least 1 (or blank for unlimited).');
    }
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
    const now = new Date().toISOString();
    const ref = db.doc(`discountCodes/${code}`);
    const fields = Object.assign(Object.assign({ code }, terms), { startsAt,
        endsAt,
        maxRedemptions, onePerAccount: input.onePerAccount === true, active: input.active !== false, note: note || null, updatedAt: now, updatedByEmail: actor.email });
    if (isNew) {
        try {
            await ref.create(Object.assign(Object.assign({}, fields), { createdAt: now, createdByEmail: actor.email }));
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === 6)
                fail('That code already exists.');
            throw err;
        }
    }
    else {
        if (!(await ref.get()).exists)
            fail('Code not found.');
        await ref.update(fields);
    }
    return { code };
}
async function listCredits(db) {
    const snap = await db.collection('creditGrants').orderBy('createdAt', 'desc').limit(500).get();
    const grants = snap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    const householdIds = [...new Set(grants.map((g) => { var _a; return String((_a = g.householdId) !== null && _a !== void 0 ? _a : ''); }).filter(Boolean))];
    const balances = new Map();
    for (let i = 0; i < householdIds.length; i += 300) {
        const chunk = householdIds.slice(i, i + 300);
        const snaps = await db.getAll(...chunk.map((id) => db.doc(`households/${id}`)));
        snaps.forEach((s) => { var _a; return balances.set(s.id, Number((_a = s.data()) === null || _a === void 0 ? void 0 : _a.giftCreditCents) || 0); });
    }
    // Credit is fungible: assume the oldest grants are spent first, so newer ones hold the balance.
    const remainingByHousehold = new Map(balances);
    return grants.map((g) => {
        var _a, _b, _c, _d;
        const amount = Number(g.amountCents) || 0;
        let unusedCents = 0;
        if (g.status !== 'revoked') {
            const left = (_a = remainingByHousehold.get(String(g.householdId))) !== null && _a !== void 0 ? _a : 0;
            unusedCents = Math.min(amount, left);
            remainingByHousehold.set(String(g.householdId), left - unusedCents);
        }
        return {
            id: g.id,
            email: String((_b = g.email) !== null && _b !== void 0 ? _b : ''),
            amountCents: amount,
            note: typeof g.note === 'string' ? g.note : null,
            createdAt: String((_c = g.createdAt) !== null && _c !== void 0 ? _c : ''),
            grantedByEmail: String((_d = g.grantedByEmail) !== null && _d !== void 0 ? _d : ''),
            accountCreated: g.accountCreated === true,
            status: g.status === 'revoked' ? 'revoked' : unusedCents >= amount ? 'unused' : unusedCents > 0 ? 'partly used' : 'used',
            usedCents: g.status === 'revoked' ? 0 : amount - unusedCents,
            revokedAt: typeof g.revokedAt === 'string' ? g.revokedAt : null,
        };
    });
}
async function grantCredit(db, actor, input) {
    const email = (0, loginLinks_1.normalizeEmail)(input.email);
    const amountCents = Math.round(Number(input.amountCents));
    if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > MAX_GRANT_CENTS) {
        fail(`Credit must be between $1 and $${MAX_GRANT_CENTS / 100}.`);
    }
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
    const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : null;
    const account = await findOrCreateAccountByEmail(db, email, name);
    const grantRef = db.collection('creditGrants').doc();
    const hhRef = db.doc(`households/${account.householdId}`);
    const now = new Date().toISOString();
    await db.runTransaction(async (tx) => {
        const hh = await tx.get(hhRef);
        if (!hh.exists)
            throw new sentry_1.HttpsError('failed-precondition', 'Household missing.');
        tx.update(hhRef, { giftCreditCents: firestore_1.FieldValue.increment(amountCents), updatedAt: now });
        tx.set(grantRef, {
            email,
            amountCents,
            note: note || null,
            uid: account.uid,
            householdId: account.householdId,
            accountCreated: account.accountCreated,
            status: 'active',
            grantedByUid: actor.uid,
            grantedByEmail: actor.email,
            createdAt: now,
        });
    });
    logger.info('grantCredit', { grantId: grantRef.id, amountCents, accountCreated: account.accountCreated });
    return { id: grantRef.id, accountCreated: account.accountCreated };
}
async function revokeCredit(db, actor, input) {
    const grantId = typeof input.grantId === 'string' ? input.grantId : '';
    if (!grantId)
        fail('grantId required.');
    const grantRef = db.doc(`creditGrants/${grantId}`);
    await db.runTransaction(async (tx) => {
        var _a;
        const grant = await tx.get(grantRef);
        if (!grant.exists)
            fail('Grant not found.');
        const g = grant.data();
        if (g.status === 'revoked')
            fail('Already revoked.');
        const hhRef = db.doc(`households/${g.householdId}`);
        const hh = await tx.get(hhRef);
        const balance = Number((_a = hh.data()) === null || _a === void 0 ? void 0 : _a.giftCreditCents) || 0;
        const amount = Number(g.amountCents) || 0;
        if (balance < amount) {
            fail('Some of this credit has already been spent, so it can’t be revoked.');
        }
        const now = new Date().toISOString();
        tx.update(hhRef, { giftCreditCents: balance - amount, updatedAt: now });
        tx.update(grantRef, { status: 'revoked', revokedAt: now, revokedByEmail: actor.email });
    });
    return { ok: true };
}
async function listInfluencers(db) {
    var _a, _b, _c, _d, _e, _f;
    const [influencers, redemptions, payouts] = await Promise.all([
        db.collection('influencers').get(),
        db.collection('promoRedemptions').where('influencerSlug', '!=', null).get(),
        db.collection('influencerPayouts').get(),
    ]);
    const rows = await withSources(db, redemptions.docs);
    const rowsBySlug = new Map();
    for (const row of rows) {
        const slug = String(row.data.influencerSlug);
        rowsBySlug.set(slug, [...((_a = rowsBySlug.get(slug)) !== null && _a !== void 0 ? _a : []), row]);
    }
    const payoutsBySlug = new Map();
    for (const d of payouts.docs) {
        const p = d.data();
        const slug = String((_b = p.slug) !== null && _b !== void 0 ? _b : '');
        payoutsBySlug.set(slug, [
            ...((_c = payoutsBySlug.get(slug)) !== null && _c !== void 0 ? _c : []),
            {
                id: d.id,
                amountCents: Number(p.amountCents) || 0,
                note: typeof p.note === 'string' ? p.note : null,
                paidAt: String((_e = (_d = p.paidAt) !== null && _d !== void 0 ? _d : p.createdAt) !== null && _e !== void 0 ? _e : ''),
                recordedByEmail: String((_f = p.recordedByEmail) !== null && _f !== void 0 ? _f : ''),
            },
        ]);
    }
    return influencers.docs
        .map((d) => {
        var _a, _b, _c;
        const data = d.data();
        const rec = influencerRecordOf(d.id, data);
        const list = ((_a = payoutsBySlug.get(d.id)) !== null && _a !== void 0 ? _a : []).sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
        const paid = list.reduce((s, p) => s + p.amountCents, 0);
        const stats = statsFromRows((_b = rowsBySlug.get(d.id)) !== null && _b !== void 0 ? _b : [], rec.commissionPercent, paid);
        return Object.assign(Object.assign(Object.assign({}, rec), { link: influencerLink(d.id), discountLabel: (0, promoPricing_1.termsLabel)(rec), note: typeof data.note === 'string' ? data.note : null, accountCreated: data.accountCreated === true, visitCount: Number(data.visitCount) || 0, uniqueVisitorCount: Number(data.uniqueVisitorCount) || 0, createdAt: String((_c = data.createdAt) !== null && _c !== void 0 ? _c : ''), payouts: list }), stats);
    })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
async function saveInfluencer(db, actor, input) {
    var _a, _b;
    const isNew = input.isNew === true;
    const slug = (0, promoPricing_1.normalizeSlug)(input.slug);
    if (!slug)
        fail('Link names are 2–40 lowercase letters, numbers or dashes.');
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
    if (!name)
        fail('Name required.');
    const email = (0, loginLinks_1.normalizeEmail)(input.email);
    const terms = unwrap((0, promoPricing_1.parseTermsInput)(input, true));
    const commissionPercent = unwrap((0, promoPricing_1.parseCommissionPercent)(input.commissionPercent));
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
    const ref = db.doc(`influencers/${slug}`);
    const existing = await ref.get();
    if (isNew && existing.exists)
        fail('That link name is taken.');
    if (!isNew && !existing.exists)
        fail('Influencer not found.');
    const emailChanged = isNew || ((_a = existing.data()) === null || _a === void 0 ? void 0 : _a.email) !== email;
    const account = emailChanged ? await findOrCreateAccountByEmail(db, email, name.split(/\s+/)[0] || null) : null;
    const now = new Date().toISOString();
    const fields = Object.assign(Object.assign(Object.assign({ slug,
        name,
        email }, terms), { commissionPercent, active: input.active !== false, note: note || null, updatedAt: now, updatedByEmail: actor.email }), (account ? { uid: account.uid, accountCreated: account.accountCreated } : {}));
    if (isNew) {
        await ref.create(Object.assign(Object.assign({}, fields), { visitCount: 0, uniqueVisitorCount: 0, createdAt: now, createdByEmail: actor.email }));
    }
    else {
        await ref.update(fields);
    }
    return { slug, link: influencerLink(slug), accountCreated: (_b = account === null || account === void 0 ? void 0 : account.accountCreated) !== null && _b !== void 0 ? _b : false };
}
async function recordPayout(db, actor, input) {
    var _a;
    const slug = (0, promoPricing_1.normalizeSlug)(input.slug);
    if (!slug || !(await db.doc(`influencers/${slug}`).get()).exists)
        fail('Influencer not found.');
    const amountCents = Math.round(Number(input.amountCents));
    if (!Number.isFinite(amountCents) || amountCents < 1 || amountCents > 10000000)
        fail('Enter the amount paid.');
    const paidAt = (_a = unwrap((0, promoPricing_1.parseIsoInput)(input.paidAt))) !== null && _a !== void 0 ? _a : new Date().toISOString();
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
    const ref = await db.collection('influencerPayouts').add({
        slug,
        amountCents,
        paidAt,
        note: note || null,
        recordedByUid: actor.uid,
        recordedByEmail: actor.email,
        createdAt: new Date().toISOString(),
    });
    return { id: ref.id };
}
async function deletePayout(db, input) {
    const id = typeof input.payoutId === 'string' ? input.payoutId : '';
    if (!id)
        fail('payoutId required.');
    await db.doc(`influencerPayouts/${id}`).delete();
    return { ok: true };
}
exports.adminPromotions = (0, sentry_1.onCall)(async (request) => {
    var _a, _b;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid) || !(0, guestSessions_1.isAdminToken)(request.auth.token)) {
        throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
    }
    const actor = {
        uid: request.auth.uid,
        email: typeof request.auth.token.email === 'string' ? request.auth.token.email : '',
    };
    const input = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const db = (0, firestore_1.getFirestore)();
    switch (input.action) {
        case 'listCodes':
            return { codes: await listCodes(db) };
        case 'saveCode':
            return saveCode(db, actor, input);
        case 'listCredits':
            return { grants: await listCredits(db) };
        case 'grantCredit':
            return grantCredit(db, actor, input);
        case 'revokeCredit':
            return revokeCredit(db, actor, input);
        case 'listInfluencers':
            return { influencers: await listInfluencers(db) };
        case 'saveInfluencer':
            return saveInfluencer(db, actor, input);
        case 'recordPayout':
            return recordPayout(db, actor, input);
        case 'deletePayout':
            return deletePayout(db, input);
        default:
            throw new sentry_1.HttpsError('invalid-argument', 'Unknown action.');
    }
});
//# sourceMappingURL=promotions.js.map