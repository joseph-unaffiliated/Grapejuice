"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportOrderToShipStation = exportOrderToShipStation;
exports.applyShipStationTracking = applyShipStationTracking;
const logger = require("firebase-functions/logger");
/** ShipStation order export — stub until ops provides API keys. */
async function exportOrderToShipStation(order) {
    var _a, _b;
    const apiKey = (_a = process.env.SHIPSTATION_API_KEY) !== null && _a !== void 0 ? _a : '';
    const apiSecret = (_b = process.env.SHIPSTATION_API_SECRET) !== null && _b !== void 0 ? _b : '';
    if (!apiKey || !apiSecret) {
        logger.info('ShipStation export skipped (keys not configured)', { orderId: order.orderId });
        return { exported: false };
    }
    // TODO: POST to ShipStation /orders/createorder with pilot SKU mapping.
    logger.info('ShipStation export stub', { orderId: order.orderId, expedited: order.expeditedShipping });
    return { exported: true, externalId: `ss-stub-${order.orderId}` };
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