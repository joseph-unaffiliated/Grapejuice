"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MARKETPLACE_RESERVATION_TTL_MS = exports.HOLIDAY_ID = exports.CATALOG_HOLIDAY = void 0;
exports.inventoryDocRef = inventoryDocRef;
exports.parseCounters = parseCounters;
exports.reserveMarketplaceInventoryInTx = reserveMarketplaceInventoryInTx;
exports.commitMarketplaceReservations = commitMarketplaceReservations;
exports.releaseMarketplaceReservations = releaseMarketplaceReservations;
exports.reservedLinesFromOrder = reservedLinesFromOrder;
exports.aggregateLineQuantities = aggregateLineQuantities;
exports.assertBoxLinesWithinInventory = assertBoxLinesWithinInventory;
exports.recomputeBoxAllocations = recomputeBoxAllocations;
exports.releaseStaleMarketplaceReservations = releaseStaleMarketplaceReservations;
/**
 * Live marketplace inventory counters under catalog/hanukkah/inventory/{itemId}.
 * Not overwritten by Airtable replace-sync.
 */
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const catalogAvailability_1 = require("./catalogAvailability");
exports.CATALOG_HOLIDAY = 'hanukkah';
exports.HOLIDAY_ID = 'hanukkah-2026';
/** Pending marketplace reservations older than this are released. */
exports.MARKETPLACE_RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;
function inventoryDocRef(db, itemId) {
    return db.doc(`catalog/${exports.CATALOG_HOLIDAY}/inventory/${itemId}`);
}
function parseCounters(data) {
    const n = (v) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    return {
        directReservedQty: n(data === null || data === void 0 ? void 0 : data.directReservedQty),
        directSoldQty: n(data === null || data === void 0 ? void 0 : data.directSoldQty),
        boxAllocatedQty: n(data === null || data === void 0 ? void 0 : data.boxAllocatedQty),
    };
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
        directSaleCapBeforeLock: typeof data.directSaleCapBeforeLock === 'number' ? data.directSaleCapBeforeLock : null,
        sellAfterLock: data.sellAfterLock === 'yes' || data.sellAfterLock === 'flag' || data.sellAfterLock === 'no'
            ? data.sellAfterLock
            : null,
    };
}
/**
 * Validate marketplace lines against availability and increment directReservedQty
 * inside an existing Firestore transaction.
 */
async function reserveMarketplaceInventoryInTx(db, tx, lines, lockAt, now = new Date()) {
    var _a, _b, _c, _d;
    const reserved = [];
    // Deterministic order avoids transaction deadlocks.
    const sorted = [...lines].sort((a, b) => a.itemId.localeCompare(b.itemId));
    for (const line of sorted) {
        const itemId = String((_a = line.itemId) !== null && _a !== void 0 ? _a : '').trim();
        const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
        if (!itemId) {
            throw new https_1.HttpsError('invalid-argument', 'Each line item needs an itemId.');
        }
        const itemRef = db.doc(`catalog/${exports.CATALOG_HOLIDAY}/items/${itemId}`);
        const invRef = inventoryDocRef(db, itemId);
        const [itemSnap, invSnap] = await Promise.all([tx.get(itemRef), tx.get(invRef)]);
        if (!itemSnap.exists) {
            throw new https_1.HttpsError('invalid-argument', `Unknown product: ${itemId}`);
        }
        const item = itemFromSnap(itemId, (_b = itemSnap.data()) !== null && _b !== void 0 ? _b : {});
        const counters = parseCounters(invSnap.data());
        const avail = (0, catalogAvailability_1.resolveAvailability)(item, counters, lockAt, now);
        if (!(0, catalogAvailability_1.availabilityAllowsDirectPurchase)(avail)) {
            throw new https_1.HttpsError('failed-precondition', (0, catalogAvailability_1.availabilityRejectMessage)((_c = item.name) !== null && _c !== void 0 ? _c : itemId, avail));
        }
        const remaining = (0, catalogAvailability_1.availabilityRemaining)(avail);
        if (remaining != null && quantity > remaining) {
            throw new https_1.HttpsError('failed-precondition', `Only ${remaining} of ${(_d = item.name) !== null && _d !== void 0 ? _d : itemId} left for direct purchase.`);
        }
        tx.set(invRef, {
            directReservedQty: firestore_1.FieldValue.increment(quantity),
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        reserved.push({ itemId, quantity });
    }
    return reserved;
}
/** Move reserved qty into sold (payment succeeded / $0 confirm). */
async function commitMarketplaceReservations(db, lines) {
    if (!lines.length)
        return;
    const batch = db.batch();
    for (const line of lines) {
        const ref = inventoryDocRef(db, line.itemId);
        batch.set(ref, {
            directReservedQty: firestore_1.FieldValue.increment(-line.quantity),
            directSoldQty: firestore_1.FieldValue.increment(line.quantity),
            updatedAt: new Date().toISOString(),
        }, { merge: true });
    }
    await batch.commit();
}
/** Release reserved qty (payment failed / canceled / stale). */
async function releaseMarketplaceReservations(db, lines) {
    if (!lines.length)
        return;
    const batch = db.batch();
    for (const line of lines) {
        const ref = inventoryDocRef(db, line.itemId);
        batch.set(ref, {
            directReservedQty: firestore_1.FieldValue.increment(-line.quantity),
            updatedAt: new Date().toISOString(),
        }, { merge: true });
    }
    await batch.commit();
}
function reservedLinesFromOrder(order) {
    const raw = order === null || order === void 0 ? void 0 : order.inventoryReservedLines;
    if (!Array.isArray(raw))
        return [];
    return raw
        .map((li) => {
        var _a;
        return ({
            itemId: String((_a = li === null || li === void 0 ? void 0 : li.itemId) !== null && _a !== void 0 ? _a : '').trim(),
            quantity: Math.max(1, Math.floor(Number(li === null || li === void 0 ? void 0 : li.quantity) || 1)),
        });
    })
        .filter((li) => li.itemId);
}
/** Aggregate quantities by itemId (skips empty ids). */
function aggregateLineQuantities(lines) {
    var _a, _b;
    const totals = new Map();
    for (const li of lines) {
        if (!li)
            continue;
        const id = String((_a = li.itemId) !== null && _a !== void 0 ? _a : '').trim();
        if (!id)
            continue;
        const q = Math.max(1, Math.floor(Number(li.quantity) || 1));
        totals.set(id, ((_b = totals.get(id)) !== null && _b !== void 0 ? _b : 0) + q);
    }
    return totals;
}
/**
 * Reject when proposed box lines would exceed Airtable inventory ceiling.
 * Items with null inventory (e.g. books) are skipped. `creditLines` are quantities
 * already counted in boxAllocatedQty for this order (pass prior lines on update).
 */
async function assertBoxLinesWithinInventory(db, proposedLines, options) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const proposed = aggregateLineQuantities(proposedLines);
    const credit = aggregateLineQuantities((_a = options === null || options === void 0 ? void 0 : options.creditLines) !== null && _a !== void 0 ? _a : []);
    const itemIds = [...proposed.keys()].sort();
    if (!itemIds.length)
        return;
    for (const itemId of itemIds) {
        const itemRef = db.doc(`catalog/${exports.CATALOG_HOLIDAY}/items/${itemId}`);
        const invRef = inventoryDocRef(db, itemId);
        const [itemSnap, invSnap] = await Promise.all([itemRef.get(), invRef.get()]);
        if (!itemSnap.exists) {
            throw new https_1.HttpsError('invalid-argument', `Unknown product: ${itemId}`);
        }
        const item = itemFromSnap(itemId, (_b = itemSnap.data()) !== null && _b !== void 0 ? _b : {});
        if ((0, catalogAvailability_1.isCatalogBookItem)(item))
            continue;
        if (item.inventory == null || !Number.isFinite(item.inventory))
            continue;
        const inventory = Math.max(0, Math.floor(item.inventory));
        const counters = parseCounters(invSnap.data());
        const direct = ((_c = counters.directReservedQty) !== null && _c !== void 0 ? _c : 0) + ((_d = counters.directSoldQty) !== null && _d !== void 0 ? _d : 0);
        const boxAllocated = (_e = counters.boxAllocatedQty) !== null && _e !== void 0 ? _e : 0;
        const credited = (_f = credit.get(itemId)) !== null && _f !== void 0 ? _f : 0;
        const want = (_g = proposed.get(itemId)) !== null && _g !== void 0 ? _g : 0;
        const available = inventory - boxAllocated - direct + credited;
        if (want > available) {
            const name = (_h = item.name) !== null && _h !== void 0 ? _h : itemId;
            const left = Math.max(0, available);
            throw new https_1.HttpsError('failed-precondition', left <= 0
                ? `${name} is out of stock for boxes.`
                : `Only ${left} of ${name} left for boxes.`);
        }
    }
}
/**
 * Recompute boxAllocatedQty from pending/committed/confirmed/shipped/delivered
 * Hanukkah box orders. Idempotent full replace. Visitor playthrough orders excluded.
 * Runs before and after lock so unpaid committed boxes reserve stock immediately.
 */
async function recomputeBoxAllocations(db, _options) {
    var _a, _b, _c, _d, _e, _f;
    const configSnap = await db.doc(`config/${exports.HOLIDAY_ID}`).get();
    const lockAt = (_b = (_a = configSnap.data()) === null || _a === void 0 ? void 0 : _a.lockAt) !== null && _b !== void 0 ? _b : null;
    const locked = Boolean(lockAt) && Date.now() >= new Date(lockAt).getTime();
    const statuses = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
    const totals = new Map();
    for (const status of statuses) {
        const snap = await db
            .collectionGroup('orders')
            .where('holidayId', '==', exports.HOLIDAY_ID)
            .where('status', '==', status)
            .get();
        for (const doc of snap.docs) {
            const order = doc.data();
            if (order.orderType === 'marketplace' || order.orderType === 'received_gift')
                continue;
            if (order.playthrough === true)
                continue;
            const lines = (_c = order.lineItems) !== null && _c !== void 0 ? _c : [];
            for (const li of lines) {
                const id = String((_d = li.itemId) !== null && _d !== void 0 ? _d : '').trim();
                if (!id)
                    continue;
                const q = Math.max(1, Math.floor(Number(li.quantity) || 1));
                totals.set(id, ((_e = totals.get(id)) !== null && _e !== void 0 ? _e : 0) + q);
            }
        }
    }
    // Also zero prior allocations for items no longer in any box (read existing inventory docs).
    const invSnap = await db.collection(`catalog/${exports.CATALOG_HOLIDAY}/inventory`).get();
    const nowIso = new Date().toISOString();
    let updated = 0;
    const allIds = new Set([...totals.keys(), ...invSnap.docs.map((d) => d.id)]);
    const ids = [...allIds];
    for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = db.batch();
        for (const id of chunk) {
            const qty = (_f = totals.get(id)) !== null && _f !== void 0 ? _f : 0;
            batch.set(inventoryDocRef(db, id), {
                boxAllocatedQty: qty,
                boxAllocatedAt: nowIso,
                updatedAt: nowIso,
            }, { merge: true });
            updated += 1;
        }
        await batch.commit();
    }
    return { itemsUpdated: updated, locked };
}
/**
 * Release reservations on pending marketplace orders older than TTL.
 */
async function releaseStaleMarketplaceReservations(db) {
    const cutoff = new Date(Date.now() - exports.MARKETPLACE_RESERVATION_TTL_MS).toISOString();
    const snap = await db
        .collectionGroup('orders')
        .where('orderType', '==', 'marketplace')
        .where('status', '==', 'pending')
        .where('inventoryReserved', '==', true)
        .get();
    let released = 0;
    for (const doc of snap.docs) {
        const order = doc.data();
        if (order.reservationReleasedAt)
            continue;
        const created = typeof order.inventoryReservedAt === 'string'
            ? order.inventoryReservedAt
            : typeof order.createdAt === 'string'
                ? order.createdAt
                : null;
        // Prefer inventoryReservedAt; fall back to createdAt ISO if present.
        // Firestore Timestamp: use toDate when available.
        let createdIso = created;
        const ts = order.createdAt;
        if (!createdIso && ts && typeof ts.toDate === 'function') {
            createdIso = ts.toDate().toISOString();
        }
        if (!createdIso || createdIso > cutoff)
            continue;
        const lines = reservedLinesFromOrder(order);
        await releaseMarketplaceReservations(db, lines);
        await doc.ref.update({
            inventoryReserved: false,
            reservationReleasedAt: new Date().toISOString(),
            status: 'cancelled',
            cancelReason: 'stale_inventory_reservation',
        });
        released += 1;
    }
    return { released };
}
//# sourceMappingURL=catalogInventory.js.map