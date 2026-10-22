"use strict";
/**
 * Lock, extension, and code dates. ET is EST (UTC-5) after Nov 1 2026.
 * Client copy lives in src/constants/hanukkahBoxLock.ts — keep the instants in sync.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CARD_FIX_DEADLINE = exports.EXTENSION_END = exports.EXTENSION_START = exports.COMMITTED_FREEZE_AT = exports.OFFER_LAST_DAY = exports.FIFTEENOFF_ENDS_AT = void 0;
exports.isExtensionWindow = isExtensionWindow;
exports.isHouseholdBoxFrozen = isHouseholdBoxFrozen;
/** 11:59pm ET Nov 4. FIFTEENOFF stops applying at checkout after this. */
exports.FIFTEENOFF_ENDS_AT = '2026-11-05T04:59:59.000Z';
/** Last ET calendar day the 15% email and the 15% ads may run. */
exports.OFFER_LAST_DAY = '2026-11-04';
/** 11:59pm ET Nov 7. A box committed before this stays frozen even if the public lock moves. */
exports.COMMITTED_FREEZE_AT = '2026-11-08T04:59:59.000Z';
/** Noon ET Nov 9. The site opens again for people who have not locked a box. */
exports.EXTENSION_START = '2026-11-09T17:00:00.000Z';
/** Noon ET Nov 10. The public lock moves here at noon on Nov 9, then passes. */
exports.EXTENSION_END = '2026-11-10T17:00:00.000Z';
/** Noon ET Nov 12. A declined card can be fixed until this moment, then the order is cancelled. */
exports.CARD_FIX_DEADLINE = '2026-11-12T17:00:00.000Z';
const FROZEN = new Set(['committed', 'pending', 'confirmed', 'shipped', 'delivered']);
function isExtensionWindow(now) {
    const t = now.getTime();
    return t >= Date.parse(exports.EXTENSION_START) && t < Date.parse(exports.EXTENSION_END);
}
/**
 * Someone who already locked a box stays in the post-lock experience.
 * Before 11:59pm ET Nov 7 their own lockAt is still ahead, so they can edit.
 * After that, a committed order is frozen even when the public lock moves to Nov 10.
 */
function isHouseholdBoxFrozen(order, now = new Date()) {
    var _a;
    if (!order)
        return false;
    if (!FROZEN.has((_a = order.status) !== null && _a !== void 0 ? _a : ''))
        return false;
    if (order.lockAt) {
        const lock = Date.parse(order.lockAt);
        if (!Number.isNaN(lock) && now.getTime() >= lock)
            return true;
    }
    return now.getTime() >= Date.parse(exports.COMMITTED_FREEZE_AT);
}
//# sourceMappingURL=lockWindow.js.map