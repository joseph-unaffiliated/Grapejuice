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
exports.runAirtableCatalogReplaceSync = runAirtableCatalogReplaceSync;
exports.assertCatalogSyncSecret = assertCatalogSyncSecret;
/**
 * Airtable → Firestore catalog replace sync.
 *
 * Source of truth: Grapejuice base Full Catalog (Listings) + Hanukkah Books.
 * Writes catalog/hanukkah/items/* and deletes orphans not in the synced set.
 *
 * Env:
 *   AIRTABLE_PAT — Personal access token with data.records:read + schema.bases:read
 *   AIRTABLE_BASE_ID — defaults to appQscrPCQUIj4shh
 *   CATALOG_SYNC_SECRET — shared secret for HTTP trigger (Authorization: Bearer …)
 */
const logger = require("firebase-functions/logger");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const crypto_1 = require("crypto");
exports.AIRTABLE_BASE_ID_DEFAULT = 'appQscrPCQUIj4shh';
exports.FULL_CATALOG_TABLE_ID = 'tblCUCVfohWTQy8fP';
exports.BOOKS_TABLE_ID = 'tbleo48j2H34DRAu1';
exports.CATALOG_HOLIDAY = 'hanukkah';
const F = {
    id: 'fldSPjarW6aFocHj3',
    description: 'fldMEo3Bys38SVisV',
    inProduction: 'fldN3303eOahUbJFU',
    inventory: 'fldXpTJPasuaXfoeW',
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
    materials: 'fldTO5IDBFvggJd7Y',
    whatsIncluded: 'fldQhql0JV2mby273',
    careNotes: 'fldXM6Az08OFmvWC9',
};
const B = {
    title: 'fldCZVbxyEy7pFpl5',
    author: 'fldJTYzX1VZANE32g',
    buyLink: 'fldoDsu0A2i6WPzd1',
    cover: 'fldPIYO00g9QwhpVC',
    defaultForAge: 'fldZcr2Dzq9JivS7u',
    age: 'fldCQ9GdNJMI4f300',
    interest: 'fld0HXR8bybF5jJlf',
    cut: 'fldRZaX3mVlFqWntD',
    price: 'fldP8mVb5xMC9CQg3',
    description: 'fld4sz0NbEfYURoas',
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
function selectNames(v) {
    if (!Array.isArray(v)) {
        const one = selectName(v);
        return one ? [one] : [];
    }
    return v.map(selectName).filter((x) => Boolean(x));
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
        if (lower.includes('electric') || lower.includes('sheet')) {
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
            return { slot: 'base', slotId: 'latke-kit', pricingTier: (isAla ? 'alaCarte' : 'included') };
        }
        if (lower.includes('sufgan')) {
            return { slot: 'base', slotId: 'sufganiyot-kit', pricingTier: (isAla ? 'alaCarte' : 'included') };
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
        return { slot: 'base', slotId: 'latke-kit', pricingTier: (isAla ? 'alaCarte' : 'included') };
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
function curationTagsFor(category) {
    switch ((category !== null && category !== void 0 ? category : '').toLowerCase()) {
        case 'menorah':
            return ['hanukkiah', 'collection'];
        case 'dreidel':
            return ['dreidel', 'collection'];
        case 'candles':
            return ['collection'];
        default:
            return ['collection'];
    }
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
async function mirrorAttachmentToStorage(itemId, kind, index, att) {
    var _a;
    if (!att.url)
        return null;
    const bucket = (0, storage_1.getStorage)().bucket();
    const ext = (att.filename && att.filename.includes('.') ? att.filename.split('.').pop() : null) ||
        (((_a = att.type) === null || _a === void 0 ? void 0 : _a.includes('png')) ? 'png' : 'jpg');
    const path = `catalog/${exports.CATALOG_HOLIDAY}/items/${itemId}/${kind}-${index}.${ext}`;
    const res = await fetch(att.url);
    if (!res.ok) {
        logger.warn('Failed to download Airtable attachment', { itemId, status: res.status });
        return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = (0, crypto_1.createHash)('sha1').update(buf).digest('hex').slice(0, 12);
    const finalPath = `catalog/${exports.CATALOG_HOLIDAY}/items/${itemId}/${kind}-${index}-${hash}.${ext}`;
    const file = bucket.file(finalPath);
    await file.save(buf, {
        contentType: att.type || 'image/jpeg',
        metadata: { cacheControl: 'public,max-age=86400' },
        resumable: false,
    });
    await file.makePublic().catch(() => undefined);
    // Prefer token URL if public ACL denied
    const [meta] = await file.getMetadata();
    if (meta.mediaLink) {
        // Stable Firebase download via public URL when possible
        return `https://storage.googleapis.com/${bucket.name}/${finalPath}`;
    }
    const [signed] = await file.getSignedUrl({
        action: 'read',
        expires: '2099-01-01',
    });
    return signed;
    // silence unused path var
    void path;
}
async function resolveImages(itemId, primary, other) {
    var _a;
    const urls = [];
    if (primary[0]) {
        const u = await mirrorAttachmentToStorage(itemId, 'primary', 0, primary[0]);
        if (u)
            urls.push(u);
    }
    for (let i = 0; i < other.length; i++) {
        const u = await mirrorAttachmentToStorage(itemId, 'other', i, other[i]);
        if (u)
            urls.push(u);
    }
    return { imageUrl: (_a = urls[0]) !== null && _a !== void 0 ? _a : null, imageUrls: urls };
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
    const category = (_b = selectNames(f[F.category])[0]) !== null && _b !== void 0 ? _b : null;
    const contexts = selectNames(f[F.context]);
    const ages = selectNames(f[F.age]);
    const placement = mapListingPlacement(category, contexts, name);
    const unitCostCents = currencyToCents(f[F.unitCost]);
    const memberPriceCents = currencyToCents(f[F.memberPrice]);
    const nonMemberPriceCents = currencyToCents(f[F.nonMemberPrice]);
    const id = slugifyCatalogId(name);
    return {
        id,
        name,
        description: String((_c = f[F.description]) !== null && _c !== void 0 ? _c : '').trim() || name,
        slot: placement.slot,
        slotId: placement.slotId,
        ageGroups: ages.length ? ageYearsToGroups(ages) : ['0-2', '3-5', '6-8', '9-12'],
        defaultFor: contexts.includes('Default') ? ['0-2', '3-5', '6-8', '9-12'] : [],
        swapOptions: [],
        unitCostCents,
        memberPriceCents,
        nonMemberPriceCents,
        dollarCostCents: nonMemberPriceCents || memberPriceCents || unitCostCents,
        pricingTier: placement.pricingTier,
        holiday: exports.CATALOG_HOLIDAY,
        category,
        context: contexts,
        source: selectName(f[F.source]),
        inventory: typeof f[F.inventory] === 'number' ? f[F.inventory] : null,
        airtableRecordId: rec.id,
        airtableTable: 'full-catalog',
        brand: null,
        imageUrl: images.imageUrl,
        imageUrls: images.imageUrls,
        buyLink: typeof f[F.link] === 'string' ? f[F.link] : null,
        interest: null,
        curationTags: curationTagsFor(category),
        dimensions: textField(f[F.dimensions]),
        materials: textField(f[F.materials]),
        whatsIncluded: textField(f[F.whatsIncluded]),
        careNotes: textField(f[F.careNotes]),
    };
}
function bookToItem(rec, images) {
    var _a, _b, _c;
    const f = rec.fields;
    if (f[B.cut] === true)
        return null;
    const title = String((_a = f[B.title]) !== null && _a !== void 0 ? _a : '').trim();
    if (!title)
        return null;
    const age = selectName(f[B.age]);
    const ageGroups = age && age !== '-' ? ageYearsToGroups([age]) : ['0-2', '3-5', '6-8', '9-12'];
    const isDefault = f[B.defaultForAge] === true;
    const author = String((_b = f[B.author]) !== null && _b !== void 0 ? _b : '').trim();
    const id = `book-${slugifyCatalogId(title)}`;
    return {
        id,
        name: title,
        description: String((_c = f[B.description]) !== null && _c !== void 0 ? _c : '').trim() || (author ? `By ${author}` : title),
        slot: 'story',
        slotId: 'story',
        ageGroups,
        defaultFor: isDefault ? ageGroups : [],
        swapOptions: [],
        unitCostCents: 0,
        memberPriceCents: 0,
        nonMemberPriceCents: 0,
        dollarCostCents: 0,
        pricingTier: 'perKid',
        holiday: exports.CATALOG_HOLIDAY,
        category: 'Book',
        context: ['Default'],
        source: 'Curated',
        inventory: null,
        airtableRecordId: rec.id,
        airtableTable: 'books',
        brand: author || null,
        imageUrl: images.imageUrl,
        imageUrls: images.imageUrls,
        buyLink: typeof f[B.buyLink] === 'string' ? f[B.buyLink] : null,
        interest: selectName(f[B.interest]),
        curationTags: ['collection'],
        dimensions: null,
        materials: null,
        whatsIncluded: null,
        careNotes: null,
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
async function runAirtableCatalogReplaceSync() {
    var _a, _b;
    const db = (0, firestore_1.getFirestore)();
    const listingFields = Object.values(F);
    const bookFields = Object.values(B);
    const [listingRecs, bookRecs] = await Promise.all([
        airtableListAll(exports.FULL_CATALOG_TABLE_ID, listingFields),
        airtableListAll(exports.BOOKS_TABLE_ID, bookFields),
    ]);
    const items = [];
    let skippedImages = 0;
    for (const rec of listingRecs) {
        const name = String((_a = rec.fields[F.id]) !== null && _a !== void 0 ? _a : '').trim();
        if (!name)
            continue;
        const inProd = selectName(rec.fields[F.inProduction]);
        if (inProd && inProd !== 'Yes')
            continue;
        const id = slugifyCatalogId(name);
        const primary = attachments(rec.fields[F.primaryImage]);
        const other = attachments(rec.fields[F.otherImages]);
        let images = { imageUrl: null, imageUrls: [] };
        if (primary.length || other.length) {
            try {
                images = await resolveImages(id, primary, other);
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
    for (const rec of bookRecs) {
        if (rec.fields[B.cut] === true)
            continue;
        const title = String((_b = rec.fields[B.title]) !== null && _b !== void 0 ? _b : '').trim();
        if (!title)
            continue;
        const id = `book-${slugifyCatalogId(title)}`;
        const cover = attachments(rec.fields[B.cover]);
        let images = { imageUrl: null, imageUrls: [] };
        if (cover.length) {
            try {
                images = await resolveImages(id, cover, []);
            }
            catch (e) {
                skippedImages += 1;
                logger.warn('Book cover mirror failed', { id, error: String(e) });
            }
        }
        const item = bookToItem(rec, images);
        if (item)
            items.push(item);
    }
    wireBookSwaps(items);
    if (items.length === 0) {
        throw new Error('Airtable sync produced 0 items — refusing to delete Firestore catalog. Check PAT scopes and field mapping.');
    }
    const col = db.collection('catalog').doc(exports.CATALOG_HOLIDAY).collection('items');
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