"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportOrderToShipStation = exportOrderToShipStation;
exports.applyShipStationTracking = applyShipStationTracking;
const logger = require("firebase-functions/logger");
function toShipStationAddress(raw) {
    var _a, _b, _c, _d, _e, _f, _g;
    const country = String((_a = raw.country) !== null && _a !== void 0 ? _a : 'US');
    return {
        name: String((_b = raw.name) !== null && _b !== void 0 ? _b : 'Grapejuice customer'),
        street1: String((_c = raw.line1) !== null && _c !== void 0 ? _c : ''),
        street2: raw.line2 ? String(raw.line2) : undefined,
        city: String((_d = raw.city) !== null && _d !== void 0 ? _d : ''),
        state: String((_f = (_e = raw.stateProvince) !== null && _e !== void 0 ? _e : raw.state) !== null && _f !== void 0 ? _f : ''),
        postalCode: String((_g = raw.postalCode) !== null && _g !== void 0 ? _g : ''),
        country: country === 'CA' ? 'CA' : 'US',
    };
}
/** ShipStation order export — no-op when keys missing. */
async function exportOrderToShipStation(order) {
    var _a, _b, _c;
    const apiKey = (_a = process.env.SHIPSTATION_API_KEY) !== null && _a !== void 0 ? _a : '';
    const apiSecret = (_b = process.env.SHIPSTATION_API_SECRET) !== null && _b !== void 0 ? _b : '';
    if (!apiKey || !apiSecret) {
        logger.info('ShipStation export skipped (keys not configured)', { orderId: order.orderId });
        return { exported: false };
    }
    const shipTo = toShipStationAddress(order.shippingAddress);
    if (!shipTo.street1 || !shipTo.city) {
        logger.warn('ShipStation export skipped (incomplete address)', { orderId: order.orderId });
        return { exported: false };
    }
    const items = order.lineItems.map((li, i) => {
        var _a, _b, _c, _d, _e, _f;
        return ({
            lineItemKey: (_a = li.itemId) !== null && _a !== void 0 ? _a : `line-${i}`,
            sku: (_b = li.itemId) !== null && _b !== void 0 ? _b : `pilot-${i}`,
            name: (_d = (_c = li.label) !== null && _c !== void 0 ? _c : li.itemId) !== null && _d !== void 0 ? _d : 'Hanukkah box item',
            quantity: (_e = li.quantity) !== null && _e !== void 0 ? _e : 1,
            unitPrice: (((_f = li.unitCents) !== null && _f !== void 0 ? _f : 0) / 100).toFixed(2),
        });
    });
    const payload = {
        orderNumber: `GJ-${order.householdId.slice(0, 6)}-${order.orderId.slice(0, 8)}`,
        orderKey: order.orderId,
        orderDate: new Date().toISOString(),
        orderStatus: 'awaiting_shipment',
        customerUsername: order.householdId,
        customerEmail: String((_c = order.shippingAddress.email) !== null && _c !== void 0 ? _c : ''),
        billTo: shipTo,
        shipTo,
        items: items.length ? items : [{ sku: 'hanukkah-pilot-box', name: 'Hanukkah pilot box', quantity: 1, unitPrice: '50.00' }],
        amountPaid: (order.totalCents / 100).toFixed(2),
        shippingAmount: 0,
        advancedOptions: order.expeditedShipping ? { customField1: 'expedited' } : undefined,
    };
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const res = await fetch('https://ssapi.shipstation.com/orders/createorder', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ShipStation ${res.status}: ${text}`);
    }
    const data = (await res.json());
    logger.info('ShipStation order created', { orderId: order.orderId, shipStationOrderId: data.orderId });
    return { exported: true, externalId: data.orderId != null ? String(data.orderId) : order.orderId };
}
/** Write tracking from ShipStation webhook or manual ops update. */
async function applyShipStationTracking(db, householdId, orderId, tracking) {
    var _a;
    const ref = db.doc(`households/${householdId}/orders/${orderId}`);
    await ref.update({
        trackingNumber: tracking.trackingNumber,
        carrier: (_a = tracking.carrier) !== null && _a !== void 0 ? _a : 'USPS',
        status: 'shipped',
        shippedAt: new Date().toISOString(),
    });
}
//# sourceMappingURL=shipstation.js.map