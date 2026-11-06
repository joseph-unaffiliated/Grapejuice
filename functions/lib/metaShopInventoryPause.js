"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledMetaShopInventoryPause = exports.DEFAULT_SHOP_AD_BINDINGS = void 0;
exports.mergeShopAdBindings = mergeShopAdBindings;
exports.bindingNeedsPause = bindingNeedsPause;
exports.runMetaShopInventoryPause = runMetaShopInventoryPause;
/**
 * Pauses Meta Shop (post-lock product) ads when the linked catalog item(s) are sold out.
 *
 * Bindings live in code (ad name + catalog itemIds). Optional Firestore
 * `programConfig/metaShopAds` can disable the job or override adIds once Ads Manager
 * IDs are known. Ad account automated rules can't do inventory, so this runs here —
 * same Ads Management token as `scheduledMetaGuard`.
 */
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const catalogAvailability_1 = require("./catalogAvailability");
const catalogInventory_1 = require("./catalogInventory");
const token = (0, params_1.defineSecret)('META_ADS_ACCESS_TOKEN_ADSMANAGEMENT');
const ACCOUNT = 'act_1311852520406314';
const GRAPH = 'https://graph.facebook.com/v21.0';
const CONFIG_DOC = 'programConfig/metaShopAds';
const CAMPAIGN_NAME_CONTAINS = 'Shop';
/**
 * Default Shop campaign ads ↔ catalog. Keep ad names in Ads Manager identical.
 * Frame files live in /Untraditional/Ads/Product Ads/.
 */
exports.DEFAULT_SHOP_AD_BINDINGS = [
    { adName: 'shop-arch-menorah', itemIds: ['arch-menorah'] }, // Frame 105
    { adName: 'shop-dreidel-cookie-cutters', itemIds: ['dreidel-cookie-cutters'] }, // Frame 108
    {
        adName: 'shop-stuffies',
        itemIds: [
            'gimmel-the-dreidel-stuffie',
            'crispy-the-latke-stuffie',
            'jelly-the-sufganiyah-stuffie',
            'shamash-the-menorah-stuffie',
        ],
    }, // Frame 109 → /store/stuffies
    { adName: 'shop-shamash-stuffie', itemIds: ['shamash-the-menorah-stuffie'] }, // Frame 110
    { adName: 'shop-toddler-play-menorah', itemIds: ['toddler-play-menorah'] }, // Frame 111
    { adName: 'shop-airdry-clay-menorah', itemIds: ['airdry-clay-menorah'] }, // Frame 112
    { adName: 'shop-wrapping-paper', itemIds: ['wrapping-paper'] }, // Frame 113
    { adName: 'shop-big-bag-of-gelt', itemIds: ['big-bag-of-gelt'] }, // Frame 114
];
function mergeShopAdBindings(defaults, override) {
    var _a, _b;
    if (!(override === null || override === void 0 ? void 0 : override.length))
        return defaults;
    const byName = new Map(defaults.map((b) => [b.adName, Object.assign({}, b)]));
    for (const row of override) {
        const name = String((_a = row.adName) !== null && _a !== void 0 ? _a : '').trim();
        if (!name)
            continue;
        const prev = byName.get(name);
        byName.set(name, {
            adName: name,
            itemIds: Array.isArray(row.itemIds) && row.itemIds.length ? row.itemIds.map(String) : (_b = prev === null || prev === void 0 ? void 0 : prev.itemIds) !== null && _b !== void 0 ? _b : [],
            adIds: Array.isArray(row.adIds) && row.adIds.length ? row.adIds.map(String) : prev === null || prev === void 0 ? void 0 : prev.adIds,
        });
    }
    return [...byName.values()].filter((b) => b.itemIds.length > 0);
}
function bindingNeedsPause(availabilities) {
    if (!availabilities.length)
        return true;
    return availabilities.some((a) => !a.allowsPurchase);
}
function itemFromSnap(itemId, data) {
    return {
        id: itemId,
        name: typeof data.name === 'string' ? data.name : itemId,
        category: typeof data.category === 'string' ? data.category : null,
        categories: Array.isArray(data.categories)
            ? data.categories.filter((c) => typeof c === 'string')
            : undefined,
        inventory: typeof data.inventory === 'number' ? data.inventory : null,
        setAside: typeof data.setAside === 'number' ? data.setAside : null,
        directSaleCapBeforeLock: typeof data.directSaleCapBeforeLock === 'number' ? data.directSaleCapBeforeLock : null,
        sellAfterLock: data.sellAfterLock === 'yes' || data.sellAfterLock === 'flag' || data.sellAfterLock === 'no'
            ? data.sellAfterLock
            : null,
    };
}
async function getLockAt(db) {
    var _a;
    const snap = await db.doc('config/hanukkah-2026').get();
    const lockAt = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.lockAt;
    return typeof lockAt === 'string' ? lockAt : null;
}
async function loadBindingAvailability(db, binding, lockAt, now) {
    var _a;
    const out = [];
    for (const itemId of binding.itemIds) {
        const [itemSnap, invSnap] = await Promise.all([
            db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/items/${itemId}`).get(),
            (0, catalogInventory_1.inventoryDocRef)(db, itemId).get(),
        ]);
        if (!itemSnap.exists) {
            out.push({ itemId, allowsPurchase: false, remaining: 0 });
            continue;
        }
        const item = itemFromSnap(itemId, (_a = itemSnap.data()) !== null && _a !== void 0 ? _a : {});
        const counters = (0, catalogInventory_1.parseCounters)(invSnap.data());
        const avail = (0, catalogAvailability_1.resolveAvailability)(item, counters, lockAt, now);
        const allows = (0, catalogAvailability_1.availabilityAllowsDirectPurchase)(avail);
        const remaining = avail.status === 'direct' || avail.status === 'limited' ? avail.remaining : 0;
        out.push({ itemId, allowsPurchase: allows, remaining });
    }
    return out;
}
async function pauseMetaAd(accessToken, adId) {
    var _a, _b;
    const body = new URLSearchParams({ access_token: accessToken, status: 'PAUSED' });
    const res = await fetch(`${GRAPH}/${adId}`, { method: 'POST', body });
    const json = (await res.json());
    if (!res.ok || json.error)
        return { ok: false, message: (_b = (_a = json.error) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : `HTTP ${res.status}` };
    return { ok: true };
}
async function listActiveShopAds(accessToken, campaignNameContains) {
    var _a, _b, _c, _d, _e;
    const params = new URLSearchParams({
        access_token: accessToken,
        fields: 'id,name,status,campaign{name}',
        filtering: JSON.stringify([
            { field: 'campaign.name', operator: 'CONTAIN', value: campaignNameContains },
            { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
        ]),
        limit: '200',
    });
    const rows = [];
    let url = `${GRAPH}/${ACCOUNT}/ads?${params}`;
    for (let page = 0; url && page < 5; page++) {
        const res = await fetch(url);
        const body = (await res.json());
        if (!res.ok || body.error)
            throw new Error((_b = (_a = body.error) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : `ads list ${res.status}`);
        for (const row of (_c = body.data) !== null && _c !== void 0 ? _c : []) {
            if (row.id && row.name)
                rows.push(row);
        }
        url = (_e = (_d = body.paging) === null || _d === void 0 ? void 0 : _d.next) !== null && _e !== void 0 ? _e : null;
    }
    return rows;
}
async function runMetaShopInventoryPause(db, accessToken, now = new Date(), fetchAds = listActiveShopAds, pauseAd = pauseMetaAd) {
    var _a, _b, _c, _d;
    const configSnap = await db.doc(CONFIG_DOC).get();
    const config = ((_a = configSnap.data()) !== null && _a !== void 0 ? _a : {});
    if (config.enabled === false) {
        return { checked: 0, paused: [], skipped: ['disabled'], errors: [] };
    }
    const bindings = mergeShopAdBindings(exports.DEFAULT_SHOP_AD_BINDINGS, config.bindings);
    const campaignNeedle = ((_b = config.campaignNameContains) !== null && _b !== void 0 ? _b : CAMPAIGN_NAME_CONTAINS).trim() || CAMPAIGN_NAME_CONTAINS;
    const lockAt = await getLockAt(db);
    const liveAds = await fetchAds(accessToken, campaignNeedle);
    const byName = new Map(liveAds.map((a) => [a.name.trim(), a]));
    const result = { checked: 0, paused: [], skipped: [], errors: [] };
    for (const binding of bindings) {
        result.checked += 1;
        const avails = await loadBindingAvailability(db, binding, lockAt, now);
        if (!bindingNeedsPause(avails.map((a) => ({ allowsPurchase: a.allowsPurchase })))) {
            result.skipped.push(binding.adName);
            continue;
        }
        const adIds = ((_c = binding.adIds) === null || _c === void 0 ? void 0 : _c.length)
            ? binding.adIds
            : (() => {
                const hit = byName.get(binding.adName);
                return hit ? [hit.id] : [];
            })();
        if (!adIds.length) {
            result.skipped.push(`${binding.adName}:no-active-ad`);
            continue;
        }
        for (const adId of adIds) {
            const paused = await pauseAd(accessToken, adId);
            if (!paused.ok) {
                result.errors.push(`${binding.adName}:${(_d = paused.message) !== null && _d !== void 0 ? _d : 'pause failed'}`);
                logger.warn('metaShopInventoryPause: pause failed', {
                    adName: binding.adName,
                    adId,
                    message: paused.message,
                });
                continue;
            }
            result.paused.push(binding.adName);
            await db.collection('programAlerts').add({
                at: now.toISOString(),
                kind: 'meta_shop_inventory_pause',
                adName: binding.adName,
                adId,
                itemIds: binding.itemIds,
                availability: avails,
                open: true,
            });
        }
    }
    return result;
}
exports.scheduledMetaShopInventoryPause = (0, sentry_1.onSchedule)({ schedule: 'every 15 minutes', secrets: [token], memory: '256MiB', timeoutSeconds: 120 }, async () => {
    var _a;
    const db = (0, firestore_1.getFirestore)();
    const access = (_a = token.value()) === null || _a === void 0 ? void 0 : _a.trim();
    if (!access) {
        await db.doc('programJobs/metaShopInventoryPause').set({
            at: new Date().toISOString(),
            ok: false,
            error: 'no token',
        });
        return;
    }
    try {
        const result = await runMetaShopInventoryPause(db, access);
        await db.doc('programJobs/metaShopInventoryPause').set(Object.assign({ at: new Date().toISOString(), ok: true }, result));
        if (result.paused.length)
            logger.warn('metaShopInventoryPause paused ads', result);
        if (result.errors.length)
            logger.warn('metaShopInventoryPause errors', result);
    }
    catch (err) {
        logger.error('metaShopInventoryPause failed', err instanceof Error ? err : new Error(String(err)));
        await db.doc('programJobs/metaShopInventoryPause').set({
            at: new Date().toISOString(),
            ok: false,
            error: String(err).slice(0, 300),
        });
    }
});
//# sourceMappingURL=metaShopInventoryPause.js.map