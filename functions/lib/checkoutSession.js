"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkoutSessionFromCallable = checkoutSessionFromCallable;
exports.checkoutSessionToStripeMetadata = checkoutSessionToStripeMetadata;
exports.checkoutSessionFromStripeMetadata = checkoutSessionFromStripeMetadata;
exports.deviceOfUa = deviceOfUa;
exports.classifyCheckoutSession = classifyCheckoutSession;
const metaCapi_1 = require("./metaCapi");
const str = (v, max = 500) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
function userAgentOf(rawRequest) {
    var _a;
    const ua = (_a = rawRequest === null || rawRequest === void 0 ? void 0 : rawRequest.headers) === null || _a === void 0 ? void 0 : _a['user-agent'];
    return str(Array.isArray(ua) ? ua[0] : ua, 450);
}
/** `data.session` (the tab's entry touch, see entryContextStore.readSessionEntry) + the caller's UA. */
function checkoutSessionFromCallable(request) {
    var _a;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    return { at: new Date().toISOString(), ua: userAgentOf(request.rawRequest), entry: (0, metaCapi_1.sanitizeTouch)(data.session) };
}
/** Stripe metadata values cap at 500 chars. */
function checkoutSessionToStripeMetadata(s) {
    const md = {};
    if (s.ua)
        md.session_ua = s.ua;
    if (s.entry) {
        const json = JSON.stringify(s.entry);
        md.session_entry = json.length <= 500 ? json : JSON.stringify(Object.assign(Object.assign({}, s.entry), { referrer: undefined, landingPath: undefined }));
    }
    return md;
}
/** Older intents only carry Meta's copy of the UA (`meta_ua`), and none for suppressed sessions. */
function checkoutSessionFromStripeMetadata(md, at) {
    var _a;
    if (!md)
        return null;
    let entry = null;
    if (md.session_entry) {
        try {
            entry = (0, metaCapi_1.sanitizeTouch)(JSON.parse(md.session_entry));
        }
        catch (_b) {
            entry = null;
        }
    }
    const ua = (_a = str(md.session_ua, 450)) !== null && _a !== void 0 ? _a : str(md.meta_ua, 450);
    const fresh = 'session_ua' in md || 'session_entry' in md;
    if (!ua && !entry)
        return null;
    return Object.assign({ at, ua, entry }, (fresh ? {} : { backfilled: true }));
}
function deviceOfUa(ua) {
    if (!ua)
        return null;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop';
}
function hostOf(url) {
    if (typeof url !== 'string' || !url)
        return null;
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    }
    catch (_a) {
        return null;
    }
}
/** Channel for a touch (`{ utm, fbclid, referrer }`, utm keys bare or utm_-prefixed). Null = nothing to go on. */
function channelOfTouch(touch) {
    var _a, _b, _c, _d, _e;
    if (!touch || typeof touch !== 'object')
        return null;
    const t = touch;
    const u = (t.utm && typeof t.utm === 'object' ? t.utm : {});
    const source = ((_b = (_a = str(u.source)) !== null && _a !== void 0 ? _a : str(u.utm_source)) !== null && _b !== void 0 ? _b : '').toLowerCase();
    const medium = ((_d = (_c = str(u.medium)) !== null && _c !== void 0 ? _c : str(u.utm_medium)) !== null && _d !== void 0 ? _d : '').toLowerCase();
    const campaign = (_e = str(u.campaign)) !== null && _e !== void 0 ? _e : str(u.utm_campaign);
    const tag = [source, campaign].filter(Boolean).join(' / ');
    const host = hostOf(t.referrer);
    if (medium === 'email' || /e-?mail|newsletter|lifecycle|transactional|retention|customer\.?io|unaffiliated/.test(source)) {
        return { channel: 'email', detail: tag || 'email link' };
    }
    if (host && /(^|\.)mail\.|outlook\.|mail\.google\.com$/.test(host))
        return { channel: 'email', detail: host };
    if (/^(ig|instagram)/.test(source) || (!source && host && /(^|\.)instagram\.com$/.test(host))) {
        return { channel: 'instagram', detail: tag || host || 'instagram' };
    }
    if (/^(fb|facebook)/.test(source) || (!source && host && /(^|\.)facebook\.com$/.test(host))) {
        return { channel: 'facebook', detail: tag || host || 'facebook' };
    }
    if (source === 'meta' || str(t.fbclid))
        return { channel: 'meta', detail: tag || 'Meta ad click' };
    if (source)
        return { channel: 'other', detail: tag };
    return { channel: 'organic', detail: host ? `Referral: ${host}` : 'Direct' };
}
const RECENT_CLICK_MS = 12 * 60 * 60 * 1000;
/**
 * IG / FB in-app browsers win (the UA can't lie about that); then the session's own entry; for
 * sessions recorded without one, a campaign click in the 12 hours before.
 */
function classifyCheckoutSession(s, recentTouches = []) {
    var _a;
    const device = deviceOfUa(s.ua);
    const base = { device, at: s.at };
    if (s.ua && /Instagram/i.test(s.ua))
        return Object.assign(Object.assign({}, base), { channel: 'instagram', detail: 'Instagram app', inferred: false });
    if (s.ua && /FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger/.test(s.ua)) {
        return Object.assign(Object.assign({}, base), { channel: 'facebook', detail: 'Facebook app', inferred: false });
    }
    const own = channelOfTouch(s.entry);
    if (own)
        return Object.assign(Object.assign(Object.assign({}, base), own), { inferred: false });
    const atMs = Date.parse(s.at);
    for (const t of recentTouches) {
        const tAt = t && typeof t === 'object' ? Date.parse(String((_a = t.at) !== null && _a !== void 0 ? _a : '')) : NaN;
        if (!Number.isFinite(atMs) || !Number.isFinite(tAt) || tAt > atMs + 60000 || atMs - tAt > RECENT_CLICK_MS)
            continue;
        const c = channelOfTouch(t);
        if (c && c.channel !== 'organic')
            return Object.assign(Object.assign(Object.assign({}, base), c), { inferred: true });
    }
    return Object.assign(Object.assign({}, base), { channel: 'organic', detail: 'No campaign click that day', inferred: true });
}
//# sourceMappingURL=checkoutSession.js.map