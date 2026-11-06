"use strict";
/**
 * Post-lock marketplace shipping — keep in sync with
 * src/services/box/postLockShipping.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST_LOCK_WEIGHT_TIERS = exports.DEFAULT_LINE_WEIGHT_OZ = void 0;
exports.weightTierCents = weightTierCents;
exports.parseCatalogWeightOuncesClient = parseCatalogWeightOuncesClient;
exports.postLockShippingCents = postLockShippingCents;
exports.DEFAULT_LINE_WEIGHT_OZ = 16;
exports.POST_LOCK_WEIGHT_TIERS = [
    { maxOz: 8, cents: 1199 },
    { maxOz: 16, cents: 1499 },
    { maxOz: 32, cents: 1899 },
    { maxOz: 48, cents: 2299 },
    { maxOz: 80, cents: 2899 },
    { maxOz: 160, cents: 3999 },
    { maxOz: 320, cents: 5499 },
];
const OVER_20LB_STEP_OZ = 80;
const OVER_20LB_STEP_CENTS = 1200;
function weightTierCents(totalOz) {
    const oz = Math.max(0, Number.isFinite(totalOz) ? totalOz : 0);
    for (const tier of exports.POST_LOCK_WEIGHT_TIERS) {
        if (oz <= tier.maxOz)
            return tier.cents;
    }
    const over = oz - 320;
    const steps = Math.ceil(over / OVER_20LB_STEP_OZ);
    return 5499 + steps * OVER_20LB_STEP_CENTS;
}
function parseCatalogWeightOuncesClient(raw) {
    if (!(raw === null || raw === void 0 ? void 0 : raw.trim()))
        return null;
    const s = raw.trim().toLowerCase();
    const lb = s.match(/^([\d.]+)\s*(lb|lbs|pound|pounds)\b/);
    if (lb) {
        const n = Number(lb[1]);
        return Number.isFinite(n) ? n * 16 : null;
    }
    const oz = s.match(/^([\d.]+)\s*(oz|ounce|ounces)\b/);
    if (oz) {
        const n = Number(oz[1]);
        return Number.isFinite(n) ? n : null;
    }
    const bare = Number(s);
    if (Number.isFinite(bare) && bare > 0) {
        return bare < 20 ? bare * 16 : bare;
    }
    return null;
}
function postLockShippingCents(lines) {
    let weightOz = 0;
    let fbaCents = 0;
    for (const line of lines) {
        const qty = Math.max(0, Math.floor(line.qty) || 0);
        if (qty <= 0)
            continue;
        const parsed = parseCatalogWeightOuncesClient(line.weight);
        weightOz += (parsed !== null && parsed !== void 0 ? parsed : exports.DEFAULT_LINE_WEIGHT_OZ) * qty;
        const fee = typeof line.fbaFeeCents === 'number' && Number.isFinite(line.fbaFeeCents)
            ? Math.max(0, Math.round(line.fbaFeeCents))
            : 0;
        fbaCents += fee * qty;
    }
    const tierCents = weightTierCents(weightOz);
    return {
        weightOz,
        tierCents,
        fbaCents,
        shippingCents: tierCents + fbaCents,
    };
}
//# sourceMappingURL=postLockShipping.js.map