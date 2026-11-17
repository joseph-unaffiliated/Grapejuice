"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processComplimentaryOrder = exports.COMPLIMENTARY_HOUSEHOLD = void 0;
exports.complimentaryRemaining = complimentaryRemaining;
exports.validateComplimentaryRequest = validateComplimentaryRequest;
exports.placeComplimentaryOrder = placeComplimentaryOrder;
/**
 * Free shipments to partners, friends and supporters. Each is a `complimentary` order under one
 * household, so its stock counts as sold direct (the same counter the shop uses) and it gets a
 * ShipStation order for the label. Nothing is charged and no customer email goes out.
 *
 * Ops request one by writing `complimentaryOrders/{id}` (server-only; see scripts/complimentary-order.mjs):
 *   { recipient: { name, email? }, shippingAddress: { name, line1, line2?, city, stateProvince, postalCode, country? },
 *     lineItems: [{ itemId, quantity }], reason, dryRun? }
 * `dryRun` only checks stock and returns what would be placed. Otherwise the order is written and
 * stock is taken in the same transaction, so two requests can't both take the last copy.
 */
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const shipstation_1 = require("./shipstation");
const catalogInventory_1 = require("./catalogInventory");
exports.COMPLIMENTARY_HOUSEHOLD = "complimentary";
/** Copies a comp can still take: on hand minus set aside, boxes, shop holds and sales. null = untracked. */
function complimentaryRemaining(inventory, setAside, counters) {
    if (typeof inventory !== "number" || !Number.isFinite(inventory))
        return null;
    const n = (v) => typeof v === "number" && Number.isFinite(v)
        ? Math.max(0, Math.floor(v))
        : 0;
    return Math.max(0, Math.floor(inventory) -
        n(setAside) -
        n(counters.boxAllocatedQty) -
        n(counters.directReservedQty) -
        n(counters.directSoldQty));
}
const REQUIRED_ADDRESS = [
    "line1",
    "city",
    "stateProvince",
    "postalCode",
];
/** Throws on anything that would make a shipment fail or ship to the wrong place. */
function validateComplimentaryRequest(raw) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const r = (raw !== null && raw !== void 0 ? raw : {});
    const recipientRaw = ((_a = r.recipient) !== null && _a !== void 0 ? _a : {});
    const name = String((_b = recipientRaw.name) !== null && _b !== void 0 ? _b : "").trim();
    if (!name)
        throw new Error("recipient.name is required");
    const email = String((_c = recipientRaw.email) !== null && _c !== void 0 ? _c : "").trim();
    if (email && !email.includes("@"))
        throw new Error("recipient.email does not look like an email");
    const addr = ((_d = r.shippingAddress) !== null && _d !== void 0 ? _d : {});
    const shippingAddress = {};
    for (const [k, v] of Object.entries(addr))
        if (typeof v === "string" && v.trim())
            shippingAddress[k] = v.trim();
    shippingAddress.name = shippingAddress.name || name;
    shippingAddress.country = (shippingAddress.country || "US").toUpperCase();
    if (shippingAddress.country !== "US" && shippingAddress.country !== "CA") {
        throw new Error("shippingAddress.country must be US or CA");
    }
    for (const key of REQUIRED_ADDRESS) {
        if (!shippingAddress[key])
            throw new Error(`shippingAddress.${key} is required`);
    }
    if (email)
        shippingAddress.email = email;
    if (!Array.isArray(r.lineItems) || !r.lineItems.length)
        throw new Error("lineItems must be a non-empty array");
    const byItem = new Map();
    for (const li of r.lineItems) {
        const itemId = String((_e = li === null || li === void 0 ? void 0 : li.itemId) !== null && _e !== void 0 ? _e : "").trim();
        const quantity = Number((_f = li === null || li === void 0 ? void 0 : li.quantity) !== null && _f !== void 0 ? _f : 1);
        if (!itemId)
            throw new Error("every line needs an itemId");
        if (!Number.isInteger(quantity) || quantity < 1)
            throw new Error(`${itemId} needs a whole quantity of 1 or more`);
        byItem.set(itemId, ((_g = byItem.get(itemId)) !== null && _g !== void 0 ? _g : 0) + quantity);
    }
    const reason = String((_h = r.reason) !== null && _h !== void 0 ? _h : "").trim();
    if (!reason)
        throw new Error("reason is required (who this is for and why)");
    return {
        recipient: Object.assign({ name }, (email ? { email } : {})),
        shippingAddress,
        lineItems: [...byItem.entries()].map(([itemId, quantity]) => ({
            itemId,
            quantity,
        })),
        reason,
        dryRun: r.dryRun === true,
    };
}
/**
 * Reads stock and, unless `dryRun`, writes the order and takes the stock in one transaction.
 * Returns the lines with what was left before the order.
 */
async function placeComplimentaryOrder(db, request, requestId) {
    const orderRef = db
        .collection(`households/${exports.COMPLIMENTARY_HOUSEHOLD}/orders`)
        .doc();
    const problems = [];
    const lines = [];
    await db.runTransaction(async (tx) => {
        // Firestore transactions reject reads after writes, so read everything before writing.
        const reads = await Promise.all(request.lineItems.map(async ({ itemId }) => ({
            item: await tx.get(db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/items/${itemId}`)),
            inv: await tx.get((0, catalogInventory_1.inventoryDocRef)(db, itemId)),
        })));
        lines.length = 0;
        problems.length = 0;
        request.lineItems.forEach(({ itemId, quantity }, i) => {
            var _a, _b;
            const { item, inv } = reads[i];
            if (!item.exists) {
                problems.push(`Unknown product: ${itemId}`);
                return;
            }
            const data = (_a = item.data()) !== null && _a !== void 0 ? _a : {};
            const name = String((_b = data.name) !== null && _b !== void 0 ? _b : itemId);
            const remaining = complimentaryRemaining(typeof data.inventory === "number" ? data.inventory : null, typeof data.setAside === "number" ? data.setAside : null, (0, catalogInventory_1.parseCounters)(inv.data()));
            lines.push({ itemId, label: name, quantity, remaining });
            if (remaining != null && quantity > remaining) {
                problems.push(remaining <= 0
                    ? `${name} is out of stock`
                    : `Only ${remaining} of ${name} left (asked for ${quantity})`);
            }
        });
        if (problems.length || request.dryRun)
            return;
        const now = new Date().toISOString();
        tx.set(db.doc(`households/${exports.COMPLIMENTARY_HOUSEHOLD}`), { name: "Complimentary orders", complimentary: true, updatedAt: now }, { merge: true });
        tx.set(orderRef, {
            status: "confirmed",
            orderType: "complimentary",
            lineItems: lines.map((l, i) => ({
                slotId: `comp-${i + 1}`,
                itemId: l.itemId,
                label: l.label,
                quantity: l.quantity,
                unitCents: 0,
                includedQty: 0,
            })),
            subtotalCents: 0,
            shippingCents: 0,
            discountCents: 0,
            taxCents: 0,
            totalCents: 0,
            shippingAddress: request.shippingAddress,
            recipient: request.recipient,
            reason: request.reason,
            requestId,
            inventoryCommittedAt: now,
            confirmedAt: now,
            createdAt: now,
            updatedAt: now,
        });
        for (const l of lines) {
            tx.set((0, catalogInventory_1.inventoryDocRef)(db, l.itemId), { directSoldQty: firestore_2.FieldValue.increment(l.quantity), updatedAt: now }, { merge: true });
        }
    });
    if (request.dryRun || problems.length)
        return { orderId: null, lines, problems };
    return { orderId: orderRef.id, lines, problems };
}
exports.processComplimentaryOrder = (0, firestore_1.onDocumentCreated)({
    document: "complimentaryOrders/{requestId}",
    memory: "256MiB",
    timeoutSeconds: 120,
}, (0, sentry_1.withSentry)(async (event) => {
    var _a, _b;
    const snap = event.data;
    if (!snap)
        return;
    const db = (0, firestore_2.getFirestore)();
    const ref = snap.ref;
    const claimed = await db.runTransaction(async (tx) => {
        var _a;
        const fresh = await tx.get(ref);
        if (((_a = fresh.data()) === null || _a === void 0 ? void 0 : _a.status) !== "requested")
            return null;
        tx.update(ref, {
            status: "processing",
            startedAt: new Date().toISOString(),
        });
        return fresh.data();
    });
    if (!claimed)
        return;
    let outcome;
    try {
        const request = validateComplimentaryRequest(claimed);
        const placed = await placeComplimentaryOrder(db, request, event.params.requestId);
        if (placed.problems.length) {
            outcome = {
                status: "rejected",
                problems: placed.problems,
                lines: placed.lines,
            };
        }
        else if (request.dryRun) {
            outcome = { status: "previewed", lines: placed.lines };
        }
        else {
            const orderRef = db.doc(`households/${exports.COMPLIMENTARY_HOUSEHOLD}/orders/${placed.orderId}`);
            const order = (_a = (await orderRef.get()).data()) !== null && _a !== void 0 ? _a : {};
            let shipStation;
            try {
                const exported = await (0, shipstation_1.exportOrderToShipStation)({
                    orderId: placed.orderId,
                    householdId: exports.COMPLIMENTARY_HOUSEHOLD,
                    shippingAddress: request.shippingAddress,
                    lineItems: (_b = order.lineItems) !== null && _b !== void 0 ? _b : [],
                    totalCents: 0,
                    customerEmail: request.recipient.email,
                });
                if (exported.exported) {
                    await orderRef.update(Object.assign({ shipStationExportedAt: new Date().toISOString() }, (exported.externalId
                        ? { shipStationOrderId: exported.externalId }
                        : {})));
                    shipStation = "created";
                }
                else {
                    shipStation = "not created (ShipStation keys or address missing)";
                }
            }
            catch (err) {
                logger.error("complimentary: ShipStation export failed", {
                    orderId: placed.orderId,
                    err,
                });
                shipStation = `failed: ${err instanceof Error ? err.message : String(err)}`;
            }
            try {
                await (0, catalogInventory_1.recomputeBoxAllocations)(db);
            }
            catch (err) {
                logger.error("complimentary: recomputeBoxAllocations failed", {
                    orderId: placed.orderId,
                    err,
                });
            }
            outcome = {
                status: "placed",
                orderId: placed.orderId,
                lines: placed.lines,
                shipStation,
            };
        }
    }
    catch (err) {
        outcome = {
            status: "failed",
            reason: err instanceof Error ? err.message : String(err),
        };
    }
    logger.info("processComplimentaryOrder", {
        requestId: event.params.requestId,
        status: outcome.status,
    });
    await ref.update(Object.assign(Object.assign({}, outcome), { processedAt: new Date().toISOString() }));
}));
//# sourceMappingURL=complimentaryOrders.js.map