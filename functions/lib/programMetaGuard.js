"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledMetaGuard = void 0;
exports.runMetaGuard = runMetaGuard;
/**
 * Hourly stand-in for the Ads Manager auto-pause rule. This ad account rejects automated rules
 * that pause on frequency or cost ("can't have cost conditions"), so the check lives here.
 * Pauses one ad set when, over the last 3 days, it was shown more than about 3 times a day
 * (frequency over 9) or it spent at least $300 at more than $150 per purchase.
 */
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const token = (0, params_1.defineSecret)('META_ADS_ACCESS_TOKEN_ADSMANAGEMENT');
const ACCOUNT = 'act_1311852520406314';
const GRAPH = 'https://graph.facebook.com/v21.0';
const GRANDPARENT = '120247861812310519';
async function runMetaGuard(accessToken) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const params = new URLSearchParams({
        access_token: accessToken,
        level: 'adset',
        date_preset: 'last_3d',
        fields: 'adset_id,adset_name,campaign_id,campaign_name,spend,frequency,actions',
        filtering: JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: 'Grapejuice' }]),
        limit: '200',
    });
    const res = await fetch(`${GRAPH}/${ACCOUNT}/insights?${params}`);
    const body = (await res.json());
    if (!res.ok || body.error)
        throw new Error((_b = (_a = body.error) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : `insights ${res.status}`);
    const paused = [];
    for (const row of (_c = body.data) !== null && _c !== void 0 ? _c : []) {
        if (!row.adset_id || row.campaign_id === GRANDPARENT)
            continue;
        const spend = Number((_d = row.spend) !== null && _d !== void 0 ? _d : 0);
        const frequency = Number((_e = row.frequency) !== null && _e !== void 0 ? _e : 0);
        const purchases = ((_f = row.actions) !== null && _f !== void 0 ? _f : [])
            .filter((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')
            .reduce((sum, a) => { var _a; return sum + Number((_a = a.value) !== null && _a !== void 0 ? _a : 0); }, 0);
        const cpp = purchases > 0 ? spend / purchases : null;
        const tooOften = frequency > 9 && spend >= 50;
        const tooCostly = cpp != null && cpp > 150 && spend >= 300;
        if (!tooOften && !tooCostly)
            continue;
        const pause = new URLSearchParams({ access_token: accessToken, status: 'PAUSED' });
        const updated = await fetch(`${GRAPH}/${row.adset_id}`, { method: 'POST', body: pause });
        const updatedBody = (await updated.json());
        if (!updated.ok || updatedBody.error) {
            logger.warn('metaGuard: pause failed', { adset: row.adset_id, message: (_g = updatedBody.error) === null || _g === void 0 ? void 0 : _g.message });
            continue;
        }
        paused.push((_h = row.adset_name) !== null && _h !== void 0 ? _h : row.adset_id);
        await (0, firestore_1.getFirestore)().collection('programAlerts').add({
            at: new Date().toISOString(),
            kind: 'meta_auto_pause',
            adsetId: row.adset_id,
            name: (_j = row.adset_name) !== null && _j !== void 0 ? _j : null,
            reason: tooOften ? 'frequency' : 'cpp',
            spend,
            frequency,
            cpp,
            open: true,
        });
    }
    return { checked: (_l = (_k = body.data) === null || _k === void 0 ? void 0 : _k.length) !== null && _l !== void 0 ? _l : 0, paused };
}
exports.scheduledMetaGuard = (0, sentry_1.onSchedule)({ schedule: 'every 60 minutes', secrets: [token], memory: '256MiB', timeoutSeconds: 120 }, async () => {
    var _a;
    const db = (0, firestore_1.getFirestore)();
    const access = (_a = token.value()) === null || _a === void 0 ? void 0 : _a.trim();
    if (!access) {
        await db.doc('programJobs/metaGuard').set({ at: new Date().toISOString(), ok: false, error: 'no token' });
        return;
    }
    try {
        const result = await runMetaGuard(access);
        await db.doc('programJobs/metaGuard').set(Object.assign({ at: new Date().toISOString(), ok: true }, result));
        if (result.paused.length)
            logger.warn('metaGuard paused ad sets', result);
    }
    catch (err) {
        logger.error('metaGuard failed', err instanceof Error ? err : new Error(String(err)));
        await db.doc('programJobs/metaGuard').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 300) });
    }
});
//# sourceMappingURL=programMetaGuard.js.map