"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCatalogRows = loadCatalogRows;
exports.buildCatalogContext = buildCatalogContext;
exports.buildBoxRulesContext = buildBoxRulesContext;
exports.buildHouseholdContext = buildHouseholdContext;
exports.buildSurfaceContext = buildSurfaceContext;
exports.buildUserMemoryContext = buildUserMemoryContext;
const firestore_1 = require("firebase-admin/firestore");
const boxRules_1 = require("./boxRules");
const HOLIDAY_ID = 'hanukkah-2026';
/** Firestore catalog path: catalog/{CATALOG_HOLIDAY}/items/{id} (Airtable sync + app client). */
const CATALOG_HOLIDAY = 'hanukkah';
const CATALOG_SOFT_LIMIT = 90;
const DESC_MAX = 140;
function asStringArray(v) {
    if (!Array.isArray(v))
        return [];
    return v.filter((x) => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim());
}
function truncate(s, max) {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t.length <= max)
        return t;
    return `${t.slice(0, max - 1)}…`;
}
function asNumberArray(v) {
    if (!Array.isArray(v))
        return [];
    return v
        .map((x) => {
        if (typeof x === 'number' && Number.isFinite(x))
            return x;
        if (typeof x === 'string' && x.trim())
            return x.trim();
        return null;
    })
        .filter((x) => x != null);
}
function docToRow(id, c) {
    return {
        id,
        name: typeof c.name === 'string' ? c.name : id,
        slotId: typeof c.slotId === 'string' ? c.slotId : 'extra',
        description: typeof c.description === 'string' ? c.description : '',
        ageGroups: asStringArray(c.ageGroups),
        swapOptions: asStringArray(c.swapOptions).slice(0, 6),
        category: typeof c.category === 'string' ? c.category : '',
        brand: typeof c.brand === 'string' ? c.brand : '',
        rails: asStringArray(c.storefrontRails).slice(0, 4),
        pricingTier: typeof c.pricingTier === 'string' ? c.pricingTier : undefined,
        memberPriceCents: typeof c.memberPriceCents === 'number' ? c.memberPriceCents : undefined,
        nonMemberPriceCents: typeof c.nonMemberPriceCents === 'number' ? c.nonMemberPriceCents : undefined,
        dollarCostCents: typeof c.dollarCostCents === 'number' ? c.dollarCostCents : undefined,
        materials: typeof c.materials === 'string' ? c.materials : '',
        interest: typeof c.interest === 'string' ? c.interest : '',
        defaultSlot: typeof c.defaultSlot === 'string' ? c.defaultSlot : null,
        boxSections: asStringArray(c.boxSections),
        defaultBookAges: asNumberArray(c.defaultBookAges),
        defaultGiftAges: asNumberArray(c.defaultGiftAges),
        defaultFor: asStringArray(c.defaultFor),
        inventory: typeof c.inventory === 'number' ? c.inventory : null,
        holdInventory: typeof c.holdInventory === 'boolean' ? c.holdInventory : null,
        wrappable: typeof c.wrappable === 'boolean' ? c.wrappable : null,
    };
}
function formatCatalogRow(row, detail) {
    const ages = row.ageGroups.length ? ` ages=[${row.ageGroups.join(',')}]` : '';
    const swaps = row.swapOptions.length ? ` swaps=[${row.swapOptions.join(',')}]` : '';
    const cat = row.category ? ` cat=${row.category}` : '';
    const brand = row.brand ? ` brand=${row.brand}` : '';
    const rails = row.rails.length ? ` rails=[${row.rails.join(',')}]` : '';
    const tier = row.pricingTier ? ` tier=${row.pricingTier}` : '';
    const priceBits = [];
    if (typeof row.memberPriceCents === 'number')
        priceBits.push(`member=$${(row.memberPriceCents / 100).toFixed(0)}`);
    if (typeof row.nonMemberPriceCents === 'number') {
        priceBits.push(`retail=$${(row.nonMemberPriceCents / 100).toFixed(0)}`);
    }
    else if (typeof row.dollarCostCents === 'number') {
        priceBits.push(`price=$${(row.dollarCostCents / 100).toFixed(0)}`);
    }
    const price = priceBits.length ? ` ${priceBits.join(' ')}` : '';
    const head = `${row.id} (${row.slotId}): ${row.name}${ages}${cat}${brand}${rails}${tier}${price}${swaps}`;
    if (!detail)
        return head;
    const extras = [];
    if (row.description)
        extras.push(truncate(row.description, DESC_MAX));
    if (row.materials)
        extras.push(`materials: ${truncate(row.materials, 80)}`);
    if (row.interest)
        extras.push(`interest: ${row.interest}`);
    return extras.length ? `${head} — ${extras.join(' | ')}` : head;
}
function priorityIdsFromClient(surface, userMemory) {
    const ids = [];
    const fe = surface === null || surface === void 0 ? void 0 : surface.focusedEntity;
    if (fe && typeof fe === 'object') {
        if (typeof fe.id === 'string' && fe.type === 'product')
            ids.push(fe.id.trim());
    }
    const browse = Array.isArray(userMemory === null || userMemory === void 0 ? void 0 : userMemory.browseRecent) ? userMemory.browseRecent : [];
    for (const e of browse.slice(0, 10)) {
        if (e && typeof e.itemId === 'string')
            ids.push(e.itemId.trim());
    }
    const wish = Array.isArray(userMemory === null || userMemory === void 0 ? void 0 : userMemory.wishlist) ? userMemory.wishlist : [];
    for (const e of wish.slice(0, 24)) {
        if (e && typeof e.itemId === 'string')
            ids.push(e.itemId.trim());
    }
    return [...new Set(ids.filter(Boolean))];
}
function scoreRow(row, priority, focusCategory) {
    let score = 0;
    if (priority.has(row.id))
        score += 100;
    if (focusCategory && row.rails.includes(focusCategory))
        score += 20;
    if (focusCategory && row.category.toLowerCase().includes(focusCategory.replace(/-/g, ' ')))
        score += 10;
    if (row.swapOptions.length)
        score += 3;
    if (row.description)
        score += 2;
    if (row.rails.includes('most-loved'))
        score += 5;
    return score;
}
/** Load catalog/hanukkah/items once for catalog + box-rules context. */
async function loadCatalogRows() {
    const db = (0, firestore_1.getFirestore)();
    const snap = await db
        .collection('catalog')
        .doc(CATALOG_HOLIDAY)
        .collection('items')
        .limit(200)
        .get();
    if (snap.empty)
        return [];
    return snap.docs.map((d) => docToRow(d.id, d.data()));
}
function toBoxRulesRows(catalog) {
    return catalog.map((r) => ({
        id: r.id,
        name: r.name,
        slotId: r.slotId,
        defaultSlot: r.defaultSlot,
        boxSections: r.boxSections,
        defaultBookAges: r.defaultBookAges,
        defaultGiftAges: r.defaultGiftAges,
        ageGroups: r.ageGroups,
        defaultFor: r.defaultFor,
        inventory: r.inventory,
        holdInventory: r.holdInventory,
        wrappable: r.wrappable,
        memberPriceCents: r.memberPriceCents,
    }));
}
/**
 * Rich catalog CONTEXT: prioritize focused/wishlist/browse items with detail lines,
 * then a scored fill of the rest (still capped for tokens).
 * Pass `rows` from loadCatalogRows() to avoid a second Firestore read.
 */
async function buildCatalogContext(surface, userMemory, rows) {
    var _a;
    const catalog = rows !== null && rows !== void 0 ? rows : (await loadCatalogRows());
    if (!catalog.length)
        return '';
    const byId = new Map(catalog.map((r) => [r.id, r]));
    const priority = new Set(priorityIdsFromClient(surface, userMemory));
    // Expand priority to swap peers of focused/wishlist items
    for (const id of [...priority]) {
        const row = byId.get(id);
        if (!row)
            continue;
        for (const swapId of row.swapOptions)
            priority.add(swapId);
    }
    const focusCategory = ((_a = surface === null || surface === void 0 ? void 0 : surface.focusedEntity) === null || _a === void 0 ? void 0 : _a.type) === 'category' && typeof surface.focusedEntity.id === 'string'
        ? surface.focusedEntity.id.trim()
        : undefined;
    const ranked = [...catalog].sort((a, b) => scoreRow(b, priority, focusCategory) - scoreRow(a, priority, focusCategory));
    const selected = ranked.slice(0, CATALOG_SOFT_LIMIT);
    const detailIds = new Set([...priority].filter((id) => byId.has(id)).slice(0, 28));
    const lines = selected.map((row) => formatCatalogRow(row, detailIds.has(row.id)));
    return [
        'Catalog (use real ids for actions/panes; prefer detailed lines when recommending):',
        ...lines,
    ].join('\n');
}
/**
 * Hanukkah 2026 box construction rules for Rav.
 * Canonical policy lives in `./boxRules` (not Airtable). Catalog rows optionally annotate live ids.
 */
async function buildBoxRulesContext(rows) {
    const catalog = rows !== null && rows !== void 0 ? rows : (await loadCatalogRows());
    return (0, boxRules_1.renderBoxRulesContext)(toBoxRulesRows(catalog));
}
async function buildHouseholdContext(uid, clientDraft) {
    var _a, _b, _c, _d, _e, _f;
    const db = (0, firestore_1.getFirestore)();
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists)
        return clientDraft ? `Current box (client): ${clientDraft}` : '';
    const user = (_a = userSnap.data()) !== null && _a !== void 0 ? _a : {};
    const householdId = user.householdId;
    const familiarity = user.familiarityLevel;
    const lines = [];
    if (familiarity)
        lines.push(`Family familiarity: ${familiarity}`);
    const childrenSnap = await db.collection(`users/${uid}/children`).get();
    if (!childrenSnap.empty) {
        const kids = childrenSnap.docs.map((d) => {
            const c = d.data();
            const name = c.name ? String(c.name) : 'Child';
            const age = c.ageGroup ? String(c.ageGroup) : '?';
            const beam = c.beamStatus ? String(c.beamStatus) : '';
            return `${name} (${age}${beam ? `, beam:${beam}` : ''})`;
        });
        lines.push(`Kids: ${kids.join(', ')}`);
    }
    if (!householdId) {
        if (clientDraft)
            lines.push(`Current box (client): ${clientDraft}`);
        return lines.join('\n');
    }
    const [draftSnap, configSnap] = await Promise.all([
        db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get(),
        db.doc('config/hanukkah-2026').get(),
    ]);
    const config = (_b = configSnap.data()) !== null && _b !== void 0 ? _b : {};
    const lockAt = config.lockAt;
    if (lockAt) {
        const locked = Date.now() >= new Date(lockAt).getTime();
        lines.push(locked ? `Box customization: locked (${lockAt})` : `Box customization open until ${lockAt}`);
    }
    if (clientDraft) {
        lines.push(`Current box (client): ${clientDraft}`);
    }
    else if (draftSnap.exists) {
        const draft = (_c = draftSnap.data()) !== null && _c !== void 0 ? _c : {};
        const items = (_d = draft.lineItems) !== null && _d !== void 0 ? _d : [];
        if (items.length) {
            const summary = items
                .map((li) => {
                const name = li.label || li.itemId || li.slotId || 'item';
                const qty = li.quantity && li.quantity > 1 ? ` ×${li.quantity}` : '';
                const kid = li.childId ? ` [${li.childId}]` : '';
                return `${name}${qty}${kid}`;
            })
                .join('; ');
            lines.push(`Current box: ${summary}`);
        }
        else {
            lines.push('Current box: empty draft');
        }
    }
    else {
        lines.push('Current box: not started');
    }
    const hhSnap = await db.doc(`households/${householdId}`).get();
    const wishlist = (_f = (_e = hhSnap.data()) === null || _e === void 0 ? void 0 : _e.wishlistItemIds) !== null && _f !== void 0 ? _f : [];
    if (wishlist.length) {
        lines.push(`Wishlist / favorites (prioritize these if recommending box items): ${wishlist.join(', ')}`);
    }
    return lines.join('\n');
}
/** Sanitize + format client surface (current screen) for the model. */
function buildSurfaceContext(raw) {
    if (!raw || typeof raw !== 'object')
        return '';
    const route = typeof raw.route === 'string' ? raw.route.trim() : '';
    const overlay = typeof raw.overlay === 'string' ? raw.overlay.trim() : '';
    const fe = raw.focusedEntity && typeof raw.focusedEntity === 'object' ? raw.focusedEntity : undefined;
    const type = typeof (fe === null || fe === void 0 ? void 0 : fe.type) === 'string' ? fe.type.trim() : '';
    const id = typeof (fe === null || fe === void 0 ? void 0 : fe.id) === 'string' ? fe.id.trim() : '';
    const label = typeof (fe === null || fe === void 0 ? void 0 : fe.label) === 'string' ? fe.label.trim() : '';
    const lines = ['Screen (co-pilot — user is looking at this now):'];
    if (route)
        lines.push(`- Route: ${route}`);
    if (overlay)
        lines.push(`- Rav overlay: ${overlay}`);
    if (type && id) {
        lines.push(`- Focused: ${type} “${label || id}” (id: ${id})`);
    }
    if (lines.length <= 1)
        return '';
    lines.push('Use this to answer in context of what they see. Prefer helping with the focused item/page before changing subject.');
    return lines.join('\n');
}
/** Sanitize + format non-PII user memory from the client. */
function buildUserMemoryContext(raw) {
    if (!raw || typeof raw !== 'object')
        return '';
    const lines = [];
    const browse = Array.isArray(raw.browseRecent) ? raw.browseRecent : [];
    const browseLines = browse
        .slice(0, 10)
        .map((e) => {
        if (!e || typeof e !== 'object')
            return null;
        const itemId = typeof e.itemId === 'string' ? e.itemId.trim() : '';
        const name = typeof e.name === 'string' ? e.name.trim() : '';
        if (!itemId && !name)
            return null;
        return `- ${name || itemId}${itemId && name ? ` (${itemId})` : ''}`;
    })
        .filter(Boolean);
    if (browseLines.length) {
        lines.push('Recently viewed products (this device):');
        lines.push(...browseLines);
    }
    const wishlist = Array.isArray(raw.wishlist) ? raw.wishlist : [];
    const wishLines = wishlist
        .slice(0, 24)
        .map((e) => {
        if (!e || typeof e !== 'object')
            return null;
        const itemId = typeof e.itemId === 'string' ? e.itemId.trim() : '';
        const name = typeof e.name === 'string' ? e.name.trim() : '';
        if (!itemId)
            return null;
        return `- ${name || itemId}${name ? ` (${itemId})` : ''}`;
    })
        .filter(Boolean);
    if (wishLines.length) {
        lines.push('Wishlist / favorites:');
        lines.push(...wishLines);
    }
    const orders = Array.isArray(raw.ordersSummary) ? raw.ordersSummary : [];
    const orderLines = orders
        .slice(0, 5)
        .map((o) => {
        if (!o || typeof o !== 'object')
            return null;
        const id = typeof o.id === 'string' ? o.id.trim() : '';
        const status = typeof o.status === 'string' ? o.status.trim() : '';
        if (!id)
            return null;
        const labels = Array.isArray(o.itemLabels)
            ? o.itemLabels.filter((l) => typeof l === 'string' && l.trim().length > 0).slice(0, 8)
            : [];
        const when = typeof o.createdAt === 'string' ? o.createdAt.slice(0, 10) : '';
        const items = labels.length ? `; items: ${labels.join(', ')}` : '';
        return `- Order ${id.slice(0, 8)}… status=${status || '?'}${when ? ` (${when})` : ''}${items}`;
    })
        .filter(Boolean);
    if (orderLines.length) {
        lines.push('Past / upcoming orders (no addresses or payment data):');
        lines.push(...orderLines);
    }
    if (!lines.length)
        return '';
    return `User memory (non-PII — use for personalization; do not invent orders/views):\n${lines.join('\n')}`;
}
//# sourceMappingURL=context.js.map