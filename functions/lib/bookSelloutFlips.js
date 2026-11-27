"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledBookSelloutFlips = exports.BOOK_SELLOUT_FLIPS = void 0;
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const catalogInventory_1 = require("./catalogInventory");
const airtableCatalogSync_1 = require("./airtableCatalogSync");
/**
 * Phase-2 sell-out flips for the non-Prime books (plan: book_sell-out_rollout).
 * Each flip, at its fixed ET slot: recompute committed copies (secured boxes +
 * paid gifts), set Airtable Inventory = committed + set aside (Hold inventory stays
 * checked), resync the catalog, and verify the book reads sold out. Drafts are
 * then swapped by the 30-min inventory watch. Runs entirely server-side; state
 * in bookSelloutFlips/{itemId} so a flip never runs twice.
 *
 * Times are UTC (EDT = UTC-4). To cancel a flip, delete its entry here and
 * redeploy, or set bookSelloutFlips/{itemId} to { status: 'cancelled' }.
 */
const AIRTABLE_BASE = 'appQscrPCQUIj4shh';
const FULL_CATALOG_TABLE = 'tblCUCVfohWTQy8fP';
const F = { inventory: 'fldXpTJPasuaXfoeW', hold: 'fldFpeHc3sxneJ1TH' };
const STATE_COLLECTION = 'bookSelloutFlips';
/**
 * Retired Nov 27, 2026. The six Oct 23–25 flips (story-of-hanukkah 10/23 10:22 ET, hanukkah-hop
 * 10/23 3:36 PM, nathan-blows-out 10/24 10:22, latke-who-couldn-t-stop-screaming 10/24 3:36,
 * rugrats-chanukah 10/25 10:22, ava-s-homemade-hanukkah 10/25 3:36) never ran: AIRTABLE_PAT is
 * read-only (the catalog sync only needs records:read), so every PATCH returned 403 and the job
 * retried every 5 minutes. Airtable was already set to the committed count with Hold on, so the
 * flips were cancelled in Firestore rather than fixed. A future flip needs a PAT with
 * data.records:write on the catalog table.
 */
exports.BOOK_SELLOUT_FLIPS = [];
const MAX_FLIP_ATTEMPTS = 3;
const FLIP_RETRY_BACKOFF_MS = 60 * 60 * 1000;
async function flipOneBook(db, itemId) {
    var _a, _b, _c, _d, _e;
    const stateRef = db.doc(`${STATE_COLLECTION}/${itemId}`);
    const claimed = await db.runTransaction(async (tx) => {
        var _a, _b, _c, _d, _e, _f;
        const snap = await tx.get(stateRef);
        const data = snap.data();
        const status = data === null || data === void 0 ? void 0 : data.status;
        if (status === 'done' || status === 'cancelled')
            return false;
        // A flip that died mid-run stays 'running'. Retry it once the attempt is stale.
        if (status === 'running') {
            const started = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.startedAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
            if (Date.now() - started < 15 * 60 * 1000)
                return false;
        }
        // A failed flip retries a few times, an hour apart, then waits for a human (a permissions
        // error otherwise repeats every 5 minutes forever and floods Sentry).
        const attempts = Number(data === null || data === void 0 ? void 0 : data.attempts) || 0;
        if (status === 'failed') {
            if (attempts >= MAX_FLIP_ATTEMPTS)
                return false;
            const failedAt = (_f = (_e = (_d = data === null || data === void 0 ? void 0 : data.failedAt) === null || _d === void 0 ? void 0 : _d.toMillis) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : 0;
            if (Date.now() - failedAt < FLIP_RETRY_BACKOFF_MS)
                return false;
        }
        tx.set(stateRef, { status: 'running', startedAt: firestore_1.Timestamp.now(), attempts: attempts + 1 }, { merge: true });
        return true;
    });
    if (!claimed)
        return;
    try {
        const pat = (_a = process.env.AIRTABLE_PAT) === null || _a === void 0 ? void 0 : _a.trim();
        if (!pat)
            throw new Error('AIRTABLE_PAT unset');
        await (0, catalogInventory_1.recomputeBoxAllocations)(db);
        const [itemSnap, invSnap] = await Promise.all([
            db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/items/${itemId}`).get(),
            db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/inventory/${itemId}`).get(),
        ]);
        if (!itemSnap.exists)
            throw new Error(`catalog item ${itemId} missing`);
        const item = (_b = itemSnap.data()) !== null && _b !== void 0 ? _b : {};
        const recordId = typeof item.airtableRecordId === 'string' ? item.airtableRecordId : '';
        if (!recordId)
            throw new Error(`catalog item ${itemId} has no airtableRecordId`);
        const committed = Math.max(0, Math.floor(Number((_c = invSnap.data()) === null || _c === void 0 ? void 0 : _c.boxAllocatedQty) || 0));
        const setAside = Math.max(0, Math.floor(Number(item.setAside) || 0));
        const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${FULL_CATALOG_TABLE}/${recordId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { [F.inventory]: committed + setAside, [F.hold]: true }, typecast: true }),
        });
        if (!res.ok)
            throw new Error(`Airtable update ${res.status}: ${await res.text()}`);
        await (0, airtableCatalogSync_1.runAirtableCatalogReplaceSync)();
        const after = (_d = (await db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/items/${itemId}`).get()).data()) !== null && _d !== void 0 ? _d : {};
        const counters = (_e = (await db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/inventory/${itemId}`).get()).data()) !== null && _e !== void 0 ? _e : {};
        const held = Math.max(0, Math.floor(Number(counters.boxAllocatedQty) || 0));
        const kept = Math.max(0, Math.floor(Number(after.setAside) || 0));
        const stockLeft = typeof after.inventory === 'number' ? after.inventory - kept - held : null;
        await stateRef.set({
            status: 'done',
            committed,
            stockLeft,
            flippedAt: firestore_1.Timestamp.now(),
            verified: stockLeft === 0,
        }, { merge: true });
        logger.info('bookSelloutFlips: flipped', { itemId, committed, stockLeft });
    }
    catch (err) {
        await stateRef.set({ status: 'failed', error: String(err).slice(0, 300), failedAt: firestore_1.Timestamp.now() }, { merge: true });
        logger.error(`bookSelloutFlips: flip failed for ${itemId}: ${String(err).slice(0, 300)}`, { itemId });
    }
}
exports.scheduledBookSelloutFlips = (0, sentry_1.onSchedule)({ schedule: 'every 5 minutes', timeZone: 'America/New_York', memory: '1GiB', timeoutSeconds: 540 }, async () => {
    const now = Date.now();
    const due = exports.BOOK_SELLOUT_FLIPS.filter((f) => now >= Date.parse(f.at));
    if (!due.length)
        return;
    const db = (0, firestore_1.getFirestore)();
    for (const flip of due) {
        await flipOneBook(db, flip.itemId);
    }
});
//# sourceMappingURL=bookSelloutFlips.js.map