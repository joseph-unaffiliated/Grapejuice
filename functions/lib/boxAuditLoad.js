"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECURED_STATUSES = exports.BOX_AUDIT_HOLIDAY_ID = void 0;
exports.toLines = toLines;
exports.isTestEmail = isTestEmail;
exports.slotKidKeys = slotKidKeys;
exports.guestBoxRefs = guestBoxRefs;
exports.accountBoxRef = accountBoxRef;
exports.loadAuditCatalog = loadAuditCatalog;
exports.loadBoxes = loadBoxes;
exports.matchException = matchException;
exports.isLikelyDonation = isLikelyDonation;
exports.isOpenProblem = isOpenProblem;
exports.auditBoxRef = auditBoxRef;
exports.boxAuditId = boxAuditId;
const boxAudit_1 = require("./boxAudit");
const boxAuditExceptions_1 = require("./boxAuditExceptions");
exports.BOX_AUDIT_HOLIDAY_ID = 'hanukkah-2026';
const CATALOG_HOLIDAY = 'hanukkah';
/** The gift flow builds for one grown-up unless the giver says otherwise (form.giftAdults). */
const GIFT_DEFAULT_ADULTS = 1;
exports.SECURED_STATUSES = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const strs = (v) => arr(v).filter((s) => typeof s === 'string');
const str = (v) => (typeof v === 'string' && v ? v : null);
function toLines(v) {
    return arr(v)
        .filter(isRecord)
        .filter((l) => typeof l.slotId === 'string' && typeof l.itemId === 'string')
        .map((l) => { var _a, _b; return (Object.assign(Object.assign({}, l), { quantity: Number((_a = l.quantity) !== null && _a !== void 0 ? _a : 0), unitCents: Number((_b = l.unitCents) !== null && _b !== void 0 ? _b : 0) })); });
}
function isTestEmail(email) {
    if (!email)
        return false;
    const s = email.toLowerCase();
    return /@unaffiliated?(\.co)?$/.test(s) || /@(a\.com|test\.com|example\.com)$/.test(s) || /joseph|jweissgold|brendan/.test(s);
}
/** Grown-ups from onboarding drafts; undefined (→ 2) when none were entered, like the builder. */
function adultsFromDrafts(drafts) {
    const n = arr(drafts).filter((d) => isRecord(d) && d.role === 'adult').length;
    return n > 0 ? n : undefined;
}
function giftAdults(draft) {
    const form = isRecord(draft.form) ? draft.form : {};
    return typeof form.giftAdults === 'number' && form.giftAdults >= 0 ? form.giftAdults : GIFT_DEFAULT_ADULTS;
}
function kidsFromDrafts(drafts) {
    return arr(drafts).filter((d) => isRecord(d) && d.role !== 'adult').length;
}
/** Per-kid slot keys on the lines, in order of first appearance. */
function slotKidKeys(lines) {
    const keys = [];
    for (const l of lines) {
        const m = l.slotId.replace(/::x$/i, '').match(/^(?:story|gift)-(.+)$/);
        if (m && !keys.includes(m[1]))
            keys.push(m[1]);
    }
    return keys;
}
function padKeys(keys, count, prefix) {
    const out = [...keys];
    for (let i = 0; out.length < count; i++)
        if (!out.includes(`${prefix}${i}`))
            out.push(`${prefix}${i}`);
    return out;
}
function isBoxOrder(o) {
    return o.orderType !== 'marketplace' && o.orderType !== 'received_gift' && o.playthrough !== true;
}
/** Signed-out box and gift draft from a guestSessions doc (null when there is none to audit). */
function guestBoxRefs(path, data) {
    if (!data || str(data.convertedUid))
        return { guest: null, gift: null };
    const snapshot = isRecord(data.snapshot) ? data.snapshot : {};
    const email = str(data.email);
    const test = isTestEmail(email) || data.test === true || path.includes('/agenttest') || JSON.stringify(snapshot).includes('"test-item"');
    const guestData = isRecord(snapshot.guest) ? snapshot.guest : null;
    let guest = null;
    if (guestData && (guestData.onboardingComplete === true || guestData.boxRevealComplete === true)) {
        const lines = toLines(guestData.lineItems);
        if (lines.length) {
            guest = {
                kind: 'guest',
                path,
                email,
                test,
                lines,
                kidKeys: padKeys(slotKidKeys(lines), kidsFromDrafts(guestData.childDrafts), 'guest-'),
                adults: adultsFromDrafts(guestData.childDrafts),
                wrapSelectedItemIds: strs(guestData.wrapSelectedItemIds),
            };
        }
    }
    const giftData = isRecord(snapshot.gift) ? snapshot.gift : null;
    const draft = (giftData === null || giftData === void 0 ? void 0 : giftData.status) === 'incomplete' && isRecord(giftData.draft) ? giftData.draft : null;
    let gift = null;
    if (draft) {
        const lines = toLines(draft.lineItems);
        if (lines.length) {
            gift = {
                kind: 'gift',
                path: `${path}#gift`,
                email,
                test,
                lines,
                kidKeys: padKeys(slotKidKeys(lines), kidsFromDrafts(draft.childDrafts), 'gift-child-'),
                adults: giftAdults(draft),
                wrapSelectedItemIds: strs(draft.wrapSelectedItemIds),
            };
        }
    }
    return { guest, gift };
}
/** One account draft, with its household's kids, adults and whether a box order is secured. */
async function accountBoxRef(db, householdId, path, data) {
    var _a, _b;
    const lines = toLines(data === null || data === void 0 ? void 0 : data.lineItems);
    if (!lines.length)
        return null;
    const ownerId = str((_a = (await db.doc(`households/${householdId}`).get()).data()) === null || _a === void 0 ? void 0 : _a.ownerId);
    const [userSnap, childSnap, orderSnap] = await Promise.all([
        ownerId ? db.doc(`users/${ownerId}`).get() : Promise.resolve(null),
        ownerId ? db.collection(`users/${ownerId}/children`).get() : Promise.resolve(null),
        db.collection(`households/${householdId}/orders`).where('holidayId', '==', exports.BOX_AUDIT_HOLIDAY_ID).get(),
    ]);
    const user = userSnap === null || userSnap === void 0 ? void 0 : userSnap.data();
    const email = str(user === null || user === void 0 ? void 0 : user.email);
    const kids = (_b = childSnap === null || childSnap === void 0 ? void 0 : childSnap.docs.map((d) => d.id)) !== null && _b !== void 0 ? _b : [];
    return {
        kind: 'account',
        path,
        email,
        test: isTestEmail(email),
        lines,
        kidKeys: kids.length ? kids : slotKidKeys(lines),
        adults: adultsFromDrafts(isRecord(user === null || user === void 0 ? void 0 : user.lastBoxAnswers) ? user.lastBoxAnswers.childDrafts : undefined),
        wrapSelectedItemIds: strs(data === null || data === void 0 ? void 0 : data.wrapSelectedItemIds),
        committed: orderSnap.docs.some((d) => isBoxOrder(d.data()) && exports.SECURED_STATUSES.includes(String(d.data().status))),
    };
}
async function loadAuditCatalog(db) {
    const snap = await db.collection(`catalog/${CATALOG_HOLIDAY}/items`).get();
    return snap.docs.map((d) => { var _a, _b; return ({ id: d.id, name: (_a = str(d.data().name)) !== null && _a !== void 0 ? _a : undefined, category: (_b = str(d.data().category)) !== null && _b !== void 0 ? _b : undefined }); });
}
/**
 * Every box. Account drafts of households with a secured order are skipped (the order is
 * audited) unless `includeSecuredDrafts`, which keeps them flagged `committed`.
 */
async function loadBoxes(db, opts = {}) {
    var _a, _b;
    const [draftSnap, householdSnap, userSnap, childSnap, guestSnap, catalog] = await Promise.all([
        db.collectionGroup('boxDrafts').get(),
        db.collection('households').get(),
        db.collection('users').get(),
        db.collectionGroup('children').get(),
        db.collection('guestSessions').get(),
        loadAuditCatalog(db),
    ]);
    const orderSnaps = await Promise.all(exports.SECURED_STATUSES.map((status) => db.collectionGroup('orders').where('holidayId', '==', exports.BOX_AUDIT_HOLIDAY_ID).where('status', '==', status).get()));
    const owners = new Map(householdSnap.docs.map((d) => { var _a; return [d.id, (_a = str(d.data().ownerId)) !== null && _a !== void 0 ? _a : undefined]; }));
    const users = new Map(userSnap.docs.map((d) => [d.id, d.data()]));
    const kidsByUser = new Map();
    for (const c of childSnap.docs) {
        const uid = c.ref.parent.parent;
        if ((uid === null || uid === void 0 ? void 0 : uid.parent.id) !== 'users')
            continue;
        kidsByUser.set(uid.id, [...((_a = kidsByUser.get(uid.id)) !== null && _a !== void 0 ? _a : []), c.id]);
    }
    const accountKeys = (ownerId, lines) => {
        const kids = ownerId ? kidsByUser.get(ownerId) : undefined;
        return (kids === null || kids === void 0 ? void 0 : kids.length) ? kids : slotKidKeys(lines);
    };
    const userOf = (ownerId) => (ownerId ? users.get(ownerId) : undefined);
    const adultsOf = (user) => adultsFromDrafts(isRecord(user === null || user === void 0 ? void 0 : user.lastBoxAnswers) ? user.lastBoxAnswers.childDrafts : undefined);
    const boxes = [];
    const securedHouseholds = new Set();
    for (const snap of orderSnaps) {
        for (const d of snap.docs) {
            const o = d.data();
            if (!isBoxOrder(o))
                continue;
            const hh = d.ref.parent.parent;
            if ((hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households')
                continue;
            securedHouseholds.add(hh.id);
            const ownerId = owners.get(hh.id);
            const user = userOf(ownerId);
            const email = (_b = str(user === null || user === void 0 ? void 0 : user.email)) !== null && _b !== void 0 ? _b : str(o.email);
            const lines = toLines(o.lineItems);
            boxes.push({
                kind: 'order',
                path: d.ref.path,
                email,
                test: isTestEmail(email),
                lines,
                kidKeys: accountKeys(ownerId, lines),
                adults: adultsOf(user),
                wrapSelectedItemIds: strs(o.wrapSelectedItemIds),
            });
        }
    }
    for (const d of draftSnap.docs) {
        const hh = d.ref.parent.parent;
        if (d.id !== exports.BOX_AUDIT_HOLIDAY_ID || (hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households')
            continue;
        const committed = securedHouseholds.has(hh.id);
        if (committed && !opts.includeSecuredDrafts)
            continue;
        const data = d.data();
        const lines = toLines(data.lineItems);
        if (!lines.length)
            continue;
        const ownerId = owners.get(hh.id);
        const user = userOf(ownerId);
        const email = str(user === null || user === void 0 ? void 0 : user.email);
        boxes.push(Object.assign({ kind: 'account', path: d.ref.path, email, test: isTestEmail(email), lines, kidKeys: accountKeys(ownerId, lines), adults: adultsOf(user), wrapSelectedItemIds: strs(data.wrapSelectedItemIds) }, (committed ? { committed: true } : {})));
    }
    for (const d of guestSnap.docs) {
        const { guest, gift } = guestBoxRefs(d.ref.path, d.data());
        if (guest)
            boxes.push(guest);
        if (gift)
            boxes.push(gift);
    }
    return { boxes, catalog };
}
function matchException(exceptions, email, p) {
    const local = email === null || email === void 0 ? void 0 : email.toLowerCase().split('@')[0];
    if (!local)
        return undefined;
    return exceptions.find((e) => e.email.toLowerCase().split('@')[0] === local &&
        (!e.section || e.section === p.section) &&
        (!e.code || e.code === p.code) &&
        (!e.itemId || e.itemId === p.itemId));
}
/** Less gelt or fewer food slots than included: usually the customer donated them. */
function isLikelyDonation(p) {
    return p.code === 'gelt-short' || p.code === 'food-slot-missing';
}
/** A problem that counts against the box. Likely donations stay listed but don't count. */
function isOpenProblem(p) {
    return !p.approved && !p.grandfathered && !isLikelyDonation(p);
}
function auditBoxRef(box, catalog, exceptions = boxAuditExceptions_1.BOX_AUDIT_EXCEPTIONS) {
    const audit = (0, boxAudit_1.auditIncluded)(box.lines, catalog, { kidKeys: box.kidKeys, adults: box.adults }, {
        wrapSelectedItemIds: box.wrapSelectedItemIds,
    });
    const problems = audit.problems.map((p) => {
        const ex = matchException(exceptions, box.email, p);
        return ex ? Object.assign(Object.assign({}, p), { approved: ex.note }) : p;
    });
    const open = problems.filter(isOpenProblem).length;
    return {
        kind: box.kind,
        path: box.path,
        email: box.email,
        test: box.test,
        committed: box.kind === 'order' || box.committed === true,
        kids: audit.kids,
        people: audit.people,
        sections: audit.sections,
        problems,
        open,
        ok: open === 0,
    };
}
/** boxAudits doc id for a box path (Firestore ids can't hold "/"). */
function boxAuditId(path) {
    return path.replace(/[/#]/g, '__');
}
//# sourceMappingURL=boxAuditLoad.js.map