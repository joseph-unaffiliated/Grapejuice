"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETIRE_CAPTURE_ID = exports.PRE_LOCK_CAPTURE_ID = void 0;
exports.retireAllowed = retireAllowed;
exports.itemIdsFromLines = itemIdsFromLines;
exports.archiveDraftBoxes = archiveDraftBoxes;
exports.retireUnsecuredDrafts = retireUnsecuredDrafts;
/**
 * Point-in-time copies of unfinished Hanukkah boxes.
 *
 * `boxDraftArchives/{captureId}__account__{householdId}` and
 * `...__guest__{visitorId}` hold the line items. The live draft is never
 * deleted. To put a box back, copy `lineItems` and `wrapSelectedItemIds`
 * onto `households/{householdId}/boxDrafts/hanukkah-2026` (or the guest
 * session snapshot). A later capture does not overwrite an earlier one.
 *
 * Favorites are a separate write: at Monday noon the same items are unioned
 * into `households.wishlistItemIds` for households that never placed a box.
 * Their draft stays, so a friends-and-family link can keep editing it.
 */
const firestore_1 = require("firebase-admin/firestore");
const lockWindow_1 = require("./lockWindow");
exports.PRE_LOCK_CAPTURE_ID = 'pre-lock-2026-11-07';
exports.RETIRE_CAPTURE_ID = 'retire-2026-11-09';
const HOLIDAY_ID = 'hanukkah-2026';
const LIVE_BOX = new Set(['pending', 'committed', 'confirmed', 'shipped', 'delivered']);
const BATCH = 400;
function retireAllowed(now) {
    return now.getTime() >= Date.parse(lockWindow_1.EXTENSION_END);
}
function itemIdsFromLines(lines) {
    if (!Array.isArray(lines))
        return [];
    const ids = [];
    for (const line of lines) {
        if (!line || typeof line !== 'object')
            continue;
        const itemId = line.itemId;
        const quantity = line.quantity;
        if (typeof itemId !== 'string' || !itemId)
            continue;
        if (typeof quantity === 'number' && quantity <= 0)
            continue;
        ids.push(itemId);
    }
    return [...new Set(ids)];
}
function iso(value) {
    if (typeof value === 'string' && value)
        return value;
    if (value &&
        typeof value === 'object' &&
        'toDate' in value &&
        typeof value.toDate === 'function') {
        const date = value.toDate();
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    return null;
}
function linesOf(value) {
    return Array.isArray(value) ? value : [];
}
function stringList(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((id) => typeof id === 'string' && id.length > 0);
}
async function commitWrites(db, writes) {
    for (let i = 0; i < writes.length; i += BATCH) {
        const batch = db.batch();
        for (const write of writes.slice(i, i + BATCH)) {
            batch.set(db.doc(write.path), write.data);
        }
        await batch.commit();
    }
}
async function liveBoxHouseholds(db) {
    var _a, _b;
    const ids = new Set();
    const snap = await db.collectionGroup('orders').select('status', 'holidayId', 'playthrough').get();
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.holidayId !== HOLIDAY_ID || data.playthrough === true)
            continue;
        if (!LIVE_BOX.has(String((_a = data.status) !== null && _a !== void 0 ? _a : '')))
            continue;
        const householdId = (_b = doc.ref.parent.parent) === null || _b === void 0 ? void 0 : _b.id;
        if (householdId)
            ids.add(householdId);
    }
    return ids;
}
/**
 * Copy every account draft and every guest box that still has items.
 * When `wishlist` is set, also union those item ids into favorites for
 * households that do not already have a live Hanukkah box order.
 */
async function archiveDraftBoxes(db, options) {
    var _a, _b;
    const now = (_a = options.now) !== null && _a !== void 0 ? _a : new Date();
    const capturedAt = now.toISOString();
    const live = options.wishlist ? await liveBoxHouseholds(db) : new Set();
    const writes = [];
    const wishlistWrites = [];
    let accountDrafts = 0;
    let guestDrafts = 0;
    let skippedLiveBoxes = 0;
    const drafts = await db.collectionGroup('boxDrafts').get();
    for (const doc of drafts.docs) {
        if (doc.id !== HOLIDAY_ID)
            continue;
        const householdId = (_b = doc.ref.parent.parent) === null || _b === void 0 ? void 0 : _b.id;
        if (!householdId)
            continue;
        const data = doc.data();
        const lineItems = linesOf(data.lineItems);
        if (lineItems.length === 0)
            continue;
        accountDrafts += 1;
        const hasLiveBox = live.has(householdId);
        if (hasLiveBox)
            skippedLiveBoxes += 1;
        writes.push({
            path: `boxDraftArchives/${options.captureId}__account__${householdId}`,
            data: {
                captureId: options.captureId,
                kind: 'account',
                sourcePath: doc.ref.path,
                householdId,
                visitorId: null,
                lineItems,
                wrapSelectedItemIds: stringList(data.wrapSelectedItemIds),
                updatedAt: iso(data.updatedAt),
                updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null,
                lineCount: lineItems.length,
                capturedAt,
                hasLiveBox,
                wishlisted: options.wishlist && !hasLiveBox,
            },
        });
        if (!options.wishlist || hasLiveBox)
            continue;
        const add = itemIdsFromLines(lineItems);
        if (add.length === 0)
            continue;
        wishlistWrites.push({
            path: `households/${householdId}`,
            data: { wishlistItemIds: firestore_1.FieldValue.arrayUnion(...add) },
        });
    }
    const [flagged, counted] = await Promise.all([
        db.collection('guestSessions').where('hasBox', '==', true).get(),
        db.collection('guestSessions').where('boxItemCount', '>', 0).get(),
    ]);
    const guests = new Map();
    for (const doc of [...flagged.docs, ...counted.docs])
        guests.set(doc.id, doc);
    for (const doc of guests.values()) {
        const data = doc.data();
        const snapshot = data.snapshot && typeof data.snapshot === 'object' ? data.snapshot : {};
        const guest = snapshot.guest && typeof snapshot.guest === 'object'
            ? (snapshot.guest)
            : {};
        const lineItems = linesOf(guest.lineItems);
        if (lineItems.length === 0)
            continue;
        guestDrafts += 1;
        writes.push({
            path: `boxDraftArchives/${options.captureId}__guest__${doc.id}`,
            data: {
                captureId: options.captureId,
                kind: 'guest',
                sourcePath: doc.ref.path,
                householdId: null,
                visitorId: doc.id,
                lineItems,
                wrapSelectedItemIds: stringList(guest.wrapSelectedItemIds),
                updatedAt: iso(data.updatedAt),
                updatedBy: null,
                lineCount: lineItems.length,
                capturedAt,
                hasLiveBox: false,
                wishlisted: false,
            },
        });
    }
    await commitWrites(db, writes);
    if (wishlistWrites.length) {
        for (let i = 0; i < wishlistWrites.length; i += BATCH) {
            const batch = db.batch();
            for (const write of wishlistWrites.slice(i, i + BATCH)) {
                batch.set(db.doc(write.path), write.data, { merge: true });
            }
            await batch.commit();
        }
    }
    return {
        captureId: options.captureId,
        accountDrafts,
        guestDrafts,
        wishlisted: wishlistWrites.length,
        skippedLiveBoxes,
    };
}
/** Monday noon: archive again, then copy unfinished boxes into favorites. */
async function retireUnsecuredDrafts(db, now = new Date()) {
    var _a;
    if (!retireAllowed(now))
        return { skipped: 'before-monday-noon' };
    const configRef = db.doc('config/hanukkah-2026');
    const config = await configRef.get();
    if ((_a = config.data()) === null || _a === void 0 ? void 0 : _a.draftsRetiredAt)
        return { skipped: 'already-retired' };
    const result = await archiveDraftBoxes(db, {
        captureId: exports.RETIRE_CAPTURE_ID,
        wishlist: true,
        now,
    });
    await configRef.set({ draftsRetiredAt: now.toISOString(), draftsRetiredCaptureId: exports.RETIRE_CAPTURE_ID }, { merge: true });
    return result;
}
//# sourceMappingURL=draftArchive.js.map