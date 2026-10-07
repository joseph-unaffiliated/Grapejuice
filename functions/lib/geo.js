"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIp = requestIp;
exports.geoFromRequest = geoFromRequest;
exports.ipGeoField = ipGeoField;
const firestore_1 = require("firebase-admin/firestore");
let geoip = null;
function lookup(ip) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        geoip !== null && geoip !== void 0 ? geoip : (geoip = require('geoip-lite'));
        const r = geoip.lookup(ip);
        if (!(r === null || r === void 0 ? void 0 : r.country))
            return null;
        return { country: r.country, region: r.region ? r.region : null };
    }
    catch (_a) {
        return null;
    }
}
function requestIp(raw) {
    var _a, _b, _c;
    const req = (raw !== null && raw !== void 0 ? raw : {});
    const forwarded = (_a = req.headers) === null || _a === void 0 ? void 0 : _a['x-forwarded-for'];
    const first = (_c = (_b = (Array.isArray(forwarded) ? forwarded[0] : forwarded)) === null || _b === void 0 ? void 0 : _b.split(',')[0]) === null || _c === void 0 ? void 0 : _c.trim();
    const ip = first || req.ip;
    return ip ? ip.replace(/^::ffff:/, '') : null;
}
function geoFromRequest(raw) {
    const ip = requestIp(raw);
    return ip ? lookup(ip) : null;
}
/** Firestore value for `ipGeo` on users/{uid} and guestSessions/{visitorId}. */
function ipGeoField(geo) {
    return { country: geo.country, region: geo.region, at: firestore_1.FieldValue.serverTimestamp() };
}
//# sourceMappingURL=geo.js.map