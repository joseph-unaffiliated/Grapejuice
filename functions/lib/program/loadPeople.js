"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadProgramPeople = loadProgramPeople;
const guestSessions_1 = require("../guestSessions");
const testAccounts_1 = require("../testAccounts");
const decideNext_1 = require("./decideNext");
const HOLIDAY = 'hanukkah-2026';
const LAUNCH = '2026-10-22T14:00:00.000Z';
const JOINED = new Set(['enrolled', 'awaiting_checkout']);
const COMMITTED = new Set(['committed', 'confirmed', 'shipped', 'delivered']);
function iso(v) {
    if (typeof v === 'string' && !Number.isNaN(Date.parse(v)))
        return v;
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
        const d = v.toDate();
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (v && typeof v === 'object' && typeof v._seconds === 'number') {
        return new Date(v._seconds * 1000).toISOString();
    }
    return null;
}
function itemCount(lineItems) {
    if (!Array.isArray(lineItems))
        return 0;
    return lineItems.reduce((sum, line) => {
        const qty = line && typeof line === 'object' ? line.quantity : 0;
        return sum + (typeof qty === 'number' && qty > 0 ? qty : 0);
    }, 0);
}
function asSends(raw) {
    if (!Array.isArray(raw))
        return [];
    const stages = new Set([
        'swap', 'lock_t7', 'lock_t3', 'lock_t1', 'abandoner', 'pilot_invite', 'pilot_d3', 'pilot_d7',
        'd1', 'd4', 'd8', 'wave2', 'low_stock', 'survey',
    ]);
    return raw.flatMap((row) => {
        if (!row || typeof row !== 'object')
            return [];
        const stage = row.stage;
        const at = row.at;
        if (typeof stage !== 'string' || !stages.has(stage) || typeof at !== 'string')
            return [];
        return [Object.assign({ stage: stage, at, marketing: row.marketing === true }, (row.skipped === true ? { skipped: true } : {}))];
    });
}
async function loadProgramPeople(db, now, opts = {}) {
    var _a, _b, _c, _d;
    const [users, households, drafts, invites, enrollments, orders, logs, overrides, funnels, guests] = await Promise.all([
        db.collection('users').select('email', 'householdId').get(),
        db.collection('households').select('ownerId', 'stripeCustomerId', 'cardOnFileAt', 'stripeDefaultPaymentMethodId').get(),
        db.collectionGroup('boxDrafts').select('lineItems', 'updatedAt', 'createdAt').get(),
        db.collection('pilotInvites').select('email', 'status', 'householdId', 'emailedAt', 'followUpAt', 'd7At').get(),
        db.collection('pilotEnrollments').select('status').get(),
        db.collectionGroup('orders').select('status', 'holidayId').get(),
        db.collection('messageLog').select('sends').get(),
        db.collection('programOverrides').select('trackOverride', 'stopped').get(),
        db.collection('checkoutFunnel').select('steps', 'uid', 'householdId').get(),
        db.collection('guestSessions').select('gateEmailHash', 'lastLeadEmailHash', 'lineItems', 'updatedAt', 'createdAt').get(),
    ]);
    const userById = new Map(users.docs.map((d) => [d.id, d.data()]));
    const emailByHousehold = new Map();
    for (const h of households.docs) {
        const ownerId = h.data().ownerId;
        const email = typeof ownerId === 'string' ? (_a = userById.get(ownerId)) === null || _a === void 0 ? void 0 : _a.email : null;
        if (typeof email === 'string' && email.includes('@'))
            emailByHousehold.set(h.id, email.trim().toLowerCase());
    }
    for (const u of users.docs) {
        const hid = u.data().householdId;
        const email = u.data().email;
        if (typeof hid === 'string' && typeof email === 'string' && email.includes('@') && !emailByHousehold.has(hid)) {
            emailByHousehold.set(hid, email.trim().toLowerCase());
        }
    }
    const committed = new Set();
    for (const o of orders.docs) {
        const hh = o.ref.parent.parent;
        if ((hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households')
            continue;
        const status = o.data().status;
        const holiday = o.data().holidayId;
        if (holiday === HOLIDAY && typeof status === 'string' && COMMITTED.has(status))
            committed.add(hh.id);
    }
    const paymentHouseholds = new Set();
    for (const h of households.docs) {
        const d = h.data();
        if (d.stripeCustomerId || d.cardOnFileAt || d.stripeDefaultPaymentMethodId)
            paymentHouseholds.add(h.id);
    }
    for (const f of funnels.docs) {
        const steps = f.data().steps;
        const reached = steps && typeof steps === 'object' && ('payment' in steps || 'card' in steps);
        const bought = steps && typeof steps === 'object' && 'purchased' in steps;
        if (!reached || bought)
            continue;
        const hid = f.data().householdId;
        if (typeof hid === 'string')
            paymentHouseholds.add(hid);
    }
    const recentAbandon = new Set();
    const nowMs = now.getTime();
    for (const f of funnels.docs) {
        const steps = f.data().steps;
        const at = (_b = steps === null || steps === void 0 ? void 0 : steps.payment) !== null && _b !== void 0 ? _b : steps === null || steps === void 0 ? void 0 : steps.card;
        const bought = Boolean(steps === null || steps === void 0 ? void 0 : steps.purchased);
        if (!at || bought)
            continue;
        const age = nowMs - Date.parse(at);
        if (age >= 2 * 60 * 60 * 1000 && age <= 24 * 60 * 60 * 1000) {
            const hid = f.data().householdId;
            if (typeof hid === 'string')
                recentAbandon.add(hid);
        }
    }
    const inviteByEmail = new Map();
    for (const inv of invites.docs) {
        const email = typeof inv.data().email === 'string' ? inv.data().email.trim().toLowerCase() : '';
        if (!email.includes('@'))
            continue;
        inviteByEmail.set(email, {
            token: inv.id,
            status: typeof inv.data().status === 'string' ? inv.data().status : '',
            emailedAt: iso(inv.data().emailedAt),
            followUpAt: iso(inv.data().followUpAt),
            d7At: iso(inv.data().d7At),
            householdId: typeof inv.data().householdId === 'string' ? inv.data().householdId : null,
        });
    }
    const enrolledHouseholds = new Set();
    for (const e of enrollments.docs) {
        const status = e.data().status;
        if (typeof status === 'string' && JOINED.has(status))
            enrolledHouseholds.add(e.id);
    }
    const sendsByKey = new Map(logs.docs.map((d) => [d.id, asSends(d.data().sends)]));
    const overrideByKey = new Map(overrides.docs.map((d) => [d.id, d.data()]));
    const people = new Map();
    const linesByHousehold = new Map();
    for (const d of drafts.docs) {
        const hh = d.ref.parent.parent;
        if (d.id !== HOLIDAY || (hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households')
            continue;
        const lines = d.data().lineItems;
        if (Array.isArray(lines))
            linesByHousehold.set(hh.id, lines);
    }
    const consider = (email, householdId, draftUpdated, draftCreated, fromGuest, guest) => {
        var _a, _b, _c, _d, _e, _f;
        const normalized = email.trim().toLowerCase();
        if (!normalized.includes('@') || (0, testAccounts_1.isTest)(normalized))
            return;
        const personKey = (0, guestSessions_1.emailHash)(normalized);
        if (people.has(personKey))
            return;
        const invite = inviteByEmail.get(normalized);
        const enrolled = Boolean(householdId && enrolledHouseholds.has(householdId));
        const override = overrideByKey.get(personKey);
        const stopped = Boolean(householdId && committed.has(householdId)) ||
            (override === null || override === void 0 ? void 0 : override.stopped) === true ||
            ((_a = opts.unsubscribed) === null || _a === void 0 ? void 0 : _a.has(personKey)) === true ||
            (invite === null || invite === void 0 ? void 0 : invite.status) === 'cancelled';
        let track = invite && invite.status !== 'cancelled' ? 'pilot' : 'coupon';
        if ((override === null || override === void 0 ? void 0 : override.trackOverride) === 'coupon')
            track = 'coupon';
        if (enrolled)
            track = 'pilot';
        const touched = draftUpdated;
        const created = draftCreated !== null && draftCreated !== void 0 ? draftCreated : touched;
        const preFacelift = Boolean(created && created < decideNext_1.FACELIFT_CUTOFF && (!touched || touched < decideNext_1.FACELIFT_CUTOFF));
        const reachedPayment = Boolean(householdId && paymentHouseholds.has(householdId));
        const anchorAt = touched && touched > LAUNCH ? touched : LAUNCH;
        const segment = track === 'pilot' ? 'pilot' : preFacelift ? 's6' : reachedPayment ? 's1' : fromGuest ? 's3' : 's2';
        const base = {
            now: now.toISOString(),
            lockAt: '2026-11-07T15:00:00.000Z',
            stopped,
            track,
            preFacelift,
            reachedPayment,
            anchorAt,
            draftTouchedAt: touched,
            enrolled,
            pilotEmailedAt: (_b = invite === null || invite === void 0 ? void 0 : invite.emailedAt) !== null && _b !== void 0 ? _b : null,
            pilotFollowUpAt: (_c = invite === null || invite === void 0 ? void 0 : invite.followUpAt) !== null && _c !== void 0 ? _c : null,
            pilotD7At: (_d = invite === null || invite === void 0 ? void 0 : invite.d7At) !== null && _d !== void 0 ? _d : null,
            sends: (_e = sendsByKey.get(personKey)) !== null && _e !== void 0 ? _e : [],
            swapDue: false,
            lowStockDue: false,
            liveAbandonerDue: Boolean(householdId && recentAbandon.has(householdId)),
            surveyDue: false,
        };
        people.set(personKey, Object.assign(Object.assign({}, base), { personKey, email: normalized, householdId, inviteToken: (_f = invite === null || invite === void 0 ? void 0 : invite.token) !== null && _f !== void 0 ? _f : null, segment, boxLines: guest ? guest.lines : (householdId && linesByHousehold.get(householdId)) || [], draftKey: guest ? `guest_${guest.visitorId}` : householdId ? `hh_${householdId}` : null }));
    };
    for (const d of drafts.docs) {
        const hh = d.ref.parent.parent;
        if (d.id !== HOLIDAY || (hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households')
            continue;
        if (itemCount(d.data().lineItems) === 0)
            continue;
        const email = emailByHousehold.get(hh.id);
        if (!email)
            continue;
        consider(email, hh.id, iso(d.data().updatedAt), iso(d.data().createdAt), false);
    }
    for (const g of guests.docs) {
        if (itemCount(g.data().lineItems) === 0)
            continue;
        const hash = (_c = g.data().gateEmailHash) !== null && _c !== void 0 ? _c : g.data().lastLeadEmailHash;
        if (typeof hash !== 'string')
            continue;
        const email = (_d = opts.leadEmails) === null || _d === void 0 ? void 0 : _d.get(hash);
        if (!email)
            continue;
        const lines = g.data().lineItems;
        consider(email, null, iso(g.data().updatedAt), iso(g.data().createdAt), true, {
            visitorId: g.id,
            lines: Array.isArray(lines) ? lines : [],
        });
    }
    for (const [email, invite] of inviteByEmail) {
        if (invite.status === 'cancelled')
            continue;
        consider(email, invite.householdId, invite.emailedAt, null, false);
    }
    return [...people.values()];
}
//# sourceMappingURL=loadPeople.js.map