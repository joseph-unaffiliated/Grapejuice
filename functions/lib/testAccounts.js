"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPlaythroughTestEmail = isPlaythroughTestEmail;
exports.isTest = isTest;
/**
 * Team and QA accounts by email only: @unaffiliated.co, placeholder domains, or Joseph's / Brendan's
 * addresses. Names don't count — the family form pre-filled "Joseph" for customers until Oct 8.
 */
/**
 * Automated test checkouts: `joseph+test-<purpose>@unaffiliated.co`. Their orders are
 * treated as visitor playthroughs (no stock allocation, no ShipStation export), so the
 * browser test flows can place orders without touching inventory. Narrower than isTest
 * on purpose: Joseph's own real orders must still ship.
 */
function isPlaythroughTestEmail(email) {
    if (!email)
        return false;
    return /^joseph\+test[-._+][^@\s]*@unaffiliated\.co$/i.test(email.trim());
}
function isTest(...vals) {
    return vals.some((v) => {
        if (!v || !v.includes('@'))
            return false;
        const s = v.toLowerCase();
        return /@unaffiliated?(\.co)?$/.test(s) || /@(a\.com|test\.com|example\.com)$/.test(s) || /joseph|jweissgold|brendan/.test(s);
    });
}
//# sourceMappingURL=testAccounts.js.map