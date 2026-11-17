"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminComplimentaryPlan = void 0;
exports.nextPersonLines = nextPersonLines;
exports.compSkipsShipStation = compSkipsShipStation;
exports.parseCompAddress = parseCompAddress;
/**
 * Plan complimentary shipments before the addresses are in. Each person holds stock as soon as an
 * item is assigned (sold direct, so Available drops). The ShipStation label is created only once
 * their address is saved. Admin only, from the Comps tab.
 */
const firestore_1 = require("firebase-admin/firestore");
const sentry_1 = require("./sentry");
const guestSessions_1 = require("./guestSessions");
const shipstation_1 = require("./shipstation");
const catalogInventory_1 = require("./catalogInventory");
const complimentaryOrders_1 = require("./complimentaryOrders");
const PEOPLE = "complimentaryPeople";
/** Replace one item's quantity. Zero drops the line. Same item is never listed twice. */
function nextPersonLines(lines, itemId, label, quantity) {
    const rest = lines.filter((l) => l.itemId !== itemId);
    if (quantity <= 0)
        return rest;
    return [...rest, { itemId, label, quantity }];
}
function linesOf(data) {
    const raw = data === null || data === void 0 ? void 0 : data.lineItems;
    if (!Array.isArray(raw))
        return [];
    return raw
        .map((r) => {
        var _a, _b, _c;
        const li = (r !== null && r !== void 0 ? r : {});
        return {
            itemId: String((_a = li.itemId) !== null && _a !== void 0 ? _a : ""),
            label: String((_c = (_b = li.label) !== null && _b !== void 0 ? _b : li.itemId) !== null && _c !== void 0 ? _c : ""),
            quantity: Math.floor(Number(li.quantity) || 0),
        };
    })
        .filter((l) => l.itemId && l.quantity > 0);
}
function addressOf(data) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const a = data === null || data === void 0 ? void 0 : data.shippingAddress;
    if (!a || typeof a.line1 !== "string")
        return null;
    return {
        name: String((_b = (_a = a.name) !== null && _a !== void 0 ? _a : data === null || data === void 0 ? void 0 : data.name) !== null && _b !== void 0 ? _b : ""),
        line1: String((_c = a.line1) !== null && _c !== void 0 ? _c : ""),
        line2: String((_d = a.line2) !== null && _d !== void 0 ? _d : ""),
        city: String((_e = a.city) !== null && _e !== void 0 ? _e : ""),
        stateProvince: String((_f = a.stateProvince) !== null && _f !== void 0 ? _f : ""),
        postalCode: String((_g = a.postalCode) !== null && _g !== void 0 ? _g : ""),
        country: String((_h = a.country) !== null && _h !== void 0 ? _h : "US"),
        email: String((_k = (_j = a.email) !== null && _j !== void 0 ? _j : data === null || data === void 0 ? void 0 : data.email) !== null && _k !== void 0 ? _k : ""),
    };
}
function viewOf(id, data) {
    var _a;
    const address = addressOf(data);
    const shipped = typeof data.shipStationExportedAt === "string";
    const failed = typeof data.shipStationError === "string" &&
        data.shipStationError &&
        !shipped;
    return {
        id,
        name: String((_a = data.name) !== null && _a !== void 0 ? _a : ""),
        lines: linesOf(data),
        address,
        orderId: typeof data.orderId === "string" ? data.orderId : null,
        label: shipped
            ? "labeled"
            : failed
                ? "label-failed"
                : address
                    ? "ready"
                    : "needs-address",
        labelDetail: shipped ? null : failed ? String(data.shipStationError) : null,
        itemsSet: data.itemsSet === true,
        handDeliver: data.handDeliver === true,
        canada: data.canada === true,
    };
}
/** Hand delivery and Canada never get a ShipStation label. A Canadian address does not either. */
function compSkipsShipStation(input) {
    return (input.handDeliver === true ||
        input.canada === true ||
        input.country === "CA");
}
/** Live copies left for every item someone already holds, straight from the stock counters. */
async function stockForLines(db, people) {
    const ids = new Set();
    for (const doc of people)
        for (const line of linesOf(doc.data()))
            ids.add(line.itemId);
    const stock = {};
    await Promise.all([...ids].map(async (itemId) => {
        var _a;
        const [itemSnap, invSnap] = await Promise.all([
            db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/items/${itemId}`).get(),
            (0, catalogInventory_1.inventoryDocRef)(db, itemId).get(),
        ]);
        if (!itemSnap.exists)
            return;
        const item = (_a = itemSnap.data()) !== null && _a !== void 0 ? _a : {};
        stock[itemId] = (0, complimentaryOrders_1.complimentaryRemaining)(typeof item.inventory === "number" ? item.inventory : null, typeof item.setAside === "number" ? item.setAside : null, (0, catalogInventory_1.parseCounters)(invSnap.data()));
    }));
    return stock;
}
async function listPeople(db) {
    const snap = await db.collection(PEOPLE).orderBy("createdAt", "asc").get();
    return {
        people: snap.docs.map((d) => viewOf(d.id, d.data())),
        stock: await stockForLines(db, snap.docs),
    };
}
function requirePerson(data) {
    if (!data)
        throw new sentry_1.HttpsError("not-found", "That person is no longer on the list.");
    if (data.shipStationExportedAt)
        throw new sentry_1.HttpsError("failed-precondition", "Their label is already in ShipStation, so this list is fixed.");
    return data;
}
/** A complete address, or an error naming the first missing part. */
function parseCompAddress(raw, fallbackName) {
    const a = (raw !== null && raw !== void 0 ? raw : {});
    const str = (k) => (typeof a[k] === "string" ? a[k].trim() : "");
    const address = {
        name: str("name") || fallbackName,
        line1: str("line1"),
        line2: str("line2"),
        city: str("city"),
        stateProvince: str("stateProvince"),
        postalCode: str("postalCode"),
        country: (str("country") || "US").toUpperCase(),
        email: str("email"),
    };
    if (!address.line1)
        throw new sentry_1.HttpsError("invalid-argument", "Street address is required.");
    if (!address.city)
        throw new sentry_1.HttpsError("invalid-argument", "City is required.");
    if (!address.stateProvince)
        throw new sentry_1.HttpsError("invalid-argument", "State is required.");
    if (!address.postalCode)
        throw new sentry_1.HttpsError("invalid-argument", "Postal code is required.");
    if (address.country !== "US" && address.country !== "CA") {
        throw new sentry_1.HttpsError("invalid-argument", "Country must be US or CA.");
    }
    if (address.email && !address.email.includes("@"))
        throw new sentry_1.HttpsError("invalid-argument", "That email does not look right.");
    return address;
}
async function setItem(db, personId, itemId, quantity) {
    if (!Number.isInteger(quantity) || quantity < 0)
        throw new sentry_1.HttpsError("invalid-argument", "Quantity has to be a whole number.");
    const personRef = db.doc(`${PEOPLE}/${personId}`);
    let remaining = null;
    await db.runTransaction(async (tx) => {
        var _a, _b, _c, _d;
        const personSnap = await tx.get(personRef);
        const person = requirePerson(personSnap.data());
        const itemSnap = await tx.get(db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/items/${itemId}`));
        const invSnap = await tx.get((0, catalogInventory_1.inventoryDocRef)(db, itemId));
        if (!itemSnap.exists)
            throw new sentry_1.HttpsError("invalid-argument", `Unknown product: ${itemId}`);
        const item = (_a = itemSnap.data()) !== null && _a !== void 0 ? _a : {};
        const label = String((_b = item.name) !== null && _b !== void 0 ? _b : itemId);
        const lines = linesOf(person);
        const old = (_d = (_c = lines.find((l) => l.itemId === itemId)) === null || _c === void 0 ? void 0 : _c.quantity) !== null && _d !== void 0 ? _d : 0;
        const delta = quantity - old;
        const left = (0, complimentaryOrders_1.complimentaryRemaining)(typeof item.inventory === "number" ? item.inventory : null, typeof item.setAside === "number" ? item.setAside : null, (0, catalogInventory_1.parseCounters)(invSnap.data()));
        if (delta > 0 && left != null && delta > left) {
            throw new sentry_1.HttpsError("failed-precondition", left <= 0
                ? `${label} is out of stock.`
                : `Only ${left} of ${label} left.`);
        }
        remaining = left == null ? null : left - delta;
        const now = new Date().toISOString();
        tx.update(personRef, {
            lineItems: nextPersonLines(lines, itemId, label, quantity),
            updatedAt: now,
        });
        if (delta !== 0) {
            tx.set((0, catalogInventory_1.inventoryDocRef)(db, itemId), { directSoldQty: firestore_1.FieldValue.increment(delta), updatedAt: now }, { merge: true });
        }
    });
    const fresh = (await personRef.get()).data();
    return { person: viewOf(personId, fresh), remaining };
}
async function shipPerson(db, personId, data) {
    var _a, _b;
    const lines = linesOf(data);
    const address = addressOf(data);
    if (!lines.length || !address)
        return viewOf(personId, data);
    const ref = db.doc(`${PEOPLE}/${personId}`);
    let orderId = typeof data.orderId === "string" ? data.orderId : "";
    if (!orderId) {
        const orderRef = db
            .collection(`households/${complimentaryOrders_1.COMPLIMENTARY_HOUSEHOLD}/orders`)
            .doc();
        orderId = orderRef.id;
        const now = new Date().toISOString();
        await db
            .doc(`households/${complimentaryOrders_1.COMPLIMENTARY_HOUSEHOLD}`)
            .set({ name: "Complimentary orders", complimentary: true, updatedAt: now }, { merge: true });
        await orderRef.set({
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
            taxCents: 0,
            totalCents: 0,
            shippingAddress: address,
            recipient: Object.assign({ name: String((_a = data.name) !== null && _a !== void 0 ? _a : address.name) }, (address.email ? { email: address.email } : {})),
            reason: `Complimentary: ${String((_b = data.name) !== null && _b !== void 0 ? _b : "")}`,
            personId,
            confirmedAt: now,
            createdAt: now,
            updatedAt: now,
        });
        await ref.update({ orderId, updatedAt: now });
    }
    const orderRef = db.doc(`households/${complimentaryOrders_1.COMPLIMENTARY_HOUSEHOLD}/orders/${orderId}`);
    if (compSkipsShipStation({
        handDeliver: data.handDeliver,
        canada: data.canada,
        country: address.country,
    })) {
        const now = new Date().toISOString();
        await ref.update({
            shipStationSkipped: data.handDeliver === true ? "hand-deliver" : "canada",
            shipStationError: firestore_1.FieldValue.delete(),
            updatedAt: now,
        });
        return viewOf(personId, (await ref.get()).data());
    }
    try {
        const exported = await (0, shipstation_1.exportOrderToShipStation)({
            orderId,
            householdId: complimentaryOrders_1.COMPLIMENTARY_HOUSEHOLD,
            shippingAddress: address,
            lineItems: lines,
            totalCents: 0,
            customerEmail: address.email || undefined,
        });
        const now = new Date().toISOString();
        if (!exported.exported)
            throw new Error("ShipStation did not create the order (keys or address).");
        await orderRef.update(Object.assign({ shipStationExportedAt: now }, (exported.externalId
            ? { shipStationOrderId: exported.externalId }
            : {})));
        await ref.update({
            shipStationExportedAt: now,
            shipStationError: firestore_1.FieldValue.delete(),
            updatedAt: now,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await ref.update({
            shipStationError: message,
            updatedAt: new Date().toISOString(),
        });
    }
    return viewOf(personId, (await ref.get()).data());
}
exports.adminComplimentaryPlan = (0, sentry_1.onCall)({ memory: "256MiB", timeoutSeconds: 120 }, async (request) => {
    var _a, _b, _c, _d;
    if (!request.auth)
        throw new sentry_1.HttpsError("unauthenticated", "Sign in required.");
    if (!(0, guestSessions_1.isAdminToken)(request.auth.token))
        throw new sentry_1.HttpsError("permission-denied", "Admin only.");
    const db = (0, firestore_1.getFirestore)();
    const body = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const action = String((_b = body.action) !== null && _b !== void 0 ? _b : "list");
    if (action === "list")
        return await listPeople(db);
    if (action === "add") {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name)
            throw new sentry_1.HttpsError("invalid-argument", "A name is required.");
        const now = new Date().toISOString();
        const ref = db.collection(PEOPLE).doc();
        await ref.set({ name, lineItems: [], createdAt: now, updatedAt: now });
        return { person: viewOf(ref.id, (await ref.get()).data()) };
    }
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId)
        throw new sentry_1.HttpsError("invalid-argument", "personId is required.");
    const personRef = db.doc(`${PEOPLE}/${personId}`);
    if (action === "setItem") {
        const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
        if (!itemId)
            throw new sentry_1.HttpsError("invalid-argument", "itemId is required.");
        return setItem(db, personId, itemId, Math.floor(Number(body.quantity)));
    }
    if (action === "remove") {
        await db.runTransaction(async (tx) => {
            var _a;
            const snap = await tx.get(personRef);
            const person = requirePerson(snap.data());
            const orderId = typeof person.orderId === "string" ? person.orderId : "";
            const orderRef = orderId
                ? db.doc(`households/${complimentaryOrders_1.COMPLIMENTARY_HOUSEHOLD}/orders/${orderId}`)
                : null;
            const orderSnap = orderRef ? await tx.get(orderRef) : null;
            if ((_a = orderSnap === null || orderSnap === void 0 ? void 0 : orderSnap.data()) === null || _a === void 0 ? void 0 : _a.shipStationExportedAt) {
                throw new sentry_1.HttpsError("failed-precondition", "Their label is already in ShipStation, so this list is fixed.");
            }
            const now = new Date().toISOString();
            for (const l of linesOf(person)) {
                tx.set((0, catalogInventory_1.inventoryDocRef)(db, l.itemId), {
                    directSoldQty: firestore_1.FieldValue.increment(-l.quantity),
                    updatedAt: now,
                }, { merge: true });
            }
            if (orderRef)
                tx.delete(orderRef);
            tx.delete(personRef);
        });
        return { removed: personId };
    }
    if (action === "setFulfillment") {
        const snap = await personRef.get();
        if (!snap.exists)
            throw new sentry_1.HttpsError("not-found", "That person is no longer on the list.");
        const update = {
            updatedAt: new Date().toISOString(),
        };
        if (typeof body.handDeliver === "boolean")
            update.handDeliver = body.handDeliver;
        if (typeof body.canada === "boolean")
            update.canada = body.canada;
        const current = (_c = snap.data()) !== null && _c !== void 0 ? _c : {};
        const saved = current.shippingAddress;
        if (body.canada === true &&
            saved &&
            typeof saved === "object" &&
            !Array.isArray(saved)) {
            update.shippingAddress = Object.assign(Object.assign({}, saved), { country: "CA" });
        }
        await personRef.update(update);
        return { person: viewOf(personId, (await personRef.get()).data()) };
    }
    if (action === "setDone") {
        const snap = await personRef.get();
        if (!snap.exists)
            throw new sentry_1.HttpsError("not-found", "That person is no longer on the list.");
        await personRef.update({
            itemsSet: body.done === true,
            updatedAt: new Date().toISOString(),
        });
        return { person: viewOf(personId, (await personRef.get()).data()) };
    }
    if (action === "address") {
        const snap = await personRef.get();
        const person = requirePerson(snap.data());
        const address = parseCompAddress(body.address, String((_d = person.name) !== null && _d !== void 0 ? _d : ""));
        const canada = typeof body.canada === "boolean" ? body.canada : person.canada === true;
        const handDeliver = typeof body.handDeliver === "boolean"
            ? body.handDeliver
            : person.handDeliver === true;
        if (canada)
            address.country = "CA";
        await personRef.update({
            shippingAddress: address,
            handDeliver,
            canada,
            email: address.email || firestore_1.FieldValue.delete(),
            updatedAt: new Date().toISOString(),
        });
        const personView = await shipPerson(db, personId, (await personRef.get()).data());
        return { person: personView };
    }
    throw new sentry_1.HttpsError("invalid-argument", `Unknown action: ${action}`);
});
//# sourceMappingURL=complimentaryPlan.js.map