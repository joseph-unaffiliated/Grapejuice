"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopOrderState = shopOrderState;
exports.buildShopOrder = buildShopOrder;
const testAccounts_1 = require("./testAccounts");
/**
 * Storefront (no-box) orders for the admin Orders and Inventory page: `orders` docs with
 * orderType 'marketplace'. Admin-only, so buyer name and email are included.
 */
const PAID = ['confirmed', 'shipped', 'delivered'];
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v ? v : null);
function iso(v) {
    if (!v)
        return null;
    if (typeof v === 'string')
        return v;
    if (typeof v.toDate === 'function')
        return v.toDate().toISOString();
    return null;
}
function shopOrderState(o) {
    var _a, _b, _c;
    const base = (_a = str(o.status)) !== null && _a !== void 0 ? _a : 'unknown';
    const total = (_b = num(o.totalCents)) !== null && _b !== void 0 ? _b : 0;
    const refunded = (_c = num(o.refundedCents)) !== null && _c !== void 0 ? _c : 0;
    const paid = PAID.includes(base) || (base === 'cancelled' && Boolean(o.confirmedAt));
    const status = refunded > 0 && refunded >= total && total > 0 ? 'refunded' : base;
    const abandoned = !paid && (base === 'pending' || base === 'cancelled');
    let fulfillment = '—';
    if (str(o.trackingNumber) || base === 'shipped' || base === 'delivered')
        fulfillment = base === 'delivered' ? 'Delivered' : 'Shipped';
    else if (o.playthrough === true)
        fulfillment = 'Not shipped (playthrough)';
    else if (o.marketplaceFulfilledAt)
        fulfillment = 'Sent to ShipStation';
    else if (status === 'refunded' || base === 'cancelled')
        fulfillment = '—';
    else if (paid || base === 'committed')
        fulfillment = 'Ships after box lock';
    return { status, paid, abandoned, fulfillment };
}
function promoLabel(p) {
    if (!p || typeof p !== 'object')
        return null;
    const promo = p;
    const parts = [];
    if (promo.source === 'code' && str(promo.code))
        parts.push(`Code ${promo.code}`);
    const slug = str(promo.influencerSlug);
    if (slug)
        parts.push(`@${slug}${promo.selfReferral ? ' (own link)' : ''}`);
    return parts.length ? parts.join(' · ') : null;
}
function buildShopOrder(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const { householdId, orderId, order: o, user } = input;
    const lines = (Array.isArray(o.lineItems) ? o.lineItems : []).filter(Boolean).map((li) => {
        var _a;
        const itemId = str(li.itemId);
        return {
            itemId,
            name: (itemId && input.itemNames.get(itemId)) || str(li.label) || itemId || '?',
            qty: Math.max(1, Math.floor(Number(li.quantity) || 1)),
            unitCents: (_a = num(li.unitCents)) !== null && _a !== void 0 ? _a : 0,
        };
    });
    const email = (_b = (_a = str(o.guestEmail)) !== null && _a !== void 0 ? _a : user === null || user === void 0 ? void 0 : user.email) !== null && _b !== void 0 ? _b : str((_c = o.shippingAddress) === null || _c === void 0 ? void 0 : _c.email);
    const timing = o.chargeTiming === 'checkout' || o.chargeTiming === 'lock' ? o.chargeTiming : null;
    return Object.assign(Object.assign({ id: `${householdId}/${orderId}`, orderId, orderNumber: orderId.slice(0, 8).toUpperCase(), householdId, createdAt: iso(o.createdAt), paidAt: iso(o.confirmedAt), buyer: (_f = (_e = str((_d = o.shippingAddress) === null || _d === void 0 ? void 0 : _d.name)) !== null && _e !== void 0 ? _e : user === null || user === void 0 ? void 0 : user.name) !== null && _f !== void 0 ? _f : null, email, guest: o.checkoutSignedOut === true || Boolean(str(o.guestEmail)), test: (0, testAccounts_1.isTest)(email, user === null || user === void 0 ? void 0 : user.email), playthrough: o.playthrough === true }, shopOrderState(o)), { cancelReason: str(o.cancelReason), chargeTiming: timing, chargeFailure: str(o.chargeFailureMessage), lines, units: lines.reduce((s, l) => s + l.qty, 0), subtotalCents: num(o.subtotalCents), discountCents: (_g = num(o.discountCents)) !== null && _g !== void 0 ? _g : 0, creditCents: (_h = num(o.creditAppliedCents)) !== null && _h !== void 0 ? _h : ((_j = num(o.giftCreditAppliedCents)) !== null && _j !== void 0 ? _j : 0) + ((_k = num(o.platformCreditAppliedCents)) !== null && _k !== void 0 ? _k : 0), shippingCents: num(o.shippingCents), taxCents: num(o.taxCents), totalCents: num(o.totalCents), refundedCents: (_l = num(o.refundedCents)) !== null && _l !== void 0 ? _l : 0, promo: promoLabel(o.promo), attribution: input.attribution, location: input.location, trackingNumber: str(o.trackingNumber), carrier: str(o.carrier), shippedAt: iso(o.shippedAt) });
}
//# sourceMappingURL=shopOrders.js.map