"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATALOG_HOLIDAY = exports.BOOKS_TABLE_ID = exports.FULL_CATALOG_TABLE_ID = exports.AIRTABLE_BASE_ID_DEFAULT = void 0;
exports.slugifyCatalogId = slugifyCatalogId;
exports.listingCatalogId = listingCatalogId;
exports.bookToItem = bookToItem;
exports.runAirtableCatalogReplaceSync = runAirtableCatalogReplaceSync;
exports.assertCatalogSyncSecret = assertCatalogSyncSecret;
/**
 * Airtable → Firestore catalog replace sync.
 *
 * Source of truth: Grapejuice base Full Catalog (Listings). Book rows there decide which
 * books are listed, their prices, ages and default ages; the linked Hanukkah Books row
 * supplies title, author, copy and gallery images.
 * Writes catalog/hanukkah/items/* and deletes orphans not in the synced set.
 *
 * Env:
 *   AIRTABLE_PAT — Personal access token with data.records:read + schema.bases:read
 *   AIRTABLE_BASE_ID — defaults to appQscrPCQUIj4shh
 *   CATALOG_SYNC_SECRET — shared secret for HTTP trigger (Authorization: Bearer …)
 */
const logger = require("./logger");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const crypto_1 = require("crypto");
const sharp = require("sharp");
const catalogThumbs_1 = require("./catalogThumbs");
exports.AIRTABLE_BASE_ID_DEFAULT = 'appQscrPCQUIj4shh';
exports.FULL_CATALOG_TABLE_ID = 'tblCUCVfohWTQy8fP';
exports.BOOKS_TABLE_ID = 'tbleo48j2H34DRAu1';
exports.CATALOG_HOLIDAY = 'hanukkah';
const F = {
    id: 'fldSPjarW6aFocHj3',
    description: 'fldMEo3Bys38SVisV',
    inProduction: 'fldN3303eOahUbJFU',
    inventory: 'fldXpTJPasuaXfoeW',
    /** Checkbox: when checked, the sync treats Inventory as a real ceiling (books too). */
    holdInventory: 'fldFpeHc3sxneJ1TH',
    /** Number: copies physically ordered (Joseph's sourcing tracker; display-only). */
    procured: 'flduff7svNVQ4pkEw',
    /** Number: copies kept back (personal, friends and family, promo). Subtracted from sellable stock. */
    setAside: 'fldujfIMeuuN7RfYN',
    /** Why those copies are kept. Display-only. */
    setAsideFor: 'fldox7zzryePIFRn2',
    unitCost: 'fldJNKCjYA1aLC2KU',
    memberPrice: 'fldSKmIeWfuRoB2IC',
    nonMemberPrice: 'fld9ipf5vOEkaMGes',
    category: 'fldDZqfGn1nrSDnwx',
    source: 'fldTuhfkRLcdVafg3',
    context: 'flduPd4VJSCm3Q8wz',
    age: 'fld19V2PBeilijWg5',
    agesForSwaps: 'fldtaNkpIzy40hsut',
    primaryImage: 'fld0nkf58rYVbWhZJ',
    otherImages: 'fldKFSK4F2FoD7QR6', // Airtable "Other Images" (secondary gallery)
    link: 'fldicpeRi2dctILQa',
    activity: 'fldZT5VtqtaN1TGE3',
    dimensions: 'fldbq5sCX6csZLV2h',
    weight: 'fldxxYMcA3qrDNdZa',
    materials: 'fldTO5IDBFvggJd7Y',
    whatsIncluded: 'fldQhql0JV2mby273',
    careNotes: 'fldXM6Az08OFmvWC9',
    /** Multi-select: most-loved | menorahs-collection | menorahs-kids | dreidels | … */
    storefrontRails: 'fld87IqgLUYTCYbfd',
    /** Number — lower shows first within a rail. */
    storefrontRank: 'fldL8ywPdWjiWDJYs',
    /** singleSelect: collection | kids — merged into storefrontRails as menorahs-* */
    menorahHomepage: 'fld11aALd1jA7S2Oh',
    /** singleSelect: collection | kids — merged into storefrontRails as dreidels-* */
    dreidelHomepage: 'fldtNYSxTNtwO9TMg',
    /** Number — units sellable à la carte before box lock. */
    availableBeforeLock: 'fld5lpY35uPMK9dWl',
    /** singleSelect: Yes | Flag | No — leftover release after lock. */
    sellAfterLock: 'fldBsSszQ2lmutIX1',
    /** Multi-select box roles (base, swap, upsell, gift-eligible, store-only, …). */
    boxRoles: 'fldxFZn1AVEGMCjjD',
    /** Warehouse / ShipStation SKU (e.g. CDL-STR-001). Empty → fall back to slugified ID. */
    sku: 'fld1xjteLPXlU4VsW',
    /** Book rows: link to the Hanukkah Books record with title, author and copy. */
    hanukkahBooks: 'fldMOUzSLUQ5qOzvu',
    /** Book rows: exact kid ages (0–12) this book is the included default for. */
    defaultBookAges: 'fldhdftdVkGmSQvCP',
    /** Present rows: exact kid ages (0–12) this item can be the included present for. */
    defaultGiftAges: 'fld29wcLrL0kf4N58',
};
const B = {
    title: 'fldCZVbxyEy7pFpl5',
    author: 'fldJTYzX1VZANE32g',
    buyLink: 'fldoDsu0A2i6WPzd1',
    /** Primary Image — same role as Full Catalog Primary Image. */
    primaryImage: 'fldPIYO00g9QwhpVC',
    /** Other Images — secondary gallery, same role as Full Catalog Other Images. */
    otherImages: 'fldlxFU6PXF2LWutu',
    interest: 'fld0HXR8bybF5jJlf',
    description: 'fld4sz0NbEfYURoas',
    whatsIncluded: 'fldibf87uviMr3F1p',
    careNotes: 'fldOgYIzuMOiKypF8',
    storefrontRails: 'fldQ0rtV9eQBoJnlj',
};
function requirePat() {
    var _a;
    const pat = (_a = process.env.AIRTABLE_PAT) === null || _a === void 0 ? void 0 : _a.trim();
    if (!pat)
        throw new Error('AIRTABLE_PAT is not configured.');
    return pat;
}
function baseId() {
    var _a;
    return ((_a = process.env.AIRTABLE_BASE_ID) === null || _a === void 0 ? void 0 : _a.trim()) || exports.AIRTABLE_BASE_ID_DEFAULT;
}
function slugifyCatalogId(name) {
    const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return slug || 'item';
}
/**
 * Full Catalog rows whose catalog id must not follow their name. Boxes, orders and inventory
 * store the id, so renaming these rows (e.g. adding coin counts) must keep the old id.
 */
const PINNED_LISTING_IDS = {
    recxIaQkZ55qi5hv7: 'big-bag-of-gelt',
    recF3yMAHEv61pJJR: 'party-bag-of-gelt',
};
/** Catalog id for a Full Catalog row: its pinned id, else the slug of its name. */
function listingCatalogId(recordId, name) {
    var _a;
    return (_a = PINNED_LISTING_IDS[recordId]) !== null && _a !== void 0 ? _a : slugifyCatalogId(name);
}
function selectName(v) {
    if (!v)
        return null;
    if (typeof v === 'string')
        return v;
    if (typeof v === 'object' && v !== null && 'name' in v) {
        return String(v.name);
    }
    return null;
}
function sellAfterLockFromAirtable(v) {
    var _a;
    const name = (_a = selectName(v)) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase();
    if (name === 'yes')
        return 'yes';
    if (name === 'flag')
        return 'flag';
    if (name === 'no')
        return 'no';
    return null;
}
function selectNames(v) {
    if (!Array.isArray(v)) {
        const one = selectName(v);
        return one ? [one] : [];
    }
    return v.map(selectName).filter((x) => Boolean(x));
}
function numberField(v) {
    if (typeof v === 'number' && Number.isFinite(v))
        return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v)))
        return Number(v);
    return null;
}
function countField(v) {
    const n = numberField(v);
    if (n == null)
        return null;
    return Math.max(0, Math.floor(n));
}
/** Merge Storefront rails multi-select + homepage single-selects into rail slugs. */
function storefrontRailsFromListing(f) {
    var _a, _b;
    const rails = new Set(selectNames(f[F.storefrontRails]));
    // Legacy single rail → collection
    if (rails.has('menorahs')) {
        rails.add('menorahs-collection');
        rails.delete('menorahs');
    }
    if (rails.has('dreidels')) {
        rails.add('dreidels-collection');
        rails.delete('dreidels');
    }
    const menorahHome = (_a = selectName(f[F.menorahHomepage])) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    if (menorahHome === 'collection')
        rails.add('menorahs-collection');
    if (menorahHome === 'kids')
        rails.add('menorahs-kids');
    const dreidelHome = (_b = selectName(f[F.dreidelHomepage])) === null || _b === void 0 ? void 0 : _b.toLowerCase();
    if (dreidelHome === 'collection')
        rails.add('dreidels-collection');
    if (dreidelHome === 'kids')
        rails.add('dreidels-kids');
    return [...rails];
}
function textField(v) {
    if (typeof v !== 'string')
        return null;
    const t = v.trim();
    return t || null;
}
function currencyToCents(v) {
    if (typeof v !== 'number' || !Number.isFinite(v))
        return 0;
    return Math.max(0, Math.round(v * 100));
}
function attachments(v) {
    if (!Array.isArray(v))
        return [];
    return v.filter((a) => a && typeof a === 'object');
}
function ageYearsToGroups(years) {
    const groups = new Set();
    for (const y of years) {
        const n = parseInt(y, 10);
        if (!Number.isFinite(n))
            continue;
        if (n <= 2)
            groups.add('0-2');
        else if (n <= 5)
            groups.add('3-5');
        else if (n <= 8)
            groups.add('6-8');
        else
            groups.add('9-12');
    }
    return groups.size ? [...groups] : ['0-2', '3-5', '6-8', '9-12'];
}
function mapListingPlacement(category, contexts, name) {
    const isAla = contexts.includes('A la carte');
    const lower = name.toLowerCase();
    const cat = (category !== null && category !== void 0 ? category : 'Other').toLowerCase();
    if (cat === 'book') {
        return { slot: 'story', slotId: 'story', pricingTier: 'perKid' };
    }
    if (cat === 'menorah') {
        return {
            slot: 'keepsake',
            slotId: isAla ? 'family-hanukkiah' : 'family-hanukkiah',
            pricingTier: (isAla ? 'alaCarte' : 'included'),
        };
    }
    if (cat === 'candles') {
        if (lower.includes('electric') ||
            lower.includes('sheet') ||
            lower.includes('roll your own')) {
            return { slot: 'addon', slotId: 'extra-candles', pricingTier: 'alaCarte' };
        }
        return { slot: 'base', slotId: 'candles', pricingTier: (isAla ? 'alaCarte' : 'included') };
    }
    if (cat === 'dreidel') {
        if (isAla || lower.includes('brass') || lower.includes('slipcast') || lower.includes('airdry')) {
            return { slot: 'keepsake', slotId: 'keepsake-dreidel', pricingTier: 'alaCarte' };
        }
        return { slot: 'gift', slotId: 'gift', pricingTier: 'perKid' };
    }
    if (cat === 'food') {
        if (lower.includes('latke')) {
            return { slot: 'base', slotId: 'latke-mix', pricingTier: (isAla ? 'alaCarte' : 'included') };
        }
        if (lower.includes('sufgan')) {
            return { slot: 'base', slotId: 'sufganiyot-mix', pricingTier: (isAla ? 'alaCarte' : 'included') };
        }
        if (lower.includes('applesauce')) {
            return { slot: 'base', slotId: 'latke-recipe-printed', pricingTier: 'included' };
        }
        if (lower.includes('gelt')) {
            return { slot: 'base', slotId: 'gelt', pricingTier: (isAla ? 'alaCarte' : 'included') };
        }
        if (lower.includes('cookie')) {
            return { slot: 'addon', slotId: 'decor', pricingTier: 'alaCarte' };
        }
        return { slot: 'base', slotId: 'food', pricingTier: (isAla ? 'alaCarte' : 'included') };
    }
    if (lower.includes('wrapping')) {
        return { slot: 'base', slotId: 'wrapping', pricingTier: (isAla ? 'alaCarte' : 'included') };
    }
    if (lower.includes('napkin')) {
        return { slot: 'addon', slotId: 'decor', pricingTier: 'alaCarte' };
    }
    if (lower.includes('plush')) {
        return { slot: 'gift', slotId: 'gift', pricingTier: 'alaCarte' };
    }
    return {
        slot: 'addon',
        slotId: 'decor',
        pricingTier: (isAla ? 'alaCarte' : 'included'),
    };
}
function primaryCategory(categories) {
    var _a;
    const nonSale = categories.find((c) => c.toLowerCase() !== 'on sale');
    return (_a = nonSale !== null && nonSale !== void 0 ? nonSale : categories[0]) !== null && _a !== void 0 ? _a : null;
}
function curationTagsFor(categories) {
    const tags = new Set(['collection']);
    for (const c of categories) {
        switch (c.toLowerCase()) {
            case 'menorah':
                tags.add('hanukkiah');
                break;
            case 'dreidel':
                tags.add('dreidel');
                break;
            default:
                break;
        }
    }
    return [...tags];
}
async function airtableListAll(tableId, fields) {
    var _a;
    const pat = requirePat();
    const out = [];
    let offset;
    const params = new URLSearchParams();
    for (const f of fields)
        params.append('fields[]', f);
    params.set('pageSize', '100');
    do {
        if (offset)
            params.set('offset', offset);
        else
            params.delete('offset');
        // Field map uses fld… IDs — ask Airtable to key the response the same way.
        params.set('returnFieldsByFieldId', 'true');
        const url = `https://api.airtable.com/v0/${baseId()}/${tableId}?${params.toString()}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${pat}` },
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Airtable list failed (${res.status}): ${body.slice(0, 400)}`);
        }
        const json = (await res.json());
        out.push(...((_a = json.records) !== null && _a !== void 0 ? _a : []));
        offset = json.offset;
    } while (offset);
    return out;
}
async function toWebpBuffer(input) {
    // Catalog tiles rarely need >1600px; WebP keeps visual quality with far smaller bytes.
    const out = await sharp(input)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
    return Buffer.from(out);
}
async function mirrorAttachmentToStorage(itemId, kind, index, att) {
    var _a;
    if (!att.url)
        return null;
    const bucket = (0, storage_1.getStorage)().bucket();
    const res = await fetch(att.url);
    if (!res.ok) {
        logger.warn('Failed to download Airtable attachment', { itemId, status: res.status });
        return null;
    }
    const raw = Buffer.from(await res.arrayBuffer());
    let buf = raw;
    let ext = 'webp';
    let contentType = 'image/webp';
    try {
        buf = await toWebpBuffer(raw);
    }
    catch (e) {
        logger.warn('WebP convert failed — storing original', { itemId, error: String(e) });
        ext =
            (att.filename && att.filename.includes('.') ? att.filename.split('.').pop() : null) ||
                (((_a = att.type) === null || _a === void 0 ? void 0 : _a.includes('png')) ? 'png' : 'jpg');
        contentType = att.type || 'image/jpeg';
    }
    const hash = (0, crypto_1.createHash)('sha1').update(buf).digest('hex').slice(0, 12);
    const finalPath = `catalog/${exports.CATALOG_HOLIDAY}/items/${itemId}/${kind}-${index}-${hash}.${ext}`;
    const file = bucket.file(finalPath);
    await file.save(buf, {
        contentType,
        metadata: { cacheControl: 'public,max-age=86400' },
        resumable: false,
    });
    await file.makePublic().catch(() => undefined);
    const [meta] = await file.getMetadata();
    if (meta.mediaLink) {
        return {
            url: `https://storage.googleapis.com/${bucket.name}/${finalPath}`,
            path: finalPath,
            buffer: buf,
        };
    }
    const [signed] = await file.getSignedUrl({
        action: 'read',
        expires: '2099-01-01',
    });
    return { url: signed, path: null, buffer: buf };
}
const NO_IMAGES = { imageUrl: null, imageUrls: [], imageThumbUrls: [] };
/**
 * New thumbs encoded per sync run — the first run after deploy would otherwise encode every
 * photo inside the 300s timeout. Later runs (or backfillCatalogThumbs) pick up the rest.
 */
const MAX_NEW_THUMBS_PER_SYNC = 60;
async function loadKnownThumbs(col) {
    const known = new Map();
    const snap = await col.select('imageUrls', 'imageThumbUrls').get();
    for (const d of snap.docs) {
        const urls = d.get('imageUrls');
        const thumbs = d.get('imageThumbUrls');
        if (!Array.isArray(urls) || !Array.isArray(thumbs))
            continue;
        urls.forEach((u, i) => {
            const t = thumbs[i];
            if (typeof u === 'string' && typeof t === 'string' && (0, catalogThumbs_1.thumbMatchesFull)(u, t))
                known.set(u, t);
        });
    }
    return known;
}
async function thumbFor(itemId, img, ctx) {
    const known = ctx.known.get(img.url);
    if (known)
        return known;
    if (!img.path)
        return null;
    const allowCreate = ctx.createBudget > 0;
    try {
        const ensured = await (0, catalogThumbs_1.ensureCatalogThumb)(img.path, { fullBuffer: img.buffer, allowCreate });
        if (ensured.created) {
            ctx.createBudget -= 1;
            ctx.created += 1;
        }
        return ensured.url;
    }
    catch (e) {
        logger.warn('Catalog thumb failed', { itemId, error: String(e) });
        return null;
    }
}
async function resolveImages(itemId, primary, other, thumbs) {
    var _a;
    const mirrored = [];
    if (primary[0]) {
        const m = await mirrorAttachmentToStorage(itemId, 'primary', 0, primary[0]);
        if (m)
            mirrored.push(m);
    }
    for (let i = 0; i < other.length; i++) {
        const m = await mirrorAttachmentToStorage(itemId, 'other', i, other[i]);
        if (m)
            mirrored.push(m);
    }
    const imageThumbUrls = [];
    for (const m of mirrored)
        imageThumbUrls.push(await thumbFor(itemId, m, thumbs));
    const urls = mirrored.map((m) => m.url);
    return { imageUrl: (_a = urls[0]) !== null && _a !== void 0 ? _a : null, imageUrls: urls, imageThumbUrls };
}
function exactAges(v) {
    return selectNames(v)
        .map((a) => parseInt(a, 10))
        .filter((n) => Number.isFinite(n))
        .sort((x, y) => x - y);
}
function listingToItem(rec, images) {
    var _a, _b, _c;
    const f = rec.fields;
    const name = String((_a = f[F.id]) !== null && _a !== void 0 ? _a : '').trim();
    if (!name)
        return null;
    const inProd = selectName(f[F.inProduction]);
    if (inProd && inProd !== 'Yes')
        return null;
    const categories = selectNames(f[F.category]);
    const category = primaryCategory(categories);
    const contexts = selectNames(f[F.context]);
    const ages = selectNames(f[F.age]);
    const placement = mapListingPlacement(category, contexts, name);
    const unitCostCents = currencyToCents(f[F.unitCost]);
    const memberPriceCents = currencyToCents(f[F.memberPrice]);
    const nonMemberPriceCents = currencyToCents(f[F.nonMemberPrice]);
    const id = listingCatalogId(rec.id, name);
    const skuRaw = String((_b = f[F.sku]) !== null && _b !== void 0 ? _b : '').trim();
    return {
        id,
        name,
        description: String((_c = f[F.description]) !== null && _c !== void 0 ? _c : '').trim() || name,
        slot: placement.slot,
        slotId: placement.slotId,
        ageGroups: ages.length ? ageYearsToGroups(ages) : ['0-2', '3-5', '6-8', '9-12'],
        defaultFor: contexts.includes('Default') ? ['0-2', '3-5', '6-8', '9-12'] : [],
        defaultGiftAges: exactAges(f[F.defaultGiftAges]),
        swapOptions: [],
        unitCostCents,
        memberPriceCents,
        nonMemberPriceCents,
        dollarCostCents: nonMemberPriceCents || memberPriceCents || unitCostCents,
        pricingTier: placement.pricingTier,
        holiday: exports.CATALOG_HOLIDAY,
        categories,
        category,
        context: contexts,
        source: selectName(f[F.source]),
        inventory: typeof f[F.inventory] === 'number' ? f[F.inventory] : null,
        holdInventory: f[F.holdInventory] === true,
        procured: typeof f[F.procured] === 'number' ? f[F.procured] : null,
        setAside: countField(f[F.setAside]),
        setAsideFor: textField(f[F.setAsideFor]),
        airtableRecordId: rec.id,
        airtableTable: 'full-catalog',
        brand: null,
        imageUrl: images.imageUrl,
        imageUrls: images.imageUrls,
        imageThumbUrls: images.imageThumbUrls,
        buyLink: typeof f[F.link] === 'string' ? f[F.link] : null,
        interest: null,
        curationTags: curationTagsFor(categories),
        storefrontRails: storefrontRailsFromListing(f),
        storefrontRank: numberField(f[F.storefrontRank]),
        dimensions: textField(f[F.dimensions]),
        weight: textField(f[F.weight]),
        materials: textField(f[F.materials]),
        whatsIncluded: textField(f[F.whatsIncluded]),
        careNotes: textField(f[F.careNotes]),
        directSaleCapBeforeLock: numberField(f[F.availableBeforeLock]),
        sellAfterLock: sellAfterLockFromAirtable(f[F.sellAfterLock]),
        boxRoles: selectNames(f[F.boxRoles]),
        sku: skuRaw || null,
    };
}
/** Book title: the linked Hanukkah Books Title, else the Full Catalog ID. Drives the item id. */
function bookTitle(fcRec, bookRec) {
    var _a, _b;
    return String((_b = (_a = bookRec === null || bookRec === void 0 ? void 0 : bookRec.fields[B.title]) !== null && _a !== void 0 ? _a : fcRec.fields[F.id]) !== null && _b !== void 0 ? _b : '').trim();
}
/**
 * A Full Catalog Book row → catalog item. Full Catalog owns listing (In production?),
 * prices, ages and default ages; the linked Hanukkah Books row only supplies copy.
 * Books stay inventory-untracked (infinite, stock rules never swap them) unless
 * "Hold inventory" is checked — then Inventory is the sellable ceiling (blank = 0)
 * and Procured rides along display-only for the admin sourcing view.
 * Set aside is held back from that ceiling.
 */
function bookToItem(fcRec, bookRec, images) {
    var _a, _b, _c, _d;
    const f = fcRec.fields;
    const b = (_a = bookRec === null || bookRec === void 0 ? void 0 : bookRec.fields) !== null && _a !== void 0 ? _a : {};
    const title = bookTitle(fcRec, bookRec);
    if (!title)
        return null;
    const inProd = selectName(f[F.inProduction]);
    if (inProd && inProd !== 'Yes')
        return null;
    const ageGroups = ageYearsToGroups(selectNames(f[F.age]));
    const defaultBookAges = exactAges(f[F.defaultBookAges]);
    const author = String((_b = b[B.author]) !== null && _b !== void 0 ? _b : '').trim();
    const id = `book-${slugifyCatalogId(title)}`;
    const memberPriceCents = currencyToCents(f[F.memberPrice]);
    const nonMemberPriceCents = currencyToCents(f[F.nonMemberPrice]) || memberPriceCents;
    return {
        id,
        name: title,
        description: String((_c = b[B.description]) !== null && _c !== void 0 ? _c : '').trim() ||
            String((_d = f[F.description]) !== null && _d !== void 0 ? _d : '').trim() ||
            (author ? `By ${author}` : title),
        slot: 'story',
        slotId: 'story',
        ageGroups,
        defaultFor: defaultBookAges.length ? ageYearsToGroups(defaultBookAges.map(String)) : [],
        defaultBookAges,
        swapOptions: [],
        unitCostCents: currencyToCents(f[F.unitCost]),
        memberPriceCents,
        nonMemberPriceCents,
        dollarCostCents: nonMemberPriceCents || memberPriceCents,
        pricingTier: 'perKid',
        holiday: exports.CATALOG_HOLIDAY,
        categories: ['Book'],
        category: 'Book',
        context: ['Default'],
        source: 'Curated',
        inventory: f[F.holdInventory] === true
            ? typeof f[F.inventory] === 'number'
                ? f[F.inventory]
                : 0
            : null,
        holdInventory: f[F.holdInventory] === true,
        procured: typeof f[F.procured] === 'number' ? f[F.procured] : null,
        setAside: countField(f[F.setAside]),
        setAsideFor: textField(f[F.setAsideFor]),
        airtableRecordId: fcRec.id,
        airtableTable: 'books',
        brand: author || null,
        imageUrl: images.imageUrl,
        imageUrls: images.imageUrls,
        imageThumbUrls: images.imageThumbUrls,
        buyLink: typeof b[B.buyLink] === 'string' ? b[B.buyLink] : null,
        interest: selectName(b[B.interest]),
        curationTags: ['collection'],
        storefrontRails: selectNames(b[B.storefrontRails]),
        storefrontRank: null,
        dimensions: null,
        weight: null,
        materials: null,
        whatsIncluded: textField(b[B.whatsIncluded]),
        careNotes: textField(b[B.careNotes]),
        // Books are never sold à la carte — caps/FBA unused by the resolver.
        directSaleCapBeforeLock: null,
        sellAfterLock: null,
        boxRoles: [],
        sku: null,
    };
}
function wireBookSwaps(items) {
    const books = items.filter((i) => i.airtableTable === 'books');
    for (const book of books) {
        const peers = books
            .filter((b) => b.id !== book.id && b.ageGroups.some((g) => book.ageGroups.includes(g)))
            .map((b) => b.id)
            .slice(0, 8);
        book.swapOptions = peers;
    }
}
/** Filename stem for Full Catalog book renderings, e.g. `papa-s-latkes__primary.png` → `papa-s-latkes`. */
function renderingSlugFromFilename(filename) {
    if (!filename)
        return null;
    const base = filename.replace(/\.[^.]+$/, '').replace(/__primary$/i, '');
    const slug = slugifyCatalogId(base);
    return slug === 'item' ? null : slug;
}
/**
 * Index Full Catalog Category=Book Primary Image renderings by title slug.
 * Many of these rows have no ID — only the attachment filename identifies the book.
 * Also indexes any `__primary` attachment filename (render pipeline naming).
 */
function buildFullCatalogBookRenderingIndex(listingRecs) {
    var _a;
    const index = new Map();
    for (const rec of listingRecs) {
        const cats = selectNames(rec.fields[F.category]).map((c) => c.toLowerCase());
        const primary = attachments(rec.fields[F.primaryImage]);
        const other = attachments(rec.fields[F.otherImages]);
        if (!primary.length && !other.length)
            continue;
        const hasPrimaryNamedRendering = primary.some((a) => /__primary\.(png|jpe?g|webp)$/i.test(a.filename || ''));
        if (!cats.includes('book') && !hasPrimaryNamedRendering)
            continue;
        const rendering = { primary, other };
        const keys = new Set();
        const name = String((_a = rec.fields[F.id]) !== null && _a !== void 0 ? _a : '').trim();
        if (name)
            keys.add(slugifyCatalogId(name));
        for (const att of primary) {
            const slug = renderingSlugFromFilename(att.filename);
            if (slug)
                keys.add(slug);
        }
        for (const key of keys) {
            const existing = index.get(key);
            if (!existing || (primary.length && !existing.primary.length)) {
                index.set(key, rendering);
            }
        }
    }
    return index;
}
/** Prefer exact slug, then longest prefix/containment match (min 12 chars). */
function findBookRendering(title, index) {
    var _a;
    const slug = slugifyCatalogId(title);
    const exact = index.get(slug);
    if (exact)
        return exact;
    let bestKey = null;
    let bestScore = 0;
    for (const key of index.keys()) {
        if (key.length < 8 || slug.length < 8)
            continue;
        let score = 0;
        if (slug === key)
            score = key.length + 2;
        else if (slug.startsWith(key) || key.startsWith(slug)) {
            score = Math.min(key.length, slug.length);
        }
        else if (slug.includes(key) || key.includes(slug)) {
            score = Math.min(key.length, slug.length) - 1;
        }
        if (score >= 12 && score > bestScore) {
            bestScore = score;
            bestKey = key;
        }
    }
    return bestKey ? (_a = index.get(bestKey)) !== null && _a !== void 0 ? _a : null : null;
}
async function runAirtableCatalogReplaceSync() {
    var _a, _b, _c;
    const db = (0, firestore_1.getFirestore)();
    const listingFields = Object.values(F);
    const bookFields = Object.values(B);
    const col = db.collection('catalog').doc(exports.CATALOG_HOLIDAY).collection('items');
    const [listingRecs, bookRecs, knownThumbs] = await Promise.all([
        airtableListAll(exports.FULL_CATALOG_TABLE_ID, listingFields),
        airtableListAll(exports.BOOKS_TABLE_ID, bookFields),
        loadKnownThumbs(col).catch((e) => {
            logger.warn('Could not read existing catalog thumbs', { error: String(e) });
            return new Map();
        }),
    ]);
    const thumbs = {
        known: knownThumbs,
        createBudget: MAX_NEW_THUMBS_PER_SYNC,
        created: 0,
    };
    const items = [];
    let skippedImages = 0;
    const bookRenderings = buildFullCatalogBookRenderingIndex(listingRecs);
    logger.info('Full Catalog book renderings indexed', { count: bookRenderings.size });
    const fcBookRecs = [];
    for (const rec of listingRecs) {
        const name = String((_a = rec.fields[F.id]) !== null && _a !== void 0 ? _a : '').trim();
        if (!name)
            continue;
        const cats = selectNames(rec.fields[F.category]).map((c) => c.toLowerCase());
        if (cats.includes('book')) {
            fcBookRecs.push(rec);
            continue;
        }
        const inProd = selectName(rec.fields[F.inProduction]);
        if (inProd && inProd !== 'Yes')
            continue;
        const id = listingCatalogId(rec.id, name);
        const primary = attachments(rec.fields[F.primaryImage]);
        const other = attachments(rec.fields[F.otherImages]);
        let images = NO_IMAGES;
        if (primary.length || other.length) {
            try {
                images = await resolveImages(id, primary, other, thumbs);
            }
            catch (e) {
                skippedImages += 1;
                logger.warn('Image mirror failed', { id, error: String(e) });
            }
        }
        const item = listingToItem(rec, images);
        if (item)
            items.push(item);
    }
    const bookRecsById = new Map(bookRecs.map((r) => [r.id, r]));
    let booksUsingFcPrimary = 0;
    for (const fcRec of fcBookRecs) {
        const inProd = selectName(fcRec.fields[F.inProduction]);
        if (inProd && inProd !== 'Yes')
            continue;
        const linkedId = Array.isArray(fcRec.fields[F.hanukkahBooks])
            ? fcRec.fields[F.hanukkahBooks].find((v) => typeof v === 'string')
            : undefined;
        const rec = linkedId ? (_b = bookRecsById.get(linkedId)) !== null && _b !== void 0 ? _b : null : null;
        const title = bookTitle(fcRec, rec);
        if (!title)
            continue;
        const id = `book-${slugifyCatalogId(title)}`;
        const bookPrimary = attachments(rec === null || rec === void 0 ? void 0 : rec.fields[B.primaryImage]);
        const bookOther = attachments(rec === null || rec === void 0 ? void 0 : rec.fields[B.otherImages]);
        const fc = findBookRendering(title, bookRenderings);
        // Book grid/PDP primary always comes from Full Catalog Primary Image when matched.
        // Hanukkah Books attachments are gallery-only (never the storefront primary).
        let primary = [];
        let other = [];
        if (fc === null || fc === void 0 ? void 0 : fc.primary.length) {
            primary = fc.primary;
            other = [...((_c = fc.other) !== null && _c !== void 0 ? _c : []), ...bookPrimary, ...bookOther];
            booksUsingFcPrimary += 1;
        }
        else {
            // No FC rendering yet — fall back so the SKU still has a photo.
            primary = bookPrimary;
            other = bookOther;
            logger.warn('No Full Catalog primary rendering for book', { id, title });
        }
        let images = NO_IMAGES;
        if (primary.length || other.length) {
            try {
                images = await resolveImages(id, primary, other, thumbs);
            }
            catch (e) {
                skippedImages += 1;
                logger.warn('Book image mirror failed', { id, error: String(e) });
            }
        }
        const item = bookToItem(fcRec, rec, images);
        if (item)
            items.push(item);
    }
    logger.info('Books using Full Catalog primary renderings', { booksUsingFcPrimary });
    wireBookSwaps(items);
    if (items.length === 0) {
        throw new Error('Airtable sync produced 0 items — refusing to delete Firestore catalog. Check PAT scopes and field mapping.');
    }
    const existing = await col.listDocuments();
    const keep = new Set(items.map((i) => i.id));
    // Firestore batches max 500
    let wrote = 0;
    for (let i = 0; i < items.length; i += 400) {
        const chunk = items.slice(i, i + 400);
        const batch = db.batch();
        for (const item of chunk) {
            const { id } = item, rest = __rest(item, ["id"]);
            batch.set(col.doc(id), Object.assign(Object.assign({}, rest), { syncedFrom: 'airtable', updatedAt: firestore_1.FieldValue.serverTimestamp() }), { merge: false });
            wrote += 1;
        }
        await batch.commit();
    }
    let deleted = 0;
    const toDelete = existing.filter((ref) => !keep.has(ref.id));
    for (let i = 0; i < toDelete.length; i += 400) {
        const chunk = toDelete.slice(i, i + 400);
        const batch = db.batch();
        for (const ref of chunk) {
            batch.delete(ref);
            deleted += 1;
        }
        await batch.commit();
    }
    await db.doc('catalog/hanukkah').set({
        lastAirtableSyncAt: firestore_1.FieldValue.serverTimestamp(),
        lastAirtableSyncCounts: {
            wrote,
            deleted,
            listings: items.filter((i) => i.airtableTable === 'full-catalog').length,
            books: items.filter((i) => i.airtableTable === 'books').length,
        },
    }, { merge: true });
    return {
        wrote,
        deleted,
        listings: items.filter((i) => i.airtableTable === 'full-catalog').length,
        books: items.filter((i) => i.airtableTable === 'books').length,
        skippedImages,
        booksUsingFcPrimary,
        bookRenderingsIndexed: bookRenderings.size,
        thumbsCreated: thumbs.created,
    };
}
function assertCatalogSyncSecret(authHeader) {
    var _a;
    const secret = (_a = process.env.CATALOG_SYNC_SECRET) === null || _a === void 0 ? void 0 : _a.trim();
    if (!secret)
        throw new Error('CATALOG_SYNC_SECRET is not configured.');
    const expected = `Bearer ${secret}`;
    if (authHeader !== expected) {
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
    }
}
//# sourceMappingURL=airtableCatalogSync.js.map