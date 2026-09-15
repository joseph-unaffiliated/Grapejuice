"use strict";
/**
 * Marketplace availability — keep in sync with src/services/catalog/availability.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCatalogBookItem = isCatalogBookItem;
exports.resolveAvailability = resolveAvailability;
exports.availabilityAllowsDirectPurchase = availabilityAllowsDirectPurchase;
exports.availabilityRemaining = availabilityRemaining;
exports.availabilityRejectMessage = availabilityRejectMessage;
function isCatalogBookItem(item) {
    var _a;
    if (item.id.startsWith('book-'))
        return true;
    const cats = ((_a = item.categories) === null || _a === void 0 ? void 0 : _a.length)
        ? item.categories
        : item.category
            ? [item.category]
            : [];
    if (cats.some((c) => c.trim().toLowerCase() === 'book'))
        return true;
    if (item.name && /book|novel/i.test(item.name))
        return true;
    return false;
}
function nonNeg(n) {
    if (typeof n !== 'number' || !Number.isFinite(n))
        return 0;
    return Math.max(0, Math.floor(n));
}
function isLocked(lockAt, now) {
    if (!lockAt)
        return false;
    return now.getTime() >= new Date(lockAt).getTime();
}
function resolveAvailability(item, counters, lockAt, now = new Date()) {
    if (isCatalogBookItem(item)) {
        return { status: 'box_only', reason: 'book' };
    }
    const reserved = nonNeg(counters === null || counters === void 0 ? void 0 : counters.directReservedQty);
    const sold = nonNeg(counters === null || counters === void 0 ? void 0 : counters.directSoldQty);
    const committed = reserved + sold;
    if (!isLocked(lockAt, now)) {
        const cap = item.directSaleCapBeforeLock;
        if (cap == null || !Number.isFinite(cap) || cap <= 0) {
            return { status: 'box_only', reason: 'no_cap' };
        }
        const remaining = Math.max(0, Math.floor(cap) - committed);
        if (remaining <= 0) {
            return { status: 'box_only', reason: 'cap_exhausted' };
        }
        if (remaining > 10) {
            return { status: 'direct', remaining };
        }
        return { status: 'limited', remaining };
    }
    const fba = item.sellAfterLock;
    if (fba === 'flag') {
        return { status: 'box_only', reason: 'post_lock_flag' };
    }
    if (fba !== 'yes') {
        return { status: 'box_only', reason: 'post_lock_no_release' };
    }
    const inventory = nonNeg(item.inventory);
    const boxAllocated = nonNeg(counters === null || counters === void 0 ? void 0 : counters.boxAllocatedQty);
    const remaining = Math.max(0, inventory - boxAllocated - committed);
    if (remaining <= 0) {
        return { status: 'sold_out' };
    }
    if (remaining > 10) {
        return { status: 'direct', remaining };
    }
    return { status: 'limited', remaining };
}
function availabilityAllowsDirectPurchase(a) {
    return a.status === 'direct' || a.status === 'limited';
}
function availabilityRemaining(a) {
    if (a.status === 'direct')
        return a.remaining;
    if (a.status === 'limited')
        return a.remaining;
    return null;
}
function availabilityRejectMessage(itemName, a) {
    switch (a.status) {
        case 'box_only':
            if (a.reason === 'book') {
                return `${itemName} is only available as part of a Hanukkah box.`;
            }
            if (a.reason === 'cap_exhausted') {
                return `${itemName} is sold out for direct purchase until boxes lock.`;
            }
            if (a.reason === 'post_lock_flag' || a.reason === 'post_lock_no_release') {
                return `${itemName} is only available as part of a Hanukkah box.`;
            }
            return `${itemName} is only available as part of a Hanukkah box.`;
        case 'sold_out':
            return `${itemName} is sold out.`;
        default:
            return `${itemName} is not available for purchase.`;
    }
}
//# sourceMappingURL=catalogAvailability.js.map