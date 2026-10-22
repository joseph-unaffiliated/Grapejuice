"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogEmailImage = catalogEmailImage;
exports.boxEmailItems = boxEmailItems;
exports.lineItemsEmailItems = lineItemsEmailItems;
exports.boxThumbFields = boxThumbFields;
exports.suggestEmailItems = suggestEmailItems;
exports.soldOutBookItem = soldOutBookItem;
exports.pickEmailItems = pickEmailItems;
const logger = require("./logger");
const storage_1 = require("firebase-admin/storage");
const crypto_1 = require("crypto");
const sharp = require("sharp");
const CATALOG_ITEMS = 'catalog/hanukkah/items';
const MAX_BOX_ITEMS = 6;
const MAX_PICKS = 3;
const IMAGE_PX = 600;
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function formatPrice(cents) {
    const n = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
    if (n <= 0)
        return '';
    return n % 100 === 0 ? `$${n / 100}` : `$${(n / 100).toFixed(2)}`;
}
async function emailImageUrl(itemId, sourceUrl, shape = 'card') {
    const bucket = (0, storage_1.getStorage)().bucket();
    const hash = (0, crypto_1.createHash)('sha1').update(sourceUrl).digest('hex').slice(0, 10);
    const path = `email/catalog/${itemId}-${hash}${shape === 'hero' ? '-hero' : ''}.jpg`;
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (exists)
        return publicUrl;
    const res = await fetch(sourceUrl);
    if (!res.ok) {
        logger.warn('emailItems: image download failed', { itemId, status: res.status });
        return null;
    }
    const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
        .rotate()
        .resize(shape === 'hero'
        ? { width: IMAGE_PX, withoutEnlargement: true }
        : { width: IMAGE_PX, height: IMAGE_PX, fit: 'contain', background: '#ffffff' })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    await file.save(jpg, {
        contentType: 'image/jpeg',
        metadata: { cacheControl: 'public,max-age=604800' },
        resumable: false,
    });
    await file.makePublic().catch(() => undefined);
    return publicUrl;
}
/**
 * 600px JPG of an item's secondary photo (`imageUrls[1]`, kept at its own proportions) or main
 * photo (square card), falling back to the other.
 */
async function catalogEmailImage(id, cat, prefer) {
    const urls = Array.isArray(cat.imageUrls) ? cat.imageUrls.filter((u) => typeof u === 'string') : [];
    const primary = typeof cat.imageUrl === 'string' ? cat.imageUrl : urls[0];
    const secondary = urls[1];
    const order = prefer === 'secondary' ? [secondary, primary] : [primary, secondary];
    for (const source of order) {
        if (!source)
            continue;
        const image = await emailImageUrl(id, source, prefer === 'secondary' && source === secondary ? 'hero' : 'card');
        if (image)
            return image;
    }
    return null;
}
async function toEmailItem(id, cat, opts) {
    var _a;
    const source = typeof cat.imageUrl === 'string' ? cat.imageUrl : null;
    if (!source)
        return null;
    const image = await emailImageUrl(id, source);
    if (!image)
        return null;
    return {
        name: String((_a = cat.name) !== null && _a !== void 0 ? _a : id),
        image_url: image,
        caption: typeof cat.category === 'string' ? cat.category : '',
        quantity: opts.quantity,
        price: opts.withPrice ? formatPrice(cat.nonMemberPriceCents) : '',
        url: opts.url,
    };
}
/** Up to six distinct items from a saved guest box, in box order; every card links to the resume URL. */
async function boxEmailItems(db, snapshot, resumeUrl) {
    const guest = isRecord(snapshot) && isRecord(snapshot.guest) ? snapshot.guest : {};
    return lineItemsEmailItems(db, guest.lineItems, resumeUrl);
}
/** Up to six distinct items from box `lineItems` (guest snapshot or household draft); every card links to `url`. */
async function lineItemsEmailItems(db, lineItems, url) {
    var _a, _b, _c;
    const lines = Array.isArray(lineItems) ? lineItems : [];
    const quantities = new Map();
    for (const line of lines) {
        if (!isRecord(line) || typeof line.itemId !== 'string')
            continue;
        const qty = typeof line.quantity === 'number' ? line.quantity : 0;
        if (qty <= 0)
            continue;
        quantities.set(line.itemId, ((_a = quantities.get(line.itemId)) !== null && _a !== void 0 ? _a : 0) + qty);
    }
    const ids = [...quantities.keys()];
    if (!ids.length)
        return { items: [], more: 0 };
    const snaps = await db.getAll(...ids.map((id) => db.doc(`${CATALOG_ITEMS}/${id}`)));
    const ranked = snaps
        .map((snap, index) => ({ snap, index }))
        .filter((row) => row.snap.exists)
        .sort((a, b) => { var _a, _b; return boxThumbTier(a.snap.id, (_a = a.snap.data()) !== null && _a !== void 0 ? _a : {}) - boxThumbTier(b.snap.id, (_b = b.snap.data()) !== null && _b !== void 0 ? _b : {}) || a.index - b.index; });
    const items = [];
    for (const { snap } of ranked) {
        if (items.length >= MAX_BOX_ITEMS)
            break;
        const item = await toEmailItem(snap.id, (_b = snap.data()) !== null && _b !== void 0 ? _b : {}, {
            quantity: (_c = quantities.get(snap.id)) !== null && _c !== void 0 ? _c : 1,
            url,
            withPrice: false,
        });
        if (item)
            items.push(item);
    }
    return { items, more: Math.max(0, ranked.length - items.length) };
}
/** `items_partial` is true when the box has more items than the six cards. */
function boxThumbFields(picked) {
    return { items: picked.items, items_partial: picked.more > 0 };
}
function catCategory(cat) {
    return typeof cat.category === 'string' ? cat.category.trim().toLowerCase() : '';
}
function catSections(cat) {
    return Array.isArray(cat.boxSections) ? cat.boxSections.map((s) => String(s).trim().toLowerCase()) : [];
}
function isBookDoc(id, cat) {
    const category = catCategory(cat);
    return id.startsWith('book-') || category === 'book' || category === 'books' || catSections(cat).some((s) => s === 'story' || s === 'books' || s.includes('tell the story'));
}
function isGiftDoc(id, cat) {
    const category = catCategory(cat);
    if (category === 'stuffies' || category === 'gift' || category === 'gifts' || category === 'wrapping')
        return true;
    if (catSections(cat).some((s) => s === 'gifts' || s === 'presents' || s.includes('present')))
        return true;
    const slot = typeof cat.slotId === 'string' ? cat.slotId : '';
    if (slot === 'wrapping' || slot === 'wrapping-paper' || slot === 'pre-wrap')
        return true;
    return /wrapping|stuffie/.test(id);
}
function isFoodDoc(id, cat) {
    if (catCategory(cat) === 'stuffies' || /stuffie/.test(id))
        return false;
    if (catCategory(cat) === 'food')
        return true;
    if (catSections(cat).some((s) => s === 'food' || s.includes('eat')))
        return true;
    return /latke-kit|latke-mix|sufganiyot|applesauce/.test(id);
}
/** Gifts and books first, food last, original order kept within a tier. */
function boxThumbTier(id, cat) {
    if (isFoodDoc(id, cat))
        return 2;
    if (isBookDoc(id, cat) || isGiftDoc(id, cat))
        return 0;
    return 1;
}
/** Storefront items to suggest adding: not in `exclude`, not sold out, "most loved" first, then by storefront rank. */
async function suggestEmailItems(db, exclude, soldOut, utm, limit = MAX_PICKS) {
    var _a;
    const snap = await db.collection(CATALOG_ITEMS).get();
    const rank = (d) => {
        const data = d.data();
        const loved = Array.isArray(data.storefrontRails) && data.storefrontRails.includes('most-loved') ? 0 : 1;
        const r = typeof data.storefrontRank === 'number' ? data.storefrontRank : Infinity;
        return [loved, r];
    };
    const ranked = snap.docs
        .filter((d) => !exclude.has(d.id) && !soldOut.has(d.id) && Array.isArray(d.data().storefrontRails) && d.data().storefrontRails.length > 0)
        .sort((a, b) => {
        const [al, ar] = rank(a);
        const [bl, br] = rank(b);
        return al - bl || ar - br;
    });
    const origin = ((_a = process.env.GJ_APP_ORIGIN) === null || _a === void 0 ? void 0 : _a.trim()) || 'https://grapejuice.co';
    const items = [];
    for (const doc of ranked) {
        if (items.length >= limit)
            break;
        const item = await toEmailItem(doc.id, doc.data(), {
            quantity: 1,
            url: `${origin}/product/${encodeURIComponent(doc.id)}?${utm}`,
            withPrice: true,
        });
        if (item)
            items.push(item);
    }
    return items;
}
/** The most recent sold-out book swapped out of this draft (`hh_<id>` or `guest_<visitorId>`), as a card. */
async function soldOutBookItem(db, draftKey, url) {
    var _a, _b;
    const swaps = await db.collection('inventorySwaps').where('draftKey', '==', draftKey).get();
    const recent = swaps.docs.sort((a, b) => {
        const at = (d) => { var _a, _b, _c; return (_c = (_b = (_a = d.data().swappedAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0; };
        return at(b) - at(a);
    });
    for (const swap of recent) {
        const id = swap.data().fromItemId;
        if (typeof id !== 'string')
            continue;
        const cat = await db.doc(`${CATALOG_ITEMS}/${id}`).get();
        if (!cat.exists || !isBookDoc(id, (_a = cat.data()) !== null && _a !== void 0 ? _a : {}))
            continue;
        const item = await toEmailItem(id, (_b = cat.data()) !== null && _b !== void 0 ? _b : {}, { quantity: 1, url, withPrice: false });
        if (item)
            return item;
    }
    return null;
}
/** Three "most loved" storefront products, for leads without a saved box. */
async function pickEmailItems(db, utm) {
    var _a;
    const snap = await db.collection(CATALOG_ITEMS).where('storefrontRails', 'array-contains', 'most-loved').get();
    const ranked = snap.docs.sort((a, b) => {
        const ar = typeof a.data().storefrontRank === 'number' ? a.data().storefrontRank : Infinity;
        const br = typeof b.data().storefrontRank === 'number' ? b.data().storefrontRank : Infinity;
        return ar - br;
    });
    const origin = ((_a = process.env.GJ_APP_ORIGIN) === null || _a === void 0 ? void 0 : _a.trim()) || 'https://grapejuice.co';
    const items = [];
    for (const doc of ranked) {
        if (items.length >= MAX_PICKS)
            break;
        const item = await toEmailItem(doc.id, doc.data(), {
            quantity: 1,
            url: `${origin}/product/${encodeURIComponent(doc.id)}?${utm}`,
            withPrice: true,
        });
        if (item)
            items.push(item);
    }
    return items;
}
//# sourceMappingURL=emailItems.js.map