"use strict";
/**
 * Monday Nov 9, 11:00am ET: pause every Grapejuice campaign and turn off the
 * overnight pause/resume rules so nothing comes back on Tuesday.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metaAdsCutoffToken = void 0;
exports.stopGrapejuiceAds = stopGrapejuiceAds;
const params_1 = require("firebase-functions/params");
const logger = require("./logger");
const time_1 = require("./program/time");
/** Write token for Meta Ads. Bound by the scheduled cutoff function as a secret. */
exports.metaAdsCutoffToken = (0, params_1.defineSecret)('META_ADS_ACCESS_TOKEN_ADSMANAGEMENT');
const GRAPH = 'https://graph.facebook.com/v21.0';
const ACCOUNT = 'act_1311852520406314';
const CUTOFF_DAY = '2026-11-09';
async function graph(token, path, params = {}, method = 'GET') {
    const body = new URLSearchParams({ access_token: token });
    for (const [key, value] of Object.entries(params))
        body.set(key, value);
    const url = method === 'GET' ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
    const res = await fetch(url, method === 'GET' ? undefined : { method, body });
    const json = (await res.json());
    if (json.error)
        throw new Error(json.error.message || 'Meta request failed');
    return json;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function stopGrapejuiceAds(token, now = new Date()) {
    var _a, _b, _c, _d;
    if ((0, time_1.etDate)(now.toISOString()) !== CUTOFF_DAY)
        return { paused: [], rules: [] };
    if (!token.trim())
        throw new Error('META_ADS_ACCESS_TOKEN_ADSMANAGEMENT is empty');
    const campaigns = await graph(token, `${ACCOUNT}/campaigns`, { fields: 'name,effective_status', limit: '100' });
    const paused = [];
    for (const campaign of (_a = campaigns.data) !== null && _a !== void 0 ? _a : []) {
        if (!((_b = campaign.name) === null || _b === void 0 ? void 0 : _b.startsWith('Grapejuice')))
            continue;
        if (campaign.effective_status === 'PAUSED')
            continue;
        await sleep(32000);
        await graph(token, campaign.id, { status: 'PAUSED' }, 'POST');
        paused.push(campaign.name);
    }
    const rules = await graph(token, `${ACCOUNT}/adrules_library`, { fields: 'name,status', limit: '100' });
    const stopped = [];
    for (const rule of (_c = rules.data) !== null && _c !== void 0 ? _c : []) {
        if (!((_d = rule.name) === null || _d === void 0 ? void 0 : _d.startsWith('Grapejuice:')))
            continue;
        if (rule.status === 'DISABLED')
            continue;
        await sleep(32000);
        await graph(token, rule.id, { status: 'DISABLED' }, 'POST');
        stopped.push(rule.name);
    }
    logger.info('grapejuice ads stopped for the season', { paused, rules: stopped });
    return { paused, rules: stopped };
}
//# sourceMappingURL=metaAdsCutoff.js.map