"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBoxesDashboard = buildBoxesDashboard;
exports.createAdminBoxesDashboard = createAdminBoxesDashboard;
const sentry_1 = require("./sentry");
/**
 * Admin "Boxes and gifts" dashboard: one read-only snapshot of Hanukkah box orders,
 * open drafts, gift invites and inventory holds. Hold math mirrors
 * recomputeBoxAllocations / addOutstandingGiftBoxes in catalogInventory.ts — keep in sync.
 */
const HOLIDAY_ID = 'hanukkah-2026';
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
const LIVE = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const DEFAULT_BOX_CENTS = 8000;
const PER_EXTRA_KID_CENTS = 1000;
const ADMIN_EMAIL = /^(brendan|joseph|maya)(\+[^@]*)?@unaffiliated\.co$/i;
function iso(v) {
    if (!v)
        return null;
    if (typeof v === 'string')
        return v;
    if (typeof v.toDate === 'function')
        return v.toDate().toISOString();
    return null;
}
const ms = (v) => {
    const s = iso(v);
    const t = s ? Date.parse(s) : NaN;
    return Number.isFinite(t) ? t : null;
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v ? v : null);
function addLines(totals, lines) {
    var _a, _b;
    if (!Array.isArray(lines))
        return;
    for (const li of lines) {
        const id = String((_a = li === null || li === void 0 ? void 0 : li.itemId) !== null && _a !== void 0 ? _a : '').trim();
        if (!id)
            continue;
        const q = Math.max(1, Math.floor(Number(li.quantity) || 1));
        totals.set(id, ((_b = totals.get(id)) !== null && _b !== void 0 ? _b : 0) + q);
    }
}
/** Team and QA accounts: @unaffiliated.co, placeholder domains, or anything from Joseph or Brendan. */
function isTest(...vals) {
    return vals.some((v) => {
        if (!v)
            return false;
        const s = v.toLowerCase();
        return /@unaffiliated?(\.co)?$/.test(s) || /@(a\.com|example\.com)$/.test(s) || /joseph|jweissgold|brendan/.test(s);
    });
}
function attributionLabel(a) {
    var _a, _b, _c, _d;
    if (!a || typeof a !== 'object')
        return null;
    const o = a;
    const parts = [(_b = (_a = o.utm_source) !== null && _a !== void 0 ? _a : o.utmSource) !== null && _b !== void 0 ? _b : o.source, (_d = (_c = o.utm_campaign) !== null && _c !== void 0 ? _c : o.utmCampaign) !== null && _d !== void 0 ? _d : o.campaign].filter((x) => typeof x === 'string' && x.length > 0);
    return parts.length ? parts.join(' / ') : null;
}
async function buildBoxesDashboard(db, nowMs = Date.now()) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11;
    const [configSnap, hhSnap, ordersSnap, invitesSnap, itemsSnap, countersSnap, draftsSnap, childrenSnap, receivedSnap] = await Promise.all([
        db.doc(`config/${HOLIDAY_ID}`).get(),
        db.collection('households').get(),
        db.collectionGroup('orders').get(),
        db.collection('giftInvites').get(),
        db.collection('catalog/hanukkah/items').get(),
        db.collection('catalog/hanukkah/inventory').get(),
        db.collectionGroup('boxDrafts').get(),
        db.collectionGroup('children').get(),
        db.collectionGroup('receivedGifts').get(),
    ]);
    const config = (_a = configSnap.data()) !== null && _a !== void 0 ? _a : {};
    const listCents = (_b = num(config.boxPriceCents)) !== null && _b !== void 0 ? _b : DEFAULT_BOX_CENTS;
    const priceForKids = (k) => listCents + Math.max(0, k - 1) * PER_EXTRA_KID_CENTS;
    const items = new Map();
    for (const d of itemsSnap.docs) {
        const x = d.data();
        items.set(d.id, { name: (_c = str(x.name)) !== null && _c !== void 0 ? _c : d.id, inventory: num(x.inventory) });
    }
    const households = new Map();
    const userIds = new Set();
    for (const d of hhSnap.docs) {
        const h = d.data();
        households.set(d.id, h);
        if (str(h.ownerId))
            userIds.add(h.ownerId);
    }
    for (const d of ordersSnap.docs) {
        const u = str(d.data().userId);
        if (u)
            userIds.add(u);
    }
    const childNamesByUser = new Map();
    for (const d of childrenSnap.docs) {
        const owner = d.ref.parent.parent;
        if (!owner || owner.parent.id !== 'users')
            continue;
        const m = (_d = childNamesByUser.get(owner.id)) !== null && _d !== void 0 ? _d : new Map();
        m.set(d.id, str(d.data().name));
        childNamesByUser.set(owner.id, m);
    }
    const userRefs = [...userIds].map((uid) => db.doc(`users/${uid}`));
    const userSnaps = userRefs.length ? await db.getAll(...userRefs) : [];
    const users = new Map();
    for (const s of userSnaps) {
        const x = (_e = s.data()) !== null && _e !== void 0 ? _e : {};
        users.set(s.id, { email: str(x.email), name: str(x.displayName) });
    }
    const drafts = new Map();
    for (const d of draftsSnap.docs) {
        const hh = d.ref.parent.parent;
        if (d.id === HOLIDAY_ID && hh && hh.parent.id === 'households')
            drafts.set(hh.id, d.data());
    }
    const received = new Map();
    for (const d of receivedSnap.docs) {
        const hh = d.ref.parent.parent;
        if (hh && hh.parent.id === 'households')
            received.set(`${hh.id}/${d.id}`, d.data());
    }
    const customerFor = (hid, uid) => {
        var _a, _b, _c, _d;
        const h = (_a = households.get(hid)) !== null && _a !== void 0 ? _a : {};
        const owner = uid !== null && uid !== void 0 ? uid : str(h.ownerId);
        const u = owner ? users.get(owner) : undefined;
        const email = (_b = u === null || u === void 0 ? void 0 : u.email) !== null && _b !== void 0 ? _b : null;
        const childNames = (owner && childNamesByUser.get(owner)) || new Map();
        return {
            name: (_d = (_c = u === null || u === void 0 ? void 0 : u.name) !== null && _c !== void 0 ? _c : (email ? email.split('@')[0] : null)) !== null && _d !== void 0 ? _d : str(h.name),
            email,
            test: isTest(email, u === null || u === void 0 ? void 0 : u.name),
            kids: Math.max(1, childNames.size),
            childNames,
            cardOnFile: Boolean(h.cardOnFileAt || h.stripeDefaultPaymentMethodId),
        };
    };
    const lineView = (li, childNames) => {
        var _a, _b, _c;
        const itemId = str(li.itemId);
        const unitCents = (_a = num(li.unitCents)) !== null && _a !== void 0 ? _a : 0;
        const childId = str(li.childId);
        return {
            itemId,
            name: (itemId && ((_b = items.get(itemId)) === null || _b === void 0 ? void 0 : _b.name)) || str(li.label) || itemId || '?',
            qty: Math.max(0, Math.floor(Number(li.quantity) || 0)),
            unitCents,
            addOn: unitCents > 0,
            child: childId ? (_c = childNames.get(childId)) !== null && _c !== void 0 ? _c : 'child' : null,
            forHousehold: !childId,
        };
    };
    const linesOf = (raw, childNames) => (Array.isArray(raw) ? raw : []).filter(Boolean).map((li) => lineView(li, childNames));
    const addOnTotal = (lines) => lines.filter((l) => l.addOn).reduce((s, l) => s + l.unitCents * Math.max(1, l.qty), 0);
    const boxHeld = new Map();
    const giftOrders = new Map();
    const receivedGiftOrdersByKey = new Map();
    const boxes = [];
    const liveBoxHouseholds = new Set();
    for (const d of ordersSnap.docs) {
        const o = d.data();
        const hid = (_g = (_f = d.ref.parent.parent) === null || _f === void 0 ? void 0 : _f.id) !== null && _g !== void 0 ? _g : '';
        const playthrough = o.playthrough === true;
        if (o.orderType === 'received_gift') {
            const key = `${hid}/${String((_h = o.giftInviteId) !== null && _h !== void 0 ? _h : d.id)}`;
            const list = (_j = receivedGiftOrdersByKey.get(key)) !== null && _j !== void 0 ? _j : [];
            list.push({ id: d.id, status: (_k = str(o.status)) !== null && _k !== void 0 ? _k : 'unknown', totalCents: num(o.totalCents), createdAt: iso(o.createdAt), playthrough });
            receivedGiftOrdersByKey.set(key, list);
            if (o.holidayId !== HOLIDAY_ID || playthrough || !LIVE.includes(o.status))
                continue;
            if (o.status === 'pending') {
                const c = ms(o.createdAt);
                if (c != null && nowMs - c >= PENDING_TTL_MS)
                    continue;
            }
            const createdMs = (_l = ms(o.createdAt)) !== null && _l !== void 0 ? _l : nowMs;
            const prev = giftOrders.get(key);
            if (!prev || createdMs > prev.createdMs)
                giftOrders.set(key, { createdMs, lines: o.lineItems });
            continue;
        }
        const isBox = o.orderType === 'hanukkah_box' || (!o.orderType && o.holidayId === HOLIDAY_ID);
        if (!isBox)
            continue;
        if (o.holidayId === HOLIDAY_ID && !playthrough && LIVE.includes(o.status))
            addLines(boxHeld, o.lineItems);
        if (!playthrough && LIVE.includes(o.status))
            liveBoxHouseholds.add(hid);
        const c = customerFor(hid, str(o.userId));
        const lines = linesOf(o.lineItems, c.childNames);
        const addOnCents = addOnTotal(lines);
        const kids = (_m = num(o.kidCount)) !== null && _m !== void 0 ? _m : c.kids;
        const subtotal = num(o.subtotalCents);
        boxes.push({
            id: `${hid}/${d.id}`,
            source: 'order',
            orderId: d.id,
            householdId: hid,
            customer: c.name,
            email: c.email,
            test: c.test,
            kids,
            status: (_o = str(o.status)) !== null && _o !== void 0 ? _o : 'unknown',
            playthrough,
            cardOnFile: c.cardOnFile,
            boxPriceCents: (_p = num(o.boxPriceCents)) !== null && _p !== void 0 ? _p : (subtotal != null ? subtotal - addOnCents : priceForKids(kids)),
            addOnCents,
            subtotalCents: subtotal,
            shippingCents: num(o.shippingCents),
            taxCents: num(o.taxCents),
            creditCents: ((_q = num(o.creditAppliedCents)) !== null && _q !== void 0 ? _q : 0) || ((_r = num(o.giftCreditAppliedCents)) !== null && _r !== void 0 ? _r : 0) + ((_s = num(o.platformCreditAppliedCents)) !== null && _s !== void 0 ? _s : 0),
            totalCents: num(o.totalCents),
            updatedAt: (_u = (_t = iso(o.updatedAt)) !== null && _t !== void 0 ? _t : iso(o.committedAt)) !== null && _u !== void 0 ? _u : iso(o.createdAt),
            committedAt: iso(o.committedAt),
            attribution: attributionLabel(o.attribution),
            lines,
        });
    }
    // A draft only counts as an open box when the household has no live box order.
    for (const [hid, dr] of drafts) {
        if (liveBoxHouseholds.has(hid) || !Array.isArray(dr.lineItems) || dr.lineItems.length === 0)
            continue;
        const c = customerFor(hid, str(dr.updatedBy));
        const lines = linesOf(dr.lineItems, c.childNames);
        const addOnCents = addOnTotal(lines);
        const boxPriceCents = priceForKids(c.kids);
        boxes.push({
            id: `${hid}/draft`,
            source: 'draft',
            orderId: null,
            householdId: hid,
            customer: c.name,
            email: c.email,
            test: c.test,
            kids: c.kids,
            status: 'draft',
            playthrough: dr.playthrough === true || ((_v = households.get(hid)) === null || _v === void 0 ? void 0 : _v.playthrough) === true,
            cardOnFile: c.cardOnFile,
            boxPriceCents,
            addOnCents,
            subtotalCents: boxPriceCents + addOnCents,
            shippingCents: null,
            taxCents: null,
            creditCents: 0,
            totalCents: null,
            updatedAt: iso(dr.updatedAt),
            committedAt: null,
            attribution: null,
            lines,
        });
    }
    const giftHeld = new Map();
    for (const { lines } of giftOrders.values())
        addLines(giftHeld, lines);
    const gifts = [];
    for (const d of invitesSnap.docs) {
        const g = d.data();
        const isBox = g.kind === 'box' || g.kind === 'credit' ? g.kind === 'box' : Array.isArray(g.lineItems) && g.lineItems.length > 0;
        const paid = g.paymentStatus === 'paid' || (g.paymentStatus == null && Boolean(g.claimEmailSentAt));
        const hid = (_w = str(g.claimedByHouseholdId)) !== null && _w !== void 0 ? _w : '';
        const key = `${hid}/${d.id}`;
        const rec = hid ? (_x = received.get(key)) !== null && _x !== void 0 ? _x : null : null;
        const convertedToCredit = g.status === 'converted_to_credit' || (rec === null || rec === void 0 ? void 0 : rec.status) === 'converted_to_credit';
        const checkoutOrders = (_y = receivedGiftOrdersByKey.get(key)) !== null && _y !== void 0 ? _y : [];
        const checkedOut = checkoutOrders.some((o) => !o.playthrough && LIVE.includes(o.status) && o.status !== 'pending');
        let holding = false;
        if (g.playthrough !== true && isBox && paid && (g.status === 'pending' || g.status === 'claimed')) {
            if (g.status === 'pending' || !hid) {
                addLines(giftHeld, g.lineItems);
                holding = true;
            }
            else if (!giftOrders.has(key) && (rec === null || rec === void 0 ? void 0 : rec.status) !== 'converted_to_credit') {
                addLines(giftHeld, Array.isArray(rec === null || rec === void 0 ? void 0 : rec.lineItems) ? rec === null || rec === void 0 ? void 0 : rec.lineItems : g.lineItems);
                holding = true;
            }
        }
        const recipient = hid ? customerFor(hid, null) : null;
        const lineSource = Array.isArray(rec === null || rec === void 0 ? void 0 : rec.lineItems) ? rec === null || rec === void 0 ? void 0 : rec.lineItems : g.lineItems;
        gifts.push({
            id: d.id,
            giver: str(g.giverName),
            giverEmail: str(g.giverEmail),
            recipientEmail: str(g.recipientEmail),
            recipientName: (_z = recipient === null || recipient === void 0 ? void 0 : recipient.name) !== null && _z !== void 0 ? _z : null,
            kind: isBox ? 'box' : 'credit',
            amountCents: num(g.creditCents),
            paid,
            paymentStatus: (_0 = str(g.paymentStatus)) !== null && _0 !== void 0 ? _0 : (g.claimEmailSentAt ? 'legacy-sent' : null),
            status: convertedToCredit ? 'converted_to_credit' : (_1 = str(g.status)) !== null && _1 !== void 0 ? _1 : 'unknown',
            claimed: Boolean(hid) || g.status === 'claimed',
            checkedOut,
            checkoutOrders,
            holdingStock: holding,
            playthrough: g.playthrough === true,
            test: isTest(str(g.giverEmail), str(g.giverName), str(g.recipientEmail), recipient === null || recipient === void 0 ? void 0 : recipient.email, recipient === null || recipient === void 0 ? void 0 : recipient.name),
            message: str(g.message),
            createdAt: iso(g.createdAt),
            lines: linesOf(lineSource, (_2 = recipient === null || recipient === void 0 ? void 0 : recipient.childNames) !== null && _2 !== void 0 ? _2 : new Map()),
        });
    }
    const favorites = new Map();
    const favoritesReal = new Map();
    for (const [hid, h] of households) {
        if (!Array.isArray(h.wishlistItemIds))
            continue;
        const real = !customerFor(hid, null).test;
        for (const id of new Set(h.wishlistItemIds.filter((x) => typeof x === 'string'))) {
            favorites.set(id, ((_3 = favorites.get(id)) !== null && _3 !== void 0 ? _3 : 0) + 1);
            if (real)
                favoritesReal.set(id, ((_4 = favoritesReal.get(id)) !== null && _4 !== void 0 ? _4 : 0) + 1);
        }
    }
    const counters = new Map(countersSnap.docs.map((d) => [d.id, d.data()]));
    const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
    const ids = new Set([...items.keys(), ...counters.keys(), ...boxHeld.keys(), ...giftHeld.keys()]);
    const inventory = [];
    const mismatches = [];
    for (const id of ids) {
        const it = items.get(id);
        const c = (_5 = counters.get(id)) !== null && _5 !== void 0 ? _5 : {};
        const heldByBoxes = (_6 = boxHeld.get(id)) !== null && _6 !== void 0 ? _6 : 0;
        const heldByGifts = (_7 = giftHeld.get(id)) !== null && _7 !== void 0 ? _7 : 0;
        const counterAllocated = n0(c.boxAllocatedQty);
        const directSold = n0(c.directSoldQty);
        const directReserved = n0(c.directReservedQty);
        const stock = (_8 = it === null || it === void 0 ? void 0 : it.inventory) !== null && _8 !== void 0 ? _8 : null;
        if (heldByBoxes + heldByGifts !== counterAllocated) {
            mismatches.push({ id, name: (_9 = it === null || it === void 0 ? void 0 : it.name) !== null && _9 !== void 0 ? _9 : id, computed: heldByBoxes + heldByGifts, counter: counterAllocated });
        }
        if (!it)
            continue;
        inventory.push({
            id,
            name: it.name,
            stock,
            heldByBoxes,
            heldByGifts,
            counterAllocated,
            directSold,
            directReserved,
            remaining: stock == null ? null : stock - counterAllocated - directSold - directReserved,
            favorites: (_10 = favorites.get(id)) !== null && _10 !== void 0 ? _10 : 0,
            favoritesReal: (_11 = favoritesReal.get(id)) !== null && _11 !== void 0 ? _11 : 0,
        });
    }
    boxes.sort((a, b) => { var _a, _b; return String((_a = b.updatedAt) !== null && _a !== void 0 ? _a : '').localeCompare(String((_b = a.updatedAt) !== null && _b !== void 0 ? _b : '')); });
    gifts.sort((a, b) => { var _a, _b; return String((_a = b.createdAt) !== null && _a !== void 0 ? _a : '').localeCompare(String((_b = a.createdAt) !== null && _b !== void 0 ? _b : '')); });
    return {
        generatedAt: new Date(nowMs).toISOString(),
        lockAt: iso(config.lockAt),
        counts: {
            households: households.size,
            drafts: drafts.size,
            orders: ordersSnap.size,
            giftInvites: invitesSnap.size,
            catalogItems: items.size,
        },
        mismatches,
        boxes,
        gifts,
        inventory,
    };
}
function createAdminBoxesDashboard(db) {
    return (0, sentry_1.onCall)(async (request) => {
        var _a, _b;
        if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
            throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
        const email = (_b = request.auth.token.email) !== null && _b !== void 0 ? _b : '';
        if (!ADMIN_EMAIL.test(email))
            throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
        return buildBoxesDashboard(db);
    });
}
//# sourceMappingURL=adminDashboard.js.map