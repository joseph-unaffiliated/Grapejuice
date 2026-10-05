"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.untraditionalCioConfigured = untraditionalCioConfigured;
exports.untraditionalIdentify = untraditionalIdentify;
exports.untraditionalEvent = untraditionalEvent;
exports.untraditionalDeletePerson = untraditionalDeletePerson;
exports.untraditionalMarkSafe = untraditionalMarkSafe;
const logger = require("firebase-functions/logger");
/**
 * Customer.io *Track* API for the Untraditional workspace (208456).
 *
 * The App API key in email.ts can only send transactional messages. Identifying people and
 * firing campaign-trigger events (guest box recovery) needs Track API credentials:
 *   Customer.io → Untraditional workspace → Settings → API Credentials → Track API Keys.
 *
 * Env (functions/.env.grapejuice-pilot, same pattern as CUSTOMERIO_APP_API_KEY):
 *   UNTRADITIONAL_CIO_SITE_ID
 *   UNTRADITIONAL_CIO_TRACK_API_KEY
 *   UNTRADITIONAL_CIO_TRACK_URL   optional, default https://track.customer.io/api/v1
 *
 * Every helper is a no-op (with a warning) when the credentials are missing, so a deploy
 * without them cannot break sign-up, checkout, or the lead endpoint.
 */
const TRACK_BASE_URL = ((_a = process.env.UNTRADITIONAL_CIO_TRACK_URL) === null || _a === void 0 ? void 0 : _a.trim()) || 'https://track.customer.io/api/v1';
function authHeader() {
    var _a, _b;
    const siteId = ((_a = process.env.UNTRADITIONAL_CIO_SITE_ID) === null || _a === void 0 ? void 0 : _a.trim()) || '';
    const apiKey = ((_b = process.env.UNTRADITIONAL_CIO_TRACK_API_KEY) === null || _b === void 0 ? void 0 : _b.trim()) || '';
    if (!siteId || !apiKey)
        return null;
    return `Basic ${Buffer.from(`${siteId}:${apiKey}`).toString('base64')}`;
}
function untraditionalCioConfigured() {
    return authHeader() !== null;
}
async function trackRequest(method, path, body) {
    const auth = authHeader();
    if (!auth) {
        logger.warn('untraditionalCio: UNTRADITIONAL_CIO_SITE_ID / TRACK_API_KEY not set, skipping', { method, path });
        return false;
    }
    const res = await fetch(`${TRACK_BASE_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Customer.io Track ${res.status}: ${text}`);
    }
    return true;
}
function compact(input) {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
        if (v !== undefined)
            out[k] = v;
    }
    return out;
}
/** Create-or-update a person keyed by email. Attributes with `undefined` are dropped. */
async function untraditionalIdentify(email, attributes) {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@'))
        return false;
    return trackRequest('PUT', `/customers/${encodeURIComponent(normalized)}`, Object.assign(Object.assign({}, compact(attributes)), { email: normalized }));
}
/** Fire a campaign-trigger event for a person keyed by email. */
async function untraditionalEvent(email, name, data) {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@'))
        return false;
    return trackRequest('POST', `/customers/${encodeURIComponent(normalized)}/events`, {
        name,
        data: compact(data),
    });
}
/** Delete a person (data-rights request). 404 is treated as already gone. */
async function untraditionalDeletePerson(email) {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@'))
        return false;
    const auth = authHeader();
    if (!auth) {
        logger.warn('untraditionalCio: credentials not set, skipping delete');
        return false;
    }
    const res = await fetch(`${TRACK_BASE_URL}/customers/${encodeURIComponent(normalized)}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
    });
    if (res.ok || res.status === 404)
        return true;
    throw new Error(`Customer.io Track ${res.status}: ${await res.text()}`);
}
/**
 * Best-effort exit signal for recovery campaigns (account created / order placed).
 * Never throws — marketing state must not break sign-up or checkout.
 */
async function untraditionalMarkSafe(email, attributes) {
    if (!email || !untraditionalCioConfigured())
        return;
    try {
        await untraditionalIdentify(email, attributes);
    }
    catch (err) {
        logger.warn('untraditionalCio: identify failed (non-fatal)', { err: String(err) });
    }
}
//# sourceMappingURL=untraditionalCio.js.map