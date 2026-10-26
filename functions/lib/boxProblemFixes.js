"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyBoxProblemFix = exports.BOX_FIX_LOG = void 0;
exports.chargeCents = chargeCents;
exports.fixesForProblem = fixesForProblem;
exports.applyLineFix = applyLineFix;
exports.applyCheckedLineFix = applyCheckedLineFix;
exports.readFixLines = readFixLines;
exports.loadFixCatalog = loadFixCatalog;
exports.loadFixBox = loadFixBox;
exports.historyClue = historyClue;
exports.loadBoxFixLog = loadBoxFixLog;
/**
 * Concrete fixes for one included-items problem. The admin review offers these as
 * buttons; applying one changes the box (or records an approve / donation).
 */
const firestore_1 = require("firebase-admin/firestore");
const sentry_1 = require("./sentry");
const guestSessions_1 = require("./guestSessions");
const boxAudit_1 = require("./boxAudit");
const boxAuditDecisions_1 = require("./boxAuditDecisions");
const boxAuditLoad_1 = require("./boxAuditLoad");
const PRIMARY_FOOD = new Set(['latke-mix', 'sufganiyot-mix', 'food']);
const DREIDEL_SLOTS = new Set(['wood-dreidel', 'blank-dreidel', 'airdry-dreidel', 'keepsake-dreidel']);
const WRAP_SLOTS = new Set(['wrapping-paper', 'wrapping', 'pre-wrap']);
const FALLBACK_CENTS = 500;
const isFree = (li) => { var _a, _b; return ((_a = li.unitCents) !== null && _a !== void 0 ? _a : 0) === 0 && ((_b = li.quantity) !== null && _b !== void 0 ? _b : 0) > 0; };
function money(cents) {
    const dollars = cents / 100;
    return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: dollars % 1 ? 2 : 0 })}`;
}
function chargeCents(row) {
    if (typeof (row === null || row === void 0 ? void 0 : row.memberPriceCents) === 'number' && row.memberPriceCents > 0)
        return Math.round(row.memberPriceCents);
    if (typeof (row === null || row === void 0 ? void 0 : row.dollarCostCents) === 'number' && row.dollarCostCents > 0)
        return Math.round(row.dollarCostCents);
    return FALLBACK_CENTS;
}
function catalogOf(catalog, itemId) {
    return catalog.find((row) => row.id === itemId);
}
function itemName(li, catalog) {
    var _a;
    return ((_a = catalogOf(catalog, li.itemId)) === null || _a === void 0 ? void 0 : _a.name) || li.label || li.itemId;
}
function names(lines, targets, catalog) {
    return targets.map((target) => itemName(lines[target.index], catalog)).join(' and ');
}
function priceOf(lines, targets, catalog) {
    return targets.reduce((sum, target) => {
        const li = lines[target.index];
        const extra = Math.max(1, li.quantity - target.keepQty);
        return sum + chargeCents(catalogOf(catalog, li.itemId)) * extra;
    }, 0);
}
function recommend(options) {
    return options.map((option, index) => (Object.assign(Object.assign({}, option), { recommended: index === 0 })));
}
function foodTargets(lines) {
    const free = lines.flatMap((li, index) => ((0, boxAudit_1.isFoodSlotLine)(li) && isFree(li) ? [{ li, index }] : []));
    if (free.length <= boxAudit_1.FOOD_SLOTS_INCLUDED)
        return [];
    const ranked = [...free].sort((a, b) => {
        const rank = (li) => (PRIMARY_FOOD.has((0, boxAudit_1.auditSlotBase)(li.slotId)) ? 0 : 1);
        return rank(a.li) - rank(b.li) || a.index - b.index;
    });
    const keep = new Set(ranked.slice(0, boxAudit_1.FOOD_SLOTS_INCLUDED).map((row) => row.index));
    return free
        .filter((row) => !keep.has(row.index))
        .map((row) => ({ index: row.index, keepQty: 0, moveToAddon: PRIMARY_FOOD.has((0, boxAudit_1.auditSlotBase)(row.li.slotId)) }));
}
function quantityTargets(lines, matches, allowed) {
    const rows = lines.flatMap((li, index) => (matches(li) && isFree(li) ? [{ li, index }] : []));
    let total = rows.reduce((sum, row) => sum + row.li.quantity, 0);
    if (total <= allowed)
        return [];
    const targets = [];
    for (const row of [...rows].reverse()) {
        if (total <= allowed)
            break;
        const drop = Math.min(row.li.quantity, total - allowed);
        targets.push({ index: row.index, keepQty: row.li.quantity - drop, moveToAddon: false });
        total -= drop;
    }
    return targets;
}
function geltTargets(lines, catalog, people) {
    const rows = lines.flatMap((li, index) => {
        var _a, _b, _c;
        const bag = (0, boxAudit_1.geltBagOf)(li.itemId, (_c = (_b = (_a = catalogOf(catalog, li.itemId)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : li.label) !== null && _c !== void 0 ? _c : '');
        if (!bag || !isFree(li) || (0, boxAudit_1.isFoodSlotLine)(li))
            return [];
        return [{ index, units: boxAudit_1.GELT_LITTLE_EQUIVALENT[bag] * li.quantity }];
    });
    let total = rows.reduce((sum, row) => sum + row.units, 0);
    if (total <= people)
        return { targets: [], indivisible: false };
    const targets = [];
    for (const row of [...rows].reverse()) {
        if (total <= people)
            break;
        if (row.units > total - people)
            return { targets, indivisible: true };
        targets.push({ index: row.index, keepQty: 0, moveToAddon: false });
        total -= row.units;
    }
    return { targets, indivisible: false };
}
function targetsFor(problem, lines, people, kids) {
    var _a;
    if (problem.code !== 'over-allowance')
        return null;
    if (problem.section === 'food')
        return foodTargets(lines);
    if (problem.section === 'candles')
        return quantityTargets(lines, (li) => (0, boxAudit_1.auditSlotBase)(li.slotId) === 'candles', 1);
    if (problem.section === 'dreidel') {
        return quantityTargets(lines, (li) => { var _a; return DREIDEL_SLOTS.has((0, boxAudit_1.auditSlotBase)(li.slotId)) && !(0, boxAudit_1.geltBagOf)(li.itemId, (_a = li.label) !== null && _a !== void 0 ? _a : ''); }, people);
    }
    if (problem.section === 'wrap') {
        return quantityTargets(lines, (li) => WRAP_SLOTS.has((0, boxAudit_1.auditSlotBase)(li.slotId)), ((_a = problem.detail) === null || _a === void 0 ? void 0 : _a.includes('pre-wrap')) ? 0 : 1);
    }
    if (problem.section === 'story' || problem.section === 'presents') {
        const base = problem.section === 'story' ? 'story' : 'gift';
        return quantityTargets(lines, (li) => (0, boxAudit_1.auditSlotBase)(li.slotId) === base && (!problem.childKey || (0, boxAudit_1.auditKidKey)(li) === problem.childKey), problem.childKey ? 1 : Math.max(kids, 0));
    }
    return [];
}
function problemLine(problem, lines) {
    return lines.findIndex((li) => {
        if (problem.itemId && li.itemId !== problem.itemId)
            return false;
        if (problem.slotId && li.slotId !== problem.slotId)
            return false;
        if (problem.childKey && (0, boxAudit_1.auditKidKey)(li) !== problem.childKey)
            return false;
        return isFree(li);
    });
}
function withoutUndefined(row) {
    const out = Object.assign({}, row);
    for (const key of Object.keys(out))
        if (out[key] === undefined)
            delete out[key];
    return out;
}
function applyTargets(lines, targets, catalog, mode) {
    const byIndex = new Map(targets.map((target) => [target.index, target]));
    const next = [];
    lines.forEach((li, index) => {
        var _a, _b;
        const target = byIndex.get(index);
        if (!target) {
            next.push(li);
            return;
        }
        if (mode === 'remove') {
            if (target.keepQty > 0)
                next.push(Object.assign(Object.assign({}, li), { quantity: target.keepQty, includedQty: Math.max((_a = li.includedQty) !== null && _a !== void 0 ? _a : 0, target.keepQty) }));
            return;
        }
        const extra = li.quantity - target.keepQty;
        if (target.keepQty > 0) {
            next.push(Object.assign(Object.assign({}, li), { quantity: target.keepQty, includedQty: Math.max((_b = li.includedQty) !== null && _b !== void 0 ? _b : 0, target.keepQty) }));
        }
        const paid = Object.assign(Object.assign({}, li), { slotId: target.moveToAddon ? `addon-${li.itemId}` : target.keepQty > 0 ? `${li.slotId}::x` : li.slotId, quantity: extra, includedQty: 0, unitCents: chargeCents(catalogOf(catalog, li.itemId)) });
        next.push(withoutUndefined(paid));
    });
    return next;
}
function fixesForProblem(problem, lines, catalog, people, kids = 0) {
    var _a;
    if (problem.grandfathered)
        return [];
    if (problem.code === 'paid-in-included-slot' || problem.code === 'wrap-charged') {
        const li = lines.find((row) => { var _a; return row.itemId === problem.itemId && ((_a = row.unitCents) !== null && _a !== void 0 ? _a : 0) > 0; });
        const name = li ? itemName(li, catalog) : 'this item';
        return recommend([
            { id: 'make-free', label: `Make the ${name} free`, detail: 'It is an included item, so the customer should not be paying for it.' },
            { id: 'approve', label: 'Leave the charge', detail: 'The charge stays as it is.' },
        ]);
    }
    if (problem.code === 'gelt-short' || problem.code === 'food-slot-missing') {
        return recommend([
            { id: 'donation', label: 'Mark it as a donation', detail: 'A short section is usually something the customer gave up on purpose.' },
            { id: 'approve', label: 'Leave it listed', detail: 'It stays visible, without being treated as a donation.' },
        ]);
    }
    if (problem.code === 'not-included-item' || problem.code === 'free-add-on') {
        const index = problemLine(problem, lines);
        const li = index >= 0 ? lines[index] : undefined;
        if (!li)
            return recommend([{ id: 'approve', label: 'Leave it as it is', detail: 'The line this refers to is no longer in the box.' }]);
        const name = itemName(li, catalog);
        const cents = chargeCents(catalogOf(catalog, li.itemId));
        const vacant = (0, boxAudit_1.nextVacantFoodSlotId)(lines);
        const options = [];
        if (problem.code === 'free-add-on' && vacant) {
            options.push({
                id: 'rehome',
                label: `Move the ${name} into the open food slot`,
                detail: 'It already qualifies as a food choice, and one included food slot is empty.',
            });
        }
        options.push({
            id: 'charge',
            label: `Charge the ${name}, ${money(cents)}`,
            detail: 'It stays in the box as a paid add-on, so it no longer counts as included.',
        }, { id: 'remove', label: `Remove the ${name}`, detail: 'It comes out of the box.' }, { id: 'approve', label: 'Leave it free', detail: 'It stays in the box at no charge.' });
        return recommend(options);
    }
    if (problem.code === 'over-allowance' && problem.section === 'gelt') {
        const gelt = geltTargets(lines, catalog, people);
        if (gelt.indivisible || gelt.targets.length === 0) {
            return recommend([
                { id: 'approve', label: 'Leave the extra gelt', detail: 'The bag does not split into the household allowance, so the clean choice is to leave it.' },
                { id: 'donation', label: 'Mark it as a donation', detail: 'Use this if the extra chocolate was intentional and should stop being listed.' },
            ]);
        }
    }
    const targets = (_a = targetsFor(problem, lines, people, kids)) !== null && _a !== void 0 ? _a : [];
    if (targets.length === 0) {
        return recommend([{ id: 'approve', label: 'Leave it as it is', detail: 'There is no extra line left to change.' }]);
    }
    const what = names(lines, targets, catalog);
    const cents = priceOf(lines, targets, catalog);
    return recommend([
        {
            id: 'charge',
            label: `Charge the ${what}, ${money(cents)}`,
            detail: 'They keep it, and the price shows in the box before checkout.',
        },
        { id: 'remove', label: `Remove the ${what}`, detail: 'The extra comes out and the box goes back to what is included.' },
        { id: 'approve', label: 'Leave it free', detail: 'The extra stays in the box at no charge.' },
    ]);
}
function applyLineFix(fixId, problem, lines, catalog, people, wrapSelectedItemIds = [], kids = 0) {
    var _a;
    if (fixId === 'approve' || fixId === 'donation')
        return null;
    if (fixId === 'make-free') {
        const healed = (0, boxAudit_1.healIncludedInCustomerFavor)(lines, catalog, auditHousehold(lines, people), { wrapSelectedItemIds });
        return healed.healed.length ? healed.lineItems : lines;
    }
    if (fixId === 'rehome') {
        const index = problemLine(problem, lines);
        const vacant = (0, boxAudit_1.nextVacantFoodSlotId)(lines);
        if (index < 0 || !vacant)
            return lines;
        return lines.map((li, i) => (i === index ? Object.assign(Object.assign({}, li), { slotId: vacant }) : li));
    }
    if (fixId !== 'charge' && fixId !== 'remove')
        return lines;
    if (problem.code === 'not-included-item' || problem.code === 'free-add-on') {
        const index = problemLine(problem, lines);
        if (index < 0)
            return lines;
        const base = (0, boxAudit_1.auditSlotBase)(lines[index].slotId);
        const move = problem.code === 'not-included-item' ||
            PRIMARY_FOOD.has(base) ||
            base === 'latke-kit' ||
            base === 'sufganiyot-kit';
        return applyTargets(lines, [{ index, keepQty: 0, moveToAddon: fixId === 'charge' && move }], catalog, fixId);
    }
    const targets = problem.section === 'gelt' ? geltTargets(lines, catalog, people).targets : (_a = targetsFor(problem, lines, people, kids)) !== null && _a !== void 0 ? _a : [];
    return applyTargets(lines, targets, catalog, fixId);
}
function auditHousehold(lines, people) {
    const kidKeys = [];
    for (const li of lines) {
        const key = (0, boxAudit_1.auditKidKey)(li);
        if (!key || !/^(?:story|gift)-/.test(li.slotId.replace(/::x$/i, '')))
            continue;
        if (!kidKeys.includes(key))
            kidKeys.push(key);
    }
    return { kidKeys, adults: Math.max(0, people - kidKeys.length) };
}
function stillOpen(problem, before, after) {
    const same = (p) => { var _a, _b, _c, _d; return p.code === problem.code && p.section === problem.section && ((_a = p.itemId) !== null && _a !== void 0 ? _a : '') === ((_b = problem.itemId) !== null && _b !== void 0 ? _b : '') && ((_c = p.childKey) !== null && _c !== void 0 ? _c : '') === ((_d = problem.childKey) !== null && _d !== void 0 ? _d : ''); };
    if (!before.some(same))
        return false;
    return after.some(same);
}
/** Apply a fix and refuse it when the same problem would remain or a new over-allowance appears. */
function applyCheckedLineFix(fixId, problem, lines, catalog, people, wrapSelectedItemIds = [], kids = 0) {
    const next = applyLineFix(fixId, problem, lines, catalog, people, wrapSelectedItemIds, kids);
    if (!next)
        return null;
    const household = auditHousehold(lines, people);
    const opts = { wrapSelectedItemIds };
    const before = (0, boxAudit_1.auditIncluded)(lines, catalog, household, opts);
    const after = (0, boxAudit_1.auditIncluded)(next, catalog, household, opts);
    if (stillOpen(problem, before.problems, after.problems)) {
        throw new sentry_1.HttpsError('failed-precondition', 'That fix would leave the same problem in place.');
    }
    const overBefore = new Set(before.problems.filter((p) => p.direction === 'over' && !p.grandfathered).map(boxAudit_1.auditProblemKey));
    const introduced = after.problems.some((p) => p.direction === 'over' && !p.grandfathered && !overBefore.has((0, boxAudit_1.auditProblemKey)(p)));
    if (introduced)
        throw new sentry_1.HttpsError('failed-precondition', 'That fix would create a new included-items problem.');
    return next;
}
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function readFixLines(v) {
    if (!Array.isArray(v))
        return [];
    return v.flatMap((row) => {
        var _a, _b;
        if (!isRecord(row) || typeof row.slotId !== 'string' || typeof row.itemId !== 'string')
            return [];
        return [Object.assign(Object.assign({}, row), { slotId: row.slotId, itemId: row.itemId, quantity: Number((_a = row.quantity) !== null && _a !== void 0 ? _a : 0), unitCents: Number((_b = row.unitCents) !== null && _b !== void 0 ? _b : 0) })];
    });
}
function householdId(path) {
    var _a, _b;
    return (_b = (_a = path.match(/^households\/([^/]+)\//)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : null;
}
async function loadFixCatalog(db) {
    const snap = await db.collection(`catalog/hanukkah/items`).get();
    return snap.docs.map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            name: typeof data.name === 'string' ? data.name : undefined,
            category: typeof data.category === 'string' ? data.category : undefined,
            memberPriceCents: typeof data.memberPriceCents === 'number' ? data.memberPriceCents : undefined,
            dollarCostCents: typeof data.dollarCostCents === 'number' ? data.dollarCostCents : undefined,
        };
    });
}
async function loadFixBox(db, path) {
    var _a, _b;
    if (path.startsWith('guestSessions/')) {
        const [docPath, which] = path.split('#');
        const snap = await db.doc(docPath).get();
        if (!snap.exists)
            return null;
        const data = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
        const snapshot = isRecord(data.snapshot) ? data.snapshot : {};
        const source = which === 'gift'
            ? isRecord(snapshot.gift) && isRecord(snapshot.gift.draft)
                ? snapshot.gift.draft
                : {}
            : isRecord(snapshot.guest)
                ? snapshot.guest
                : {};
        const wrap = Array.isArray(source.wrapSelectedItemIds)
            ? source.wrapSelectedItemIds.filter((id) => typeof id === 'string')
            : [];
        return { lines: readFixLines(source.lineItems), wrapSelectedItemIds: wrap };
    }
    const snap = await db.doc(path).get();
    if (!snap.exists)
        return null;
    const data = (_b = snap.data()) !== null && _b !== void 0 ? _b : {};
    const wrap = Array.isArray(data.wrapSelectedItemIds) ? data.wrapSelectedItemIds.filter((id) => typeof id === 'string') : [];
    return { lines: readFixLines(data.lineItems), wrapSelectedItemIds: wrap };
}
async function writeLines(db, path, lines, uid) {
    const cleaned = lines.map((li) => withoutUndefined(li));
    const now = new Date().toISOString();
    if (path.startsWith('guestSessions/')) {
        const [docPath, which] = path.split('#');
        const field = which === 'gift' ? 'snapshot.gift.draft.lineItems' : 'snapshot.guest.lineItems';
        await db.doc(docPath).update({ [field]: cleaned, updatedAt: now, lastChangeSource: 'admin-fix' });
        return;
    }
    await db.doc(path).update({ lineItems: cleaned, updatedAt: now, updatedBy: uid, lastChangeSource: 'admin-fix' });
}
async function siblingPaths(db, path) {
    const hh = householdId(path);
    if (!hh)
        return [];
    if (path.includes('/boxDrafts/')) {
        const orders = await db.collection(`households/${hh}/orders`).where('holidayId', '==', boxAuditLoad_1.BOX_AUDIT_HOLIDAY_ID).get();
        return orders.docs.map((doc) => doc.ref.path);
    }
    if (path.includes('/orders/'))
        return [`households/${hh}/boxDrafts/${boxAuditLoad_1.BOX_AUDIT_HOLIDAY_ID}`];
    return [];
}
const FOOD_SLOT_IDS = new Set(['latke-mix', 'sufganiyot-mix', 'latke-kit', 'sufganiyot-kit', 'food', 'applesauce']);
const SOURCE_LABEL = {
    customer: 'the customer',
    rav: 'Rav',
    'default-build': 'the box builder',
    'guest-signup': 'signup',
    'auto-repair': 'an automatic repair',
    'inventory-swap': 'a sold-out swap',
    'admin-fix': 'an admin fix',
};
function changeItem(change) {
    var _a, _b;
    if (change.type === 'swap')
        return (_a = change.toItemId) !== null && _a !== void 0 ? _a : null;
    return (_b = change.itemId) !== null && _b !== void 0 ? _b : null;
}
function changeIsFree(change) {
    const cents = change.type === 'swap' || change.type === 'quantity' ? change.toUnitCents : change.unitCents;
    return cents == null || cents === 0;
}
/** The earliest box-history save that introduced this problem's free line. */
function historyClue(entries, focus) {
    var _a, _b, _c, _d;
    const wanted = new Set(focus.itemIds.filter(Boolean));
    const sorted = entries.filter((entry) => entry.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    for (const entry of sorted) {
        for (const change of (_a = entry.changes) !== null && _a !== void 0 ? _a : []) {
            if (change.type === 'remove')
                continue;
            const itemId = changeItem(change);
            const slot = (_b = change.slotId) !== null && _b !== void 0 ? _b : '';
            const slotHit = focus.section === 'food' && FOOD_SLOT_IDS.has((0, boxAudit_1.auditSlotBase)(slot));
            if (!changeIsFree(change) || (!itemId || (!wanted.has(itemId) && !slotHit)))
                continue;
            if (wanted.size > 0 && itemId && !wanted.has(itemId))
                continue;
            const when = new Date(entry.at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: 'America/New_York',
            });
            const who = (_d = SOURCE_LABEL[(_c = entry.source) !== null && _c !== void 0 ? _c : '']) !== null && _d !== void 0 ? _d : 'an unsourced save';
            return `${itemId} showed up ${when} ET from ${who}.`;
        }
    }
    return null;
}
function touchedItemIds(before, after) {
    const afterKey = new Set(after.map((li) => `${li.slotId}|${li.itemId}`));
    const ids = new Set();
    for (const li of before) {
        const next = after.find((row) => row.slotId === li.slotId && row.itemId === li.itemId);
        if (!next || next.unitCents !== li.unitCents || next.quantity !== li.quantity)
            ids.add(li.itemId);
        if (!afterKey.has(`${li.slotId}|${li.itemId}`))
            ids.add(li.itemId);
    }
    for (const li of after) {
        const prev = before.find((row) => row.slotId === li.slotId && row.itemId === li.itemId);
        if (!prev || prev.unitCents !== li.unitCents || prev.quantity !== li.quantity || prev.slotId !== li.slotId)
            ids.add(li.itemId);
    }
    return [...ids];
}
exports.BOX_FIX_LOG = 'boxFixLog';
function historyCollection(path) {
    if (path.startsWith('guestSessions/'))
        return `${path.split('#')[0]}/history`;
    const hh = householdId(path);
    return hh ? `households/${hh}/boxDrafts/${boxAuditLoad_1.BOX_AUDIT_HOLIDAY_ID}/history` : null;
}
async function recordFixLog(db, input) {
    var _a;
    let historyNote = null;
    const collection = historyCollection(input.path);
    if (collection) {
        const snap = await db.collection(collection).get();
        const entries = snap.docs
            .filter((doc) => doc.id !== 'default')
            .map((doc) => doc.data());
        historyNote = historyClue(entries, { itemIds: input.itemIds, section: input.problem.section });
    }
    const ref = db.collection(exports.BOX_FIX_LOG).doc();
    const entry = {
        id: ref.id,
        at: new Date().toISOString(),
        email: input.email,
        path: input.path,
        section: input.problem.section,
        code: input.problem.code,
        detail: (_a = input.problem.detail) !== null && _a !== void 0 ? _a : '',
        fixId: input.fixId,
        fixLabel: input.fixLabel,
        historyNote,
        status: 'open',
        cause: null,
        proposal: null,
        by: input.by,
    };
    await ref.set(entry);
}
async function loadBoxFixLog(db) {
    const snap = await db.collection(exports.BOX_FIX_LOG).orderBy('at', 'desc').limit(30).get();
    return snap.docs.map((doc) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const data = doc.data();
        return {
            id: doc.id,
            at: String((_a = data.at) !== null && _a !== void 0 ? _a : ''),
            email: typeof data.email === 'string' ? data.email : null,
            path: String((_b = data.path) !== null && _b !== void 0 ? _b : ''),
            section: String((_c = data.section) !== null && _c !== void 0 ? _c : ''),
            code: String((_d = data.code) !== null && _d !== void 0 ? _d : ''),
            detail: String((_e = data.detail) !== null && _e !== void 0 ? _e : ''),
            fixId: String((_f = data.fixId) !== null && _f !== void 0 ? _f : ''),
            fixLabel: String((_g = data.fixLabel) !== null && _g !== void 0 ? _g : ''),
            historyNote: typeof data.historyNote === 'string' ? data.historyNote : null,
            status: 'open',
            cause: typeof data.cause === 'string' ? data.cause : null,
            proposal: typeof data.proposal === 'string' ? data.proposal : null,
            by: typeof data.by === 'string' ? data.by : '',
        };
    });
}
exports.applyBoxProblemFix = (0, sentry_1.onCall)(async (request) => {
    var _a;
    if (!request.auth)
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    if (!(0, guestSessions_1.isAdminToken)(request.auth.token))
        throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
    const body = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const fixId = body.fixId;
    if (fixId !== 'charge' && fixId !== 'remove' && fixId !== 'rehome' && fixId !== 'make-free' && fixId !== 'approve' && fixId !== 'donation') {
        throw new sentry_1.HttpsError('invalid-argument', 'Unknown fix.');
    }
    const path = typeof body.path === 'string' ? body.path.trim() : '';
    const db = (0, firestore_1.getFirestore)();
    const people = typeof body.people === 'number' && body.people > 0 ? body.people : 2;
    const kids = typeof body.kids === 'number' && body.kids >= 0 ? body.kids : 0;
    const problem = {
        code: typeof body.code === 'string' ? body.code : '',
        section: typeof body.section === 'string' ? body.section : '',
        detail: typeof body.detail === 'string' ? body.detail : '',
        itemId: typeof body.itemId === 'string' ? body.itemId : null,
        childKey: typeof body.childKey === 'string' ? body.childKey : null,
        slotId: typeof body.slotId === 'string' ? body.slotId : null,
    };
    const fixLabel = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : fixId;
    const log = async (itemIds) => {
        var _a, _b;
        await recordFixLog(db, {
            path,
            email: typeof body.email === 'string' ? body.email : null,
            problem,
            fixId,
            fixLabel,
            itemIds: itemIds.length ? itemIds : problem.itemId ? [problem.itemId] : [],
            by: (_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid) !== null && _b !== void 0 ? _b : '',
        }).catch(() => undefined);
    };
    if (fixId === 'approve' || fixId === 'donation') {
        await (0, boxAuditDecisions_1.writeBoxAuditDecision)(db, request.auth.uid, Object.assign(Object.assign({}, body), { path, decision: fixId, note: fixLabel }));
        await log([]);
        return { ok: true };
    }
    const catalog = await loadFixCatalog(db);
    const paths = [path, ...(await siblingPaths(db, path))];
    let changed = false;
    let itemIds = [];
    for (const target of paths) {
        const box = await loadFixBox(db, target);
        if (!box)
            continue;
        const next = applyCheckedLineFix(fixId, problem, box.lines, catalog, people, box.wrapSelectedItemIds, kids);
        if (!next || JSON.stringify(next) === JSON.stringify(box.lines))
            continue;
        if (target === path)
            itemIds = touchedItemIds(box.lines, next);
        await writeLines(db, target, next, request.auth.uid);
        changed = true;
    }
    if (!changed)
        throw new sentry_1.HttpsError('failed-precondition', 'Nothing in the box changed.');
    await (0, boxAuditDecisions_1.writeBoxAuditDecision)(db, request.auth.uid, Object.assign(Object.assign({}, body), { path, decision: null }));
    await log(itemIds);
    return { ok: true };
});
//# sourceMappingURL=boxProblemFixes.js.map