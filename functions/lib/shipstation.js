"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.carrierLabelFromShipStation = carrierLabelFromShipStation;
exports.exportOrderToShipStation = exportOrderToShipStation;
exports.applyShipStationTracking = applyShipStationTracking;
exports.processShipStationShipNotify = processShipStationShipNotify;
exports.verifyShipStationWebhookSecret = verifyShipStationWebhookSecret;
const logger = require("firebase-functions/logger");
const firestore_1 = require("firebase-admin/firestore");
const email_1 = require("./email");
const SHIP_NOTIFY_TYPES = new Set(['SHIP_NOTIFY', 'ITEM_SHIP_NOTIFY', 'FULFILLMENT_SHIPPED']);
function shipStationAuthHeader() {
    var _a, _b;
    const apiKey = (_a = process.env.SHIPSTATION_API_KEY) !== null && _a !== void 0 ? _a : '';
    const apiSecret = (_b = process.env.SHIPSTATION_API_SECRET) !== null && _b !== void 0 ? _b : '';
    if (!apiKey || !apiSecret)
        return null;
    return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
}
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
/** Map ShipStation carrierCode → label used in Orders UI. */
function carrierLabelFromShipStation(code) {
    const c = (code !== null && code !== void 0 ? code : '').toLowerCase();
    if (!c)
        return 'USPS';
    if (c.includes('ups'))
        return 'UPS';
    if (c.includes('fedex'))
        return 'FedEx';
    if (c.includes('dhl'))
        return 'DHL';
    if (c.includes('usps') || c.includes('stamps') || c.includes('endicia') || c.includes('postal')) {
        return 'USPS';
    }
    return code.toUpperCase();
}
function assertSafeShipStationResourceUrl(raw) {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'ssapi.shipstation.com') {
        throw new Error(`Refusing ShipStation resource_url host: ${url.hostname}`);
    }
    return url;
}
async function writeShipStationIndex(params) {
    var _a;
    const db = (0, firestore_1.getFirestore)();
    await db.doc(`shipStationOrders/${params.orderId}`).set({
        householdId: params.householdId,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        shipStationOrderId: (_a = params.shipStationOrderId) !== null && _a !== void 0 ? _a : null,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
}
async function resolveFulfillmentSkus(lineItems) {
    const db = (0, firestore_1.getFirestore)();
    const ids = [
        ...new Set(lineItems
            .map((li) => (typeof li.itemId === 'string' ? li.itemId.trim() : ''))
            .filter(Boolean)),
    ];
    const out = new Map();
    await Promise.all(ids.map(async (id) => {
        var _a;
        try {
            const snap = await db.doc(`catalog/hanukkah/items/${id}`).get();
            const raw = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.sku;
            if (typeof raw === 'string' && raw.trim()) {
                out.set(id, raw.trim());
            }
        }
        catch (err) {
            logger.warn('ShipStation SKU lookup failed', { itemId: id, err });
        }
    }));
    return out;
}
/** ShipStation order export — no-op when keys missing. */
async function exportOrderToShipStation(order) {
    var _a;
    const auth = shipStationAuthHeader();
    if (!auth) {
        logger.info('ShipStation export skipped (keys not configured)', { orderId: order.orderId });
        return { exported: false };
    }
    const shipTo = toShipStationAddress(order.shippingAddress);
    if (!shipTo.street1 || !shipTo.city) {
        logger.warn('ShipStation export skipped (incomplete address)', { orderId: order.orderId });
        return { exported: false };
    }
    const skuByItemId = await resolveFulfillmentSkus(order.lineItems);
    const items = order.lineItems.map((li, i) => {
        var _a, _b, _c, _d, _e;
        const itemId = ((_a = li.itemId) === null || _a === void 0 ? void 0 : _a.trim()) || '';
        const sku = (itemId && skuByItemId.get(itemId)) || itemId || `pilot-${i}`;
        return {
            lineItemKey: itemId || `line-${i}`,
            sku,
            name: (_c = (_b = li.label) !== null && _b !== void 0 ? _b : itemId) !== null && _c !== void 0 ? _c : 'Hanukkah box item',
            quantity: (_d = li.quantity) !== null && _d !== void 0 ? _d : 1,
            unitPrice: (((_e = li.unitCents) !== null && _e !== void 0 ? _e : 0) / 100).toFixed(2),
        };
    });
    const orderNumber = `GJ-${order.householdId.slice(0, 6)}-${order.orderId.slice(0, 8)}`;
    const payload = {
        orderNumber,
        // Firestore order id — webhook uses this (+ shipStationOrders index / SS customerUsername).
        orderKey: order.orderId,
        orderDate: new Date().toISOString(),
        orderStatus: 'awaiting_shipment',
        customerUsername: order.householdId,
        customerEmail: String((_a = order.shippingAddress.email) !== null && _a !== void 0 ? _a : ''),
        billTo: shipTo,
        shipTo,
        items: items.length
            ? items
            : [{ sku: 'hanukkah-pilot-box', name: 'Hanukkah pilot box', quantity: 1, unitPrice: '50.00' }],
        amountPaid: (order.totalCents / 100).toFixed(2),
        shippingAmount: 0,
        advancedOptions: order.expeditedShipping ? { customField1: 'expedited' } : undefined,
    };
    const res = await fetch('https://ssapi.shipstation.com/orders/createorder', {
        method: 'POST',
        headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ShipStation ${res.status}: ${text}`);
    }
    const data = (await res.json());
    const externalId = data.orderId != null ? String(data.orderId) : undefined;
    try {
        await writeShipStationIndex({
            householdId: order.householdId,
            orderId: order.orderId,
            orderNumber,
            shipStationOrderId: externalId,
        });
    }
    catch (indexErr) {
        logger.warn('ShipStation index write failed (export still ok)', {
            orderId: order.orderId,
            indexErr,
        });
    }
    logger.info('ShipStation order created', {
        orderId: order.orderId,
        shipStationOrderId: data.orderId,
    });
    return { exported: true, externalId: externalId !== null && externalId !== void 0 ? externalId : order.orderId };
}
function trackingUrlFor(carrier, trackingNumber) {
    const encoded = encodeURIComponent(trackingNumber);
    const c = carrier.toLowerCase();
    if (c.includes('ups'))
        return `https://www.ups.com/track?tracknum=${encoded}`;
    if (c.includes('fedex'))
        return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
    if (c.includes('dhl'))
        return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encoded}`;
    if (c.includes('usps') || c.includes('postal')) {
        return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(`${trackingNumber} tracking`)}`;
}
function shippedEmailTemplate(order) {
    if (order.orderType === 'marketplace' || order.orderType === 'received_gift')
        return 'order-shipped';
    return 'box-shipped';
}
/** One email per order. Safe to call again after a webhook retry. */
async function sendShippedEmail(db, householdId, orderId) {
    var _a, _b, _c, _d, _e;
    const ref = db.doc(`households/${householdId}/orders/${orderId}`);
    const snap = await ref.get();
    const order = snap.data();
    if (!order || order.shippedEmailSentAt)
        return;
    const trackingNumber = String((_a = order.trackingNumber) !== null && _a !== void 0 ? _a : '').trim();
    if (!trackingNumber)
        return;
    const userId = typeof order.userId === 'string' ? order.userId : '';
    let to = '';
    if (userId) {
        const userSnap = await db.doc(`users/${userId}`).get();
        to = String((_c = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : '').trim();
    }
    if (!to) {
        const address = order.shippingAddress;
        to = String((_d = address === null || address === void 0 ? void 0 : address.email) !== null && _d !== void 0 ? _d : '').trim();
    }
    if (!to.includes('@')) {
        logger.warn('Shipped email skipped (no recipient)', { orderId, householdId });
        return;
    }
    const carrier = String((_e = order.carrier) !== null && _e !== void 0 ? _e : 'USPS');
    const template = shippedEmailTemplate(order);
    try {
        await (0, email_1.sendEmail)({
            to,
            template,
            data: {
                orderId,
                carrier,
                trackingNumber,
                trackingUrl: trackingUrlFor(carrier, trackingNumber),
            },
        });
        await ref.update({ shippedEmailSentAt: new Date().toISOString() });
        logger.info('Shipped email sent', { orderId, householdId, template });
    }
    catch (err) {
        logger.error('Shipped email failed', { orderId, householdId, template, err });
    }
}
/** Write tracking from ShipStation webhook or manual ops update, then email once. */
async function applyShipStationTracking(db, householdId, orderId, tracking) {
    var _a, _b, _c;
    const ref = db.doc(`households/${householdId}/orders/${orderId}`);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new Error(`Order not found: ${householdId}/${orderId}`);
    }
    const existing = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
    const unchanged = existing.trackingNumber === tracking.trackingNumber && existing.status === 'shipped';
    if (!unchanged) {
        await ref.update({
            trackingNumber: tracking.trackingNumber,
            carrier: (_b = tracking.carrier) !== null && _b !== void 0 ? _b : 'USPS',
            status: 'shipped',
            shippedAt: (_c = tracking.shippedAt) !== null && _c !== void 0 ? _c : new Date().toISOString(),
        });
    }
    await sendShippedEmail(db, householdId, orderId);
}
async function fetchShipStationOrder(shipStationOrderId) {
    const auth = shipStationAuthHeader();
    if (!auth)
        return null;
    const res = await fetch(`https://ssapi.shipstation.com/orders/${shipStationOrderId}`, {
        headers: { Authorization: auth },
    });
    if (!res.ok) {
        logger.warn('ShipStation order fetch failed', {
            shipStationOrderId,
            status: res.status,
        });
        return null;
    }
    return (await res.json());
}
async function resolveHouseholdForShipment(db, shipment) {
    var _a, _b, _c, _d, _e;
    const orderId = String((_a = shipment.orderKey) !== null && _a !== void 0 ? _a : '').trim();
    if (!orderId)
        return null;
    const indexSnap = await db.doc(`shipStationOrders/${orderId}`).get();
    if (indexSnap.exists) {
        const householdId = String((_c = (_b = indexSnap.data()) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '').trim();
        if (householdId)
            return { householdId, orderId };
    }
    // Orders exported before the index existed: SS still has customerUsername = householdId.
    if (shipment.orderId != null) {
        const ssOrder = await fetchShipStationOrder(shipment.orderId);
        const householdId = String((_d = ssOrder === null || ssOrder === void 0 ? void 0 : ssOrder.customerUsername) !== null && _d !== void 0 ? _d : '').trim();
        if (householdId) {
            try {
                await writeShipStationIndex({
                    householdId,
                    orderId,
                    orderNumber: String((_e = shipment.orderNumber) !== null && _e !== void 0 ? _e : ''),
                    shipStationOrderId: String(shipment.orderId),
                });
            }
            catch (_f) {
                /* non-fatal */
            }
            return { householdId, orderId };
        }
    }
    return null;
}
/** Mark as Shipped has no orderKey. orderKey and householdId live on the ShipStation order. */
async function resolveHouseholdForFulfillment(db, fulfillment) {
    var _a, _b, _c;
    if (fulfillment.orderId == null)
        return null;
    const ssOrder = await fetchShipStationOrder(fulfillment.orderId);
    const orderId = String((_a = ssOrder === null || ssOrder === void 0 ? void 0 : ssOrder.orderKey) !== null && _a !== void 0 ? _a : '').trim();
    const householdId = String((_b = ssOrder === null || ssOrder === void 0 ? void 0 : ssOrder.customerUsername) !== null && _b !== void 0 ? _b : '').trim();
    if (!orderId || !householdId)
        return null;
    try {
        await writeShipStationIndex({
            householdId,
            orderId,
            orderNumber: String((_c = fulfillment.orderNumber) !== null && _c !== void 0 ? _c : ''),
            shipStationOrderId: String(fulfillment.orderId),
        });
    }
    catch (_d) {
        /* non-fatal */
    }
    return { householdId, orderId };
}
/**
 * Process ShipStation SHIP_NOTIFY / ITEM_SHIP_NOTIFY / FULFILLMENT_SHIPPED.
 * Payload is only `{ resource_url, resource_type }` — we GET that URL next.
 * A label is a shipment. Manual Mark as Shipped is a fulfillment (FULFILLMENT_SHIPPED).
 *
 *
 * Dev/ops bypass (requires webhook secret on the URL):
 * `{ "simulate": true, "orderKey": "<firestoreOrderId>", "trackingNumber": "...", "carrierCode": "ups", "householdId": "..." }`
 * `householdId` optional when `shipStationOrders/{orderKey}` index exists (or SS order lookup works).
 */
async function processShipStationShipNotify(db, body) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (body.simulate === true) {
        const orderId = String((_b = (_a = body.orderKey) !== null && _a !== void 0 ? _a : body.orderId) !== null && _b !== void 0 ? _b : '').trim();
        const trackingNumber = String((_c = body.trackingNumber) !== null && _c !== void 0 ? _c : '').trim();
        if (!orderId || !trackingNumber) {
            throw new Error('simulate requires orderKey (Firestore order id) and trackingNumber');
        }
        let householdId = String((_d = body.householdId) !== null && _d !== void 0 ? _d : '').trim();
        if (!householdId) {
            const resolved = await resolveHouseholdForShipment(db, { orderKey: orderId });
            householdId = (_e = resolved === null || resolved === void 0 ? void 0 : resolved.householdId) !== null && _e !== void 0 ? _e : '';
        }
        if (!householdId) {
            throw new Error('simulate: householdId required (or export index shipStationOrders/{orderKey} must exist)');
        }
        await applyShipStationTracking(db, householdId, orderId, {
            trackingNumber,
            carrier: carrierLabelFromShipStation((_f = body.carrierCode) !== null && _f !== void 0 ? _f : 'usps'),
        });
        logger.info('ShipStation tracking simulated', { orderId, householdId, trackingNumber });
        return { processed: 1, skipped: 0, simulated: true };
    }
    const resourceType = String((_g = body.resource_type) !== null && _g !== void 0 ? _g : '');
    if (!SHIP_NOTIFY_TYPES.has(resourceType)) {
        logger.info('ShipStation webhook ignored (unsupported type)', { resourceType });
        return { processed: 0, skipped: 0 };
    }
    const rawUrl = String((_h = body.resource_url) !== null && _h !== void 0 ? _h : '').trim();
    if (!rawUrl) {
        throw new Error('Missing resource_url');
    }
    const resourceUrl = assertSafeShipStationResourceUrl(rawUrl);
    const auth = shipStationAuthHeader();
    if (!auth) {
        throw new Error('ShipStation API keys not configured');
    }
    const res = await fetch(resourceUrl.toString(), {
        headers: { Authorization: auth },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ShipStation shipments fetch ${res.status}: ${text}`);
    }
    const data = (await res.json());
    const shipments = Array.isArray(data.shipments) ? data.shipments : [];
    const fulfillments = Array.isArray(data.fulfillments) ? data.fulfillments : [];
    let processed = 0;
    let skipped = 0;
    for (const shipment of shipments) {
        const outcome = await applyTrackingEvent(db, shipment, 'shipment');
        if (outcome === 'processed')
            processed += 1;
        else
            skipped += 1;
    }
    for (const fulfillment of fulfillments) {
        const outcome = await applyTrackingEvent(db, fulfillment, 'fulfillment');
        if (outcome === 'processed')
            processed += 1;
        else
            skipped += 1;
    }
    if (shipments.length === 0 && fulfillments.length === 0) {
        logger.info('ShipStation webhook had no shipments or fulfillments', {
            resourceType,
            resourceUrl: resourceUrl.toString(),
        });
    }
    return { processed, skipped };
}
async function applyTrackingEvent(db, event, kind) {
    var _a, _b;
    if (event.voided)
        return 'skipped';
    const trackingNumber = String((_a = event.trackingNumber) !== null && _a !== void 0 ? _a : '').trim();
    if (!trackingNumber)
        return 'skipped';
    const resolved = kind === 'shipment' && 'orderKey' in event && String((_b = event.orderKey) !== null && _b !== void 0 ? _b : '').trim()
        ? await resolveHouseholdForShipment(db, event)
        : await resolveHouseholdForFulfillment(db, event);
    if (!resolved) {
        logger.warn('ShipStation tracking: could not resolve Grapejuice order', {
            kind,
            orderKey: 'orderKey' in event ? event.orderKey : undefined,
            orderNumber: event.orderNumber,
            shipStationOrderId: event.orderId,
        });
        return 'skipped';
    }
    try {
        await applyShipStationTracking(db, resolved.householdId, resolved.orderId, {
            trackingNumber,
            carrier: carrierLabelFromShipStation(event.carrierCode),
            shippedAt: event.shipDate ? new Date(event.shipDate).toISOString() : new Date().toISOString(),
        });
        logger.info('ShipStation tracking applied', {
            kind,
            orderId: resolved.orderId,
            householdId: resolved.householdId,
            trackingNumber,
        });
        return 'processed';
    }
    catch (err) {
        logger.error('ShipStation tracking apply failed', {
            kind,
            orderId: resolved.orderId,
            householdId: resolved.householdId,
            err,
        });
        return 'skipped';
    }
}
/** True when request carries the shared webhook secret (if configured). */
function verifyShipStationWebhookSecret(req) {
    var _a, _b, _c, _d, _e, _f, _g;
    const expected = ((_a = process.env.SHIPSTATION_WEBHOOK_SECRET) !== null && _a !== void 0 ? _a : '').trim();
    if (!expected) {
        logger.warn('SHIPSTATION_WEBHOOK_SECRET unset — accepting webhook without shared secret');
        return true;
    }
    const q = (_b = req.query) !== null && _b !== void 0 ? _b : {};
    const h = (_c = req.headers) !== null && _c !== void 0 ? _c : {};
    const provided = String((_g = (_f = (_e = (_d = q.key) !== null && _d !== void 0 ? _d : q.secret) !== null && _e !== void 0 ? _e : h['x-gj-shipstation-secret']) !== null && _f !== void 0 ? _f : h['x-shipstation-secret']) !== null && _g !== void 0 ? _g : '').trim();
    return provided.length > 0 && provided === expected;
}
//# sourceMappingURL=shipstation.js.map