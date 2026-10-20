"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPilotJoinedEmail = exports.healPilotDraftLines = exports.enrollPilot = exports.getPilotInvite = exports.adminPilotParticipants = void 0;
exports.withPilotLines = withPilotLines;
exports.markPilotEnrollmentCommitted = markPilotEnrollmentCommitted;
exports.runPilotAutoInvites = runPilotAutoInvites;
/**
 * Pilot Participants (docs/RESEARCH_PARTICIPANT_PROGRAM_BRIEF.md): invited families add three free
 * items to their Hanukkah box and agree to finish the post-Hanukkah survey by Jan 15, or be charged
 * for those items. Phase 1 here: invites, the enroll page's data, enrolling, and keeping the pilot
 * lines on the box. Survey tracking, the deferred charge and refunds come later.
 *
 * - pilotInvites/{token}: one per email, made by an admin (adminPilotParticipants) or by the
 *   auto-invite sweep (runPilotAutoInvites, `source: 'auto'`). Joseph emails the link himself and
 *   ticks `emailedAt` / `followUpAt` in the admin; nothing here sends it.
 * - pilotEnrollments/{householdId}: picks (price snapshot), agreement record, status
 *   `awaiting_checkout` (picks are in the draft; the box isn't checked out yet) → `enrolled`.
 * - adminConfig/pilotParticipants (optional): `itemIds` overrides the approved list and its order.
 *
 * Pilot lines are $0 box lines with `program: 'pilot'` and `deferredChargeCents`. The enrollment is
 * their source of truth: order syncs and checkout merge them back in, and a draft write that drops
 * them is healed. They can't be changed or removed once joined.
 */
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const logger = require("./logger");
const adminDashboard_1 = require("./adminDashboard");
const testAccounts_1 = require("./testAccounts");
const sentry_1 = require("./sentry");
const guestSessions_1 = require("./guestSessions");
const loginLinks_1 = require("./loginLinks");
const promotions_1 = require("./promotions");
const geo_1 = require("./geo");
const email_1 = require("./email");
const emailItems_1 = require("./emailItems");
const catalogInventory_1 = require("./catalogInventory");
const pilotRules_1 = require("./pilotRules");
const CATALOG_HOLIDAY = 'hanukkah';
const OPEN_ORDER_STATUSES = new Set(['committed', 'pending']);
const JOINED_STATUSES = new Set(['enrolled', 'awaiting_checkout']);
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
function str(v) {
    return typeof v === 'string' ? v : '';
}
function firstNameOf(name) {
    var _a;
    return (_a = name.trim().split(/\s+/)[0]) !== null && _a !== void 0 ? _a : '';
}
function pilotLink(token) {
    return `${(0, guestSessions_1.appOrigin)()}/pilot/${token}`;
}
function linesOf(raw) {
    return Array.isArray(raw) ? raw.filter((l) => l && typeof l === 'object') : [];
}
async function boxConfig(db) {
    var _a;
    const data = (_a = (await db.doc(`config/${catalogInventory_1.HOLIDAY_ID}`).get()).data()) !== null && _a !== void 0 ? _a : {};
    return {
        lockAt: typeof data.lockAt === 'string' ? data.lockAt : null,
        arrivesBy: typeof data.estimatedDeliveryBy === 'string' ? data.estimatedDeliveryBy : null,
    };
}
function isPast(iso) {
    return !!iso && Date.now() >= new Date(iso).getTime();
}
/** Approved ids in display order: adminConfig/pilotParticipants.itemIds when set, else the brief's nine. */
async function approvedItems(db) {
    var _a;
    const ids = (_a = (await db.doc('adminConfig/pilotParticipants').get()).data()) === null || _a === void 0 ? void 0 : _a.itemIds;
    if (!Array.isArray(ids) || !ids.length)
        return [...pilotRules_1.PILOT_DEFAULT_ITEMS];
    const names = new Map(pilotRules_1.PILOT_DEFAULT_ITEMS.map((i) => [i.id, i.name]));
    return ids
        .filter((id) => typeof id === 'string' && !!id)
        .map((id) => { var _a; return ({ id, name: (_a = names.get(id)) !== null && _a !== void 0 ? _a : '' }); });
}
/** Catalog rows with how many units are left for boxes (null = untracked). */
async function catalogRows(db, ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length)
        return new Map();
    const [items, inv] = await Promise.all([
        db.getAll(...unique.map((id) => db.doc(`catalog/${CATALOG_HOLIDAY}/items/${id}`))),
        db.getAll(...unique.map((id) => (0, catalogInventory_1.inventoryDocRef)(db, id))),
    ]);
    const rows = new Map();
    items.forEach((snap, i) => {
        var _a, _b, _c, _d, _e;
        if (!snap.exists)
            return;
        const d = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
        const thumbs = Array.isArray(d.imageThumbUrls) ? d.imageThumbUrls : [];
        const inventory = typeof d.inventory === 'number' && Number.isFinite(d.inventory) ? Math.floor(d.inventory) : null;
        const c = (0, catalogInventory_1.parseCounters)((_b = inv[i]) === null || _b === void 0 ? void 0 : _b.data());
        const used = ((_c = c.boxAllocatedQty) !== null && _c !== void 0 ? _c : 0) + ((_d = c.directReservedQty) !== null && _d !== void 0 ? _d : 0) + ((_e = c.directSoldQty) !== null && _e !== void 0 ? _e : 0);
        rows.set(snap.id, {
            id: snap.id,
            name: str(d.name) || snap.id,
            memberPriceCents: typeof d.memberPriceCents === 'number' ? Math.round(d.memberPriceCents) : 0,
            imageUrl: str(thumbs[0]) || str(d.imageUrl) || null,
            remaining: inventory == null ? null : inventory - used,
        });
    });
    return rows;
}
/** The household's draft and its open (committed or pending, not marketplace) Hanukkah box order. */
async function loadBox(db, householdId) {
    var _a;
    const draftRef = db.doc(`households/${householdId}/boxDrafts/${catalogInventory_1.HOLIDAY_ID}`);
    const [draftSnap, ordersSnap] = await Promise.all([
        draftRef.get(),
        db.collection(`households/${householdId}/orders`).where('holidayId', '==', catalogInventory_1.HOLIDAY_ID).get(),
    ]);
    const open = ordersSnap.docs
        .filter((d) => {
        var _a;
        const o = d.data();
        return OPEN_ORDER_STATUSES.has(str(o.status)) && ((_a = o.orderType) !== null && _a !== void 0 ? _a : 'hanukkah_box') === 'hanukkah_box';
    })
        .sort((a, b) => { var _a, _b, _c, _d; return ((_b = (_a = b.createTime) === null || _a === void 0 ? void 0 : _a.toMillis()) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = a.createTime) === null || _c === void 0 ? void 0 : _c.toMillis()) !== null && _d !== void 0 ? _d : 0); })[0];
    return {
        householdId,
        draftRef,
        draftLines: linesOf((_a = draftSnap.data()) === null || _a === void 0 ? void 0 : _a.lineItems),
        draftExists: draftSnap.exists,
        order: open ? { ref: open.ref, data: open.data() } : null,
    };
}
async function householdOf(db, uid) {
    var _a;
    const hh = str((_a = (await db.doc(`users/${uid}`).get()).data()) === null || _a === void 0 ? void 0 : _a.householdId);
    if (!hh)
        throw new sentry_1.HttpsError('failed-precondition', 'Your account isn’t set up yet. Build your box first.');
    return hh;
}
function boxItemsView(lines, rows) {
    var _a;
    const qty = new Map();
    for (const li of lines) {
        if ((0, pilotRules_1.isPilotLine)(li))
            continue;
        const id = str(li.itemId);
        if (!id)
            continue;
        qty.set(id, ((_a = qty.get(id)) !== null && _a !== void 0 ? _a : 0) + Math.max(1, Math.floor(Number(li.quantity) || 1)));
    }
    return [...qty.entries()].map(([itemId, quantity]) => {
        var _a, _b, _c, _d;
        return ({
            itemId,
            name: (_b = (_a = rows.get(itemId)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : itemId,
            imageUrl: (_d = (_c = rows.get(itemId)) === null || _c === void 0 ? void 0 : _c.imageUrl) !== null && _d !== void 0 ? _d : null,
            quantity,
        });
    });
}
function addressLine(order) {
    const a = order === null || order === void 0 ? void 0 : order.shippingAddress;
    if (!a)
        return null;
    const parts = [str(a.city), str(a.stateProvince)].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
}
// ---------------------------------------------------------------------------
// Enrollment lines: the source of truth for pilot lines on a box
// ---------------------------------------------------------------------------
async function enrollmentLines(db, householdId) {
    const e = (await db.doc(`pilotEnrollments/${householdId}`).get()).data();
    if (!e || !JOINED_STATUSES.has(str(e.status)))
        return null;
    return (Array.isArray(e.picks) ? e.picks : []).map(pilotRules_1.pilotLineFor);
}
/**
 * Box lines with the household's pilot lines merged in. Order sync and checkout call this on the
 * draft's lines so a client save can never drop or reprice them.
 */
async function withPilotLines(db, householdId, lines) {
    const pilot = await enrollmentLines(db, householdId);
    if (!pilot)
        return { lines, changed: false };
    return (0, pilotRules_1.mergePilotLines)(lines, pilot);
}
/** After checkout: an `awaiting_checkout` enrollment is now on a committed order. */
async function markPilotEnrollmentCommitted(db, householdId, orderId) {
    const ref = db.doc(`pilotEnrollments/${householdId}`);
    const e = (await ref.get()).data();
    if (!e || str(e.status) !== 'awaiting_checkout')
        return;
    const now = new Date().toISOString();
    await ref.update({ status: 'enrolled', orderId, enrolledAt: now, updatedAt: now });
    if (str(e.inviteToken)) {
        await db.doc(`pilotInvites/${e.inviteToken}`).update({ status: 'enrolled', enrolledAt: now }).catch(() => undefined);
    }
}
const AUTO_ACTOR = { uid: 'auto', email: 'auto' };
async function createInvite(db, actor, input, extra = {}) {
    var _a, _b;
    const email = (0, loginLinks_1.normalizeEmail)(input.email);
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
    if (!name)
        throw new sentry_1.HttpsError('invalid-argument', 'Enter their name.');
    const existing = await db.collection('pilotInvites').where('email', '==', email).get();
    const live = existing.docs.find((d) => str(d.data().status) !== 'cancelled');
    if (live)
        return { token: live.id, link: pilotLink(live.id), existing: true, accountCreated: false };
    const account = await (0, promotions_1.findOrCreateAccountByEmail)(db, email, firstNameOf(name) || null);
    const { lockAt } = await boxConfig(db);
    const token = (0, node_crypto_1.randomBytes)(16).toString('base64url');
    await db.doc(`pilotInvites/${token}`).create(Object.assign({ email,
        name, uid: account.uid, householdId: account.householdId, accountCreated: account.accountCreated, status: 'invited', expiresAt: lockAt, createdByUid: actor.uid, createdByEmail: actor.email, createdAt: new Date().toISOString(), source: (_a = extra.source) !== null && _a !== void 0 ? _a : 'manual' }, (typeof extra.jewishScore === 'number' ? { jewishScore: extra.jewishScore } : {})));
    logger.info('pilot invite created', { accountCreated: account.accountCreated, source: (_b = extra.source) !== null && _b !== void 0 ? _b : 'manual' });
    return { token, link: pilotLink(token), existing: false, accountCreated: account.accountCreated };
}
/** State / province label for admin (no street). Mirrors adminDashboard.locationOf, trimmed down. */
function adminLocationOf(addr) {
    if (!addr || typeof addr !== 'object')
        return null;
    const a = addr;
    const raw = typeof a.stateProvince === 'string' ? a.stateProvince.trim().replace(/\.|\s+/g, ' ').toUpperCase() : '';
    if (!raw)
        return null;
    const compact = raw.replace(/\s+/g, ' ');
    if (a.country === 'CA' || /\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|NT|NU|YT)\b/.test(compact)) {
        const m = compact.match(/\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|NT|NU|YT)\b/);
        return m ? `${m[1]}, Canada` : `${compact}, Canada`;
    }
    if (/^[A-Z]{2}$/.test(compact))
        return compact;
    if (a.country === 'OTHER')
        return `${compact} (intl)`;
    return compact.length <= 24 ? compact : compact.slice(0, 24);
}
function adminIpLocation(geo) {
    if (!geo || typeof geo !== 'object')
        return null;
    const g = geo;
    const country = str(g.country);
    const region = str(g.region);
    if (!country)
        return null;
    if (country === 'US')
        return region || 'US';
    if (country === 'CA')
        return region ? `${region}, Canada` : 'Canada';
    return country;
}
/** Address label known to be Canada / international (mirrors adminDashboard). */
const addressOutsideUs = (location) => Boolean(location && /(, Canada|\(intl\))$/.test(location));
function ipOutsideUs(geo) {
    const country = geo && typeof geo === 'object' ? str(geo.country) : '';
    return Boolean(country && country.toUpperCase() !== 'US');
}
function ageLabel(plannerAge) {
    if (typeof plannerAge !== 'number' || !Number.isFinite(plannerAge))
        return null;
    const n = Math.max(0, Math.floor(plannerAge));
    return n >= 18 ? '18+' : String(n);
}
/** Firestore Timestamp or ISO string → ISO, else null. */
function toIso(v) {
    if (!v)
        return null;
    if (typeof v === 'string')
        return v;
    if (typeof v.toDate === 'function') {
        try {
            return v.toDate().toISOString();
        }
        catch (_a) {
            return null;
        }
    }
    return null;
}
/** Chunked getAll — Firestore caps at 100 refs. */
async function getAllChunked(db, refs) {
    const out = [];
    for (let i = 0; i < refs.length; i += 100) {
        out.push(...(await db.getAll(...refs.slice(i, i + 100))));
    }
    return out;
}
async function listInvites(db) {
    var _a, _b, _c, _d, _e;
    const [invites, enrollments] = await Promise.all([
        db.collection('pilotInvites').orderBy('createdAt', 'desc').get(),
        db.collection('pilotEnrollments').get(),
    ]);
    const byToken = new Map(enrollments.docs.map((d) => [str(d.data().inviteToken), d.data()]));
    const householdIds = [
        ...new Set(invites.docs.map((d) => { var _a; return str(d.data().householdId) || str((_a = byToken.get(d.id)) === null || _a === void 0 ? void 0 : _a.householdId); }).filter(Boolean)),
    ];
    const uids = [...new Set(invites.docs.map((d) => str(d.data().uid)).filter(Boolean))];
    const [userSnaps, draftSnaps, childrenSnap, openOrdersSnap, itemSnaps] = await Promise.all([
        uids.length ? getAllChunked(db, uids.map((uid) => db.doc(`users/${uid}`))) : Promise.resolve([]),
        householdIds.length
            ? getAllChunked(db, householdIds.map((hid) => db.doc(`households/${hid}/boxDrafts/${catalogInventory_1.HOLIDAY_ID}`)))
            : Promise.resolve([]),
        uids.length ? db.collectionGroup('children').get() : Promise.resolve(null),
        householdIds.length
            ? db
                .collectionGroup('orders')
                // Index is status + holidayId (firestore.indexes.json).
                .where('status', 'in', [...OPEN_ORDER_STATUSES])
                .where('holidayId', '==', catalogInventory_1.HOLIDAY_ID)
                .get()
            : Promise.resolve(null),
        db.collection(`catalog/${CATALOG_HOLIDAY}/items`).select('name').get(),
    ]);
    const users = new Map(userSnaps.map((s) => { var _a; return [s.id, (_a = s.data()) !== null && _a !== void 0 ? _a : {}]; }));
    const drafts = new Map();
    for (const s of draftSnaps) {
        const hid = (_a = s.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (hid && s.exists)
            drafts.set(hid, (_b = s.data()) !== null && _b !== void 0 ? _b : {});
    }
    const kidAgesByUid = new Map();
    if (childrenSnap) {
        const want = new Set(uids);
        for (const d of childrenSnap.docs) {
            const owner = d.ref.parent.parent;
            if (!owner || owner.parent.id !== 'users' || !want.has(owner.id))
                continue;
            const age = ageLabel(d.data().plannerAge);
            if (age == null)
                continue;
            const n = age === '18+' ? 18 : Number(age);
            const list = (_c = kidAgesByUid.get(owner.id)) !== null && _c !== void 0 ? _c : [];
            list.push(n);
            kidAgesByUid.set(owner.id, list);
        }
    }
    for (const [, ages] of kidAgesByUid)
        ages.sort((a, b) => a - b);
    const orderByHousehold = new Map();
    if (openOrdersSnap) {
        const want = new Set(householdIds);
        for (const d of openOrdersSnap.docs) {
            const hid = (_d = d.ref.parent.parent) === null || _d === void 0 ? void 0 : _d.id;
            if (!hid || !want.has(hid))
                continue;
            const o = d.data();
            if (((_e = o.orderType) !== null && _e !== void 0 ? _e : 'hanukkah_box') !== 'hanukkah_box')
                continue;
            // Prefer committed over pending when both exist.
            const prev = orderByHousehold.get(hid);
            if (!prev || (str(prev.status) === 'pending' && str(o.status) === 'committed')) {
                orderByHousehold.set(hid, Object.assign(Object.assign({}, o), { _orderId: d.id }));
            }
        }
    }
    const itemName = new Map(itemSnaps.docs.map((d) => [d.id, str(d.data().name) || d.id]));
    const boxItemNames = (lines) => {
        var _a;
        const qty = new Map();
        for (const li of lines) {
            const id = str(li.itemId);
            if (!id)
                continue;
            const name = itemName.get(id) || str(li.label) || id;
            const prev = qty.get(id);
            const n = Math.max(1, Math.floor(Number(li.quantity) || 1));
            qty.set(id, { name, n: ((_a = prev === null || prev === void 0 ? void 0 : prev.n) !== null && _a !== void 0 ? _a : 0) + n });
        }
        return [...qty.values()].map(({ name, n }) => (n > 1 ? `${name} ×${n}` : name));
    };
    return invites.docs.map((d) => {
        var _a, _b;
        const i = d.data();
        const e = byToken.get(d.id);
        const picks = Array.isArray(e === null || e === void 0 ? void 0 : e.picks) ? e.picks : [];
        const householdId = str(i.householdId) || str(e === null || e === void 0 ? void 0 : e.householdId) || null;
        const uid = str(i.uid);
        const user = uid ? users.get(uid) : undefined;
        const last = ((_a = user === null || user === void 0 ? void 0 : user.lastBoxAnswers) !== null && _a !== void 0 ? _a : {});
        const jewishFromUser = scoreOf(last.practiceFrequencyScore);
        const jewishScore = typeof i.jewishScore === 'number' ? i.jewishScore : jewishFromUser;
        const hanukkahScore = scoreOf(last.familiarityScore);
        const order = householdId ? orderByHousehold.get(householdId) : undefined;
        const draft = householdId ? drafts.get(householdId) : undefined;
        const orderLines = order ? linesOf(order.lineItems) : [];
        const draftLines = draft ? linesOf(draft.lineItems) : [];
        const boxKind = order
            ? 'order'
            : draftLines.length
                ? 'draft'
                : 'none';
        const boxItems = boxItemNames(orderLines.length ? orderLines : draftLines);
        const email = str(i.email);
        const name = str(i.name);
        const addr = order === null || order === void 0 ? void 0 : order.shippingAddress;
        const fromAddr = adminLocationOf(addr);
        const fromIp = adminIpLocation(user === null || user === void 0 ? void 0 : user.ipGeo);
        const location = fromAddr || fromIp || null;
        const locationFromIp = !fromAddr && !!fromIp;
        const outsideUs = fromAddr ? addressOutsideUs(fromAddr) : fromIp ? ipOutsideUs(user === null || user === void 0 ? void 0 : user.ipGeo) : false;
        const ages = uid ? (_b = kidAgesByUid.get(uid)) !== null && _b !== void 0 ? _b : [] : [];
        const kidAges = ages.map((n) => (n >= 18 ? '18+' : String(n)));
        return {
            token: d.id,
            link: pilotLink(d.id),
            email,
            name,
            status: str(e === null || e === void 0 ? void 0 : e.status) || str(i.status) || 'invited',
            accountCreated: i.accountCreated === true,
            /** When the Firebase/user account was created (not the invite). */
            accountCreatedAt: toIso(user === null || user === void 0 ? void 0 : user.createdAt),
            createdAt: str(i.createdAt),
            createdByEmail: str(i.createdByEmail),
            source: (i.source === 'auto' ? 'auto' : 'manual'),
            jewishScore,
            hanukkahScore,
            householdId,
            location,
            locationFromIp,
            /** Team / QA email (isTest). */
            test: (0, testAccounts_1.isTest)(email, name),
            /** Ship-to or IP known outside the US. Missing location counts as US. */
            outsideUs,
            kidAges,
            boxKind,
            boxItems,
            emailedAt: str(i.emailedAt) || null,
            followUpAt: str(i.followUpAt) || null,
            openedAt: str(i.openedAt) || null,
            enrolledAt: str(e === null || e === void 0 ? void 0 : e.enrolledAt) || null,
            joinedAt: str(e === null || e === void 0 ? void 0 : e.createdAt) || null,
            picks: picks.map((p) => p.name),
            deferredTotalCents: typeof (e === null || e === void 0 ? void 0 : e.deferredTotalCents) === 'number' ? e.deferredTotalCents : 0,
            quoteConsent: (e === null || e === void 0 ? void 0 : e.quoteConsent) === true,
            orderId: str(e === null || e === void 0 ? void 0 : e.orderId) || str(order === null || order === void 0 ? void 0 : order._orderId) || null,
        };
    });
}
async function cancelInvite(db, input) {
    const token = str(input.token);
    if (!TOKEN_RE.test(token))
        throw new sentry_1.HttpsError('invalid-argument', 'Invite not found.');
    const ref = db.doc(`pilotInvites/${token}`);
    const invite = (await ref.get()).data();
    if (!invite)
        throw new sentry_1.HttpsError('not-found', 'Invite not found.');
    const joined = await db.collection('pilotEnrollments').where('inviteToken', '==', token).limit(1).get();
    if (!joined.empty)
        throw new sentry_1.HttpsError('failed-precondition', 'They’ve already joined, so the invite can’t be cancelled.');
    await ref.update({ status: 'cancelled', cancelledAt: new Date().toISOString() });
    return { ok: true };
}
/** Ticks or clears "Emailed" (`emailedAt`) or "Follow-up sent" (`followUpAt`) on an invite. */
async function markSent(db, actor, input, field) {
    const token = str(input.token);
    if (!TOKEN_RE.test(token))
        throw new sentry_1.HttpsError('invalid-argument', 'Invite not found.');
    const ref = db.doc(`pilotInvites/${token}`);
    if (!(await ref.get()).exists)
        throw new sentry_1.HttpsError('not-found', 'Invite not found.');
    const at = new Date().toISOString();
    await ref.update(input.done === true
        ? { [`${field}At`]: at, [`${field}ByEmail`]: actor.email }
        : { [`${field}At`]: firestore_2.FieldValue.delete(), [`${field}ByEmail`]: firestore_2.FieldValue.delete() });
    return { ok: true, at: input.done === true ? at : null };
}
const scoreOf = (v) => typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(100, v))) : null;
/**
 * Invites every family that qualifies (pilotRules.isAutoInviteEligible): Jewish practice at or
 * under 59 (a 50 is kept only when Hanukkah is also answered and under 60), a
 * real first name and an email, a Hanukkah draft with items and no checked-out box. Anyone with an
 * invite already (cancelled included) or an enrollment is left alone. Stops once the box locks.
 * Scores and names are read the way the Boxes dashboard reads them (adminDashboard.ts).
 */
async function runPilotAutoInvites(db, opts = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const dryRun = opts.dryRun === true;
    const { lockAt } = await boxConfig(db);
    if (isPast(lockAt))
        return { dryRun, locked: true, created: 0, families: [] };
    const [draftsSnap, ordersSnap, invitesSnap, enrollSnap, guestSnap] = await Promise.all([
        db.collectionGroup('boxDrafts').get(),
        db.collectionGroup('orders').select('orderType', 'holidayId', 'status', 'playthrough').get(),
        db.collection('pilotInvites').select('email', 'householdId').get(),
        db.collection('pilotEnrollments').select().get(),
        db.collection('guestSessions').select('convertedUid', 'snapshot.guest').get(),
    ]);
    const committed = new Set();
    for (const d of ordersSnap.docs) {
        const o = d.data();
        const hid = (_a = d.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        const isBox = o.orderType === 'hanukkah_box' || (!o.orderType && o.holidayId === catalogInventory_1.HOLIDAY_ID);
        if (hid && isBox && o.playthrough !== true && ['committed', 'confirmed', 'shipped', 'delivered'].includes(o.status)) {
            committed.add(hid);
        }
    }
    const invitedEmails = new Set(invitesSnap.docs.map((d) => str(d.data().email).toLowerCase()).filter(Boolean));
    const invitedHouseholds = new Set([
        ...invitesSnap.docs.map((d) => str(d.data().householdId)).filter(Boolean),
        ...enrollSnap.docs.map((d) => d.id),
    ]);
    const drafts = new Map();
    for (const d of draftsSnap.docs) {
        const hh = d.ref.parent.parent;
        if (d.id !== catalogInventory_1.HOLIDAY_ID || !hh || hh.parent.id !== 'households')
            continue;
        const x = d.data();
        if (!linesOf(x.lineItems).length || committed.has(hh.id) || invitedHouseholds.has(hh.id))
            continue;
        drafts.set(hh.id, x);
    }
    if (!drafts.size)
        return { dryRun, locked: false, created: 0, families: [] };
    const hhSnaps = await db.getAll(...[...drafts.keys()].map((hid) => db.doc(`households/${hid}`)));
    const ownerByHousehold = new Map();
    for (const s of hhSnaps) {
        const ownerId = str((_b = s.data()) === null || _b === void 0 ? void 0 : _b.ownerId);
        if (ownerId)
            ownerByHousehold.set(s.id, { ownerId, playthrough: ((_c = s.data()) === null || _c === void 0 ? void 0 : _c.playthrough) === true });
    }
    const ownerIds = [...new Set([...ownerByHousehold.values()].map((o) => o.ownerId))];
    const userSnaps = ownerIds.length ? await db.getAll(...ownerIds.map((uid) => db.doc(`users/${uid}`))) : [];
    const userById = new Map(userSnaps.map((s) => { var _a; return [s.id, (_a = s.data()) !== null && _a !== void 0 ? _a : {}]; }));
    // Some profiles lack email/displayName; the Auth record still has them.
    const authByUid = new Map();
    const needAuth = ownerIds.filter((uid) => { var _a, _b; return !str((_a = userById.get(uid)) === null || _a === void 0 ? void 0 : _a.email) || !str((_b = userById.get(uid)) === null || _b === void 0 ? void 0 : _b.displayName); });
    for (let i = 0; i < needAuth.length; i += 100) {
        const { users } = await (0, auth_1.getAuth)().getUsers(needAuth.slice(i, i + 100).map((uid) => ({ uid })));
        for (const r of users)
            authByUid.set(r.uid, { email: (_d = r.email) !== null && _d !== void 0 ? _d : null, name: (_e = r.displayName) !== null && _e !== void 0 ? _e : null });
    }
    // Slider answers from a converted guest session fill in for accounts with no saved lastBoxAnswers.
    const guestScores = new Map();
    for (const d of guestSnap.docs) {
        const x = d.data();
        const uid = str(x.convertedUid);
        const guest = (_f = x.snapshot) === null || _f === void 0 ? void 0 : _f.guest;
        const s = guest ? scoreOf(guest.practiceFrequencyScore) : null;
        if (uid && guest && s != null && (0, adminDashboard_1.guestAnsweredSliders)(guest)) {
            guestScores.set(uid, { jewish: s, hanukkah: scoreOf(guest.familiarityScore) });
        }
    }
    const families = [];
    for (const [hid, draft] of drafts) {
        const owner = ownerByHousehold.get(hid);
        if (!owner)
            continue;
        const u = (_g = userById.get(owner.ownerId)) !== null && _g !== void 0 ? _g : {};
        const auth = authByUid.get(owner.ownerId);
        const email = (str(u.email) || (auth === null || auth === void 0 ? void 0 : auth.email) || '').trim().toLowerCase() || null;
        const name = (str(u.displayName) || (auth === null || auth === void 0 ? void 0 : auth.name) || '').trim() || null;
        const savedPractice = scoreOf((_h = u.lastBoxAnswers) === null || _h === void 0 ? void 0 : _h.practiceFrequencyScore);
        const guest = guestScores.get(owner.ownerId);
        const jewish = (_j = savedPractice !== null && savedPractice !== void 0 ? savedPractice : guest === null || guest === void 0 ? void 0 : guest.jewish) !== null && _j !== void 0 ? _j : null;
        const hanukkah = savedPractice != null ? scoreOf((_k = u.lastBoxAnswers) === null || _k === void 0 ? void 0 : _k.familiarityScore) : ((_l = guest === null || guest === void 0 ? void 0 : guest.hanukkah) !== null && _l !== void 0 ? _l : null);
        const eligible = (0, pilotRules_1.isAutoInviteEligible)({
            jewish,
            hanukkah,
            email,
            name,
            hasDraftLines: true,
            committed: false,
            playthrough: owner.playthrough || draft.playthrough === true,
            isTest: (0, testAccounts_1.isTest)(email),
            alreadyInvited: !!email && invitedEmails.has(email),
        });
        if (eligible && !families.some((f) => f.email === email)) {
            families.push({ email: email, name: name, jewishScore: jewish, householdId: hid });
        }
    }
    let created = 0;
    if (!dryRun) {
        for (const f of families) {
            try {
                const r = await createInvite(db, AUTO_ACTOR, { email: f.email, name: f.name }, { source: 'auto', jewishScore: f.jewishScore });
                if (!r.existing)
                    created += 1;
            }
            catch (err) {
                logger.error('pilot auto invite failed', { householdId: f.householdId, err: String(err) });
            }
        }
    }
    logger.info('pilot auto invites', { dryRun, eligible: families.length, created });
    return { dryRun, locked: false, created, families };
}
exports.adminPilotParticipants = (0, sentry_1.onCall)(async (request) => {
    var _a, _b;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid) || !(0, guestSessions_1.isAdminToken)(request.auth.token)) {
        throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
    }
    const actor = {
        uid: request.auth.uid,
        email: typeof request.auth.token.email === 'string' ? request.auth.token.email : '',
    };
    const input = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const db = (0, firestore_2.getFirestore)();
    switch (input.action) {
        case 'list':
            return { invites: await listInvites(db) };
        case 'createInvite':
            return createInvite(db, actor, input);
        case 'cancelInvite':
            return cancelInvite(db, input);
        case 'markEmailed':
            return markSent(db, actor, input, 'emailed');
        case 'markFollowUp':
            return markSent(db, actor, input, 'followUp');
        case 'autoInvite': {
            const r = await runPilotAutoInvites(db, { dryRun: input.dryRun === true });
            return { dryRun: r.dryRun, locked: r.locked, created: r.created, eligible: r.families.length };
        }
        default:
            throw new sentry_1.HttpsError('invalid-argument', 'Unknown action.');
    }
});
// ---------------------------------------------------------------------------
// The enroll page
// ---------------------------------------------------------------------------
async function liveInvite(db, token) {
    if (!TOKEN_RE.test(token))
        return null;
    const ref = db.doc(`pilotInvites/${token}`);
    const snap = await ref.get();
    const data = snap.data();
    if (!data || str(data.status) === 'cancelled')
        return null;
    return { ref, data };
}
function inviteMatches(invite, auth) {
    const email = typeof auth.token.email === 'string' ? auth.token.email.trim().toLowerCase() : '';
    return auth.uid === str(invite.uid) || (!!email && email === str(invite.email));
}
function joinedView(e, rows) {
    const picks = (Array.isArray(e.picks) ? e.picks : []).map((p) => {
        var _a, _b;
        return ({
            itemId: p.itemId,
            name: p.name,
            deferredChargeCents: p.deferredChargeCents,
            imageUrl: (_b = (_a = rows.get(p.itemId)) === null || _a === void 0 ? void 0 : _a.imageUrl) !== null && _b !== void 0 ? _b : null,
        });
    });
    return {
        status: str(e.status),
        picks,
        totalCents: typeof e.deferredTotalCents === 'number' ? e.deferredTotalCents : 0,
    };
}
/**
 * Everything the /pilot/:token page needs. Signed out it only says whose invite it is; an unknown,
 * cancelled or expired token says nothing about the program.
 */
exports.getPilotInvite = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    const db = (0, firestore_2.getFirestore)();
    const token = str((_a = request.data) === null || _a === void 0 ? void 0 : _a.token).trim();
    if (!((_b = request.auth) === null || _b === void 0 ? void 0 : _b.uid))
        await (0, loginLinks_1.enforceRateLimits)(db, null, request.rawRequest, 'pilot:');
    const invite = await liveInvite(db, token);
    if (!invite)
        return { state: 'unavailable' };
    const firstName = firstNameOf(str(invite.data.name));
    const maskedEmail = (0, pilotRules_1.maskEmail)(str(invite.data.email));
    const { lockAt, arrivesBy } = await boxConfig(db);
    const dates = { lockAt, arrivesBy, surveyDueLabel: pilotRules_1.PILOT_SURVEY_DUE_LABEL };
    if (str(invite.data.status) === 'invited') {
        await invite.ref.update({ status: 'opened', openedAt: new Date().toISOString() }).catch(() => undefined);
    }
    if (!((_c = request.auth) === null || _c === void 0 ? void 0 : _c.uid)) {
        if (isPast(lockAt) || isPast(str(invite.data.expiresAt) || null))
            return { state: 'closed', firstName };
        return { state: 'sign_in', firstName, maskedEmail, dates };
    }
    if (!inviteMatches(invite.data, request.auth)) {
        return { state: 'wrong_account', firstName, maskedEmail };
    }
    const householdId = await householdOf(db, request.auth.uid);
    const [enrollment, box, approved] = await Promise.all([
        db.doc(`pilotEnrollments/${householdId}`).get(),
        loadBox(db, householdId),
        approvedItems(db),
    ]);
    const boxLines = box.order ? linesOf(box.order.data.lineItems) : box.draftLines;
    const rows = await catalogRows(db, [...approved.map((a) => a.id), ...boxLines.map((l) => str(l.itemId))]);
    const hh = (_d = (await db.doc(`households/${householdId}`).get()).data()) !== null && _d !== void 0 ? _d : {};
    const boxView = {
        kind: box.order ? 'order' : boxLines.some((l) => !(0, pilotRules_1.isPilotLine)(l)) ? 'draft' : 'none',
        items: boxItemsView(boxLines, rows),
        address: addressLine((_e = box.order) === null || _e === void 0 ? void 0 : _e.data),
        cardOnFile: !!hh.cardOnFileAt,
    };
    const e = enrollment.data();
    if (e && JOINED_STATUSES.has(str(e.status))) {
        return { state: 'joined', firstName, dates, box: boxView, enrollment: joinedView(e, rows) };
    }
    if (isPast(lockAt) || isPast(str(invite.data.expiresAt) || null))
        return { state: 'closed', firstName };
    const inBox = new Set(boxLines.filter((l) => !(0, pilotRules_1.isPilotLine)(l)).map((l) => str(l.itemId)));
    const items = approved
        .map((a) => ({ a, row: rows.get(a.id) }))
        .filter(({ row }) => row && row.memberPriceCents > 0 && (row.remaining == null || row.remaining > 0))
        .map(({ a, row }) => ({
        id: a.id,
        name: a.name || row.name,
        memberPriceCents: row.memberPriceCents,
        imageUrl: row.imageUrl,
        inBox: inBox.has(a.id),
    }));
    return { state: 'ready', firstName, dates, box: boxView, items, pickCount: pilotRules_1.PILOT_PICK_COUNT };
});
/**
 * Join: three approved picks, the agreement as shown, a typed name. Adds the pilot lines to the
 * committed order (and draft) when there is one, else to the draft for checkout. No backing out.
 */
exports.enrollPilot = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in to join.');
    const db = (0, firestore_2.getFirestore)();
    const input = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const token = str(input.token).trim();
    const invite = await liveInvite(db, token);
    if (!invite)
        throw new sentry_1.HttpsError('not-found', 'This invitation isn’t available.');
    if (!inviteMatches(invite.data, request.auth)) {
        throw new sentry_1.HttpsError('permission-denied', `This invitation is for ${(0, pilotRules_1.maskEmail)(str(invite.data.email))}. Sign in with that email to continue.`);
    }
    const { lockAt } = await boxConfig(db);
    if (isPast(lockAt) || isPast(str(invite.data.expiresAt) || null)) {
        throw new sentry_1.HttpsError('failed-precondition', 'Sign-up closed when boxes locked.');
    }
    const typedName = typeof input.typedName === 'string' ? input.typedName.trim().slice(0, 120) : '';
    if (typedName.length < 2)
        throw new sentry_1.HttpsError('invalid-argument', 'Type your full name to sign.');
    if (input.agreed !== true)
        throw new sentry_1.HttpsError('invalid-argument', 'Check “I agree” to join.');
    const pickIds = Array.isArray(input.itemIds) ? input.itemIds.map((v) => str(v)).filter(Boolean) : [];
    const householdId = await householdOf(db, uid);
    const enrollmentRef = db.doc(`pilotEnrollments/${householdId}`);
    if ((await enrollmentRef.get()).exists) {
        throw new sentry_1.HttpsError('already-exists', 'Your household has already joined the pilot.');
    }
    const [box, approved] = await Promise.all([loadBox(db, householdId), approvedItems(db)]);
    const boxLines = box.order ? linesOf(box.order.data.lineItems) : box.draftLines;
    if (!box.order && !box.draftLines.some((l) => !(0, pilotRules_1.isPilotLine)(l))) {
        throw new sentry_1.HttpsError('failed-precondition', 'You’ll need a Hanukkah box to join, since your picks ship inside it.');
    }
    if (box.order && isPast(str(box.order.data.lockAt) || lockAt)) {
        throw new sentry_1.HttpsError('failed-precondition', 'Your box has locked, so it can’t take new items.');
    }
    const rows = await catalogRows(db, approved.map((a) => a.id));
    const nameOf = (id) => { var _a, _b; return ((_a = approved.find((a) => a.id === id)) === null || _a === void 0 ? void 0 : _a.name) || ((_b = rows.get(id)) === null || _b === void 0 ? void 0 : _b.name) || id; };
    const problem = (0, pilotRules_1.pickProblem)(pickIds, approved.map((a) => a.id), [...boxLines, ...box.draftLines], nameOf);
    if (problem)
        throw new sentry_1.HttpsError('invalid-argument', problem);
    const picks = pickIds.map((id) => {
        const row = rows.get(id);
        if (!row || row.memberPriceCents <= 0)
            throw new sentry_1.HttpsError('invalid-argument', `${nameOf(id)} isn’t available. Pick something else.`);
        return { itemId: id, name: nameOf(id), deferredChargeCents: row.memberPriceCents };
    });
    const text = (0, pilotRules_1.pilotAgreementText)(picks);
    if (str(input.agreementText) !== text) {
        throw new sentry_1.HttpsError('failed-precondition', 'The agreement changed while you were reading. Refresh the page and sign again.');
    }
    const pilotLines = picks.map(pilotRules_1.pilotLineFor);
    const playthrough = ((_c = box.order) === null || _c === void 0 ? void 0 : _c.data.playthrough) === true;
    if (box.order && !playthrough) {
        const prior = linesOf(box.order.data.lineItems);
        await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, (0, pilotRules_1.mergePilotLines)(prior, pilotLines).lines, { creditLines: prior });
    }
    else if (!box.order) {
        await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, pilotLines);
    }
    const now = new Date().toISOString();
    const status = box.order ? 'enrolled' : 'awaiting_checkout';
    const deferredTotalCents = picks.reduce((s, p) => s + p.deferredChargeCents, 0);
    const headers = (_e = (_d = request.rawRequest) === null || _d === void 0 ? void 0 : _d.headers) !== null && _e !== void 0 ? _e : {};
    await db.runTransaction(async (tx) => {
        var _a, _b, _c, _d, _e, _f;
        const [existing, draftSnap, orderSnap] = await Promise.all([
            tx.get(enrollmentRef),
            tx.get(box.draftRef),
            box.order ? tx.get(box.order.ref) : Promise.resolve(null),
        ]);
        if (existing.exists)
            throw new sentry_1.HttpsError('already-exists', 'Your household has already joined the pilot.');
        if (orderSnap && !OPEN_ORDER_STATUSES.has(str((_a = orderSnap.data()) === null || _a === void 0 ? void 0 : _a.status))) {
            throw new sentry_1.HttpsError('failed-precondition', 'Your box order changed. Refresh and try again.');
        }
        tx.create(enrollmentRef, {
            householdId,
            uid,
            email: str(invite.data.email),
            name: str(invite.data.name),
            inviteToken: token,
            status,
            orderId: (_c = (_b = box.order) === null || _b === void 0 ? void 0 : _b.ref.id) !== null && _c !== void 0 ? _c : null,
            picks,
            deferredTotalCents,
            surveyDueAt: pilotRules_1.PILOT_SURVEY_DUE_AT,
            agreement: {
                text,
                hash: (0, pilotRules_1.agreementHash)(text),
                version: pilotRules_1.PILOT_AGREEMENT_VERSION,
                typedName,
                agreedAt: now,
                ip: (_d = (0, geo_1.requestIp)(request.rawRequest)) !== null && _d !== void 0 ? _d : null,
                userAgent: str(headers['user-agent']).slice(0, 300) || null,
            },
            quoteConsent: input.quoteConsent === true,
            createdAt: now,
            enrolledAt: box.order ? now : null,
            updatedAt: now,
        });
        tx.update(invite.ref, Object.assign({ status: box.order ? 'enrolled' : 'joined', householdId, joinedAt: now }, (box.order ? { enrolledAt: now } : {})));
        if (draftSnap.exists) {
            tx.update(box.draftRef, {
                lineItems: (0, pilotRules_1.mergePilotLines)(linesOf((_e = draftSnap.data()) === null || _e === void 0 ? void 0 : _e.lineItems), pilotLines).lines,
                updatedAt: now,
                lastChangeSource: 'pilot',
            });
        }
        if (orderSnap) {
            tx.update(orderSnap.ref, {
                lineItems: (0, pilotRules_1.mergePilotLines)(linesOf((_f = orderSnap.data()) === null || _f === void 0 ? void 0 : _f.lineItems), pilotLines).lines,
                updatedAt: now,
            });
        }
    });
    if (box.order && !playthrough) {
        try {
            await (0, catalogInventory_1.recomputeBoxAllocations)(db);
        }
        catch (err) {
            logger.error('enrollPilot recomputeBoxAllocations failed', { householdId, err });
        }
    }
    logger.info('pilot enrolled', { householdId, status, deferredTotalCents });
    return { status, picks, totalCents: deferredTotalCents };
});
// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------
/** A draft save that dropped or edited pilot lines gets them back (skips empty and deleted drafts). */
exports.healPilotDraftLines = (0, firestore_1.onDocumentWritten)({ document: `households/{householdId}/boxDrafts/${catalogInventory_1.HOLIDAY_ID}`, memory: '256MiB' }, (0, sentry_1.withSentry)(async (event) => {
    var _a, _b;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    if (!(after === null || after === void 0 ? void 0 : after.exists))
        return;
    const lines = linesOf((_b = after.data()) === null || _b === void 0 ? void 0 : _b.lineItems);
    if (!lines.some((l) => !(0, pilotRules_1.isPilotLine)(l)))
        return;
    const db = (0, firestore_2.getFirestore)();
    const merged = await withPilotLines(db, event.params.householdId, lines);
    if (!merged.changed)
        return;
    await after.ref.update({ lineItems: merged.lines, lastChangeSource: 'pilot', updatedAt: new Date().toISOString() });
    logger.info('pilot lines restored on draft', { householdId: event.params.householdId });
}));
/** "You're in" email, once, when an enrollment reaches `enrolled`. */
exports.sendPilotJoinedEmail = (0, firestore_1.onDocumentWritten)({ document: 'pilotEnrollments/{householdId}', memory: '512MiB' }, (0, sentry_1.withSentry)(async (event) => {
    var _a, _b;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    const e = (after === null || after === void 0 ? void 0 : after.exists) ? after.data() : undefined;
    if (!after || !e || str(e.status) !== 'enrolled' || e.confirmationEmail)
        return;
    const db = (0, firestore_2.getFirestore)();
    const { lockAt, arrivesBy } = await boxConfig(db);
    const picks = Array.isArray(e.picks) ? e.picks : [];
    const rows = await catalogRows(db, picks.map((p) => p.itemId));
    let result = 'skipped';
    try {
        const items = await Promise.all(picks.map(async (p) => {
            var _a, _b, _c;
            const cat = (_a = (await db.doc(`catalog/${CATALOG_HOLIDAY}/items/${p.itemId}`).get()).data()) !== null && _a !== void 0 ? _a : {};
            const image = await (0, emailItems_1.catalogEmailImage)(p.itemId, cat, 'primary').catch(() => null);
            return {
                name: p.name,
                value: (0, pilotRules_1.formatPilotDollars)(p.deferredChargeCents),
                image_url: (_c = image !== null && image !== void 0 ? image : (_b = rows.get(p.itemId)) === null || _b === void 0 ? void 0 : _b.imageUrl) !== null && _c !== void 0 ? _c : null,
                caption: str(cat.category),
                url: `${(0, guestSessions_1.appOrigin)()}/product/${encodeURIComponent(p.itemId)}?utm_source=email&utm_medium=transactional&utm_campaign=pilot_joined`,
            };
        }));
        result = await (0, email_1.sendEmail)({
            to: str(e.email),
            template: 'pilot-joined',
            data: {
                first_name: firstNameOf(str(e.name)),
                items,
                total: (0, pilotRules_1.formatPilotDollars)(Number(e.deferredTotalCents) || 0),
                lock_date: lockAt,
                arrives_by: arrivesBy,
                lock_label: (0, pilotRules_1.formatPilotDay)(lockAt) || 'Nov 7',
                arrives_label: (0, pilotRules_1.formatPilotDay)(arrivesBy) || 'Nov 21',
                survey_date: 'December 13',
                survey_due: pilotRules_1.PILOT_SURVEY_DUE_LABEL,
                agreement_text: str((_b = e.agreement) === null || _b === void 0 ? void 0 : _b.text),
                pilot_url: str(e.inviteToken) ? pilotLink(str(e.inviteToken)) : (0, guestSessions_1.appOrigin)(),
            },
        });
    }
    catch (err) {
        result = 'failed';
        logger.error('pilot joined email failed', { householdId: event.params.householdId, err: String(err) });
    }
    await after.ref.update({ confirmationEmail: result, confirmationEmailAt: new Date().toISOString() });
}));
//# sourceMappingURL=pilotParticipants.js.map