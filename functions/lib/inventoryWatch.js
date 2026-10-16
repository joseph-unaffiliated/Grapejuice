"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledInventoryWatch = exports.INVENTORY_SWAPS = void 0;
exports.toDraftLines = toDraftLines;
exports.countDraftHolds = countDraftHolds;
exports.guestKidAges = guestKidAges;
exports.guestDraftLines = guestDraftLines;
exports.loadUnsecuredDrafts = loadUnsecuredDrafts;
exports.writeDraftHolds = writeDraftHolds;
exports.swapNotices = swapNotices;
exports.applySoldOutSwaps = applySoldOutSwaps;
exports.lowItemsReport = lowItemsReport;
exports.lockPassed = lockPassed;
exports.runInventoryWatch = runInventoryWatch;
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const catalogInventory_1 = require("./catalogInventory");
const context_1 = require("./rav/context");
const boxRules_1 = require("./rav/boxRules");
const testAccounts_1 = require("./testAccounts");
/**
 * Inventory watch (every 30 minutes):
 *  1. Counts units sitting in account drafts without a box order (signed-out boxes and gift
 *     drafts don't count) into
 *     catalog/hanukkah/inventory/{itemId}.draftHeldQty. Drafts hold no stock; the count only
 *     feeds the "low" rule (defaults + the low-stock email).
 *  2. Swaps truly sold-out items (every unit held by a real order) out of those drafts using the
 *     box rules, and records each swap in inventorySwaps/{draftKey}_{itemId} for the swapped email.
 * Secured boxes (pending/committed/... orders) are never touched.
 * Off unless GJ_INVENTORY_WATCH_ENABLED=true. scripts/inventory-alerts-preview.mjs runs it dry.
 */
exports.INVENTORY_SWAPS = 'inventorySwaps';
const DRAFT_STATUSES_SECURED = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const MAX_NOTICES = 10;
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function toDraftLines(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw.filter((l) => isRecord(l) && typeof l.itemId === 'string' && l.itemId.length > 0 && typeof l.slotId === 'string');
}
function lineQty(line) {
    return typeof line.quantity === 'number' && Number.isFinite(line.quantity) ? Math.max(0, Math.floor(line.quantity)) : 0;
}
/**
 * Units per item across unsecured account drafts (test accounts excluded). Signed-out boxes
 * and gift drafts rarely check out, so they don't count toward "low".
 */
function countDraftHolds(drafts) {
    var _a;
    const totals = new Map();
    for (const d of drafts) {
        if (d.test || d.kind !== 'household')
            continue;
        for (const line of [...d.lines, ...d.giftLines]) {
            const qty = lineQty(line);
            if (qty > 0)
                totals.set(line.itemId, ((_a = totals.get(line.itemId)) !== null && _a !== void 0 ? _a : 0) + qty);
        }
    }
    return totals;
}
/** Guest kid ids the client assigns: non-adult box kids `guest-N`, gift kids `gift-child-N`. */
function guestKidAges(snapshot) {
    const ages = new Map();
    const guest = isRecord(snapshot.guest) ? snapshot.guest : {};
    const kids = Array.isArray(guest.childDrafts) ? guest.childDrafts.filter((c) => isRecord(c) && c.role !== 'adult') : [];
    kids.forEach((kid, i) => {
        const age = (0, boxRules_1.plannerAgeOf)(kid);
        if (age != null)
            ages.set(`guest-${i}`, age);
    });
    const gift = isRecord(snapshot.gift) ? snapshot.gift : null;
    const giftKids = gift && isRecord(gift.draft) && Array.isArray(gift.draft.childDrafts) ? gift.draft.childDrafts : [];
    giftKids.forEach((kid, i) => {
        const age = isRecord(kid) ? (0, boxRules_1.plannerAgeOf)(kid) : undefined;
        if (age != null)
            ages.set(`gift-child-${i}`, age);
    });
    return ages;
}
function guestDraftLines(snapshot) {
    const guest = isRecord(snapshot.guest) ? snapshot.guest : {};
    const hasBox = guest.onboardingComplete === true || guest.boxRevealComplete === true;
    const gift = isRecord(snapshot.gift) ? snapshot.gift : null;
    const giftDraft = (gift === null || gift === void 0 ? void 0 : gift.status) === 'incomplete' && isRecord(gift.draft) ? gift.draft : null;
    return {
        lines: hasBox ? toDraftLines(guest.lineItems) : [],
        giftLines: giftDraft ? toDraftLines(giftDraft.lineItems) : [],
    };
}
async function householdsWithSecuredBox(db) {
    const secured = new Set();
    for (const status of DRAFT_STATUSES_SECURED) {
        const snap = await db
            .collectionGroup('orders')
            .where('holidayId', '==', catalogInventory_1.HOLIDAY_ID)
            .where('status', '==', status)
            .select('orderType', 'playthrough')
            .get();
        for (const d of snap.docs) {
            const o = d.data();
            if (o.orderType === 'marketplace' || o.orderType === 'received_gift' || o.playthrough === true)
                continue;
            const hh = d.ref.parent.parent;
            if ((hh === null || hh === void 0 ? void 0 : hh.parent.id) === 'households')
                secured.add(hh.id);
        }
    }
    return secured;
}
/** Every draft that could still hold an item without reserving it. Read-only. */
async function loadUnsecuredDrafts(db) {
    const [secured, draftSnap, householdSnap, userSnap, guestBoxSnap, guestGiftSnap] = await Promise.all([
        householdsWithSecuredBox(db),
        db.collectionGroup('boxDrafts').get(),
        db.collection('households').select('ownerId').get(),
        db.collection('users').select('email').get(),
        db.collection('guestSessions').where('hasBox', '==', true).get(),
        db.collection('guestSessions').where('hasGiftDraft', '==', true).get(),
    ]);
    const owners = new Map(householdSnap.docs.map((d) => [d.id, d.data().ownerId]));
    const emails = new Map(userSnap.docs.map((d) => [d.id, d.data().email]));
    const drafts = [];
    for (const d of draftSnap.docs) {
        const hh = d.ref.parent.parent;
        if (d.id !== catalogInventory_1.HOLIDAY_ID || (hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households' || secured.has(hh.id))
            continue;
        const lines = toDraftLines(d.data().lineItems);
        if (!lines.length)
            continue;
        const ownerId = typeof owners.get(hh.id) === 'string' ? owners.get(hh.id) : undefined;
        const email = ownerId && typeof emails.get(ownerId) === 'string' ? emails.get(ownerId) : null;
        drafts.push({
            key: `hh_${hh.id}`,
            kind: 'household',
            ref: d.ref,
            lines,
            giftLines: [],
            householdId: hh.id,
            ownerId,
            ownerEmail: email,
            test: (0, testAccounts_1.isTest)(email),
        });
    }
    const seen = new Set();
    for (const d of [...guestBoxSnap.docs, ...guestGiftSnap.docs]) {
        if (seen.has(d.id))
            continue;
        seen.add(d.id);
        const data = d.data();
        if (typeof data.convertedUid === 'string' && data.convertedUid)
            continue;
        const snapshot = isRecord(data.snapshot) ? data.snapshot : {};
        const { lines, giftLines } = guestDraftLines(snapshot);
        if (!lines.length && !giftLines.length)
            continue;
        drafts.push({
            key: `guest_${d.id}`,
            kind: 'guest',
            ref: d.ref,
            lines,
            giftLines,
            leadEmailHash: typeof data.lastLeadEmailHash === 'string' ? data.lastLeadEmailHash : null,
            guestKidAges: guestKidAges(snapshot),
            test: false,
        });
    }
    return drafts;
}
/** Write draftHeldQty for every tracked counter doc (zeroing items no longer in drafts). */
async function writeDraftHolds(db, totals) {
    var _a;
    const invSnap = await db.collection(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/inventory`).select().get();
    const ids = [...new Set([...totals.keys(), ...invSnap.docs.map((d) => d.id)])];
    const nowIso = new Date().toISOString();
    for (let i = 0; i < ids.length; i += 400) {
        const batch = db.batch();
        for (const id of ids.slice(i, i + 400)) {
            batch.set((0, catalogInventory_1.inventoryDocRef)(db, id), { draftHeldQty: (_a = totals.get(id)) !== null && _a !== void 0 ? _a : 0, draftHeldAt: nowIso }, { merge: true });
        }
        await batch.commit();
    }
    return ids.length;
}
function nameOf(catalog, id) {
    var _a, _b;
    if (!id)
        return null;
    return (_b = (_a = catalog.find((r) => r.id === id)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : id;
}
function swapNotices(swaps, catalog, at) {
    return swaps.map((s) => {
        var _a;
        return ({
            fromItemId: s.fromItemId,
            fromName: (_a = nameOf(catalog, s.fromItemId)) !== null && _a !== void 0 ? _a : s.fromItemId,
            toItemId: s.toItemId,
            toName: nameOf(catalog, s.toItemId),
            at,
        });
    });
}
function mergeNotices(existing, added) {
    const prior = Array.isArray(existing) ? existing.filter(isRecord) : [];
    const fresh = new Set(added.map((n) => n.fromItemId));
    return [...prior.filter((n) => !fresh.has(n.fromItemId)), ...added].slice(-MAX_NOTICES);
}
async function householdKidAges(db, ownerId) {
    const ages = new Map();
    if (!ownerId)
        return ages;
    const snap = await db.collection(`users/${ownerId}/children`).get();
    for (const d of snap.docs) {
        const age = (0, boxRules_1.plannerAgeOf)(d.data());
        if (age != null)
            ages.set(d.id, age);
    }
    return ages;
}
function countSwaps(result, swaps) {
    var _a, _b, _c;
    var _d, _e;
    if (swaps.length)
        result.draftsSwapped += 1;
    for (const s of swaps) {
        const entry = ((_a = (_d = result.swapsByItem)[_e = s.fromItemId]) !== null && _a !== void 0 ? _a : (_d[_e] = { drafts: 0, replacements: {} }));
        entry.drafts += 1;
        const to = (_b = s.toItemId) !== null && _b !== void 0 ? _b : '(removed)';
        entry.replacements[to] = ((_c = entry.replacements[to]) !== null && _c !== void 0 ? _c : 0) + 1;
    }
}
async function recordSwaps(db, draft, notices) {
    var _a;
    const batch = db.batch();
    for (const n of notices) {
        batch.set(db.doc(`${exports.INVENTORY_SWAPS}/${draft.key}_${n.fromItemId}`), {
            draftKey: draft.key,
            kind: draft.kind,
            householdId: (_a = draft.householdId) !== null && _a !== void 0 ? _a : null,
            visitorId: draft.kind === 'guest' ? draft.ref.id : null,
            fromItemId: n.fromItemId,
            toItemId: n.toItemId,
            swappedAt: firestore_1.Timestamp.now(),
            emailed: false,
        }, { merge: true });
    }
    await batch.commit();
}
/**
 * Swap sold-out lines out of each unsecured draft. Each write re-reads the draft in a
 * transaction so a shopper's concurrent edit is never clobbered with stale lines.
 */
async function applySoldOutSwaps(db, drafts, catalog, options = {}) {
    var _a;
    const result = { draftsSwapped: 0, swapsByItem: {} };
    const soldOutIds = new Set(catalog.filter(boxRules_1.isSoldOutForBoxes).map((r) => r.id));
    if (!soldOutIds.size)
        return result;
    const at = new Date().toISOString();
    for (const draft of drafts) {
        if (![...draft.lines, ...draft.giftLines].some((l) => soldOutIds.has(l.itemId)))
            continue;
        if (draft.kind === 'household') {
            const ages = await householdKidAges(db, draft.ownerId);
            const ageFor = (id) => (id ? ages.get(id) : undefined);
            if (options.dryRun) {
                countSwaps(result, (0, boxRules_1.swapSoldOutLines)(draft.lines, catalog, ageFor).swaps);
                continue;
            }
            const swaps = await db.runTransaction(async (tx) => {
                var _a;
                const snap = await tx.get(draft.ref);
                const data = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
                const next = (0, boxRules_1.swapSoldOutLines)(toDraftLines(data.lineItems), catalog, ageFor);
                if (!next.swaps.length)
                    return [];
                tx.set(draft.ref, {
                    lineItems: next.lines,
                    inventorySwapNotices: mergeNotices(data.inventorySwapNotices, swapNotices(next.swaps, catalog, at)),
                    updatedAt: at,
                    updatedBy: 'inventory-swap',
                    lastChangeSource: 'inventory-swap',
                }, { merge: true });
                return next.swaps;
            });
            countSwaps(result, swaps);
            if (swaps.length)
                await recordSwaps(db, draft, swapNotices(swaps, catalog, at));
            continue;
        }
        const ages = (_a = draft.guestKidAges) !== null && _a !== void 0 ? _a : new Map();
        const ageFor = (id) => (id ? ages.get(id) : undefined);
        if (options.dryRun) {
            const box = (0, boxRules_1.swapSoldOutLines)(draft.lines, catalog, ageFor).swaps;
            const gift = (0, boxRules_1.swapSoldOutLines)(draft.giftLines, catalog, ageFor).swaps;
            countSwaps(result, [...box, ...gift.filter((g) => !box.some((b) => b.fromItemId === g.fromItemId))]);
            continue;
        }
        const swaps = await db.runTransaction(async (tx) => {
            var _a;
            const snap = await tx.get(draft.ref);
            const data = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
            if (typeof data.convertedUid === 'string' && data.convertedUid)
                return [];
            const snapshot = isRecord(data.snapshot) ? data.snapshot : {};
            const current = guestDraftLines(snapshot);
            const box = (0, boxRules_1.swapSoldOutLines)(current.lines, catalog, ageFor);
            const gift = (0, boxRules_1.swapSoldOutLines)(current.giftLines, catalog, ageFor);
            const all = [...box.swaps, ...gift.swaps.filter((g) => !box.swaps.some((b) => b.fromItemId === g.fromItemId))];
            if (!all.length)
                return [];
            const guest = isRecord(snapshot.guest) ? snapshot.guest : {};
            const update = {};
            if (box.swaps.length) {
                update['snapshot.guest.lineItems'] = box.lines;
                update['snapshot.guest.inventorySwapNotices'] = mergeNotices(guest.inventorySwapNotices, swapNotices(box.swaps, catalog, at));
            }
            if (gift.swaps.length)
                update['snapshot.gift.draft.lineItems'] = gift.lines;
            update.lastChangeSource = 'inventory-swap';
            tx.update(draft.ref, update);
            return all;
        });
        countSwaps(result, swaps);
        if (swaps.length)
            await recordSwaps(db, draft, swapNotices(swaps, catalog, at));
    }
    return result;
}
function lowItemsReport(catalog) {
    const item = (r) => ({
        id: r.id,
        name: r.name,
        inventory: typeof r.inventory === 'number' ? r.inventory : null,
        stockLeft: typeof r.stockLeft === 'number' ? r.stockLeft : null,
        draftHeld: typeof r.draftHeld === 'number' ? r.draftHeld : 0,
        remaining: (0, boxRules_1.rowRemainingWithDrafts)(r),
    });
    return {
        low: catalog.filter((r) => (0, boxRules_1.isLowWithDrafts)(r) && !(0, boxRules_1.isSoldOutForBoxes)(r)).map(item),
        soldOut: catalog.filter(boxRules_1.isSoldOutForBoxes).map(item),
    };
}
async function lockPassed(db) {
    var _a;
    const lockAt = (_a = (await db.doc(`config/${catalogInventory_1.HOLIDAY_ID}`).get()).data()) === null || _a === void 0 ? void 0 : _a.lockAt;
    return typeof lockAt === 'string' && Date.now() >= new Date(lockAt).getTime();
}
/** Count draft holds, write them (unless dry), then swap sold-out lines (unless dry or locked). */
async function runInventoryWatch(db, options = {}) {
    const drafts = await loadUnsecuredDrafts(db);
    const totals = countDraftHolds(drafts);
    if (!options.dryRun)
        await writeDraftHolds(db, totals);
    const catalog = (0, context_1.toBoxRulesRows)(await (0, context_1.loadCatalogRows)(db)).map((r) => { var _a; return options.dryRun ? Object.assign(Object.assign({}, r), { draftHeld: (_a = totals.get(r.id)) !== null && _a !== void 0 ? _a : 0 }) : r; });
    const locked = await lockPassed(db);
    const { low, soldOut } = lowItemsReport(catalog);
    const swaps = locked
        ? { draftsSwapped: 0, swapsByItem: {} }
        : await applySoldOutSwaps(db, drafts, catalog, options);
    return {
        drafts: {
            household: drafts.filter((d) => d.kind === 'household' && !d.test).length,
            guest: drafts.filter((d) => d.kind === 'guest').length,
            test: drafts.filter((d) => d.test).length,
        },
        heldItems: totals.size,
        low,
        soldOut,
        swaps,
        locked,
    };
}
exports.scheduledInventoryWatch = (0, sentry_1.onSchedule)({ schedule: 'every 30 minutes', timeZone: 'America/New_York', memory: '1GiB', timeoutSeconds: 540 }, async () => {
    if (process.env.GJ_INVENTORY_WATCH_ENABLED !== 'true')
        return;
    const result = await runInventoryWatch((0, firestore_1.getFirestore)());
    logger.info('scheduledInventoryWatch', {
        drafts: result.drafts,
        heldItems: result.heldItems,
        low: result.low.map((i) => `${i.id}:${i.remaining}`),
        soldOut: result.soldOut.map((i) => i.id),
        swaps: result.swaps,
        locked: result.locked,
    });
});
//# sourceMappingURL=inventoryWatch.js.map