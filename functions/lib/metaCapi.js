"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.META_PIXEL_ID = void 0;
exports.sanitizeMetaContext = sanitizeMetaContext;
exports.metaContextFromCallable = metaContextFromCallable;
exports.metaContextToStripeMetadata = metaContextToStripeMetadata;
exports.metaContextFromStripeMetadata = metaContextFromStripeMetadata;
exports.metaContextForDoc = metaContextForDoc;
exports.sanitizeAttribution = sanitizeAttribution;
exports.sendMetaEvent = sendMetaEvent;
const crypto_1 = require("crypto");
const logger = require("./logger");
/**
 * Meta Conversions API (server copy of browser pixel events).
 *
 * Env (functions/.env.grapejuice-pilot — missing token = no-op):
 *  META_CAPI_TOKEN        Events Manager → dataset → Settings → Conversions API → Generate access token
 *  META_TEST_EVENT_CODE   optional; routes events to Events Manager "Test events" and
 *                         lets test-mode Stripe / localhost traffic through for QA
 */
/** "Unaffiliated" dataset. Keep in sync with src/services/analytics/metaPixel.ts. */
exports.META_PIXEL_ID = '809409995127436';
const GRAPH_URL = `https://graph.facebook.com/v21.0/${exports.META_PIXEL_ID}/events`;
const CONTENT_CATEGORY = 'grapejuice';
const SEND_TIMEOUT_MS = 3500;
function str(value, max) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : undefined;
}
function sha256(value) {
    return (0, crypto_1.createHash)('sha256').update(value).digest('hex');
}
function normalizedPhone(raw, country) {
    const digits = raw.replace(/\D/g, '');
    if (!digits)
        return undefined;
    if (digits.length === 10 && (!country || country === 'US' || country === 'CA'))
        return `1${digits}`;
    return digits;
}
function hashedUserData(user) {
    var _a, _b, _c, _d, _e, _f, _g;
    const out = {};
    const put = (key, value) => {
        if (value)
            out[key] = [sha256(value)];
    };
    put('em', ((_a = user.email) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase()) || undefined);
    if (user.phone)
        put('ph', normalizedPhone(user.phone, user.country));
    put('external_id', ((_b = user.externalId) === null || _b === void 0 ? void 0 : _b.trim()) || undefined);
    const nameParts = ((_c = user.name) !== null && _c !== void 0 ? _c : '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (nameParts.length) {
        put('fn', nameParts[0]);
        if (nameParts.length > 1)
            put('ln', nameParts[nameParts.length - 1]);
    }
    put('ct', ((_d = user.city) === null || _d === void 0 ? void 0 : _d.toLowerCase().replace(/[^a-z]/g, '')) || undefined);
    const state = (_e = user.state) === null || _e === void 0 ? void 0 : _e.trim().toLowerCase();
    put('st', state && state.length === 2 ? state : undefined);
    const zip = (_f = user.zip) === null || _f === void 0 ? void 0 : _f.trim().toLowerCase();
    const country = (_g = user.country) === null || _g === void 0 ? void 0 : _g.trim().toLowerCase();
    put('zp', zip ? (country === 'us' || !country ? zip.slice(0, 5) : zip.replace(/\s/g, '')) : undefined);
    put('country', country && country.length === 2 ? country : undefined);
    return out;
}
/** `data.meta` from a callable — untrusted client input. */
function sanitizeMetaContext(raw) {
    if (!raw || typeof raw !== 'object')
        return {};
    const o = raw;
    if (o.skip === true)
        return { skip: true };
    const ctx = {};
    const eventId = str(o.eventId, 120);
    const fbp = str(o.fbp, 200);
    const fbc = str(o.fbc, 500);
    const url = str(o.url, 500);
    if (eventId)
        ctx.eventId = eventId;
    if (fbp === null || fbp === void 0 ? void 0 : fbp.startsWith('fb.'))
        ctx.fbp = fbp;
    if (fbc === null || fbc === void 0 ? void 0 : fbc.startsWith('fb.'))
        ctx.fbc = fbc;
    if (url && /^https?:\/\//.test(url))
        ctx.url = url;
    return ctx;
}
/** Client meta + caller IP / user agent from the callable's raw request. */
function metaContextFromCallable(request) {
    var _a, _b, _c, _d, _e, _f;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const ctx = sanitizeMetaContext(data.meta);
    if (ctx.skip)
        return ctx;
    const raw = ((_b = request.rawRequest) !== null && _b !== void 0 ? _b : {});
    const forwarded = (_c = raw.headers) === null || _c === void 0 ? void 0 : _c['x-forwarded-for'];
    const forwardedFirst = (_e = (_d = (Array.isArray(forwarded) ? forwarded[0] : forwarded)) === null || _d === void 0 ? void 0 : _d.split(',')[0]) === null || _e === void 0 ? void 0 : _e.trim();
    const ip = forwardedFirst || raw.ip;
    const uaHeader = (_f = raw.headers) === null || _f === void 0 ? void 0 : _f['user-agent'];
    const ua = Array.isArray(uaHeader) ? uaHeader[0] : uaHeader;
    if (ip)
        ctx.ip = ip.slice(0, 64);
    if (ua)
        ctx.ua = ua.slice(0, 450);
    return ctx;
}
/** Stripe metadata values cap at 500 chars; webhook events rebuild context from these. */
function metaContextToStripeMetadata(ctx) {
    if (ctx.skip)
        return { meta_skip: '1' };
    const md = {};
    if (ctx.fbp)
        md.meta_fbp = ctx.fbp;
    if (ctx.fbc)
        md.meta_fbc = ctx.fbc;
    if (ctx.url)
        md.meta_url = ctx.url;
    if (ctx.ip)
        md.meta_ip = ctx.ip;
    if (ctx.ua)
        md.meta_ua = ctx.ua;
    return md;
}
function metaContextFromStripeMetadata(md) {
    if (!md)
        return {};
    if (md.meta_skip === '1')
        return { skip: true };
    const ctx = {};
    if (md.meta_fbp)
        ctx.fbp = md.meta_fbp;
    if (md.meta_fbc)
        ctx.fbc = md.meta_fbc;
    if (md.meta_url)
        ctx.url = md.meta_url;
    if (md.meta_ip)
        ctx.ip = md.meta_ip;
    if (md.meta_ua)
        ctx.ua = md.meta_ua;
    return ctx;
}
/** Firestore-safe context (no undefined) for storing on orders / gift invites. */
function metaContextForDoc(ctx) {
    const out = {};
    for (const [key, value] of Object.entries(ctx)) {
        if (key === 'eventId')
            continue;
        if (value !== undefined && value !== '')
            out[key] = value;
    }
    return out;
}
function sanitizeTouch(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const o = raw;
    const touch = {};
    const utmRaw = o.utm && typeof o.utm === 'object' ? o.utm : null;
    if (utmRaw) {
        const utm = {};
        for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
            const v = str(utmRaw[key], 200);
            if (v)
                utm[key] = v;
        }
        if (Object.keys(utm).length)
            touch.utm = utm;
    }
    const fbclid = str(o.fbclid, 400);
    const landingPath = str(o.landingPath, 200);
    const referrer = str(o.referrer, 300);
    const at = str(o.at, 40);
    if (fbclid)
        touch.fbclid = fbclid;
    if (landingPath)
        touch.landingPath = landingPath;
    if (referrer)
        touch.referrer = referrer;
    if (at)
        touch.at = at;
    return Object.keys(touch).length ? touch : null;
}
/** `data.attribution` (first / last touch UTMs + Meta ids) → Firestore-safe map, or null. */
function sanitizeAttribution(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const o = raw;
    const out = {};
    const firstTouch = sanitizeTouch(o.firstTouch);
    const lastTouch = sanitizeTouch(o.lastTouch);
    const fbc = str(o.fbc, 500);
    const fbp = str(o.fbp, 200);
    if (firstTouch)
        out.firstTouch = firstTouch;
    if (lastTouch)
        out.lastTouch = lastTouch;
    if (fbc)
        out.fbc = fbc;
    if (fbp)
        out.fbp = fbp;
    return Object.keys(out).length ? out : null;
}
function stripeKeyIsTest() {
    var _a;
    const key = (_a = process.env.STRIPE_SECRET_KEY) !== null && _a !== void 0 ? _a : '';
    return key.startsWith('sk_test') || key.startsWith('rk_test');
}
function isLocalUrl(url) {
    if (!url)
        return false;
    try {
        const host = new URL(url).hostname;
        return host === 'localhost' || host === '127.0.0.1';
    }
    catch (_a) {
        return false;
    }
}
/**
 * Send one server event. Never throws — tracking must not block checkout.
 * `stripeBacked` events are dropped in Stripe test mode unless META_TEST_EVENT_CODE is set.
 */
async function sendMetaEvent(input) {
    var _a, _b, _c, _d, _e, _f;
    try {
        const token = (_a = process.env.META_CAPI_TOKEN) === null || _a === void 0 ? void 0 : _a.trim();
        if (!token)
            return;
        const ctx = (_b = input.context) !== null && _b !== void 0 ? _b : {};
        if (ctx.skip || input.playthrough)
            return;
        const testCode = (_c = process.env.META_TEST_EVENT_CODE) === null || _c === void 0 ? void 0 : _c.trim();
        if (!testCode && input.stripeBacked && stripeKeyIsTest())
            return;
        if (!testCode && isLocalUrl(ctx.url))
            return;
        const userData = hashedUserData((_d = input.user) !== null && _d !== void 0 ? _d : {});
        if (ctx.fbp)
            userData.fbp = ctx.fbp;
        if (ctx.fbc)
            userData.fbc = ctx.fbc;
        if (ctx.ip)
            userData.client_ip_address = ctx.ip;
        if (ctx.ua)
            userData.client_user_agent = ctx.ua;
        const appBase = (_e = process.env.PILOT_APP_BASE_URL) !== null && _e !== void 0 ? _e : 'https://app.grapejuice.co';
        const event = {
            event_name: input.eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: input.eventId,
            action_source: 'website',
            event_source_url: (_f = ctx.url) !== null && _f !== void 0 ? _f : appBase,
            user_data: userData,
            custom_data: Object.assign(Object.assign({}, input.customData), { content_category: CONTENT_CATEGORY }),
        };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
        try {
            const res = await fetch(`${GRAPH_URL}?access_token=${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ data: [event] }, (testCode ? { test_event_code: testCode } : {}))),
                signal: controller.signal,
            });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                logger.warn('Meta CAPI rejected event', {
                    eventName: input.eventName,
                    eventId: input.eventId,
                    status: res.status,
                    body: body.slice(0, 500),
                });
            }
        }
        finally {
            clearTimeout(timer);
        }
    }
    catch (err) {
        logger.warn('Meta CAPI send failed', {
            eventName: input.eventName,
            eventId: input.eventId,
            message: err instanceof Error ? err.message : String(err),
        });
    }
}
//# sourceMappingURL=metaCapi.js.map