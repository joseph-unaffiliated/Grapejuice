"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderConfirmationTemplate = orderConfirmationTemplate;
exports.orderEmailLines = orderEmailLines;
exports.orderItemSummary = orderItemSummary;
exports.claimOrderEmail = claimOrderEmail;
/** Storefront orders get their own template; Hanukkah boxes and gift boxes get the box one. */
function orderConfirmationTemplate(order) {
    return order.orderType === 'marketplace' ? 'marketplace-order-confirmed' : 'order-confirmed';
}
function orderEmailLines(lineItems) {
    if (!Array.isArray(lineItems))
        return [];
    return lineItems
        .filter((li) => typeof li === 'object' && li !== null)
        .map((li) => {
        var _a, _b;
        return ({
            name: String((_b = (_a = li.label) !== null && _a !== void 0 ? _a : li.itemId) !== null && _b !== void 0 ? _b : 'Item'),
            quantity: Math.max(1, Math.floor(Number(li.quantity) || 1)),
        });
    });
}
function orderItemSummary(lines) {
    return lines.map((li) => (li.quantity > 1 ? `${li.quantity}× ${li.name}` : li.name)).join(', ');
}
/** A send that crashed mid-flight releases its claim after this long. */
const EMAIL_CLAIM_STALE_MS = 10 * 60 * 1000;
/**
 * The checkout callable and the Stripe webhook can both finish the same order; only the caller
 * that wins `<prefix>ClaimedAt` sends. Clear the claim if the send fails.
 */
async function claimOrderEmail(orderRef, prefix, now = Date.now()) {
    return orderRef.firestore.runTransaction(async (tx) => {
        var _a;
        const data = (_a = (await tx.get(orderRef)).data()) !== null && _a !== void 0 ? _a : {};
        if (data[`${prefix}SentAt`])
            return false;
        const claimedAt = typeof data[`${prefix}ClaimedAt`] === 'string' ? Date.parse(data[`${prefix}ClaimedAt`]) : NaN;
        if (Number.isFinite(claimedAt) && now - claimedAt < EMAIL_CLAIM_STALE_MS)
            return false;
        tx.update(orderRef, { [`${prefix}ClaimedAt`]: new Date(now).toISOString() });
        return true;
    });
}
//# sourceMappingURL=orderEmails.js.map