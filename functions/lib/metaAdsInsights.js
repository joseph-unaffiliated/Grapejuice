"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metaAdsAccessToken = void 0;
exports.metaStatsByAd = metaStatsByAd;
const params_1 = require("firebase-functions/params");
const logger = require("./logger");
exports.metaAdsAccessToken = (0, params_1.defineSecret)('META_ADS_ACCESS_TOKEN');
const AD_ACCOUNT = 'act_1311852520406314';
const GRAPH = 'https://graph.facebook.com/v21.0';
/** The ad account also runs Unaffiliated campaigns; only Grapejuice ones count here. */
const CAMPAIGN_FILTER = 'Grapejuice';
const SINCE = '2026-09-01';
const CACHE_MS = 10 * 60 * 1000;
let cache = null;
const ACTION_KEYS = {
    landing_page_view: 'landingPageViews',
    'offsite_conversion.fb_pixel_add_to_cart': 'addToCart',
    'offsite_conversion.fb_pixel_complete_registration': 'registrations',
    'offsite_conversion.fb_pixel_purchase': 'purchases',
};
/** Per-ad Meta results keyed by ad name (what ads pass as utm_content). Null when Meta is unreachable. */
async function metaStatsByAd(nowMs = Date.now()) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (cache && nowMs - cache.at < CACHE_MS)
        return cache.byAd;
    let token;
    try {
        token = exports.metaAdsAccessToken.value();
    }
    catch (_h) {
        return null;
    }
    if (!token)
        return null;
    const until = new Date(nowMs).toISOString().slice(0, 10);
    const params = new URLSearchParams({
        level: 'ad',
        fields: 'ad_name,spend,inline_link_clicks,actions',
        time_range: JSON.stringify({ since: SINCE, until }),
        filtering: JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: CAMPAIGN_FILTER }]),
        limit: '500',
        access_token: token,
    });
    const byAd = {};
    let url = `${GRAPH}/${AD_ACCOUNT}/insights?${params}`;
    try {
        for (let page = 0; url && page < 10; page++) {
            const res = await fetch(url);
            const body = (await res.json());
            if (!res.ok || body.error) {
                logger.warn('metaStatsByAd: insights request failed', { status: res.status, message: (_a = body.error) === null || _a === void 0 ? void 0 : _a.message });
                return null;
            }
            for (const row of (_b = body.data) !== null && _b !== void 0 ? _b : []) {
                const name = (_c = row.ad_name) === null || _c === void 0 ? void 0 : _c.trim();
                if (!name)
                    continue;
                const s = ((_d = byAd[name]) !== null && _d !== void 0 ? _d : (byAd[name] = { spend: 0, linkClicks: 0, landingPageViews: 0, addToCart: 0, registrations: 0, purchases: 0 }));
                s.spend += Number(row.spend) || 0;
                s.linkClicks += Number(row.inline_link_clicks) || 0;
                for (const a of (_e = row.actions) !== null && _e !== void 0 ? _e : []) {
                    const key = ACTION_KEYS[a.action_type];
                    if (key)
                        s[key] += Number(a.value) || 0;
                }
            }
            url = (_g = (_f = body.paging) === null || _f === void 0 ? void 0 : _f.next) !== null && _g !== void 0 ? _g : null;
        }
    }
    catch (err) {
        logger.warn('metaStatsByAd: insights request threw', { message: err instanceof Error ? err.message : String(err) });
        return null;
    }
    for (const s of Object.values(byAd))
        s.spend = Math.round(s.spend * 100) / 100;
    cache = { at: nowMs, byAd };
    return byAd;
}
//# sourceMappingURL=metaAdsInsights.js.map