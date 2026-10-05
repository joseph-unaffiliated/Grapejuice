"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retentionLead = exports.LEAD_EVENT_NAME = exports.TIMESTAMP_HEADER = exports.SIGNATURE_HEADER = void 0;
exports.signForward = signForward;
exports.verifyForwardSignature = verifyForwardSignature;
exports.visitorIdFromLandingUrl = visitorIdFromLandingUrl;
exports.parseClickedAt = parseClickedAt;
exports.fallbackSessionForLead = fallbackSessionForLead;
exports.processRetentionLead = processRetentionLead;
const logger = require("./logger");
const sentry_1 = require("./sentry");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
const guestSessions_1 = require("./guestSessions");
const untraditionalCio_1 = require("./untraditionalCio");
const emailItems_1 = require("./emailItems");
/**
 * Receives grapejuice.co leads forwarded by subscription-functions' /api/retention-webhook
 * (lib/grapejuice-lead.js), links them to a saved guest box, and hands them to the
 * Untraditional Customer.io workspace, which owns the recovery emails.
 *
 * Shared secret (same value on both sides):
 *   functions/.env.grapejuice-pilot:        GJ_RETENTION_FORWARD_SECRET
 *   Vercel (subscription-functions):        GRAPEJUICE_RETENTION_FORWARD_SECRET
 */
exports.SIGNATURE_HEADER = 'x-gj-signature';
exports.TIMESTAMP_HEADER = 'x-gj-timestamp';
const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;
/** Fallback matching: a session created this close to the lead's click, with matching entry context. */
const FALLBACK_WINDOW_MS = 10 * 60 * 1000;
exports.LEAD_EVENT_NAME = 'grapejuice_retention_lead';
function signForward(secret, timestamp, rawBody) {
    return (0, crypto_1.createHmac)('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}
function verifyForwardSignature(input) {
    var _a;
    const { secret, timestamp, signature, rawBody } = input;
    if (!secret || !timestamp || !signature)
        return false;
    const ts = Number(timestamp);
    if (!Number.isFinite(ts))
        return false;
    const now = (_a = input.nowMs) !== null && _a !== void 0 ? _a : Date.now();
    if (Math.abs(now - ts) > SIGNATURE_MAX_SKEW_MS)
        return false;
    const expected = Buffer.from(signForward(secret, timestamp, rawBody), 'hex');
    let given;
    try {
        given = Buffer.from(signature.trim(), 'hex');
    }
    catch (_b) {
        return false;
    }
    if (given.length !== expected.length || given.length === 0)
        return false;
    return (0, crypto_1.timingSafeEqual)(given, expected);
}
/** `?gjv=` from the landing URL. Tolerates URLs that fail to parse. */
function visitorIdFromLandingUrl(url) {
    if (typeof url !== 'string' || !url)
        return null;
    let value = null;
    try {
        value = new URL(url).searchParams.get('gjv');
    }
    catch (_a) {
        const m = /[?&]gjv=([A-Za-z0-9_-]{16,64})(?:[&#]|$)/.exec(url);
        value = m ? m[1] : null;
    }
    return value && guestSessions_1.VISITOR_ID_RE.test(value) ? value : null;
}
/** Retention sends e.g. "Mon, 28 Nov 2022 19:47:42 UTC +00:00" — not something Date.parse accepts as-is. */
function parseClickedAt(raw) {
    if (typeof raw !== 'string' || !raw.trim())
        return null;
    const candidates = [
        raw,
        raw.replace(/\s+UTC\s*([+-]\d{2}:?\d{2})$/, ' GMT$1'),
        raw.replace(/\s+UTC\s*[+-]\d{2}:?\d{2}$/, ' GMT'),
    ];
    for (const c of candidates) {
        const ms = Date.parse(c);
        if (Number.isFinite(ms))
            return new Date(ms);
    }
    return null;
}
function hostOf(url) {
    if (typeof url !== 'string' || !url)
        return null;
    try {
        return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    }
    catch (_a) {
        return null;
    }
}
function utmCampaignOf(url) {
    if (typeof url !== 'string')
        return null;
    try {
        return new URL(url).searchParams.get('utm_campaign');
    }
    catch (_a) {
        return null;
    }
}
/**
 * No `gjv` in the URL: accept the single unconverted session created within ±10 minutes of the
 * click whose entry context (external referrer host or utm_campaign) matches the lead's.
 * Ambiguity (0 or 2+ matches) means no link.
 */
async function fallbackSessionForLead(db, lead) {
    if (!lead.clickedAt)
        return null;
    const leadReferrerHost = hostOf(lead.referrer);
    const leadCampaign = utmCampaignOf(lead.landingPageUrl);
    if (!leadReferrerHost && !leadCampaign)
        return null;
    const from = firestore_1.Timestamp.fromMillis(lead.clickedAt.getTime() - FALLBACK_WINDOW_MS);
    const to = firestore_1.Timestamp.fromMillis(lead.clickedAt.getTime() + FALLBACK_WINDOW_MS);
    const snap = await db
        .collection('guestSessions')
        .where('createdAt', '>=', from)
        .where('createdAt', '<=', to)
        .limit(200)
        .get();
    const matches = snap.docs.filter((d) => {
        var _a, _b;
        const data = d.data();
        if (data.convertedUid)
            return false;
        const entry = ((_a = data.entry) !== null && _a !== void 0 ? _a : {});
        const entryHost = hostOf(entry.referrer);
        if (leadReferrerHost && entryHost && entryHost === leadReferrerHost)
            return true;
        const entryCampaign = typeof ((_b = entry.utm) === null || _b === void 0 ? void 0 : _b.campaign) === 'string' ? entry.utm.campaign : null;
        return !!leadCampaign && !!entryCampaign && entryCampaign === leadCampaign;
    });
    return matches.length === 1 ? matches[0] : null;
}
function str(v, max = 500) {
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}
async function processRetentionLead(db, payload, now = new Date()) {
    var _a, _b, _c, _d;
    const email = (_a = str(payload.email, 254)) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return { status: 'ignored', reason: 'invalid_email' };
    }
    const clickedAtRaw = (_b = str(payload.clicked_at, 100)) !== null && _b !== void 0 ? _b : '';
    const clickedAt = parseClickedAt(clickedAtRaw);
    const landingPageUrl = str(payload.landing_page_url, 2000);
    const hash = (0, guestSessions_1.emailHash)(email);
    // Dedupe on email + clicked_at: webhook retries and the replay cron must never double-send.
    const eventRef = db.doc(`retentionLeadEvents/${(0, guestSessions_1.sha256Hex)(`${email}|${clickedAtRaw}`)}`);
    const created = await db.runTransaction(async (tx) => {
        var _a, _b;
        const existing = await tx.get(eventRef);
        if (existing.exists)
            return false;
        tx.set(eventRef, {
            emailHash: hash,
            clickedAt: clickedAt ? firestore_1.Timestamp.fromDate(clickedAt) : null,
            clickedAtRaw,
            receivedAt: firestore_1.Timestamp.fromDate(now),
            landingPageUrl: landingPageUrl !== null && landingPageUrl !== void 0 ? landingPageUrl : null,
            landingPageDomain: (_a = str(payload.landing_page_domain, 200)) !== null && _a !== void 0 ? _a : null,
            referrer: (_b = str(payload.referrer, 500)) !== null && _b !== void 0 ? _b : null,
            replayed: payload.replayed === true,
            status: 'processing',
        });
        return true;
    });
    if (!created)
        return { status: 'duplicate' };
    // Link to a saved guest box.
    let linked = null;
    let session = null;
    const visitorId = visitorIdFromLandingUrl(landingPageUrl);
    if (visitorId) {
        const snap = await db.doc(`guestSessions/${visitorId}`).get();
        if (snap.exists) {
            session = snap;
            linked = 'gjv';
        }
    }
    if (!session) {
        session = await fallbackSessionForLead(db, { clickedAt, referrer: payload.referrer, landingPageUrl });
        if (session)
            linked = 'clicked_at';
    }
    const sessionData = (_c = session === null || session === void 0 ? void 0 : session.data()) !== null && _c !== void 0 ? _c : null;
    const converted = typeof (sessionData === null || sessionData === void 0 ? void 0 : sessionData.convertedUid) === 'string' && sessionData.convertedUid.length > 0;
    const hasBox = !!sessionData && !converted && (sessionData.hasBox === true || sessionData.hasGiftDraft === true);
    const kidCount = typeof (sessionData === null || sessionData === void 0 ? void 0 : sessionData.kidCount) === 'number' ? sessionData.kidCount : 0;
    const boxItemCount = typeof (sessionData === null || sessionData === void 0 ? void 0 : sessionData.boxItemCount) === 'number' ? sessionData.boxItemCount : 0;
    let resumeUrl;
    if (session && hasBox) {
        const minted = await (0, guestSessions_1.mintResumeToken)(db, session.id, email, now);
        resumeUrl = minted.url;
    }
    else {
        resumeUrl = `${(0, guestSessions_1.appOrigin)()}/box?utm_source=retention&utm_medium=email&utm_campaign=guest_box_recovery`;
    }
    let items = [];
    let itemsMore = 0;
    try {
        if (session && hasBox) {
            ({ items, more: itemsMore } = await (0, emailItems_1.boxEmailItems)(db, sessionData === null || sessionData === void 0 ? void 0 : sessionData.snapshot, resumeUrl));
        }
        else {
            items = await (0, emailItems_1.pickEmailItems)(db, 'utm_source=retention&utm_medium=email&utm_campaign=guest_box_recovery');
        }
    }
    catch (err) {
        logger.warn('retentionLead: email items failed (sending without them)', { err: String(err) });
    }
    if (session) {
        await session.ref.set({ lastLeadEmailHash: hash, lastLeadAt: firestore_1.Timestamp.fromDate(now) }, { merge: true });
    }
    // Untraditional Customer.io: person + campaign trigger. No child names leave Firestore.
    let eventSent = false;
    let cioError = null;
    try {
        await (0, untraditionalCio_1.untraditionalIdentify)(email, {
            first_name: str(payload.first_name, 100),
            last_name: str(payload.last_name, 100),
            grapejuice_lead: true,
            lead_source: 'retention',
            grapejuice_has_box: hasBox,
            grapejuice_resume_url: resumeUrl,
            grapejuice_kid_count: kidCount,
            grapejuice_box_item_count: boxItemCount,
            grapejuice_lead_at: now.toISOString(),
            grapejuice_lead_landing_url: landingPageUrl,
        });
        // A session that already became an account must not trigger recovery campaigns.
        if (!converted) {
            eventSent = await (0, untraditionalCio_1.untraditionalEvent)(email, exports.LEAD_EVENT_NAME, {
                has_box: hasBox,
                resume_url: resumeUrl,
                kid_count: kidCount,
                box_item_count: boxItemCount,
                linked: linked !== null && linked !== void 0 ? linked : 'none',
                landing_page_url: landingPageUrl,
                items,
                items_more: itemsMore,
            });
        }
    }
    catch (err) {
        cioError = String(err).slice(0, 500);
        logger.error('retentionLead: Customer.io failed', { err: cioError });
    }
    await eventRef.set({
        status: cioError ? 'cio_failed' : 'done',
        visitorId: (_d = session === null || session === void 0 ? void 0 : session.id) !== null && _d !== void 0 ? _d : null,
        linked,
        hasBox,
        converted,
        eventSent,
        cioError,
        processedAt: firestore_1.Timestamp.fromDate(now),
    }, { merge: true });
    return { status: 'processed', linked, hasBox, eventSent };
}
exports.retentionLead = (0, sentry_1.onRequest)({ cors: false }, async (req, res) => {
    var _a, _b, _c, _d;
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const secret = (_b = (_a = process.env.GJ_RETENTION_FORWARD_SECRET) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '';
    if (!secret) {
        logger.error('retentionLead: GJ_RETENTION_FORWARD_SECRET not set');
        res.status(503).json({ error: 'Not configured' });
        return;
    }
    const rawBody = (_d = (_c = req.rawBody) === null || _c === void 0 ? void 0 : _c.toString('utf8')) !== null && _d !== void 0 ? _d : '';
    const header = (name) => {
        const v = req.headers[name];
        return Array.isArray(v) ? v[0] : v;
    };
    if (!verifyForwardSignature({
        secret,
        timestamp: header(exports.TIMESTAMP_HEADER),
        signature: header(exports.SIGNATURE_HEADER),
        rawBody,
    })) {
        logger.warn('retentionLead: bad signature');
        res.status(401).json({ error: 'Bad signature' });
        return;
    }
    let payload;
    try {
        payload = JSON.parse(rawBody);
    }
    catch (_e) {
        res.status(400).json({ error: 'Invalid JSON' });
        return;
    }
    try {
        const result = await processRetentionLead((0, firestore_1.getFirestore)(), payload);
        logger.info('retentionLead', result);
        res.status(200).json(result);
    }
    catch (err) {
        logger.error('retentionLead failed', err);
        res.status(500).json({ error: 'Processing failed' });
    }
});
//# sourceMappingURL=retentionLead.js.map