"use strict";
/**
 * Monday Nov 9, 11:00am ET: pause every Grapejuice campaign and turn off the
 * overnight pause/resume rules so nothing comes back on Tuesday.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopGrapejuiceAds = stopGrapejuiceAds;
const logger = require("./logger");
const time_1 = require("./program/time");
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
async function stopGrapejuiceAds(now = new Date()) {
    var _a, _b, _c, _d, _e;
    if ((0, time_1.etDate)(now.toISOString()) !== CUTOFF_DAY)
        return { paused: [], rules: [] };
    const token = (_a = process.env.META_ADS_ACCESS_TOKEN) === null || _a === void 0 ? void 0 : _a.trim();
    if (!token)
        throw new Error('META_ADS_ACCESS_TOKEN is not configured');
    const campaigns = await graph(token, `${ACCOUNT}/campaigns`, { fields: 'name,effective_status', limit: '100' });
    const paused = [];
    for (const campaign of (_b = campaigns.data) !== null && _b !== void 0 ? _b : []) {
        if (!((_c = campaign.name) === null || _c === void 0 ? void 0 : _c.startsWith('Grapejuice')))
            continue;
        if (campaign.effective_status === 'PAUSED')
            continue;
        await sleep(32000);
        await graph(token, campaign.id, { status: 'PAUSED' }, 'POST');
        paused.push(campaign.name);
    }
    const rules = await graph(token, `${ACCOUNT}/adrules_library`, { fields: 'name,status', limit: '100' });
    const stopped = [];
    for (const rule of (_d = rules.data) !== null && _d !== void 0 ? _d : []) {
        if (!((_e = rule.name) === null || _e === void 0 ? void 0 : _e.startsWith('Grapejuice:')))
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