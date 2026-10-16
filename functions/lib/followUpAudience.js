"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256 = exports.AUDIENCE_SCHEMA = exports.PAID_ORDER_STATUSES = exports.STATIC_ROWS_DOC = exports.META_AD_ACCOUNT = exports.FOLLOW_UP_LIST_AUDIENCE_ID = exports.FOLLOW_UP_HOLIDAY_ID = void 0;
exports.followUpSkipReason = followUpSkipReason;
exports.normalizeEmail = normalizeEmail;
exports.normalizePhone = normalizePhone;
exports.normalizeName = normalizeName;
exports.hashedAudienceRow = hashedAudienceRow;
exports.dedupeAudienceRows = dedupeAudienceRows;
exports.toStoredRow = toStoredRow;
exports.fromStoredRow = fromStoredRow;
exports.combineFollowUpRows = combineFollowUpRows;
exports.selectBuilderRows = selectBuilderRows;
exports.loadStaticRows = loadStaticRows;
exports.createFollowUpListAudience = createFollowUpListAudience;
exports.replaceAudienceMembers = replaceAudienceMembers;
const crypto_1 = require("crypto");
const metaPracticeCutoff_1 = require("./metaPracticeCutoff");
const testAccounts_1 = require("./testAccounts");
/**
 * Customer-list side of the Meta follow-up audience. The website audience only holds browsers that
 * fired BoxFollowUp in the last 30 days; this list adds account holders who built a box but never
 * added a card, plus static lead lists stored as hashes in STATIC_ROWS_DOC.
 * Shared by scheduledFollowUpListAudience (followUpListAudience.ts) and
 * scripts/meta-followup-list-audience.mjs, which loads this file in plain Node: keep runtime
 * imports to crypto and pure local modules.
 */
exports.FOLLOW_UP_HOLIDAY_ID = 'hanukkah-2026';
/** "Follow-up - builders no payment + form list", targeted by the follow-up ad set. */
exports.FOLLOW_UP_LIST_AUDIENCE_ID = '120247911418820519';
exports.META_AD_ACCOUNT = 'act_1311852520406314';
/** Hashed lead-list rows: { rows: [{ em, ph, fn, ln }], count, seededAt }. Never readable by clients. */
exports.STATIC_ROWS_DOC = 'adminConfig/metaFollowupStatic';
/** Order statuses that mean the household already paid (or committed a card). */
exports.PAID_ORDER_STATUSES = ['committed', 'confirmed', 'shipped', 'delivered'];
exports.AUDIENCE_SCHEMA = ['EMAIL', 'PHONE', 'FN', 'LN'];
const PROTECTED_AUDIENCES = new Set(['120247150226310519']);
const GRAPH = 'https://graph.facebook.com/v21.0';
const BATCH = 10000;
function boxItemCount(lineItems) {
    if (!Array.isArray(lineItems))
        return 0;
    return lineItems.reduce((sum, line) => {
        const qty = line && typeof line === 'object' ? line.quantity : 0;
        return sum + (typeof qty === 'number' && qty > 0 ? qty : 0);
    }, 0);
}
function hasPaid(h) {
    return (Boolean(h.cardOnFileAt || h.stripeDefaultPaymentMethodId) ||
        h.orderStatuses.some((s) => typeof s === 'string' && exports.PAID_ORDER_STATUSES.includes(s)));
}
function followUpSkipReason(h) {
    if (boxItemCount(h.draftLineItems) === 0)
        return 'no_box';
    if (h.cardOnFileAt || h.stripeDefaultPaymentMethodId)
        return 'card_on_file';
    if (hasPaid(h))
        return 'paid_order';
    if (!normalizeEmail(h.email))
        return 'no_email';
    if ((0, testAccounts_1.isTest)(h.email))
        return 'test';
    if (!(0, metaPracticeCutoff_1.practiceEligibleForFollowUp)(h.practiceFrequencyScore))
        return 'practice';
    return null;
}
function normalizeEmail(raw) {
    if (typeof raw !== 'string')
        return null;
    const email = raw.trim().toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}
/** Digits with country code; bare 10-digit numbers are taken as US. */
function normalizePhone(raw) {
    if (typeof raw !== 'string')
        return null;
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length === 10)
        return `1${digits}`;
    return digits.length >= 11 && digits.length <= 15 ? digits : null;
}
function normalizeName(raw) {
    if (typeof raw !== 'string')
        return null;
    const name = raw.trim().toLowerCase().replace(/[^\p{L}]/gu, '');
    return name || null;
}
const sha256 = (value) => (0, crypto_1.createHash)('sha256').update(value).digest('hex');
exports.sha256 = sha256;
/** Hashed row, or null with neither email nor phone. */
function hashedAudienceRow(p) {
    const email = normalizeEmail(p.email);
    const phone = normalizePhone(p.phone);
    if (!email && !phone)
        return null;
    const hash = (v) => (v ? (0, exports.sha256)(v) : '');
    return [hash(email), hash(phone), hash(normalizeName(p.firstName)), hash(normalizeName(p.lastName))];
}
/** Drops rows whose email hash (or, without an email, phone hash) was already seen. */
function dedupeAudienceRows(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows) {
        const key = row[0] ? `e:${row[0]}` : `p:${row[1]}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(row);
    }
    return { rows: out, duplicates: rows.length - out.length };
}
function toStoredRow(row) {
    const [em, ph, fn, ln] = row;
    return Object.assign(Object.assign(Object.assign(Object.assign({}, (em ? { em } : {})), (ph ? { ph } : {})), (fn ? { fn } : {})), (ln ? { ln } : {}));
}
function fromStoredRow(row) {
    const hex = (v) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : '');
    const out = [hex(row === null || row === void 0 ? void 0 : row.em), hex(row === null || row === void 0 ? void 0 : row.ph), hex(row === null || row === void 0 ? void 0 : row.fn), hex(row === null || row === void 0 ? void 0 : row.ln)];
    return out[0] || out[1] ? out : null;
}
/** Builders first, then static rows minus anyone whose email hash belongs to a paying household. */
function combineFollowUpRows(builderRows, staticRows, paidEmailHashes) {
    const unpaidStatic = staticRows.filter((r) => !(r[0] && paidEmailHashes.has(r[0])));
    const { rows, duplicates } = dedupeAudienceRows([...builderRows, ...unpaidStatic]);
    return { rows, duplicates, staticPaid: staticRows.length - unpaidStatic.length };
}
/** Account holders with a box draft, no card and no paid order (test accounts skipped). Read-only. */
async function selectBuilderRows(db) {
    var _a, _b, _c, _d, _e, _f, _g;
    const [householdSnap, draftSnap, orderSnap, userSnap] = await Promise.all([
        db.collection('households').select('ownerId', 'cardOnFileAt', 'stripeDefaultPaymentMethodId').get(),
        db.collectionGroup('boxDrafts').get(),
        db.collectionGroup('orders').select('status').get(),
        db.collection('users').select('email', 'displayName', 'phone', 'lastBoxAnswers').get(),
    ]);
    const users = new Map(userSnap.docs.map((d) => [d.id, d.data()]));
    const statusesByHousehold = new Map();
    for (const d of orderSnap.docs) {
        const hh = d.ref.parent.parent;
        if ((hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households')
            continue;
        statusesByHousehold.set(hh.id, [...((_a = statusesByHousehold.get(hh.id)) !== null && _a !== void 0 ? _a : []), d.data().status]);
    }
    const households = new Map(householdSnap.docs.map((d) => [d.id, d.data()]));
    const ownerOf = (h) => typeof (h === null || h === void 0 ? void 0 : h.ownerId) === 'string' ? users.get(h.ownerId) : undefined;
    const paidEmailHashes = new Set();
    for (const [hid, h] of households) {
        const email = normalizeEmail((_b = ownerOf(h)) === null || _b === void 0 ? void 0 : _b.email);
        if (email && hasPaid(Object.assign(Object.assign({}, h), { orderStatuses: (_c = statusesByHousehold.get(hid)) !== null && _c !== void 0 ? _c : [] })))
            paidEmailHashes.add((0, exports.sha256)(email));
    }
    const rows = [];
    const skipped = {};
    for (const d of draftSnap.docs) {
        const hh = d.ref.parent.parent;
        if (d.id !== exports.FOLLOW_UP_HOLIDAY_ID || (hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households')
            continue;
        const h = households.get(hh.id);
        const owner = ownerOf(h);
        const reason = followUpSkipReason({
            draftLineItems: d.data().lineItems,
            cardOnFileAt: h === null || h === void 0 ? void 0 : h.cardOnFileAt,
            stripeDefaultPaymentMethodId: h === null || h === void 0 ? void 0 : h.stripeDefaultPaymentMethodId,
            orderStatuses: (_d = statusesByHousehold.get(hh.id)) !== null && _d !== void 0 ? _d : [],
            email: typeof (owner === null || owner === void 0 ? void 0 : owner.email) === 'string' ? owner.email : null,
            practiceFrequencyScore: (_e = owner === null || owner === void 0 ? void 0 : owner.lastBoxAnswers) === null || _e === void 0 ? void 0 : _e.practiceFrequencyScore,
        });
        if (reason) {
            skipped[reason] = ((_f = skipped[reason]) !== null && _f !== void 0 ? _f : 0) + 1;
            continue;
        }
        const [firstName, ...rest] = String((_g = owner === null || owner === void 0 ? void 0 : owner.displayName) !== null && _g !== void 0 ? _g : '').trim().split(/\s+/);
        const lastName = rest[rest.length - 1];
        const row = hashedAudienceRow({ email: owner === null || owner === void 0 ? void 0 : owner.email, phone: owner === null || owner === void 0 ? void 0 : owner.phone, firstName, lastName });
        if (row)
            rows.push(row);
    }
    return { rows, paidEmailHashes, skipped };
}
/** Rows stored by `scripts/meta-followup-list-audience.mjs --seed-static`, or null when never seeded. */
async function loadStaticRows(db) {
    var _a;
    const snap = await db.doc(exports.STATIC_ROWS_DOC).get();
    if (!snap.exists)
        return null;
    const stored = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.rows;
    return Array.isArray(stored) ? stored.map(fromStoredRow).filter((r) => r !== null) : [];
}
async function graph(fetchImpl, token, method, path, params = {}) {
    const body = new URLSearchParams({ access_token: token });
    for (const [k, v] of Object.entries(params))
        body.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    const res = await fetchImpl(method === 'GET' ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`, Object.assign({ method }, (method === 'GET' ? {} : { body })));
    const json = (await res.json());
    if (json.error)
        throw new Error(`Meta ${method} ${path.split('/')[0]}: ${json.error.message}`);
    return json;
}
async function createFollowUpListAudience(token, name, fetchImpl = fetch) {
    const made = await graph(fetchImpl, token, 'POST', `${exports.META_AD_ACCOUNT}/customaudiences`, {
        name,
        subtype: 'CUSTOM',
        customer_file_source: 'USER_PROVIDED_ONLY',
        description: 'Box builders without a card on file, plus lead lists. Refreshed daily by scheduledFollowUpListAudience.',
    });
    return String(made.id);
}
/**
 * Replace (not append) the audience's members so people who paid drop off. Refuses anything but a
 * customer-list audience in META_AD_ACCOUNT, and an empty list (which would wipe the audience).
 */
async function replaceAudienceMembers(audienceId, rows, token, fetchImpl = fetch) {
    var _a, _b;
    if (PROTECTED_AUDIENCES.has(audienceId))
        throw new Error(`Refusing to write to protected audience ${audienceId}`);
    if (!rows.length)
        throw new Error('Refusing to replace the audience with an empty list');
    const target = await graph(fetchImpl, token, 'GET', audienceId, { fields: 'subtype,account_id' });
    if (target.subtype !== 'CUSTOM' || `act_${target.account_id}` !== exports.META_AD_ACCOUNT) {
        throw new Error(`Audience ${audienceId} is not a customer list in ${exports.META_AD_ACCOUNT}`);
    }
    const sessionId = (0, crypto_1.randomInt)(1, 2 ** 47);
    let received = 0;
    let invalid = 0;
    for (let i = 0, seq = 1; i < rows.length; i += BATCH, seq++) {
        const r = await graph(fetchImpl, token, 'POST', `${audienceId}/usersreplace`, {
            session: {
                session_id: sessionId,
                batch_seq: seq,
                last_batch_flag: i + BATCH >= rows.length,
                estimated_num_total: rows.length,
            },
            payload: { schema: exports.AUDIENCE_SCHEMA, data: rows.slice(i, i + BATCH) },
        });
        received += Number((_a = r.num_received) !== null && _a !== void 0 ? _a : 0);
        invalid += Number((_b = r.num_invalid_entries) !== null && _b !== void 0 ? _b : 0);
    }
    return { received, invalid };
}
//# sourceMappingURL=followUpAudience.js.map