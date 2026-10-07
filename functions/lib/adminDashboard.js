"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBoxesDashboard = buildBoxesDashboard;
exports.createAdminBoxesDashboard = createAdminBoxesDashboard;
const sentry_1 = require("./sentry");
/**
 * Admin "Boxes and gifts" dashboard: one read-only snapshot of Hanukkah box orders,
 * open drafts, anonymous (signed-out) boxes, gift invites and inventory holds. Hold math mirrors
 * recomputeBoxAllocations / addOutstandingGiftBoxes in catalogInventory.ts — keep in sync.
 */
const HOLIDAY_ID = 'hanukkah-2026';
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
const LIVE = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const DEFAULT_BOX_CENTS = 8000;
const PER_EXTRA_KID_CENTS = 1000;
const ADMIN_EMAIL = /^(brendan|joseph|maya)(\+[^@]*)?@unaffiliated\.co$/i;
const GUEST_ROW_LIMIT = 500;
/** Onboarding steps after the two sliders — reaching one means the scores are real answers, not defaults. */
const STEPS_AFTER_SLIDERS = ['rav-question', 'building', 'reveal'];
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
        return /@unaffiliated?(\.co)?$/.test(s) || /@(a\.com|test\.com|example\.com)$/.test(s) || /joseph|jweissgold|brendan/.test(s);
    });
}
const score = (v) => {
    const n = num(v);
    return n == null ? null : Math.round(Math.max(0, Math.min(100, n)));
};
const NO_ANSWERS = { hanukkah: null, hanukkahLevel: null, jewish: null };
function hostOf(url) {
    if (typeof url !== 'string' || !url)
        return null;
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    }
    catch (_a) {
        return null;
    }
}
function guestSourceLabel(entry) {
    if (!entry || typeof entry !== 'object')
        return null;
    const e = entry;
    const fromUtm = attributionLabel(e.utm);
    if (fromUtm)
        return fromUtm;
    if (str(e.fbclid))
        return 'Meta (fbclid)';
    return hostOf(e.referrer);
}
function attributionLabel(a) {
    var _a, _b, _c, _d;
    if (!a || typeof a !== 'object')
        return null;
    const o = a;
    const parts = [(_b = (_a = o.utm_source) !== null && _a !== void 0 ? _a : o.utmSource) !== null && _b !== void 0 ? _b : o.source, (_d = (_c = o.utm_campaign) !== null && _c !== void 0 ? _c : o.utmCampaign) !== null && _d !== void 0 ? _d : o.campaign].filter((x) => typeof x === 'string' && x.length > 0);
    return parts.length ? parts.join(' / ') : null;
}
const US_STATES = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO',
    CONNECTICUT: 'CT', DELAWARE: 'DE', 'DISTRICT OF COLUMBIA': 'DC', FLORIDA: 'FL', GEORGIA: 'GA',
    HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY',
    LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
    MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH',
    'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
    OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
    VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY', 'PUERTO RICO': 'PR',
};
const CA_PROVINCES = {
    ALBERTA: 'AB', 'BRITISH COLUMBIA': 'BC', MANITOBA: 'MB', 'NEW BRUNSWICK': 'NB',
    'NEWFOUNDLAND AND LABRADOR': 'NL', NEWFOUNDLAND: 'NL', 'NOVA SCOTIA': 'NS', ONTARIO: 'ON',
    'PRINCE EDWARD ISLAND': 'PE', QUEBEC: 'QC', QUÉBEC: 'QC', SASKATCHEWAN: 'SK',
    'NORTHWEST TERRITORIES': 'NT', NUNAVUT: 'NU', YUKON: 'YT',
};
const US_CODES = new Set(Object.values(US_STATES));
const CA_CODES = new Set(Object.values(CA_PROVINCES));
/**
 * State only — the dashboard never carries street addresses. The address form defaults country to
 * US, so Canada is inferred from the province.
 */
function locationOf(addr) {
    var _a, _b;
    if (!addr || typeof addr !== 'object')
        return null;
    const a = addr;
    const raw = typeof a.stateProvince === 'string' ? a.stateProvince.trim().replace(/\.|\s+(?=\s)/g, '').toUpperCase() : '';
    if (!raw)
        return null;
    const ca = (_a = CA_PROVINCES[raw]) !== null && _a !== void 0 ? _a : (CA_CODES.has(raw) ? raw : null);
    const us = (_b = US_STATES[raw]) !== null && _b !== void 0 ? _b : (US_CODES.has(raw) ? raw : null);
    if (ca && (a.country === 'CA' || !us))
        return `${ca}, Canada`;
    if (us)
        return us;
    return a.country === 'OTHER' ? `${raw} (intl)` : raw;
}
const META_AD_UNKNOWN = 'Meta, ad unknown';
const NOT_FROM_AD = 'Not from an ad';
/** Ad name from a touch (`{ utm, fbclid }`) or a guest entry; utm keys may be bare or utm_-prefixed. */
function adNameOf(touch) {
    var _a, _b, _c;
    if (!touch || typeof touch !== 'object')
        return null;
    const t = touch;
    const u = (t.utm && typeof t.utm === 'object' ? t.utm : {});
    const content = (_a = str(u.utm_content)) !== null && _a !== void 0 ? _a : str(u.content);
    if (content)
        return content;
    const source = (_c = ((_b = str(u.utm_source)) !== null && _b !== void 0 ? _b : str(u.source))) === null || _c === void 0 ? void 0 : _c.toLowerCase();
    return source === 'meta' || str(t.fbclid) ? META_AD_UNKNOWN : null;
}
function guestAnsweredSliders(guest) {
    return (guest.onboardingComplete === true ||
        guest.boxRevealComplete === true ||
        STEPS_AFTER_SLIDERS.includes(String(guest.onboardingStep)) ||
        (Array.isArray(guest.lineItems) && guest.lineItems.length > 0 && guest.buildBoxPath === true));
}
function guestAnswers(guest) {
    return { hanukkah: score(guest.familiarityScore), hanukkahLevel: null, jewish: score(guest.practiceFrequencyScore) };
}
/** Signed-out visitors' saved boxes (guestSessions). Favorites-only browsing is left out. */
function buildGuestRows(docs, items, priceForKids) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const rows = [];
    for (const d of docs) {
        const x = d.data();
        const guest = (_b = (_a = x.snapshot) === null || _a === void 0 ? void 0 : _a.guest) !== null && _b !== void 0 ? _b : {};
        const gift = (_d = (_c = x.snapshot) === null || _c === void 0 ? void 0 : _c.gift) !== null && _d !== void 0 ? _d : null;
        const giftDraft = (_e = gift === null || gift === void 0 ? void 0 : gift.draft) !== null && _e !== void 0 ? _e : null;
        const kidDrafts = (Array.isArray(guest.childDrafts) ? guest.childDrafts : []).filter((c) => c && c.role !== 'adult');
        const rawLines = Array.isArray(guest.lineItems) ? guest.lineItems : [];
        const step = str(guest.onboardingStep);
        if (!rawLines.length && !step && !kidDrafts.length && !giftDraft && guest.boxRevealComplete !== true)
            continue;
        const kidLabels = new Map();
        kidDrafts.forEach((c, i) => {
            const age = num(c.plannerAge);
            kidLabels.set(`guest-${i}`, `Kid ${i + 1}${age != null ? ` (${age >= 18 ? '18+' : age})` : ''}`);
        });
        const lines = rawLines.filter(Boolean).map((raw) => {
            var _a, _b, _c;
            const li = raw;
            const itemId = str(li.itemId);
            const unitCents = (_a = num(li.unitCents)) !== null && _a !== void 0 ? _a : 0;
            const childId = str(li.childId);
            return {
                itemId,
                name: (itemId && ((_b = items.get(itemId)) === null || _b === void 0 ? void 0 : _b.name)) || str(li.label) || itemId || '?',
                qty: Math.max(0, Math.floor(Number(li.quantity) || 0)),
                unitCents,
                addOn: unitCents > 0,
                child: childId ? (_c = kidLabels.get(childId)) !== null && _c !== void 0 ? _c : 'child' : null,
                forHousehold: !childId,
            };
        });
        const answered = guestAnsweredSliders(guest);
        const stage = guest.boxRevealComplete
            ? 'revealed'
            : lines.length
                ? 'built'
                : answered
                    ? 'answered'
                    : step || kidDrafts.length
                        ? 'started'
                        : 'gift';
        const kids = Math.max(1, kidDrafts.length);
        const giftLines = Array.isArray(giftDraft === null || giftDraft === void 0 ? void 0 : giftDraft.lineItems) ? giftDraft === null || giftDraft === void 0 ? void 0 : giftDraft.lineItems.length : 0;
        rows.push({
            id: d.id,
            createdAt: iso(x.createdAt),
            updatedAt: iso(x.updatedAt),
            stage,
            step,
            kids,
            boxPriceCents: priceForKids(kids),
            addOnCents: lines.filter((l) => l.addOn).reduce((s, l) => s + l.unitCents * Math.max(1, l.qty), 0),
            answers: answered ? guestAnswers(guest) : NO_ANSWERS,
            source: guestSourceLabel(x.entry),
            landingPath: str((_f = x.entry) === null || _f === void 0 ? void 0 : _f.landingPath),
            lastPath: str(x.path),
            converted: Boolean(str(x.convertedUid)),
            convertedAt: iso(x.convertedAt),
            leadAt: iso(x.lastLeadAt),
            resumeCount: (_g = num(x.resumeCount)) !== null && _g !== void 0 ? _g : 0,
            saveCount: (_h = num(x.saveCount)) !== null && _h !== void 0 ? _h : 0,
            gift: giftDraft
                ? {
                    kind: str(gift === null || gift === void 0 ? void 0 : gift.kind),
                    giverName: str((_j = giftDraft.form) === null || _j === void 0 ? void 0 : _j.giverName),
                    recipientEmail: str((_k = giftDraft.form) === null || _k === void 0 ? void 0 : _k.recipientEmail),
                    items: giftLines,
                }
                : null,
            lines,
        });
    }
    rows.sort((a, b) => { var _a, _b; return String((_a = b.updatedAt) !== null && _a !== void 0 ? _a : '').localeCompare(String((_b = a.updatedAt) !== null && _b !== void 0 ? _b : '')); });
    return rows.slice(0, GUEST_ROW_LIMIT);
}
async function buildBoxesDashboard(db, nowMs = Date.now()) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30;
    const [configSnap, hhSnap, ordersSnap, invitesSnap, itemsSnap, countersSnap, draftsSnap, childrenSnap, receivedSnap, guestSnap,] = await Promise.all([
        db.doc(`config/${HOLIDAY_ID}`).get(),
        db.collection('households').get(),
        db.collectionGroup('orders').get(),
        db.collection('giftInvites').get(),
        db.collection('catalog/hanukkah/items').get(),
        db.collection('catalog/hanukkah/inventory').get(),
        db.collectionGroup('boxDrafts').get(),
        db.collectionGroup('children').get(),
        db.collectionGroup('receivedGifts').get(),
        db
            .collection('guestSessions')
            .select('snapshot', 'entry', 'path', 'createdAt', 'updatedAt', 'convertedUid', 'convertedAt', 'lastLeadAt', 'resumeCount', 'saveCount')
            .get(),
    ]);
    const guestDocs = guestSnap.docs.filter((d) => !d.id.startsWith('agenttest'));
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
    // Slider answers from a converted guest session fill in for accounts with no saved lastBoxAnswers.
    const guestAnswersByUid = new Map();
    const guestAdByUid = new Map();
    for (const d of guestSnap.docs) {
        const x = d.data();
        const uid = str(x.convertedUid);
        const guest = (_e = x.snapshot) === null || _e === void 0 ? void 0 : _e.guest;
        if (uid && guest && guestAnsweredSliders(guest))
            guestAnswersByUid.set(uid, guestAnswers(guest));
        const ad = uid ? adNameOf(x.entry) : null;
        if (uid && ad)
            guestAdByUid.set(uid, ad);
    }
    const users = new Map();
    for (const s of userSnaps) {
        const x = (_f = s.data()) !== null && _f !== void 0 ? _f : {};
        const last = (_g = x.lastBoxAnswers) !== null && _g !== void 0 ? _g : {};
        const fromGuest = (_h = guestAnswersByUid.get(s.id)) !== null && _h !== void 0 ? _h : NO_ANSWERS;
        const hanukkah = (_j = score(last.familiarityScore)) !== null && _j !== void 0 ? _j : fromGuest.hanukkah;
        const attr = (_k = x.attribution) !== null && _k !== void 0 ? _k : {};
        users.set(s.id, {
            email: str(x.email),
            name: str(x.displayName),
            answers: {
                hanukkah,
                hanukkahLevel: hanukkah == null ? (_l = str(last.familiarityLevel)) !== null && _l !== void 0 ? _l : str(x.familiarityLevel) : null,
                jewish: (_m = score(last.practiceFrequencyScore)) !== null && _m !== void 0 ? _m : fromGuest.jewish,
            },
            householdId: str(x.householdId),
            ad: (_q = (_p = (_o = adNameOf(attr.firstTouch)) !== null && _o !== void 0 ? _o : adNameOf(attr.lastTouch)) !== null && _p !== void 0 ? _p : guestAdByUid.get(s.id)) !== null && _q !== void 0 ? _q : (str(attr.fbc) ? META_AD_UNKNOWN : NOT_FROM_AD),
            createdAt: iso(x.createdAt),
        });
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
        var _a, _b, _c, _d, _e;
        const h = (_a = households.get(hid)) !== null && _a !== void 0 ? _a : {};
        const owner = uid !== null && uid !== void 0 ? uid : str(h.ownerId);
        const u = owner ? users.get(owner) : undefined;
        const email = (_b = u === null || u === void 0 ? void 0 : u.email) !== null && _b !== void 0 ? _b : null;
        const childNames = (owner && childNamesByUser.get(owner)) || new Map();
        return {
            name: (_d = (_c = u === null || u === void 0 ? void 0 : u.name) !== null && _c !== void 0 ? _c : (email ? email.split('@')[0] : null)) !== null && _d !== void 0 ? _d : str(h.name),
            email,
            test: isTest(email, u === null || u === void 0 ? void 0 : u.name),
            answers: (_e = u === null || u === void 0 ? void 0 : u.answers) !== null && _e !== void 0 ? _e : NO_ANSWERS,
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
    const latestLocation = new Map();
    for (const d of ordersSnap.docs) {
        const hid = (_r = d.ref.parent.parent) === null || _r === void 0 ? void 0 : _r.id;
        const location = locationOf(d.data().shippingAddress);
        if (!hid || !location)
            continue;
        const createdMs = (_s = ms(d.data().createdAt)) !== null && _s !== void 0 ? _s : 0;
        const prev = latestLocation.get(hid);
        if (!prev || createdMs > prev.createdMs)
            latestLocation.set(hid, { createdMs, location });
    }
    const householdLocation = (hid) => { var _a, _b; return (hid ? (_b = (_a = latestLocation.get(hid)) === null || _a === void 0 ? void 0 : _a.location) !== null && _b !== void 0 ? _b : null : null); };
    const boxHeld = new Map();
    const giftOrders = new Map();
    const receivedGiftOrdersByKey = new Map();
    const boxes = [];
    const liveBoxHouseholds = new Set();
    const committedBoxHouseholds = new Set();
    for (const d of ordersSnap.docs) {
        const o = d.data();
        const hid = (_u = (_t = d.ref.parent.parent) === null || _t === void 0 ? void 0 : _t.id) !== null && _u !== void 0 ? _u : '';
        const playthrough = o.playthrough === true;
        if (o.orderType === 'received_gift') {
            const key = `${hid}/${String((_v = o.giftInviteId) !== null && _v !== void 0 ? _v : d.id)}`;
            const list = (_w = receivedGiftOrdersByKey.get(key)) !== null && _w !== void 0 ? _w : [];
            list.push({ id: d.id, status: (_x = str(o.status)) !== null && _x !== void 0 ? _x : 'unknown', totalCents: num(o.totalCents), createdAt: iso(o.createdAt), playthrough });
            receivedGiftOrdersByKey.set(key, list);
            if (o.holidayId !== HOLIDAY_ID || playthrough || !LIVE.includes(o.status))
                continue;
            if (o.status === 'pending') {
                const c = ms(o.createdAt);
                if (c != null && nowMs - c >= PENDING_TTL_MS)
                    continue;
            }
            const createdMs = (_y = ms(o.createdAt)) !== null && _y !== void 0 ? _y : nowMs;
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
        if (!playthrough && LIVE.includes(o.status) && o.status !== 'pending')
            committedBoxHouseholds.add(hid);
        const c = customerFor(hid, str(o.userId));
        const lines = linesOf(o.lineItems, c.childNames);
        const addOnCents = addOnTotal(lines);
        const kids = (_z = num(o.kidCount)) !== null && _z !== void 0 ? _z : c.kids;
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
            status: (_0 = str(o.status)) !== null && _0 !== void 0 ? _0 : 'unknown',
            playthrough,
            cardOnFile: c.cardOnFile,
            boxPriceCents: (_1 = num(o.boxPriceCents)) !== null && _1 !== void 0 ? _1 : (subtotal != null ? subtotal - addOnCents : priceForKids(kids)),
            addOnCents,
            subtotalCents: subtotal,
            shippingCents: num(o.shippingCents),
            taxCents: num(o.taxCents),
            creditCents: ((_2 = num(o.creditAppliedCents)) !== null && _2 !== void 0 ? _2 : 0) || ((_3 = num(o.giftCreditAppliedCents)) !== null && _3 !== void 0 ? _3 : 0) + ((_4 = num(o.platformCreditAppliedCents)) !== null && _4 !== void 0 ? _4 : 0),
            totalCents: num(o.totalCents),
            updatedAt: (_6 = (_5 = iso(o.updatedAt)) !== null && _5 !== void 0 ? _5 : iso(o.committedAt)) !== null && _6 !== void 0 ? _6 : iso(o.createdAt),
            committedAt: iso(o.committedAt),
            attribution: attributionLabel(o.attribution),
            location: (_7 = locationOf(o.shippingAddress)) !== null && _7 !== void 0 ? _7 : householdLocation(hid),
            answers: c.answers,
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
            playthrough: dr.playthrough === true || ((_8 = households.get(hid)) === null || _8 === void 0 ? void 0 : _8.playthrough) === true,
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
            location: householdLocation(hid),
            answers: c.answers,
            lines,
        });
    }
    const guests = buildGuestRows(guestDocs, items, priceForKids);
    const adPeople = [];
    for (const [uid, u] of users) {
        const hid = u.householdId;
        const draftLines = hid ? (_9 = drafts.get(hid)) === null || _9 === void 0 ? void 0 : _9.lineItems : null;
        const hasBox = Boolean(hid && (liveBoxHouseholds.has(hid) || (Array.isArray(draftLines) && draftLines.length > 0)));
        adPeople.push({
            id: uid,
            ad: u.ad,
            account: true,
            test: isTest(u.email, u.name),
            answered: u.answers.jewish != null || u.answers.hanukkah != null || u.answers.hanukkahLevel != null,
            box: hasBox,
            purchase: Boolean(hid && committedBoxHouseholds.has(hid)),
            jewish: u.answers.jewish,
            hanukkah: u.answers.hanukkah,
            firstSeen: u.createdAt,
        });
    }
    for (const d of guestDocs) {
        const x = d.data();
        const uid = str(x.convertedUid);
        if (uid && users.has(uid))
            continue;
        const guest = (_11 = (_10 = x.snapshot) === null || _10 === void 0 ? void 0 : _10.guest) !== null && _11 !== void 0 ? _11 : {};
        const answered = guestAnsweredSliders(guest);
        const box = Array.isArray(guest.lineItems) && guest.lineItems.length > 0;
        if (!answered && !box)
            continue;
        const a = answered ? guestAnswers(guest) : NO_ANSWERS;
        adPeople.push({
            id: d.id,
            ad: (_12 = adNameOf(x.entry)) !== null && _12 !== void 0 ? _12 : NOT_FROM_AD,
            account: false,
            test: false,
            answered,
            box,
            purchase: false,
            jewish: a.jewish,
            hanukkah: a.hanukkah,
            firstSeen: iso(x.createdAt),
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
        const hid = (_13 = str(g.claimedByHouseholdId)) !== null && _13 !== void 0 ? _13 : '';
        const key = `${hid}/${d.id}`;
        const rec = hid ? (_14 = received.get(key)) !== null && _14 !== void 0 ? _14 : null : null;
        const convertedToCredit = g.status === 'converted_to_credit' || (rec === null || rec === void 0 ? void 0 : rec.status) === 'converted_to_credit';
        const checkoutOrders = (_15 = receivedGiftOrdersByKey.get(key)) !== null && _15 !== void 0 ? _15 : [];
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
            recipientName: (_16 = recipient === null || recipient === void 0 ? void 0 : recipient.name) !== null && _16 !== void 0 ? _16 : null,
            recipientAnswers: (_17 = recipient === null || recipient === void 0 ? void 0 : recipient.answers) !== null && _17 !== void 0 ? _17 : NO_ANSWERS,
            kind: isBox ? 'box' : 'credit',
            amountCents: num(g.creditCents),
            paid,
            paymentStatus: (_18 = str(g.paymentStatus)) !== null && _18 !== void 0 ? _18 : (g.claimEmailSentAt ? 'legacy-sent' : null),
            status: convertedToCredit ? 'converted_to_credit' : (_19 = str(g.status)) !== null && _19 !== void 0 ? _19 : 'unknown',
            claimed: Boolean(hid) || g.status === 'claimed',
            checkedOut,
            checkoutOrders,
            holdingStock: holding,
            playthrough: g.playthrough === true,
            test: isTest(str(g.giverEmail), str(g.giverName), str(g.recipientEmail), recipient === null || recipient === void 0 ? void 0 : recipient.email, recipient === null || recipient === void 0 ? void 0 : recipient.name),
            message: str(g.message),
            createdAt: iso(g.createdAt),
            location: (_20 = locationOf(g.shippingAddress)) !== null && _20 !== void 0 ? _20 : householdLocation(hid || null),
            lines: linesOf(lineSource, (_21 = recipient === null || recipient === void 0 ? void 0 : recipient.childNames) !== null && _21 !== void 0 ? _21 : new Map()),
        });
    }
    const favorites = new Map();
    const favoritesReal = new Map();
    for (const [hid, h] of households) {
        if (!Array.isArray(h.wishlistItemIds))
            continue;
        const real = !customerFor(hid, null).test;
        for (const id of new Set(h.wishlistItemIds.filter((x) => typeof x === 'string'))) {
            favorites.set(id, ((_22 = favorites.get(id)) !== null && _22 !== void 0 ? _22 : 0) + 1);
            if (real)
                favoritesReal.set(id, ((_23 = favoritesReal.get(id)) !== null && _23 !== void 0 ? _23 : 0) + 1);
        }
    }
    const counters = new Map(countersSnap.docs.map((d) => [d.id, d.data()]));
    const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
    const ids = new Set([...items.keys(), ...counters.keys(), ...boxHeld.keys(), ...giftHeld.keys()]);
    const inventory = [];
    const mismatches = [];
    for (const id of ids) {
        const it = items.get(id);
        const c = (_24 = counters.get(id)) !== null && _24 !== void 0 ? _24 : {};
        const heldByBoxes = (_25 = boxHeld.get(id)) !== null && _25 !== void 0 ? _25 : 0;
        const heldByGifts = (_26 = giftHeld.get(id)) !== null && _26 !== void 0 ? _26 : 0;
        const counterAllocated = n0(c.boxAllocatedQty);
        const directSold = n0(c.directSoldQty);
        const directReserved = n0(c.directReservedQty);
        const stock = (_27 = it === null || it === void 0 ? void 0 : it.inventory) !== null && _27 !== void 0 ? _27 : null;
        if (heldByBoxes + heldByGifts !== counterAllocated) {
            mismatches.push({ id, name: (_28 = it === null || it === void 0 ? void 0 : it.name) !== null && _28 !== void 0 ? _28 : id, computed: heldByBoxes + heldByGifts, counter: counterAllocated });
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
            favorites: (_29 = favorites.get(id)) !== null && _29 !== void 0 ? _29 : 0,
            favoritesReal: (_30 = favoritesReal.get(id)) !== null && _30 !== void 0 ? _30 : 0,
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
            guestSessions: guestDocs.length,
        },
        mismatches,
        boxes,
        guests,
        gifts,
        inventory,
        adPeople,
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