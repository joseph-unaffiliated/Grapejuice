"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LARGE_BOX_UNITS = exports.LARGE_BOX_ITEM_INCHES = exports.PACKING_SIZES = void 0;
exports.maxDimensionInches = maxDimensionInches;
exports.recommendedSizeFor = recommendedSizeFor;
exports.mayNeedLargeBox = mayNeedLargeBox;
exports.buildAdminPackingList = buildAdminPackingList;
exports.createAdminPacking = createAdminPacking;
const firestore_1 = require("firebase-admin/firestore");
const sentry_1 = require("./sentry");
const guestSessions_1 = require("./guestSessions");
const testAccounts_1 = require("./testAccounts");
const boxHistoryDiff_1 = require("./boxHistoryDiff");
const adminDashboard_1 = require("./adminDashboard");
const shopOrders_1 = require("./shopOrders");
/**
 * Packing list for the warehouse: paid Hanukkah boxes, paid storefront (shop) orders and paid gift
 * boxes that have a ship-to address. Each package gets a box size and each line gets a shared
 * "packed" checkbox. Size and packed state live in `packingPackages/{packageId}` (admin SDK only).
 *
 * Box orders are only "paid" once charged at lock (status confirmed or later), so they appear after lock.
 */
const HOLIDAY_ID = 'hanukkah-2026';
const PAID_BOX_STATUSES = ['confirmed', 'shipped', 'delivered'];
const PACKING_COLLECTION = 'packingPackages';
const PACKAGE_ID = /^(box|shop|gift)_[A-Za-z0-9_-]{1,200}$/;
/** Box sizes in inches. Default for box orders and gifts is 14×14×6; 10×8×6 is for shop orders only; 14×14×12 is picked by hand when flagged. */
exports.PACKING_SIZES = {
    '14x14x6': { label: '14 × 14 × 6 in' },
    '14x14x12': { label: '14 × 14 × 12 in' },
    '10x8x6': { label: '10 × 8 × 6 in' },
};
const PACKING_SIZE_KEYS = Object.keys(exports.PACKING_SIZES);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length > 0) : [];
function iso(v) {
    if (!v)
        return null;
    if (typeof v === 'string')
        return v;
    if (typeof v.toDate === 'function')
        return v.toDate().toISOString();
    return null;
}
function score(v) {
    const n = num(v);
    return n == null ? null : Math.round(Math.max(0, Math.min(100, n)));
}
/** Largest of the first three numbers before any parenthetical: '6.3" h × 5.1" w × 1.4" d' → 6.3. */
function maxDimensionInches(raw) {
    if (!raw)
        return null;
    const main = raw.split('(')[0];
    const nums = [...main.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).slice(0, 3);
    return nums.length ? Math.max(...nums) : null;
}
function addressOf(raw) {
    var _a, _b, _c;
    if (!isRecord(raw))
        return null;
    const line1 = str(raw.line1);
    if (!line1)
        return null;
    return {
        name: str(raw.name),
        line1,
        line2: str(raw.line2),
        city: (_a = str(raw.city)) !== null && _a !== void 0 ? _a : '',
        stateProvince: (_b = str(raw.stateProvince)) !== null && _b !== void 0 ? _b : '',
        postalCode: (_c = str(raw.postalCode)) !== null && _c !== void 0 ? _c : '',
        country: str(raw.country),
    };
}
/** Recommended box: shop orders use 10×8×6; boxes and gifts use 14×14×6. Packers pick a bigger box from the flag. */
function recommendedSizeFor(kind) {
    return kind === 'shop' ? '10x8x6' : '14x14x6';
}
/** An item longer than this (inches, largest dimension) can't fit a 10×8×6 or 14×14×6 box lying flat. */
exports.LARGE_BOX_ITEM_INCHES = 12;
/**
 * Total units in a package that count as "a lot of stuff": the 90th percentile of saved default
 * Hanukkah boxes (median 14, p75 16, p90 18). Above this, the package may need a larger box.
 */
exports.LARGE_BOX_UNITS = 18;
/** Flag for the packer: an item is too long for the box, or the package holds a lot of units. */
function mayNeedLargeBox(lines) {
    const units = lines.reduce((sum, l) => sum + l.qty, 0);
    return units > exports.LARGE_BOX_UNITS || lines.some((l) => { var _a; return ((_a = l.maxInches) !== null && _a !== void 0 ? _a : 0) > exports.LARGE_BOX_ITEM_INCHES; });
}
function buildLines(args) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const seen = new Map();
    const out = [];
    for (const raw of Array.isArray(args.raw) ? args.raw : []) {
        if (!raw || typeof raw !== 'object')
            continue;
        const li = raw;
        const qty = Math.max(0, Math.floor(Number(li.quantity) || 0));
        if (qty <= 0)
            continue;
        const itemId = str(li.itemId);
        const childId = str(li.childId);
        const meta = itemId ? args.items.get(itemId) : undefined;
        const base = `${(_a = itemId !== null && itemId !== void 0 ? itemId : str(li.label)) !== null && _a !== void 0 ? _a : '?'}|${childId !== null && childId !== void 0 ? childId : 'household'}`;
        const n = (_b = seen.get(base)) !== null && _b !== void 0 ? _b : 0;
        seen.set(base, n + 1);
        out.push({
            key: `${base}|${n}`,
            itemId,
            name: (_e = (_d = (_c = meta === null || meta === void 0 ? void 0 : meta.name) !== null && _c !== void 0 ? _c : str(li.label)) !== null && _d !== void 0 ? _d : itemId) !== null && _e !== void 0 ? _e : '?',
            qty,
            child: childId ? (_f = args.childName(childId)) !== null && _f !== void 0 ? _f : 'Child' : null,
            forHousehold: !childId,
            origin: (0, adminDashboard_1.lineOriginVsDefault)(li, args.defaults),
            wrap: Boolean(itemId && args.wrap.has(itemId)),
            dimensions: (_g = meta === null || meta === void 0 ? void 0 : meta.dimensions) !== null && _g !== void 0 ? _g : null,
            maxInches: (_h = meta === null || meta === void 0 ? void 0 : meta.maxInches) !== null && _h !== void 0 ? _h : null,
            packed: false,
        });
    }
    return out;
}
const emptySliders = { hanukkah: null, jewish: null };
async function getAllSafe(db, refs) {
    return refs.length ? db.getAll(...refs) : [];
}
async function buildAdminPackingList(db, nowMs = Date.now()) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16;
    const [ordersSnap, invitesSnap, receivedSnap, itemsSnap, childrenSnap] = await Promise.all([
        db.collectionGroup('orders').get(),
        db.collection('giftInvites').get(),
        db.collectionGroup('receivedGifts').get(),
        db.collection('catalog/hanukkah/items').get(),
        db.collectionGroup('children').get(),
    ]);
    const items = new Map();
    for (const d of itemsSnap.docs) {
        const x = d.data();
        const dimensions = str(x.dimensions);
        items.set(d.id, { name: (_a = str(x.name)) !== null && _a !== void 0 ? _a : d.id, dimensions, maxInches: maxDimensionInches(dimensions) });
    }
    const childInfoById = new Map();
    const childrenByOwner = new Map();
    for (const d of childrenSnap.docs) {
        const owner = d.ref.parent.parent;
        if (!owner || owner.parent.id !== 'users')
            continue;
        const x = d.data();
        const age = typeof x.plannerAge === 'number' && Number.isFinite(x.plannerAge)
            ? String(Math.max(0, Math.floor(x.plannerAge)))
            : str(x.ageGroup);
        const info = { name: str(x.name), age };
        childInfoById.set(d.id, info);
        const list = (_b = childrenByOwner.get(owner.id)) !== null && _b !== void 0 ? _b : [];
        list.push(info);
        childrenByOwner.set(owner.id, list);
    }
    // Gift recipients' copies of the gift (customised after claim) and any live checkout order for it.
    const receivedByKey = new Map();
    for (const d of receivedSnap.docs) {
        const hh = d.ref.parent.parent;
        if (hh && hh.parent.id === 'households')
            receivedByKey.set(`${hh.id}/${d.id}`, d.data());
    }
    const boxRows = [];
    const shopRows = [];
    const liveGiftOrderByInvite = new Map();
    for (const d of ordersSnap.docs) {
        const o = d.data();
        const hid = (_d = (_c = d.ref.parent.parent) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : '';
        if (!hid || o.playthrough === true)
            continue;
        if (o.orderType === 'received_gift') {
            const inviteId = str(o.giftInviteId);
            if (inviteId && o.holidayId === HOLIDAY_ID && PAID_BOX_STATUSES.includes(String(o.status))) {
                liveGiftOrderByInvite.set(inviteId, o);
            }
            continue;
        }
        if (o.orderType === 'marketplace') {
            // Paid, not cancelled or fully refunded (a cancelled order with a confirmed date still shows as paid elsewhere).
            const state = (0, shopOrders_1.shopOrderState)(o);
            if (state.paid && state.status !== 'refunded' && state.status !== 'cancelled')
                shopRows.push({ hid, id: d.id, o });
            continue;
        }
        const isBox = o.orderType === 'hanukkah_box' || (!o.orderType && o.holidayId === HOLIDAY_ID);
        if (isBox && o.holidayId === HOLIDAY_ID && PAID_BOX_STATUSES.includes(String(o.status))) {
            boxRows.push({ hid, id: d.id, o });
        }
    }
    // Per-household reads for the paid boxes: household (owner fallback), draft (wrap fallback), default build.
    const boxHids = [...new Set(boxRows.map((r) => r.hid))];
    const [hhSnaps, draftSnaps, histSnaps] = await Promise.all([
        getAllSafe(db, boxHids.map((hid) => db.doc(`households/${hid}`))),
        getAllSafe(db, boxHids.map((hid) => db.doc(`households/${hid}/boxDrafts/${HOLIDAY_ID}`))),
        getAllSafe(db, boxHids.map((hid) => db.doc(`households/${hid}/boxDrafts/${HOLIDAY_ID}/history/default`))),
    ]);
    const householdById = new Map(hhSnaps.map((s) => { var _a; return [s.id, (_a = s.data()) !== null && _a !== void 0 ? _a : {}]; }));
    const draftByHid = new Map(boxHids.map((hid, i) => { var _a, _b; return [hid, (_b = (_a = draftSnaps[i]) === null || _a === void 0 ? void 0 : _a.data()) !== null && _b !== void 0 ? _b : {}]; }));
    const defaultsByHid = new Map(boxHids.map((hid, i) => {
        var _a, _b;
        const def = (_b = (_a = histSnaps[i]) === null || _a === void 0 ? void 0 : _a.data()) === null || _b === void 0 ? void 0 : _b.box;
        const lines = (0, boxHistoryDiff_1.historyLines)(isRecord(def) ? def.lineItems : null);
        return [hid, lines.length ? lines : null];
    }));
    // Users: box owners and shop buyers, for email, name, slider answers and the Rav note.
    const userIds = new Set();
    for (const r of boxRows) {
        const uid = (_e = str(r.o.userId)) !== null && _e !== void 0 ? _e : str((_f = householdById.get(r.hid)) === null || _f === void 0 ? void 0 : _f.ownerId);
        if (uid)
            userIds.add(uid);
    }
    for (const r of shopRows) {
        const uid = str(r.o.userId);
        if (uid)
            userIds.add(uid);
    }
    const userSnaps = await getAllSafe(db, [...userIds].map((uid) => db.doc(`users/${uid}`)));
    const usersById = new Map();
    for (const s of userSnaps) {
        const x = (_g = s.data()) !== null && _g !== void 0 ? _g : {};
        usersById.set(s.id, {
            email: str(x.email),
            name: (_j = (_h = str(x.displayName)) === null || _h === void 0 ? void 0 : _h.split(/\s+/)[0]) !== null && _j !== void 0 ? _j : null,
            last: isRecord(x.lastBoxAnswers) ? x.lastBoxAnswers : {},
        });
    }
    const packages = [];
    for (const r of boxRows) {
        const hh = (_k = householdById.get(r.hid)) !== null && _k !== void 0 ? _k : {};
        const uid = (_l = str(r.o.userId)) !== null && _l !== void 0 ? _l : str(hh.ownerId);
        const user = uid ? usersById.get(uid) : undefined;
        const last = (_m = user === null || user === void 0 ? void 0 : user.last) !== null && _m !== void 0 ? _m : {};
        const wrap = new Set(strList((_o = r.o.wrapSelectedItemIds) !== null && _o !== void 0 ? _o : (_p = draftByHid.get(r.hid)) === null || _p === void 0 ? void 0 : _p.wrapSelectedItemIds));
        const kids = uid ? (_q = childrenByOwner.get(uid)) !== null && _q !== void 0 ? _q : [] : [];
        const shipping = addressOf(r.o.shippingAddress);
        const lines = buildLines({
            raw: r.o.lineItems,
            items,
            childName: (id) => { var _a, _b; return (_b = (_a = childInfoById.get(id)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : null; },
            defaults: (_r = defaultsByHid.get(r.hid)) !== null && _r !== void 0 ? _r : null,
            wrap,
        });
        packages.push({
            id: `box_${r.hid}_${r.id}`,
            kind: 'box',
            status: (_s = str(r.o.status)) !== null && _s !== void 0 ? _s : 'unknown',
            reference: `Order ${r.id.slice(0, 8).toUpperCase()}`,
            recipient: (_u = (_t = shipping === null || shipping === void 0 ? void 0 : shipping.name) !== null && _t !== void 0 ? _t : user === null || user === void 0 ? void 0 : user.name) !== null && _u !== void 0 ? _u : null,
            email: (_w = (_v = str(r.o.guestEmail)) !== null && _v !== void 0 ? _v : user === null || user === void 0 ? void 0 : user.email) !== null && _w !== void 0 ? _w : null,
            test: (0, testAccounts_1.isTest)((_x = str(r.o.guestEmail)) !== null && _x !== void 0 ? _x : user === null || user === void 0 ? void 0 : user.email, user === null || user === void 0 ? void 0 : user.name, shipping === null || shipping === void 0 ? void 0 : shipping.name),
            paidAt: (_z = (_y = iso(r.o.confirmedAt)) !== null && _y !== void 0 ? _y : iso(r.o.committedAt)) !== null && _z !== void 0 ? _z : iso(r.o.createdAt),
            destination: shipping,
            kids: kids.map((k) => ({ name: k.name, age: k.age })),
            sliders: {
                hanukkah: score(last.familiarityScore),
                jewish: score(last.practiceFrequencyScore),
            },
            note: (_0 = str(last.ravNotes)) !== null && _0 !== void 0 ? _0 : null,
            recommendedSize: '14x14x6',
            lines,
        });
    }
    for (const d of invitesSnap.docs) {
        const g = d.data();
        const isBox = g.kind === 'box' || g.kind === 'credit' ? g.kind === 'box' : Array.isArray(g.lineItems) && g.lineItems.length > 0;
        if (!isBox || g.playthrough === true || g.status === 'converted_to_credit')
            continue;
        const paid = g.paymentStatus === 'paid' || (g.paymentStatus == null && Boolean(g.claimEmailSentAt));
        if (!paid)
            continue;
        const claimedHid = str(g.claimedByHouseholdId);
        const rec = claimedHid ? receivedByKey.get(`${claimedHid}/${d.id}`) : undefined;
        const liveOrder = liveGiftOrderByInvite.get(d.id);
        const shipping = (_1 = addressOf(liveOrder === null || liveOrder === void 0 ? void 0 : liveOrder.shippingAddress)) !== null && _1 !== void 0 ? _1 : addressOf(g.shippingAddress);
        // Ship only when there is an address; QA gifts without one are skipped.
        if (!shipping)
            continue;
        const rawLines = liveOrder && Array.isArray(liveOrder.lineItems) ? liveOrder.lineItems : (_2 = rec === null || rec === void 0 ? void 0 : rec.lineItems) !== null && _2 !== void 0 ? _2 : g.lineItems;
        const wrap = new Set(strList((_4 = (_3 = liveOrder === null || liveOrder === void 0 ? void 0 : liveOrder.wrapSelectedItemIds) !== null && _3 !== void 0 ? _3 : rec === null || rec === void 0 ? void 0 : rec.wrapSelectedItemIds) !== null && _4 !== void 0 ? _4 : g.wrapSelectedItemIds));
        const lines = buildLines({
            raw: rawLines,
            items,
            childName: (id) => { var _a, _b; return (_b = (_a = childInfoById.get(id)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : null; },
            defaults: null,
            wrap,
        });
        const giver = (_6 = (_5 = str(g.giverName)) !== null && _5 !== void 0 ? _5 : str(g.giverEmail)) !== null && _6 !== void 0 ? _6 : 'a giver';
        packages.push({
            id: `gift_${d.id}`,
            kind: 'gift',
            status: (_7 = str(g.status)) !== null && _7 !== void 0 ? _7 : 'unknown',
            reference: `Gift from ${giver}`,
            recipient: (_9 = (_8 = shipping.name) !== null && _8 !== void 0 ? _8 : str(g.recipientName)) !== null && _9 !== void 0 ? _9 : str(g.recipientEmail),
            email: str(g.recipientEmail),
            test: (0, testAccounts_1.isTest)(str(g.giverEmail), str(g.giverName), str(g.recipientEmail), shipping.name),
            paidAt: (_10 = iso(g.claimEmailSentAt)) !== null && _10 !== void 0 ? _10 : iso(g.createdAt),
            destination: shipping,
            kids: [],
            sliders: emptySliders,
            note: str(g.message),
            recommendedSize: '14x14x6',
            lines,
        });
    }
    for (const r of shopRows) {
        const user = str(r.o.userId) ? usersById.get(str(r.o.userId)) : undefined;
        const shipping = addressOf(r.o.shippingAddress);
        const email = (_12 = (_11 = str(r.o.guestEmail)) !== null && _11 !== void 0 ? _11 : user === null || user === void 0 ? void 0 : user.email) !== null && _12 !== void 0 ? _12 : str((_13 = r.o.shippingAddress) === null || _13 === void 0 ? void 0 : _13.email);
        const lines = buildLines({
            raw: r.o.lineItems,
            items,
            childName: () => null,
            defaults: null,
            wrap: new Set(strList(r.o.wrapSelectedItemIds)),
        });
        packages.push({
            id: `shop_${r.hid}_${r.id}`,
            kind: 'shop',
            status: (0, shopOrders_1.shopOrderState)(r.o).status,
            reference: `Order ${r.id.slice(0, 8).toUpperCase()}`,
            recipient: (_15 = (_14 = shipping === null || shipping === void 0 ? void 0 : shipping.name) !== null && _14 !== void 0 ? _14 : user === null || user === void 0 ? void 0 : user.name) !== null && _15 !== void 0 ? _15 : null,
            email,
            test: (0, testAccounts_1.isTest)(email, user === null || user === void 0 ? void 0 : user.name),
            paidAt: (_16 = iso(r.o.confirmedAt)) !== null && _16 !== void 0 ? _16 : iso(r.o.createdAt),
            destination: shipping,
            kids: [],
            sliders: emptySliders,
            note: null,
            recommendedSize: recommendedSizeFor('shop'),
            lines,
        });
    }
    // Shared packing state: chosen size and packed lines, one doc per package.
    const stored = await getAllSafe(db, packages.map((p) => db.doc(`${PACKING_COLLECTION}/${p.id}`)));
    const storedById = new Map(stored.map((s) => { var _a; return [s.id, (_a = s.data()) !== null && _a !== void 0 ? _a : {}]; }));
    const out = packages.map((p) => {
        var _a;
        const state = (_a = storedById.get(p.id)) !== null && _a !== void 0 ? _a : {};
        const packedMap = isRecord(state.packed) ? state.packed : {};
        const picked = typeof state.size === 'string' && PACKING_SIZE_KEYS.includes(state.size)
            ? state.size
            : null;
        const lines = p.lines.map((l) => (Object.assign(Object.assign({}, l), { packed: packedMap[l.key] === true })));
        return Object.assign(Object.assign({}, p), { lines, mayNeedLargeBox: mayNeedLargeBox(lines), size: picked !== null && picked !== void 0 ? picked : p.recommendedSize, sizeSet: picked != null });
    });
    out.sort((a, b) => { var _a, _b; return ((_a = a.paidAt) !== null && _a !== void 0 ? _a : '').localeCompare((_b = b.paidAt) !== null && _b !== void 0 ? _b : ''); });
    return { generatedAt: new Date(nowMs).toISOString(), packages: out };
}
const PACKING_CALL_OPTS = {
    timeoutSeconds: 300,
    memory: '1GiB',
};
function createAdminPacking(db) {
    const getAdminPacking = (0, sentry_1.onCall)(PACKING_CALL_OPTS, async (request) => {
        var _a;
        if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
            throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
        if (!(0, guestSessions_1.isAdminToken)(request.auth.token))
            throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
        return buildAdminPackingList(db);
    });
    /** Set a line's packed flag, or a package's box size. Shared across admins. */
    const setAdminPackingState = (0, sentry_1.onCall)(PACKING_CALL_OPTS, async (request) => {
        var _a, _b, _c;
        if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
            throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
        if (!(0, guestSessions_1.isAdminToken)(request.auth.token))
            throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
        const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
        const packageId = typeof data.packageId === 'string' ? data.packageId : '';
        if (!PACKAGE_ID.test(packageId))
            throw new sentry_1.HttpsError('invalid-argument', 'Unknown package.');
        const update = {
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedBy: (_c = request.auth.token.email) !== null && _c !== void 0 ? _c : request.auth.uid,
        };
        const lineKey = typeof data.lineKey === 'string' ? data.lineKey : '';
        if (lineKey) {
            if (lineKey.length > 300)
                throw new sentry_1.HttpsError('invalid-argument', 'Line key too long.');
            update.packed = { [lineKey]: data.packed === true };
        }
        if (data.size !== undefined) {
            if (typeof data.size !== 'string' || !PACKING_SIZE_KEYS.includes(data.size)) {
                throw new sentry_1.HttpsError('invalid-argument', 'Unknown box size.');
            }
            update.size = data.size;
        }
        if (!lineKey && data.size === undefined)
            throw new sentry_1.HttpsError('invalid-argument', 'Nothing to update.');
        await db.doc(`${PACKING_COLLECTION}/${packageId}`).set(update, { merge: true });
        return { ok: true };
    });
    return { getAdminPacking, setAdminPackingState };
}
//# sourceMappingURL=adminPacking.js.map