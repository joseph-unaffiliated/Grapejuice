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
 * paid gifts), set Airtable Inventory = committed (Hold inventory stays
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
exports.BOOK_SELLOUT_FLIPS = [
    { itemId: 'book-the-story-of-hanukkah', at: '2026-10-23T14:22:00Z' }, // Fri Oct 23, 10:22 AM ET
    { itemId: 'book-the-hanukkah-hop', at: '2026-10-23T19:36:00Z' }, // Fri Oct 23, 3:36 PM ET
    { itemId: 'book-nathan-blows-out-the-hanukkah-candles', at: '2026-10-24T14:22:00Z' }, // Sat Oct 24, 10:22 AM ET
    { itemId: 'book-the-latke-who-couldn-t-stop-screaming', at: '2026-10-24T19:36:00Z' }, // Sat Oct 24, 3:36 PM ET
    { itemId: 'book-a-rugrats-chanukah', at: '2026-10-25T14:22:00Z' }, // Sun Oct 25, 10:22 AM ET
    { itemId: 'book-ava-s-homemade-hanukkah', at: '2026-10-25T19:36:00Z' }, // Sun Oct 25, 3:36 PM ET
];
async function flipOneBook(db, itemId) {
    var _a, _b, _c, _d, _e;
    const stateRef = db.doc(`${STATE_COLLECTION}/${itemId}`);
    const claimed = await db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(stateRef);
        const status = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.status;
        if (status === 'done' || status === 'cancelled' || status === 'running')
            return false;
        tx.set(stateRef, { status: 'running', startedAt: firestore_1.Timestamp.now() }, { merge: true });
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
        const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${FULL_CATALOG_TABLE}/${recordId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { [F.inventory]: committed, [F.hold]: true }, typecast: true }),
        });
        if (!res.ok)
            throw new Error(`Airtable update ${res.status}: ${await res.text()}`);
        await (0, airtableCatalogSync_1.runAirtableCatalogReplaceSync)();
        const after = (_d = (await db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/items/${itemId}`).get()).data()) !== null && _d !== void 0 ? _d : {};
        const counters = (_e = (await db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/inventory/${itemId}`).get()).data()) !== null && _e !== void 0 ? _e : {};
        const held = Math.max(0, Math.floor(Number(counters.boxAllocatedQty) || 0));
        const stockLeft = typeof after.inventory === 'number' ? after.inventory - held : null;
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
        logger.error('bookSelloutFlips: flip failed', { itemId, err: String(err).slice(0, 300) });
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