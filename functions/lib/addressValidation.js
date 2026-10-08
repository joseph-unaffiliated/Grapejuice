"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateShippingAddress = exports.ADDRESS_NOT_FOUND_MESSAGE = void 0;
exports.interpretValidation = interpretValidation;
const logger = require("./logger");
const sentry_1 = require("./sentry");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const geo_1 = require("./geo");
const loginLinks_1 = require("./loginLinks");
const usAddress_1 = require("./usAddress");
/**
 * Deliverability check for shipping addresses (Google Address Validation API, USPS CASS on).
 * The client calls this on Continue; any outage or missing key returns `unavailable` and the
 * format check alone decides. Roughly $0.017 per call, so calls are rate-limited per IP.
 */
const addressValidationKey = (0, params_1.defineSecret)('GOOGLE_ADDRESS_VALIDATION_KEY');
const ENDPOINT = 'https://addressvalidation.googleapis.com/v1:validateAddress';
const TIMEOUT_MS = 5000;
const IP_LIMIT_PER_WINDOW = 40;
exports.ADDRESS_NOT_FOUND_MESSAGE = "We couldn't find that address. Please double-check it.";
function str(v, max = 200) {
    return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
const PREMISE_GRANULARITY = new Set(['PREMISE', 'SUB_PREMISE']);
const MEANINGFUL_COMPONENTS = new Set([
    'route',
    'street_number',
    'locality',
    'postal_code',
    'administrative_area_level_1',
]);
function comparable(v) {
    return (v !== null && v !== void 0 ? v : '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
const STREET_ABBREVIATIONS = {
    AVENUE: 'AVE',
    STREET: 'ST',
    ROAD: 'RD',
    BOULEVARD: 'BLVD',
    DRIVE: 'DR',
    LANE: 'LN',
    COURT: 'CT',
    PLACE: 'PL',
    PARKWAY: 'PKWY',
    HIGHWAY: 'HWY',
    TERRACE: 'TER',
    CIRCLE: 'CIR',
    SQUARE: 'SQ',
    TRAIL: 'TRL',
    APARTMENT: 'APT',
    SUITE: 'STE',
    NORTH: 'N',
    SOUTH: 'S',
    EAST: 'E',
    WEST: 'W',
    NORTHEAST: 'NE',
    NORTHWEST: 'NW',
    SOUTHEAST: 'SE',
    SOUTHWEST: 'SW',
};
/** Street line compared word by word with USPS abbreviations, so "Avenue" vs "Ave" isn't a change. */
function comparableStreet(v) {
    return (v !== null && v !== void 0 ? v : '')
        .toUpperCase()
        .replace(/[.,#]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => { var _a; return (_a = STREET_ABBREVIATIONS[w]) !== null && _a !== void 0 ? _a : w; })
        .join(' ');
}
/** Pure interpretation of the API response (exported for tests). */
function interpretValidation(input, body) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const result = body.result;
    const postal = (_a = result === null || result === void 0 ? void 0 : result.address) === null || _a === void 0 ? void 0 : _a.postalAddress;
    if (!result || !postal)
        return { status: 'unavailable' };
    if (postal.regionCode && postal.regionCode !== 'US') {
        return { status: 'non_us', message: usAddress_1.NON_US_SHIPPING_MESSAGE, field: 'stateProvince' };
    }
    const suggestedState = (0, usAddress_1.normalizeUsState)((_b = postal.administrativeArea) !== null && _b !== void 0 ? _b : '');
    if (postal.administrativeArea && !suggestedState) {
        return { status: 'non_us', message: usAddress_1.NON_US_SHIPPING_MESSAGE, field: 'stateProvince' };
    }
    const verdict = (_c = result.verdict) !== null && _c !== void 0 ? _c : {};
    const dpv = (_d = result.uspsData) === null || _d === void 0 ? void 0 : _d.dpvConfirmation;
    const premiseConfirmed = PREMISE_GRANULARITY.has((_e = verdict.validationGranularity) !== null && _e !== void 0 ? _e : '');
    const deliverable = dpv === 'Y' ||
        dpv === 'S' ||
        dpv === 'D' ||
        (premiseConfirmed &&
            (verdict.addressComplete === true || verdict.possibleNextAction === 'CONFIRM_ADD_SUBPREMISES'));
    if (!deliverable || verdict.possibleNextAction === 'FIX') {
        return { status: 'invalid', message: exports.ADDRESS_NOT_FOUND_MESSAGE, field: 'line1' };
    }
    const lines = (_f = postal.addressLines) !== null && _f !== void 0 ? _f : [];
    const line1 = (_g = lines[0]) !== null && _g !== void 0 ? _g : input.line1;
    const line2FoldedIn = !!input.line2 && comparable(line1).endsWith(comparable(input.line2));
    const keptLine2 = (_h = lines[1]) !== null && _h !== void 0 ? _h : (line2FoldedIn ? undefined : input.line2);
    const suggestion = Object.assign(Object.assign({ line1 }, (keptLine2 ? { line2: keptLine2 } : {})), { city: (_j = postal.locality) !== null && _j !== void 0 ? _j : input.city, stateProvince: suggestedState !== null && suggestedState !== void 0 ? suggestedState : input.stateCode, postalCode: ((_k = postal.postalCode) !== null && _k !== void 0 ? _k : input.zip).slice(0, 5) });
    const corrected = ((_m = (_l = result.address) === null || _l === void 0 ? void 0 : _l.addressComponents) !== null && _m !== void 0 ? _m : []).some((c) => { var _a; return (c.spellCorrected || c.replaced) && MEANINGFUL_COMPONENTS.has((_a = c.componentType) !== null && _a !== void 0 ? _a : ''); });
    const streetDiffers = comparableStreet(line1) !== comparableStreet(input.line1) &&
        comparableStreet(lines.join(' ')) !== comparableStreet([input.line1, input.line2].filter(Boolean).join(' '));
    const differs = streetDiffers ||
        comparable(suggestion.city) !== comparable(input.city) ||
        suggestion.stateProvince !== input.stateCode ||
        suggestion.postalCode !== input.zip.slice(0, 5);
    if (corrected || differs)
        return { status: 'suggest', suggestion };
    return { status: 'ok' };
}
exports.validateShippingAddress = (0, sentry_1.onCall)({ secrets: [addressValidationKey], maxInstances: 10 }, async (request) => {
    var _a;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const line1 = str(data.line1);
    const line2 = str(data.line2);
    const city = str(data.city, 100);
    const stateProvince = str(data.stateProvince, 60);
    const postalCode = str(data.postalCode, 20);
    const country = str(data.country, 10) || 'US';
    if (!line1 || !city || !stateProvince || !postalCode) {
        return { status: 'invalid', message: 'Please complete the address.' };
    }
    const format = (0, usAddress_1.checkUsAddressFormat)({ line1, city, stateProvince, postalCode, country });
    if (!format.ok) {
        return {
            status: format.message === usAddress_1.NON_US_SHIPPING_MESSAGE ? 'non_us' : 'invalid',
            message: format.message,
            field: format.field,
        };
    }
    let key = '';
    try {
        key = addressValidationKey.value();
    }
    catch (_b) {
        key = '';
    }
    if (!key)
        return { status: 'unavailable' };
    const ip = (0, geo_1.requestIp)(request.rawRequest);
    if (ip) {
        try {
            if (await (0, loginLinks_1.hitRateLimit)((0, firestore_1.getFirestore)(), `addr:${ip}`, IP_LIMIT_PER_WINDOW, Date.now())) {
                return { status: 'unavailable' };
            }
        }
        catch (err) {
            logger.warn('validateShippingAddress rate limit check failed', { err: String(err) });
        }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                address: {
                    regionCode: 'US',
                    addressLines: line2 ? [line1, line2] : [line1],
                    locality: city,
                    administrativeArea: format.stateCode,
                    postalCode: format.zip,
                },
                enableUspsCass: true,
            }),
        });
        if (!res.ok) {
            logger.warn('validateShippingAddress API error', { status: res.status });
            return { status: 'unavailable' };
        }
        const body = (await res.json());
        return interpretValidation({ line1, line2: line2 || undefined, city, stateCode: format.stateCode, zip: format.zip }, body);
    }
    catch (err) {
        logger.warn('validateShippingAddress failed', { err: String(err) });
        return { status: 'unavailable' };
    }
    finally {
        clearTimeout(timer);
    }
});
//# sourceMappingURL=addressValidation.js.map