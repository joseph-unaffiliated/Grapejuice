"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unaffiliatedVisit = exports.UNAFFILIATED_USER_ID_RE = void 0;
exports.unaffiliatedUserIdFrom = unaffiliatedUserIdFrom;
exports.visitAttributes = visitAttributes;
exports.reportUnaffiliatedShippingGeo = reportUnaffiliatedShippingGeo;
const logger = require("./logger");
const sentry_1 = require("./sentry");
const retentionLead_1 = require("./retentionLead");
const untraditionalCio_1 = require("./untraditionalCio");
/**
 * Unaffiliated (newsletter network) readers who reach grapejuice.co from an Unaffiliated email.
 * Their email links carry `userID={{customer.id}}`; the web app keeps it as
 * `attribution.unaffiliatedUserID` and reports the visit to magic.unaffiliated.co/api/site-visit,
 * which records IP geo on the Unaffiliated side and forwards it here.
 *
 *   unaffiliatedVisit (magic → here): email + IP geo → Untraditional Customer.io person.
 *   reportUnaffiliatedShippingGeo (here → magic): city / state / ZIP of an order placed by such
 *     a reader → Unaffiliated BigQuery + Customer.io; returns the metro magic derived.
 *
 * Both directions are HMAC-signed with the Retention forward secret:
 *   functions/.env.grapejuice-pilot: GJ_RETENTION_FORWARD_SECRET
 *   Vercel (subscription-functions): GRAPEJUICE_RETENTION_FORWARD_SECRET
 */
exports.UNAFFILIATED_USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_SHIPPING_GEO_URL = 'https://magic.unaffiliated.co/api/grapejuice-shipping-geo';
const SHIPPING_GEO_TIMEOUT_MS = 3000;
function str(v, max = 200) {
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}
function unaffiliatedUserIdFrom(attribution) {
    if (!attribution || typeof attribution !== 'object')
        return null;
    const id = attribution.unaffiliatedUserID;
    return typeof id === 'string' && exports.UNAFFILIATED_USER_ID_RE.test(id) ? id.toLowerCase() : null;
}
/** Untraditional Customer.io attributes for a forwarded visit (geo keys match the Unaffiliated workspace). */
function visitAttributes(payload) {
    var _a, _b, _c, _d, _e;
    const geo = payload.geo && typeof payload.geo === 'object' ? payload.geo : null;
    const utm = payload.utm && typeof payload.utm === 'object' ? payload.utm : null;
    const attrs = {
        unaffiliated_reader: true,
        unaffiliated_user_id: str(payload.userID, 64),
        grapejuice_email_visit_at: (_a = str(payload.at, 40)) !== null && _a !== void 0 ? _a : new Date().toISOString(),
        grapejuice_email_visit_source: str(utm === null || utm === void 0 ? void 0 : utm.source),
        grapejuice_email_visit_campaign: str(utm === null || utm === void 0 ? void 0 : utm.campaign),
    };
    if (geo && str(geo.country, 2)) {
        attrs.country = str(geo.country, 2);
        attrs.region = (_b = str(geo.region, 3)) !== null && _b !== void 0 ? _b : '';
        attrs.city = (_c = str(geo.city, 80)) !== null && _c !== void 0 ? _c : '';
        attrs.postal_code = (_d = str(geo.postalCode, 10)) !== null && _d !== void 0 ? _d : '';
        attrs.metro = (_e = str(geo.metro, 80)) !== null && _e !== void 0 ? _e : '';
    }
    return attrs;
}
exports.unaffiliatedVisit = (0, sentry_1.onRequest)({ cors: false }, async (req, res) => {
    var _a, _b, _c, _d, _e;
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const secret = (_b = (_a = process.env.GJ_RETENTION_FORWARD_SECRET) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '';
    if (!secret) {
        logger.error('unaffiliatedVisit: GJ_RETENTION_FORWARD_SECRET not set');
        res.status(503).json({ error: 'Not configured' });
        return;
    }
    const rawBody = (_d = (_c = req.rawBody) === null || _c === void 0 ? void 0 : _c.toString('utf8')) !== null && _d !== void 0 ? _d : '';
    const header = (name) => {
        const v = req.headers[name];
        return Array.isArray(v) ? v[0] : v;
    };
    if (!(0, retentionLead_1.verifyForwardSignature)({ secret, timestamp: header(retentionLead_1.TIMESTAMP_HEADER), signature: header(retentionLead_1.SIGNATURE_HEADER), rawBody })) {
        logger.warn('unaffiliatedVisit: bad signature');
        res.status(401).json({ error: 'Bad signature' });
        return;
    }
    let payload;
    try {
        payload = JSON.parse(rawBody);
    }
    catch (_f) {
        res.status(400).json({ error: 'Invalid JSON' });
        return;
    }
    const email = (_e = str(payload.email, 254)) === null || _e === void 0 ? void 0 : _e.toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        res.status(200).json({ status: 'ignored', reason: 'invalid_email' });
        return;
    }
    try {
        const sent = await (0, untraditionalCio_1.untraditionalIdentify)(email, visitAttributes(payload));
        res.status(200).json({ status: sent ? 'processed' : 'not_configured' });
    }
    catch (err) {
        logger.error('unaffiliatedVisit: Customer.io failed', { err: String(err).slice(0, 500) });
        res.status(500).json({ error: 'Customer.io failed' });
    }
});
/**
 * Order placed by an Unaffiliated reader: send city / state / ZIP (never street lines) to magic,
 * and put the same shipping location on the buyer's Untraditional Customer.io profile.
 * Never throws — attribution must not break checkout.
 */
async function reportUnaffiliatedShippingGeo(input) {
    var _a, _b, _c, _d, _e;
    const userID = unaffiliatedUserIdFrom(input.attribution);
    const address = input.shippingAddress;
    if (!userID || !address)
        return;
    const secret = (_b = (_a = process.env.GJ_RETENTION_FORWARD_SECRET) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '';
    const country = str(address.country, 8);
    const location = {
        country: country === 'US' || country === 'CA' ? country : undefined,
        region: str(address.stateProvince, 60),
        city: str(address.city, 80),
        postalCode: str(address.postalCode, 12),
    };
    let metro;
    if (secret && location.country) {
        try {
            const payload = JSON.stringify({ userID, address: location });
            const timestamp = String(Date.now());
            const res = await fetch(((_c = process.env.UNAFFILIATED_SHIPPING_GEO_URL) === null || _c === void 0 ? void 0 : _c.trim()) || DEFAULT_SHIPPING_GEO_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    [retentionLead_1.TIMESTAMP_HEADER]: timestamp,
                    [retentionLead_1.SIGNATURE_HEADER]: (0, retentionLead_1.signForward)(secret, timestamp, payload),
                },
                body: JSON.stringify({ payload }),
                signal: AbortSignal.timeout(SHIPPING_GEO_TIMEOUT_MS),
            });
            const data = (await res.json().catch(() => ({})));
            metro = str(data.metro, 80);
            logger.info('reportUnaffiliatedShippingGeo', { status: res.status, result: (_d = data.status) !== null && _d !== void 0 ? _d : null });
        }
        catch (err) {
            logger.warn('reportUnaffiliatedShippingGeo: magic failed (non-fatal)', { err: String(err).slice(0, 300) });
        }
    }
    if (input.email) {
        try {
            await (0, untraditionalCio_1.untraditionalIdentify)(input.email, {
                unaffiliated_reader: true,
                unaffiliated_user_id: userID,
                shipping_country: (_e = location.country) !== null && _e !== void 0 ? _e : str(address.country, 8),
                shipping_region: location.region,
                shipping_city: location.city,
                shipping_postal_code: location.postalCode,
                shipping_metro: metro,
            });
        }
        catch (err) {
            logger.warn('reportUnaffiliatedShippingGeo: Customer.io failed (non-fatal)', { err: String(err).slice(0, 300) });
        }
    }
}
//# sourceMappingURL=unaffiliated.js.map