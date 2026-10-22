"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyBoxChargedIfAwake = notifyBoxChargedIfAwake;
exports.maybeOpenExtension = maybeOpenExtension;
exports.cancelUnpaidAfterDeadline = cancelUnpaidAfterDeadline;
exports.runLockNotes = runLockNotes;
/**
 * Dated notes around the lock. Nothing customer-facing goes out until the matching
 * piece is approved AND its Customer.io template id is set. Template id 0 skips the send
 * and leaves the person eligible for the next run.
 *
 * Audience for the sorry note and the Nov 9 notes: Grapejuice only
 * (an account, a guest draft, a pilot invite, or a checkout we can tie to one of those),
 * not unsubscribed, and not a household that already locked a Hanukkah box.
 */
const firestore_1 = require("firebase-admin/firestore");
const logger = require("../logger");
const email_1 = require("../email");
const cioPeople_1 = require("../cioPeople");
const guestSessions_1 = require("../guestSessions");
const testAccounts_1 = require("../testAccounts");
const config_1 = require("./config");
const time_1 = require("./time");
const catalogInventory_1 = require("../catalogInventory");
const lockWindow_1 = require("./lockWindow");
const emailItems_1 = require("../emailItems");
const context_1 = require("../rav/context");
const boxRules_1 = require("../rav/boxRules");
const HOLIDAY = 'hanukkah-2026';
const COMMITTED = new Set(['committed', 'confirmed', 'shipped', 'delivered']);
function itemCount(lineItems) {
    if (!Array.isArray(lineItems))
        return 0;
    return lineItems.reduce((sum, line) => {
        const qty = line && typeof line === 'object' ? line.quantity : 0;
        return sum + (typeof qty === 'number' && qty > 0 ? qty : 0);
    }, 0);
}
async function suppression(db) {
    const apiKey = (0, email_1.getCustomerioAppApiKey)();
    if (!apiKey)
        return { unsubscribed: new Set(), leads: new Map(), ok: false };
    try {
        const [leads, unsubscribed] = await Promise.all([(0, cioPeople_1.leadEmailsByHash)(apiKey), (0, cioPeople_1.unsubscribedHashes)([apiKey])]);
        return { unsubscribed, leads, ok: true };
    }
    catch (err) {
        logger.warn('lockNotes: customer.io lookup failed', { err: String(err).slice(0, 200) });
        return { unsubscribed: new Set(), leads: new Map(), ok: false };
    }
}
async function recipients(db, unsubscribed, leads) {
    var _a;
    const [users, drafts, orders, guests, invites] = await Promise.all([
        db.collection('users').select('email', 'householdId').get(),
        db.collectionGroup('boxDrafts').select('lineItems').get(),
        db.collectionGroup('orders').select('status', 'holidayId', 'lineItems', 'orderType').get(),
        db.collection('guestSessions').select('gateEmailHash', 'lastLeadEmailHash', 'lineItems').get(),
        db.collection('pilotInvites').select('email', 'householdId').get(),
    ]);
    const committedLines = new Map();
    for (const o of orders.docs) {
        const hh = o.ref.parent.parent;
        if ((hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households')
            continue;
        const status = o.data().status;
        if (o.data().orderType === 'marketplace')
            continue;
        if (o.data().holidayId === HOLIDAY && typeof status === 'string' && COMMITTED.has(status)) {
            const lines = o.data().lineItems;
            committedLines.set(hh.id, Array.isArray(lines) ? lines : []);
        }
    }
    const draftLines = new Map();
    for (const d of drafts.docs) {
        const hh = d.ref.parent.parent;
        if (d.id !== HOLIDAY || (hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households')
            continue;
        if (itemCount(d.data().lineItems) > 0)
            draftLines.set(hh.id, d.data().lineItems);
    }
    const byEmail = new Map();
    const add = (email, householdId, guestLines) => {
        var _a;
        const normalized = email.trim().toLowerCase();
        if (!normalized.includes('@') || (0, testAccounts_1.isTest)(normalized))
            return;
        const personKey = (0, guestSessions_1.emailHash)(normalized);
        if (unsubscribed.has(personKey))
            return;
        const orderLines = householdId ? committedLines.get(householdId) : undefined;
        const boxLines = guestLines !== null && guestLines !== void 0 ? guestLines : (householdId ? draftLines.get(householdId) : undefined);
        const prev = byEmail.get(normalized);
        if (prev) {
            if (orderLines) {
                prev.committed = true;
                prev.lines = orderLines;
            }
            else if (!prev.committed && !prev.hasDraft && boxLines) {
                prev.lines = boxLines;
            }
            prev.hasDraft = prev.hasDraft || Boolean(boxLines);
            return;
        }
        byEmail.set(normalized, {
            email: normalized,
            personKey,
            hasDraft: Boolean(boxLines),
            committed: Boolean(orderLines),
            lines: (_a = orderLines !== null && orderLines !== void 0 ? orderLines : boxLines) !== null && _a !== void 0 ? _a : [],
        });
    };
    for (const u of users.docs) {
        const email = u.data().email;
        const hid = u.data().householdId;
        if (typeof email !== 'string')
            continue;
        add(email, typeof hid === 'string' ? hid : null, null);
    }
    for (const inv of invites.docs) {
        const email = inv.data().email;
        const hid = inv.data().householdId;
        if (typeof email !== 'string')
            continue;
        add(email, typeof hid === 'string' ? hid : null, null);
    }
    for (const g of guests.docs) {
        const hash = (_a = g.data().gateEmailHash) !== null && _a !== void 0 ? _a : g.data().lastLeadEmailHash;
        if (typeof hash !== 'string')
            continue;
        const email = leads.get(hash);
        if (!email)
            continue;
        add(email, null, itemCount(g.data().lineItems) > 0 ? g.data().lineItems : null);
    }
    return [...byEmail.values()];
}
async function sendOnce(db, person, stage, template, data) {
    var _a;
    const ref = db.doc(`messageLog/${person.personKey}`);
    const snap = await ref.get();
    const sends = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.sends;
    if (Array.isArray(sends) && sends.some((s) => s && typeof s === 'object' && s.stage === stage && s.skipped !== true)) {
        return 'already';
    }
    const status = await (0, email_1.sendEmail)({ to: person.email, template, data });
    if (status !== 'sent')
        return 'skipped';
    await ref.set({ sends: firestore_1.FieldValue.arrayUnion({ stage, at: new Date().toISOString(), marketing: true, skipped: false }) }, { merge: true });
    return 'sent';
}
function link(stage) {
    return `${(0, guestSessions_1.appOrigin)()}/box?utm_source=lifecycle&utm_medium=email&utm_campaign=${stage}`;
}
async function emailForHousehold(db, householdId, userId) {
    var _a, _b, _c;
    if (typeof userId === 'string' && userId) {
        const user = await db.doc(`users/${userId}`).get();
        const email = (_a = user.data()) === null || _a === void 0 ? void 0 : _a.email;
        if (typeof email === 'string' && email.includes('@'))
            return email.trim().toLowerCase();
    }
    const hh = await db.doc(`households/${householdId}`).get();
    const ownerId = (_b = hh.data()) === null || _b === void 0 ? void 0 : _b.ownerId;
    if (typeof ownerId !== 'string')
        return null;
    const owner = await db.doc(`users/${ownerId}`).get();
    const email = (_c = owner.data()) === null || _c === void 0 ? void 0 : _c.email;
    return typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null;
}
/** Receipt after a successful charge. Quiet hours hold it for the 9am pass. */
async function notifyBoxChargedIfAwake(db, householdId, orderId, now = new Date()) {
    const hour = (0, time_1.etHour)(now.toISOString());
    if (hour < 9 || hour >= 20)
        return;
    await sendChargeReceipt(db, householdId, orderId);
}
async function sendChargeReceipt(db, householdId, orderId) {
    var _a;
    const enabled = await (0, config_1.enabledStageSet)(db);
    if (!enabled.has('lock_charged'))
        return;
    const ref = db.doc(`households/${householdId}/orders/${orderId}`);
    const snap = await ref.get();
    const order = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
    if (order.lockChargedNotifiedAt)
        return;
    if (order.holidayId !== HOLIDAY)
        return;
    if (order.status !== 'confirmed' && order.status !== 'shipped' && order.status !== 'delivered')
        return;
    const email = await emailForHousehold(db, householdId, order.userId);
    if (!email || (0, testAccounts_1.isTest)(email))
        return;
    const status = await (0, email_1.sendEmail)({
        to: email,
        template: 'program-lock-charged',
        data: Object.assign({ cta_url: `${(0, guestSessions_1.appOrigin)()}/orders?utm_source=lifecycle&utm_medium=email&utm_campaign=lock_charged`, total_cents: typeof order.totalCents === 'number' ? order.totalCents : 0 }, (0, emailItems_1.boxThumbFields)(await (0, emailItems_1.lineItemsEmailItems)(db, Array.isArray(order.lineItems) ? order.lineItems : [], `${(0, guestSessions_1.appOrigin)()}/orders`))),
    });
    if (status !== 'sent')
        return;
    await ref.set({ lockChargedNotifiedAt: new Date().toISOString() }, { merge: true });
}
async function sendUnnotifiedReceipts(db, now) {
    var _a, _b, _c;
    const day = (0, time_1.etDate)(now.toISOString());
    const hour = (0, time_1.etHour)(now.toISOString());
    if (day < '2026-11-08' || day > '2026-11-30' || hour < 9 || hour >= 20)
        return 0;
    const enabled = await (0, config_1.enabledStageSet)(db);
    if (!enabled.has('lock_charged'))
        return 0;
    const snap = await db.collectionGroup('orders').where('status', '==', 'confirmed').where('holidayId', '==', HOLIDAY).get();
    let sent = 0;
    for (const doc of snap.docs) {
        if (doc.data().lockChargedNotifiedAt)
            continue;
        const householdId = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (!householdId || ((_b = doc.ref.parent.parent) === null || _b === void 0 ? void 0 : _b.parent.id) !== 'households')
            continue;
        const before = doc.data().lockChargedNotifiedAt;
        await sendChargeReceipt(db, householdId, doc.id);
        const after = (_c = (await doc.ref.get()).data()) === null || _c === void 0 ? void 0 : _c.lockChargedNotifiedAt;
        if (!before && after)
            sent += 1;
    }
    return sent;
}
/** Noon ET Nov 9 through noon ET Nov 10 the public lock is the end of the extra day. */
async function maybeOpenExtension(db, now = new Date()) {
    var _a;
    const t = now.getTime();
    if (t < Date.parse(lockWindow_1.EXTENSION_START) || t >= Date.parse(lockWindow_1.EXTENSION_END))
        return false;
    const ref = db.doc('config/hanukkah-2026');
    const snap = await ref.get();
    const lockAt = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.lockAt;
    if (typeof lockAt === 'string' && Date.parse(lockAt) >= Date.parse(lockWindow_1.EXTENSION_END))
        return false;
    await ref.set({ lockAt: lockWindow_1.EXTENSION_END, extensionOpenedAt: now.toISOString() }, { merge: true });
    logger.info('extension window opened', { lockAt: lockWindow_1.EXTENSION_END });
    return true;
}
/** Still-unpaid committed boxes are cancelled at noon ET Nov 12. The note waits on approval. */
async function cancelUnpaidAfterDeadline(db, now = new Date()) {
    var _a, _b;
    if (now.getTime() < Date.parse(lockWindow_1.CARD_FIX_DEADLINE))
        return 0;
    const snap = await db.collectionGroup('orders').where('status', '==', 'committed').where('holidayId', '==', HOLIDAY).get();
    const enabled = await (0, config_1.enabledStageSet)(db);
    const tell = enabled.has('order_cancelled');
    let cancelled = 0;
    for (const doc of snap.docs) {
        const order = doc.data();
        if (order.playthrough === true)
            continue;
        const message = typeof order.chargeFailureMessage === 'string' ? order.chargeFailureMessage : '';
        if (!message || message === 'Stripe is not configured')
            continue;
        const householdId = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (!householdId || ((_b = doc.ref.parent.parent) === null || _b === void 0 ? void 0 : _b.parent.id) !== 'households')
            continue;
        const giftRestore = typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
        const platformRestore = typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
        const fresh = await db.runTransaction(async (tx) => {
            var _a;
            const current = await tx.get(doc.ref);
            if (((_a = current.data()) === null || _a === void 0 ? void 0 : _a.status) !== 'committed')
                return false;
            tx.update(doc.ref, {
                status: 'cancelled',
                cancelledAt: firestore_1.FieldValue.serverTimestamp(),
                cancelReason: 'unpaid_after_nov_12',
            });
            if (giftRestore > 0 || platformRestore > 0) {
                tx.update(db.doc(`households/${householdId}`), Object.assign(Object.assign(Object.assign({}, (giftRestore > 0 ? { giftCreditCents: firestore_1.FieldValue.increment(giftRestore) } : {})), (platformRestore > 0 ? { platformCreditCents: firestore_1.FieldValue.increment(platformRestore) } : {})), { updatedAt: new Date().toISOString() }));
            }
            return true;
        });
        if (!fresh)
            continue;
        cancelled += 1;
        if (!tell)
            continue;
        const email = await emailForHousehold(db, householdId, order.userId);
        if (!email || (0, testAccounts_1.isTest)(email))
            continue;
        const status = await (0, email_1.sendEmail)({
            to: email,
            template: 'program-order-cancelled',
            data: { cta_url: link('order_cancelled') },
        });
        if (status === 'sent') {
            await doc.ref.set({ cancelNotifiedAt: new Date().toISOString() }, { merge: true });
        }
    }
    if (cancelled > 0) {
        try {
            await (0, catalogInventory_1.recomputeBoxAllocations)(db);
        }
        catch (err) {
            logger.error('cancelUnpaidAfterDeadline allocations', err instanceof Error ? err : new Error(String(err)));
        }
        await db.doc('programJobs/cancelUnpaid').set({ at: now.toISOString(), ok: true, cancelled });
    }
    return cancelled;
}
async function sendTo(db, people, stage, template, pick, extra = async () => ({})) {
    let sent = 0;
    for (const person of people) {
        if (!pick(person))
            continue;
        const data = Object.assign({ cta_url: link(stage) }, (await extra(person)));
        const result = await sendOnce(db, person, stage, template, data);
        if (result === 'sent')
            sent += 1;
    }
    return sent;
}
async function soldOutIds(db) {
    const rows = (0, context_1.toBoxRulesRows)(await (0, context_1.loadCatalogRows)(db));
    return new Set(rows.filter(boxRules_1.isSoldOutForBoxes).map((r) => r.id));
}
function lineItemIds(lines) {
    const ids = new Set();
    for (const line of lines) {
        const id = line && typeof line === 'object' ? line.itemId : null;
        if (typeof id === 'string')
            ids.add(id);
    }
    return ids;
}
/** Hourly from the charge job. Each note fires on its day, after its hour, and only once per person. */
async function runLockNotes(db, now = new Date()) {
    const day = (0, time_1.etDate)(now.toISOString());
    const hour = (0, time_1.etHour)(now.toISOString());
    if (day >= '2026-11-08') {
        await sendUnnotifiedReceipts(db, now);
    }
    const marketing = (day === '2026-11-06' && hour >= 9) ||
        (day === '2026-11-08' && hour >= 9) ||
        (day === '2026-11-09' && hour >= 12);
    if (!marketing)
        return;
    const enabled = await (0, config_1.enabledStageSet)(db);
    const wantCommitted = day === '2026-11-06' && enabled.has('lock_t1_committed');
    const wantSorry = day === '2026-11-08' && enabled.has('lock_sorry');
    const wantExtend = day === '2026-11-09' && (enabled.has('extend_draft') || enabled.has('extend_new'));
    if (!wantCommitted && !wantSorry && !wantExtend) {
        await db.doc('programJobs/lockNotes').set({ at: now.toISOString(), ok: true, skipped: 'not_approved', day });
        return;
    }
    const lists = await suppression(db);
    if (!lists.ok) {
        await db.doc('programJobs/lockNotes').set({ at: now.toISOString(), ok: true, skipped: 'unsubscribe_list_unavailable', day });
        return;
    }
    const people = await recipients(db, lists.unsubscribed, lists.leads);
    const counts = {};
    if (wantCommitted) {
        const soldOut = await soldOutIds(db);
        counts.lock_t1_committed = await sendTo(db, people, 'lock_t1_committed', 'program-lock-t1-committed', (p) => p.committed, async (p) => ({
            suggestions: await (0, emailItems_1.suggestEmailItems)(db, lineItemIds(p.lines), soldOut, 'utm_source=lifecycle&utm_medium=email&utm_campaign=lock_t1_committed'),
        }));
    }
    if (wantSorry) {
        counts.lock_sorry = await sendTo(db, people, 'lock_sorry', 'program-lock-sorry', (p) => !p.committed);
    }
    if (wantExtend && enabled.has('extend_draft')) {
        counts.extend_draft = await sendTo(db, people, 'extend_draft', 'program-extend-draft', (p) => !p.committed && p.hasDraft, async (p) => (Object.assign({}, (0, emailItems_1.boxThumbFields)(await (0, emailItems_1.lineItemsEmailItems)(db, p.lines, link('extend_draft'))))));
    }
    if (wantExtend && enabled.has('extend_new')) {
        const popular = await (0, emailItems_1.pickEmailItems)(db, 'utm_source=lifecycle&utm_medium=email&utm_campaign=extend_new');
        counts.extend_new = await sendTo(db, people, 'extend_new', 'program-extend-new', (p) => !p.committed && !p.hasDraft, async () => ({
            popular,
        }));
    }
    await db.doc('programJobs/lockNotes').set(Object.assign({ at: now.toISOString(), ok: true, day }, counts));
}
//# sourceMappingURL=lockNotes.js.map