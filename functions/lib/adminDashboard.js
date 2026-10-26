"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GIFT_FUNNEL_KEYS = void 0;
exports.guestAnsweredSliders = guestAnsweredSliders;
exports.buildGiftFunnelRows = buildGiftFunnelRows;
exports.buildBoxesDashboard = buildBoxesDashboard;
exports.createAdminBoxesDashboard = createAdminBoxesDashboard;
const auth_1 = require("firebase-admin/auth");
const sentry_1 = require("./sentry");
const guestSessions_1 = require("./guestSessions");
const metaAdsInsights_1 = require("./metaAdsInsights");
const testAccounts_1 = require("./testAccounts");
const catalogAvailability_1 = require("./catalogAvailability");
const shopOrders_1 = require("./shopOrders");
const inventoryEmails_1 = require("./inventoryEmails");
const stripe_1 = require("./stripe");
const boxAuditJob_1 = require("./boxAuditJob");
const logger = require("./logger");
const checkoutSession_1 = require("./checkoutSession");
/**
 * Admin "Orders and Inventory" dashboard: one read-only snapshot of Hanukkah box orders,
 * storefront (no-box) orders, open drafts, anonymous (signed-out) boxes, gift invites and
 * inventory holds. Hold math mirrors recomputeBoxAllocations / addOutstandingGiftBoxes in
 * catalogInventory.ts — keep in sync.
 */
const HOLIDAY_ID = 'hanukkah-2026';
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
const LIVE = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const DEFAULT_BOX_CENTS = 8000;
const PER_EXTRA_KID_CENTS = 1000;
const GUEST_ROW_LIMIT = 500;
/** Onboarding steps after the two sliders — reaching one means the scores are real answers, not defaults. */
const STEPS_AFTER_SLIDERS = ['rav-question', 'building', 'reveal'];
/** Gift funnel steps in order; `email` and `box` only exist on the curated path. */
exports.GIFT_FUNNEL_KEYS = [
    'start',
    'path',
    'family',
    'email',
    'box',
    'note',
    'send',
    'checkout',
    'paid',
    'claimed',
];
const CURATED_ONLY = ['email', 'box'];
function iso(v) {
    if (!v)
        return null;
    if (typeof v === 'string')
        return v;
    if (typeof v.toDate === 'function')
        return v.toDate().toISOString();
    return null;
}
const ms = (v) => {
    const s = iso(v);
    const t = s ? Date.parse(s) : NaN;
    return Number.isFinite(t) ? t : null;
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v ? v : null);
function addLines(totals, lines) {
    var _a, _b;
    if (!Array.isArray(lines))
        return;
    for (const li of lines) {
        const id = String((_a = li === null || li === void 0 ? void 0 : li.itemId) !== null && _a !== void 0 ? _a : '').trim();
        if (!id)
            continue;
        const q = Math.max(1, Math.floor(Number(li.quantity) || 1));
        totals.set(id, ((_b = totals.get(id)) !== null && _b !== void 0 ? _b : 0) + q);
    }
}
/** "Sarah Cohen" → "Sarah". */
const firstNameOf = (name) => (name === null || name === void 0 ? void 0 : name.trim().split(/\s+/)[0]) || null;
const score = (v) => {
    const n = num(v);
    return n == null ? null : Math.round(Math.max(0, Math.min(100, n)));
};
const NO_ANSWERS = { hanukkah: null, hanukkahLevel: null, jewish: null };
/** "We keep kosher" / "kosher home". Not a product description. */
const KOSHER_WORD = /\bkosher\b/i;
function kosherQuote(text) {
    if (!KOSHER_WORD.test(text))
        return null;
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > 180 ? `${flat.slice(0, 177)}…` : flat;
}
function hostOf(url) {
    if (typeof url !== 'string' || !url)
        return null;
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    }
    catch (_a) {
        return null;
    }
}
function guestSourceLabel(entry) {
    if (!entry || typeof entry !== 'object')
        return null;
    const e = entry;
    const fromUtm = attributionLabel(e.utm);
    if (fromUtm)
        return fromUtm;
    if (str(e.fbclid))
        return 'Meta (fbclid)';
    return hostOf(e.referrer);
}
function attributionLabel(a) {
    var _a, _b, _c, _d;
    if (!a || typeof a !== 'object')
        return null;
    const o = a;
    const parts = [(_b = (_a = o.utm_source) !== null && _a !== void 0 ? _a : o.utmSource) !== null && _b !== void 0 ? _b : o.source, (_d = (_c = o.utm_campaign) !== null && _c !== void 0 ? _c : o.utmCampaign) !== null && _d !== void 0 ? _d : o.campaign].filter((x) => typeof x === 'string' && x.length > 0);
    return parts.length ? parts.join(' / ') : null;
}
const US_STATES = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO',
    CONNECTICUT: 'CT', DELAWARE: 'DE', 'DISTRICT OF COLUMBIA': 'DC', FLORIDA: 'FL', GEORGIA: 'GA',
    HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY',
    LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
    MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH',
    'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
    OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
    VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY', 'PUERTO RICO': 'PR',
};
const CA_PROVINCES = {
    ALBERTA: 'AB', 'BRITISH COLUMBIA': 'BC', MANITOBA: 'MB', 'NEW BRUNSWICK': 'NB',
    'NEWFOUNDLAND AND LABRADOR': 'NL', NEWFOUNDLAND: 'NL', 'NOVA SCOTIA': 'NS', ONTARIO: 'ON',
    'PRINCE EDWARD ISLAND': 'PE', QUEBEC: 'QC', QUÉBEC: 'QC', SASKATCHEWAN: 'SK',
    'NORTHWEST TERRITORIES': 'NT', NUNAVUT: 'NU', YUKON: 'YT',
};
const US_CODES = new Set(Object.values(US_STATES));
const CA_CODES = new Set(Object.values(CA_PROVINCES));
/**
 * State only — the dashboard never carries street addresses. The address form defaults country to
 * US, so Canada is inferred from the province.
 */
function locationOf(addr) {
    var _a, _b;
    if (!addr || typeof addr !== 'object')
        return null;
    const a = addr;
    const raw = typeof a.stateProvince === 'string' ? a.stateProvince.trim().replace(/\.|\s+(?=\s)/g, '').toUpperCase() : '';
    if (!raw)
        return null;
    const ca = (_a = CA_PROVINCES[raw]) !== null && _a !== void 0 ? _a : (CA_CODES.has(raw) ? raw : null);
    const us = (_b = US_STATES[raw]) !== null && _b !== void 0 ? _b : (US_CODES.has(raw) ? raw : null);
    if (ca && (a.country === 'CA' || !us))
        return `${ca}, Canada`;
    if (us)
        return us;
    return a.country === 'OTHER' ? `${raw} (intl)` : raw;
}
/** `ipGeo` written by functions/src/geo.ts → "NY", "ON, Canada", or a country code. */
function ipLocationOf(geo) {
    if (!geo || typeof geo !== 'object')
        return null;
    const g = geo;
    const country = str(g.country);
    const region = str(g.region);
    if (!country)
        return null;
    if (country === 'US')
        return region !== null && region !== void 0 ? region : 'US';
    if (country === 'CA')
        return region ? `${region}, Canada` : 'Canada';
    return country;
}
/** IP country known and not US. No geo counts as US. */
function ipOutsideUs(geo) {
    const country = geo && typeof geo === 'object' ? str(geo.country) : null;
    return Boolean(country && country.toUpperCase() !== 'US');
}
/** A `locationOf` label for a Canadian or international address. */
const addressOutsideUs = (location) => Boolean(location && /(, Canada|\(intl\))$/.test(location));
const META_AD_UNKNOWN = 'Meta, ad unknown';
const DIRECT = 'Direct / no tags';
const NOT_RECORDED = 'Not recorded';
/** Where a non-ad visit came from: a utm_source (newsletters), else the referring site. */
function nonAdSourceOf(...touches) {
    var _a;
    const ts = touches.filter((t) => Boolean(t && typeof t === 'object'));
    for (const t of ts) {
        const u = (t.utm && typeof t.utm === 'object' ? t.utm : {});
        const source = (_a = str(u.utm_source)) !== null && _a !== void 0 ? _a : str(u.source);
        if (source)
            return `From ${source}`;
    }
    for (const t of ts) {
        const host = hostOf(t.referrer);
        if (host)
            return `Referral: ${host}`;
    }
    return null;
}
/** Label for a guest session with no ad name. */
function guestNonAdLabel(entry) {
    var _a;
    if (!entry || typeof entry !== 'object')
        return NOT_RECORDED;
    return (_a = nonAdSourceOf(entry)) !== null && _a !== void 0 ? _a : DIRECT;
}
/** Ad name from a touch (`{ utm, fbclid }`) or a guest entry; utm keys may be bare or utm_-prefixed. */
function adNameOf(touch) {
    var _a, _b, _c;
    if (!touch || typeof touch !== 'object')
        return null;
    const t = touch;
    const u = (t.utm && typeof t.utm === 'object' ? t.utm : {});
    const content = (_a = str(u.utm_content)) !== null && _a !== void 0 ? _a : str(u.content);
    if (content)
        return content;
    const source = (_c = ((_b = str(u.utm_source)) !== null && _b !== void 0 ? _b : str(u.source))) === null || _c === void 0 ? void 0 : _c.toLowerCase();
    return source === 'meta' || str(t.fbclid) ? META_AD_UNKNOWN : null;
}
function guestAnsweredSliders(guest) {
    return (guest.onboardingComplete === true ||
        guest.boxRevealComplete === true ||
        STEPS_AFTER_SLIDERS.includes(String(guest.onboardingStep)) ||
        (Array.isArray(guest.lineItems) && guest.lineItems.length > 0 && guest.buildBoxPath === true));
}
function guestAnswers(guest) {
    return { hanukkah: score(guest.familiarityScore), hanukkahLevel: null, jewish: score(guest.practiceFrequencyScore) };
}
/** Signed-out visitors' saved boxes (guestSessions). Favorites-only browsing is left out. */
function buildGuestRows(docs, items, priceForKids) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const rows = [];
    for (const d of docs) {
        const x = d.data();
        const guest = (_b = (_a = x.snapshot) === null || _a === void 0 ? void 0 : _a.guest) !== null && _b !== void 0 ? _b : {};
        const gift = (_d = (_c = x.snapshot) === null || _c === void 0 ? void 0 : _c.gift) !== null && _d !== void 0 ? _d : null;
        const giftDraft = (_e = gift === null || gift === void 0 ? void 0 : gift.draft) !== null && _e !== void 0 ? _e : null;
        const kidDrafts = (Array.isArray(guest.childDrafts) ? guest.childDrafts : []).filter((c) => c && c.role !== 'adult');
        const rawLines = Array.isArray(guest.lineItems) ? guest.lineItems : [];
        const step = str(guest.onboardingStep);
        if (!rawLines.length && !step && !kidDrafts.length && !giftDraft && guest.boxRevealComplete !== true)
            continue;
        const kidLabels = new Map();
        kidDrafts.forEach((c, i) => {
            const age = num(c.plannerAge);
            kidLabels.set(`guest-${i}`, `Kid ${i + 1}${age != null ? ` (${age >= 18 ? '18+' : age})` : ''}`);
        });
        const lines = rawLines.filter(Boolean).map((raw) => {
            var _a, _b, _c;
            const li = raw;
            const itemId = str(li.itemId);
            const unitCents = (_a = num(li.unitCents)) !== null && _a !== void 0 ? _a : 0;
            const childId = str(li.childId);
            return {
                itemId,
                name: (itemId && ((_b = items.get(itemId)) === null || _b === void 0 ? void 0 : _b.name)) || str(li.label) || itemId || '?',
                qty: Math.max(0, Math.floor(Number(li.quantity) || 0)),
                unitCents,
                addOn: unitCents > 0,
                child: childId ? (_c = kidLabels.get(childId)) !== null && _c !== void 0 ? _c : 'child' : null,
                forHousehold: !childId,
            };
        });
        const answered = guestAnsweredSliders(guest);
        const stage = guest.boxRevealComplete
            ? 'revealed'
            : lines.length
                ? 'built'
                : answered
                    ? 'answered'
                    : step || kidDrafts.length
                        ? 'started'
                        : 'gift';
        const kids = Math.max(1, kidDrafts.length);
        const giftLines = Array.isArray(giftDraft === null || giftDraft === void 0 ? void 0 : giftDraft.lineItems) ? giftDraft === null || giftDraft === void 0 ? void 0 : giftDraft.lineItems.length : 0;
        rows.push({
            id: d.id,
            createdAt: iso(x.createdAt),
            updatedAt: iso(x.updatedAt),
            stage,
            step,
            kids,
            boxPriceCents: priceForKids(kids),
            addOnCents: lines.filter((l) => l.addOn).reduce((s, l) => s + l.unitCents * Math.max(1, l.qty), 0),
            answers: answered ? guestAnswers(guest) : NO_ANSWERS,
            source: guestSourceLabel(x.entry),
            landingPath: str((_f = x.entry) === null || _f === void 0 ? void 0 : _f.landingPath),
            lastPath: str(x.path),
            converted: Boolean(str(x.convertedUid)),
            convertedAt: iso(x.convertedAt),
            leadAt: iso(x.lastLeadAt),
            resumeCount: (_g = num(x.resumeCount)) !== null && _g !== void 0 ? _g : 0,
            saveCount: (_h = num(x.saveCount)) !== null && _h !== void 0 ? _h : 0,
            gift: giftDraft
                ? {
                    kind: str(gift === null || gift === void 0 ? void 0 : gift.kind),
                    giverName: str((_j = giftDraft.form) === null || _j === void 0 ? void 0 : _j.giverName),
                    recipientEmail: str((_k = giftDraft.form) === null || _k === void 0 ? void 0 : _k.recipientEmail),
                    items: giftLines,
                }
                : null,
            location: ipLocationOf(x.ipGeo),
            outsideUs: ipOutsideUs(x.ipGeo),
            lines,
        });
    }
    rows.sort((a, b) => { var _a, _b; return String((_a = b.updatedAt) !== null && _a !== void 0 ? _a : '').localeCompare(String((_b = a.updatedAt) !== null && _b !== void 0 ? _b : '')); });
    return rows.slice(0, GUEST_ROW_LIMIT);
}
/** A saved draft's `step` is the page it was on, which means the step before it was done. */
const GIFT_DRAFT_STEP_REACHED = {
    type: 'start',
    kids: 'path',
    email: 'family',
    note: 'note',
    send: 'send',
    pay: 'checkout',
};
/** giftFunnel step tracking, plus signed-out gift drafts saved before it (or without it). */
function buildGiftFunnelRows(funnelDocs, guestDocs, invites, testUid) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
    const funnelById = new Map(funnelDocs.map((d) => [d.id, d.data()]));
    const guestById = new Map(guestDocs.map((d) => [d.id, d.data()]));
    const ids = new Set(funnelById.keys());
    for (const [id, x] of guestById)
        if ((_b = (_a = x.snapshot) === null || _a === void 0 ? void 0 : _a.gift) === null || _b === void 0 ? void 0 : _b.draft)
            ids.add(id);
    const rows = [];
    for (const id of ids) {
        const f = funnelById.get(id);
        const g = guestById.get(id);
        const gift = (_d = (_c = g === null || g === void 0 ? void 0 : g.snapshot) === null || _c === void 0 ? void 0 : _c.gift) !== null && _d !== void 0 ? _d : null;
        const draft = (_e = gift === null || gift === void 0 ? void 0 : gift.draft) !== null && _e !== void 0 ? _e : null;
        const recorded = new Set((f === null || f === void 0 ? void 0 : f.steps) && typeof f.steps === 'object' ? Object.keys(f.steps) : []);
        const draftLines = Array.isArray(draft === null || draft === void 0 ? void 0 : draft.lineItems) ? draft.lineItems.length : 0;
        if (draft) {
            recorded.add('path');
            const fromStep = GIFT_DRAFT_STEP_REACHED[(_f = str(draft.step)) !== null && _f !== void 0 ? _f : ''];
            if (fromStep)
                recorded.add(fromStep);
            if (draftLines || str(g === null || g === void 0 ? void 0 : g.path) === '/gift/customize')
                recorded.add('box');
            // The curated email step signs the giver in, which ends the guest session's saves.
            if (str(g === null || g === void 0 ? void 0 : g.convertedUid) && (gift === null || gift === void 0 ? void 0 : gift.kind) === 'customize')
                recorded.add('email');
        }
        const linked = (Array.isArray(f === null || f === void 0 ? void 0 : f.inviteIds) ? f.inviteIds : [])
            .map((i) => invites.get(String(i)))
            .filter((inv) => Boolean(inv));
        if (linked.length)
            recorded.add('checkout');
        if (linked.some((inv) => inv.paymentStatus === 'paid'))
            recorded.add('paid');
        if (linked.some((inv) => inv.status === 'claimed' || str(inv.claimedByHouseholdId)))
            recorded.add('claimed');
        const rawPath = (_k = (_h = (_g = str(f === null || f === void 0 ? void 0 : f.path)) !== null && _g !== void 0 ? _g : str(gift === null || gift === void 0 ? void 0 : gift.kind)) !== null && _h !== void 0 ? _h : str((_j = draft === null || draft === void 0 ? void 0 : draft.form) === null || _j === void 0 ? void 0 : _j.giftPath)) !== null && _k !== void 0 ? _k : (linked[0] ? (linked[0].kind === 'box' ? 'customize' : 'credit_only') : null);
        const path = rawPath === 'customize' ? 'curated' : rawPath === 'credit_only' ? 'credit' : null;
        const furthest = exports.GIFT_FUNNEL_KEYS.reduce((m, k, i) => (recorded.has(k) ? i : m), -1);
        const reached = exports.GIFT_FUNNEL_KEYS.filter((k, i) => i <= furthest && (path === 'curated' || !CURATED_ONLY.includes(k)));
        const landing = recorded.has('landing');
        if (!reached.length && !landing)
            continue;
        const uid = (_l = str(f === null || f === void 0 ? void 0 : f.uid)) !== null && _l !== void 0 ? _l : str(g === null || g === void 0 ? void 0 : g.convertedUid);
        const entry = (_m = f === null || f === void 0 ? void 0 : f.entry) !== null && _m !== void 0 ? _m : g === null || g === void 0 ? void 0 : g.entry;
        const geo = (_o = f === null || f === void 0 ? void 0 : f.ipGeo) !== null && _o !== void 0 ? _o : g === null || g === void 0 ? void 0 : g.ipGeo;
        const firstMs = Math.min((_p = ms(f === null || f === void 0 ? void 0 : f.createdAt)) !== null && _p !== void 0 ? _p : Infinity, (_q = ms(g === null || g === void 0 ? void 0 : g.createdAt)) !== null && _q !== void 0 ? _q : Infinity);
        const lastMs = Math.max((_r = ms(f === null || f === void 0 ? void 0 : f.updatedAt)) !== null && _r !== void 0 ? _r : -Infinity, (_s = ms(g === null || g === void 0 ? void 0 : g.updatedAt)) !== null && _s !== void 0 ? _s : -Infinity);
        const kids = path === 'curated' ? (Array.isArray(draft === null || draft === void 0 ? void 0 : draft.childDrafts) ? draft.childDrafts.length : null) : num((_t = draft === null || draft === void 0 ? void 0 : draft.form) === null || _t === void 0 ? void 0 : _t.creditKids);
        rows.push({
            id,
            firstSeen: Number.isFinite(firstMs) ? new Date(firstMs).toISOString() : null,
            lastSeen: Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null,
            ad: (_u = adNameOf(entry)) !== null && _u !== void 0 ? _u : guestNonAdLabel(entry),
            test: (uid ? testUid(uid) : false) ||
                linked.some((inv) => (0, testAccounts_1.isTest)(str(inv.giverEmail), str(inv.recipientEmail))) ||
                (0, testAccounts_1.isTest)(str((_v = draft === null || draft === void 0 ? void 0 : draft.form) === null || _v === void 0 ? void 0 : _v.giverEmail), str((_w = draft === null || draft === void 0 ? void 0 : draft.form) === null || _w === void 0 ? void 0 : _w.recipientEmail)),
            outsideUs: ipOutsideUs(geo),
            location: ipLocationOf(geo),
            path,
            landing,
            reached,
            tracked: Boolean(f),
            signedIn: Boolean(uid),
            kids,
            items: draftLines,
        });
    }
    rows.sort((a, b) => { var _a, _b; return String((_a = b.lastSeen) !== null && _a !== void 0 ? _a : '').localeCompare(String((_b = a.lastSeen) !== null && _b !== void 0 ? _b : '')); });
    return rows;
}
const CARD_SESSION_BACKFILL_PER_LOAD = 40;
/**
 * Cards saved before sessions were recorded: rebuild the session once from the SetupIntent's
 * metadata and keep it on the household. Mutates `households` so this load shows it.
 */
async function backfillCardSessions(db, households) {
    const client = stripe_1.stripe;
    if (!client)
        return;
    const todo = [...households]
        .filter(([, h]) => (h.cardOnFileAt || h.stripeDefaultPaymentMethodId) &&
        !h.cardOnFileSession &&
        !h.cardOnFileSessionMissing &&
        str(h.stripeCustomerId))
        .slice(0, CARD_SESSION_BACKFILL_PER_LOAD);
    for (let i = 0; i < todo.length; i += 8) {
        await Promise.all(todo.slice(i, i + 8).map(async ([hid, h]) => {
            var _a, _b;
            try {
                const list = await client.setupIntents.list({ customer: String(h.stripeCustomerId), limit: 10 });
                const ok = list.data.filter((si) => si.status === 'succeeded');
                const pmOf = (si) => { var _a; return typeof si.payment_method === 'string' ? si.payment_method : (_a = si.payment_method) === null || _a === void 0 ? void 0 : _a.id; };
                const si = (_a = ok.find((s) => pmOf(s) === h.stripeDefaultPaymentMethodId)) !== null && _a !== void 0 ? _a : ok[0];
                const at = (_b = str(h.cardOnFileAt)) !== null && _b !== void 0 ? _b : (si ? new Date(si.created * 1000).toISOString() : null);
                const session = si && at ? (0, checkoutSession_1.checkoutSessionFromStripeMetadata)(si.metadata, at) : null;
                const patch = session ? { cardOnFileSession: session } : { cardOnFileSessionMissing: true };
                await db.doc(`households/${hid}`).set(patch, { merge: true });
                Object.assign(h, patch);
            }
            catch (err) {
                logger.warn('Card session backfill failed', { householdId: hid, err: String(err) });
            }
        }));
    }
}
const sessionDoc = (v) => v && typeof v === 'object' && typeof v.at === 'string' ? v : null;
async function buildBoxesDashboard(db, nowMs = Date.now()) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38, _39, _40, _41, _42, _43, _44, _45, _46, _47, _48, _49, _50, _51, _52, _53, _54, _55;
    const [configSnap, hhSnap, ordersSnap, invitesSnap, itemsSnap, countersSnap, draftsSnap, childrenSnap, receivedSnap, guestSnap, giftFunnelSnap, inventoryEmailSnap, chatSnap,] = await Promise.all([
        db.doc(`config/${HOLIDAY_ID}`).get(),
        db.collection('households').get(),
        db.collectionGroup('orders').get(),
        db.collection('giftInvites').get(),
        db.collection('catalog/hanukkah/items').get(),
        db.collection('catalog/hanukkah/inventory').get(),
        db.collectionGroup('boxDrafts').get(),
        db.collectionGroup('children').get(),
        db.collectionGroup('receivedGifts').get(),
        db
            .collection('guestSessions')
            .select('snapshot', 'entry', 'path', 'createdAt', 'updatedAt', 'convertedUid', 'convertedAt', 'lastLeadAt', 'gateEmailAt', 'resumeCount', 'saveCount', 'ipGeo')
            .get(),
        db.collection('giftFunnel').get(),
        db.collection(inventoryEmails_1.INVENTORY_EMAIL_LOG).where('status', '==', 'sent').get(),
        db.collectionGroup('aiChats').select('messages').get(),
    ]);
    const guestDocs = guestSnap.docs.filter((d) => !d.id.startsWith('agenttest'));
    const config = (_a = configSnap.data()) !== null && _a !== void 0 ? _a : {};
    const listCents = (_b = num(config.boxPriceCents)) !== null && _b !== void 0 ? _b : DEFAULT_BOX_CENTS;
    const priceForKids = (k) => listCents + Math.max(0, k - 1) * PER_EXTRA_KID_CENTS;
    const items = new Map();
    for (const d of itemsSnap.docs) {
        const x = d.data();
        items.set(d.id, {
            name: (_c = str(x.name)) !== null && _c !== void 0 ? _c : d.id,
            inventory: num(x.inventory),
            procured: num(x.procured),
            setAside: num(x.setAside),
            setAsideFor: str(x.setAsideFor),
            category: str(x.category),
            categories: Array.isArray(x.categories) ? x.categories.filter((c) => typeof c === 'string') : undefined,
            directSaleCapBeforeLock: num(x.directSaleCapBeforeLock),
            sellAfterLock: x.sellAfterLock === 'yes' || x.sellAfterLock === 'flag' || x.sellAfterLock === 'no' ? x.sellAfterLock : null,
        });
    }
    const itemNames = new Map([...items].map(([id, it]) => [id, it.name]));
    const households = new Map();
    const userIds = new Set();
    for (const d of hhSnap.docs) {
        const h = d.data();
        households.set(d.id, h);
        if (str(h.ownerId))
            userIds.add(h.ownerId);
    }
    await backfillCardSessions(db, households);
    for (const d of ordersSnap.docs) {
        const u = str(d.data().userId);
        if (u)
            userIds.add(u);
    }
    for (const d of invitesSnap.docs) {
        const u = str(d.data().giverUid);
        if (u)
            userIds.add(u);
    }
    for (const d of giftFunnelSnap.docs) {
        const u = str(d.data().uid);
        if (u)
            userIds.add(u);
    }
    const childNamesByUser = new Map();
    for (const d of childrenSnap.docs) {
        const owner = d.ref.parent.parent;
        if (!owner || owner.parent.id !== 'users')
            continue;
        const m = (_d = childNamesByUser.get(owner.id)) !== null && _d !== void 0 ? _d : new Map();
        m.set(d.id, str(d.data().name));
        childNamesByUser.set(owner.id, m);
    }
    const userRefs = [...userIds].map((uid) => db.doc(`users/${uid}`));
    const userSnaps = userRefs.length ? await db.getAll(...userRefs) : [];
    // Some profiles lack email/displayName; the Auth record still has them.
    const authByUid = new Map();
    const needAuth = userSnaps.filter((s) => { var _a, _b; return !str((_a = s.data()) === null || _a === void 0 ? void 0 : _a.email) || !str((_b = s.data()) === null || _b === void 0 ? void 0 : _b.displayName); }).map((s) => s.id);
    for (let i = 0; i < needAuth.length; i += 100) {
        const { users: records } = await (0, auth_1.getAuth)().getUsers(needAuth.slice(i, i + 100).map((uid) => ({ uid })));
        for (const r of records)
            authByUid.set(r.uid, { email: (_e = r.email) !== null && _e !== void 0 ? _e : null, name: (_f = r.displayName) !== null && _f !== void 0 ? _f : null });
    }
    // Slider answers from a converted guest session fill in for accounts with no saved lastBoxAnswers.
    const guestAnswersByUid = new Map();
    const guestAdByUid = new Map();
    const guestNonAdByUid = new Map();
    const guestIpLocationByUid = new Map();
    const guestIpOutsideUsByUid = new Map();
    for (const d of guestSnap.docs) {
        const x = d.data();
        const uid = str(x.convertedUid);
        const guest = (_g = x.snapshot) === null || _g === void 0 ? void 0 : _g.guest;
        if (uid && guest && guestAnsweredSliders(guest))
            guestAnswersByUid.set(uid, guestAnswers(guest));
        const ad = uid ? adNameOf(x.entry) : null;
        if (uid && ad)
            guestAdByUid.set(uid, ad);
        const nonAd = uid && !ad ? nonAdSourceOf(x.entry) : null;
        if (uid && nonAd)
            guestNonAdByUid.set(uid, nonAd);
        const ipLoc = uid ? ipLocationOf(x.ipGeo) : null;
        if (uid && ipLoc) {
            guestIpLocationByUid.set(uid, ipLoc);
            guestIpOutsideUsByUid.set(uid, ipOutsideUs(x.ipGeo));
        }
    }
    const userTouches = new Map();
    const users = new Map();
    const kosherFromChat = new Map();
    for (const d of chatSnap.docs) {
        const uid = (_h = d.ref.parent.parent) === null || _h === void 0 ? void 0 : _h.id;
        if (!uid || d.ref.parent.id !== 'aiChats' || kosherFromChat.has(uid))
            continue;
        const msgs = d.data().messages;
        if (!Array.isArray(msgs))
            continue;
        for (const m of msgs) {
            if (!m || m.role === 'assistant')
                continue;
            const quote = kosherQuote(String((_j = m.content) !== null && _j !== void 0 ? _j : ''));
            if (quote) {
                kosherFromChat.set(uid, quote);
                break;
            }
        }
    }
    for (const s of userSnaps) {
        const x = (_k = s.data()) !== null && _k !== void 0 ? _k : {};
        const last = (_l = x.lastBoxAnswers) !== null && _l !== void 0 ? _l : {};
        const fromGuest = (_m = guestAnswersByUid.get(s.id)) !== null && _m !== void 0 ? _m : NO_ANSWERS;
        const hanukkah = (_o = score(last.familiarityScore)) !== null && _o !== void 0 ? _o : fromGuest.hanukkah;
        const attr = (_p = x.attribution) !== null && _p !== void 0 ? _p : {};
        userTouches.set(s.id, [attr.lastTouch, attr.firstTouch].filter(Boolean));
        const fromAuth = authByUid.get(s.id);
        users.set(s.id, {
            email: (_r = (_q = str(x.email)) !== null && _q !== void 0 ? _q : fromAuth === null || fromAuth === void 0 ? void 0 : fromAuth.email) !== null && _r !== void 0 ? _r : null,
            name: firstNameOf((_t = (_s = str(x.displayName)) !== null && _s !== void 0 ? _s : fromAuth === null || fromAuth === void 0 ? void 0 : fromAuth.name) !== null && _t !== void 0 ? _t : null),
            answers: {
                hanukkah,
                hanukkahLevel: hanukkah == null ? (_u = str(last.familiarityLevel)) !== null && _u !== void 0 ? _u : str(x.familiarityLevel) : null,
                jewish: (_v = score(last.practiceFrequencyScore)) !== null && _v !== void 0 ? _v : fromGuest.jewish,
            },
            householdId: str(x.householdId),
            ad: (_2 = (_1 = (_0 = (_z = (_y = (_x = (_w = adNameOf(attr.firstTouch)) !== null && _w !== void 0 ? _w : adNameOf(attr.lastTouch)) !== null && _x !== void 0 ? _x : guestAdByUid.get(s.id)) !== null && _y !== void 0 ? _y : (str(attr.fbc) ? META_AD_UNKNOWN : null)) !== null && _z !== void 0 ? _z : nonAdSourceOf(attr.firstTouch, attr.lastTouch)) !== null && _0 !== void 0 ? _0 : (str(attr.unaffiliatedUserID) ? 'Unaffiliated newsletter' : null)) !== null && _1 !== void 0 ? _1 : guestNonAdByUid.get(s.id)) !== null && _2 !== void 0 ? _2 : (attr.firstTouch || attr.lastTouch ? DIRECT : NOT_RECORDED),
            createdAt: iso(x.createdAt),
            ipLocation: (_4 = (_3 = ipLocationOf(x.ipGeo)) !== null && _3 !== void 0 ? _3 : guestIpLocationByUid.get(s.id)) !== null && _4 !== void 0 ? _4 : null,
            ipOutsideUs: ipLocationOf(x.ipGeo) ? ipOutsideUs(x.ipGeo) : (_5 = guestIpOutsideUsByUid.get(s.id)) !== null && _5 !== void 0 ? _5 : false,
            kosherNote: (_9 = (_8 = kosherQuote((_7 = (_6 = str(last.ravNotes)) !== null && _6 !== void 0 ? _6 : str(x.ravNotes)) !== null && _7 !== void 0 ? _7 : '')) !== null && _8 !== void 0 ? _8 : kosherFromChat.get(s.id)) !== null && _9 !== void 0 ? _9 : null,
        });
    }
    const drafts = new Map();
    for (const d of draftsSnap.docs) {
        const hh = d.ref.parent.parent;
        if (d.id === HOLIDAY_ID && hh && hh.parent.id === 'households')
            drafts.set(hh.id, d.data());
    }
    const received = new Map();
    for (const d of receivedSnap.docs) {
        const hh = d.ref.parent.parent;
        if (hh && hh.parent.id === 'households')
            received.set(`${hh.id}/${d.id}`, d.data());
    }
    const customerFor = (hid, uid) => {
        var _a, _b, _c, _d, _e;
        const h = (_a = households.get(hid)) !== null && _a !== void 0 ? _a : {};
        const owner = uid !== null && uid !== void 0 ? uid : str(h.ownerId);
        const u = owner ? users.get(owner) : undefined;
        const email = (_b = u === null || u === void 0 ? void 0 : u.email) !== null && _b !== void 0 ? _b : null;
        const childNames = (owner && childNamesByUser.get(owner)) || new Map();
        return {
            name: (_c = u === null || u === void 0 ? void 0 : u.name) !== null && _c !== void 0 ? _c : (email ? email.split('@')[0] : null),
            email,
            test: (0, testAccounts_1.isTest)(email, u === null || u === void 0 ? void 0 : u.name),
            answers: (_d = u === null || u === void 0 ? void 0 : u.answers) !== null && _d !== void 0 ? _d : NO_ANSWERS,
            kosher: Boolean(u === null || u === void 0 ? void 0 : u.kosherNote),
            kosherNote: (_e = u === null || u === void 0 ? void 0 : u.kosherNote) !== null && _e !== void 0 ? _e : null,
            kids: Math.max(1, childNames.size),
            childNames,
            cardOnFile: Boolean(h.cardOnFileAt || h.stripeDefaultPaymentMethodId),
        };
    };
    const cardSessionFor = (hid, uid, order) => {
        var _a, _b;
        const h = (_a = households.get(hid)) !== null && _a !== void 0 ? _a : {};
        if (!(h.cardOnFileAt || h.stripeDefaultPaymentMethodId))
            return null;
        const s = (_b = sessionDoc(h.cardOnFileSession)) !== null && _b !== void 0 ? _b : sessionDoc(order === null || order === void 0 ? void 0 : order.checkoutSession);
        if (!s)
            return null;
        const owner = uid !== null && uid !== void 0 ? uid : str(h.ownerId);
        const oa = ((order === null || order === void 0 ? void 0 : order.attribution) && typeof order.attribution === 'object' ? order.attribution : {});
        return (0, checkoutSession_1.classifyCheckoutSession)(s, [oa.lastTouch, oa.firstTouch, ...((owner && userTouches.get(owner)) || [])]);
    };
    const lineView = (li, childNames) => {
        var _a, _b, _c;
        const itemId = str(li.itemId);
        const unitCents = (_a = num(li.unitCents)) !== null && _a !== void 0 ? _a : 0;
        const childId = str(li.childId);
        return {
            itemId,
            name: (itemId && ((_b = items.get(itemId)) === null || _b === void 0 ? void 0 : _b.name)) || str(li.label) || itemId || '?',
            qty: Math.max(0, Math.floor(Number(li.quantity) || 0)),
            unitCents,
            addOn: unitCents > 0,
            child: childId ? (_c = childNames.get(childId)) !== null && _c !== void 0 ? _c : 'child' : null,
            forHousehold: !childId,
        };
    };
    const linesOf = (raw, childNames) => (Array.isArray(raw) ? raw : []).filter(Boolean).map((li) => lineView(li, childNames));
    const addOnTotal = (lines) => lines.filter((l) => l.addOn).reduce((s, l) => s + l.unitCents * Math.max(1, l.qty), 0);
    const latestLocation = new Map();
    for (const d of ordersSnap.docs) {
        const hid = (_10 = d.ref.parent.parent) === null || _10 === void 0 ? void 0 : _10.id;
        const location = locationOf(d.data().shippingAddress);
        if (!hid || !location)
            continue;
        const createdMs = (_11 = ms(d.data().createdAt)) !== null && _11 !== void 0 ? _11 : 0;
        const prev = latestLocation.get(hid);
        if (!prev || createdMs > prev.createdMs)
            latestLocation.set(hid, { createdMs, location });
    }
    const householdLocation = (hid) => { var _a, _b; return (hid ? (_b = (_a = latestLocation.get(hid)) === null || _a === void 0 ? void 0 : _a.location) !== null && _b !== void 0 ? _b : null : null); };
    const userIpLocation = (uid) => { var _a, _b, _c; return (uid ? (_c = (_b = (_a = users.get(uid)) === null || _a === void 0 ? void 0 : _a.ipLocation) !== null && _b !== void 0 ? _b : guestIpLocationByUid.get(uid)) !== null && _c !== void 0 ? _c : null : null); };
    const userIpOutsideUs = (uid) => { var _a, _b, _c; return uid ? (_c = (_b = (_a = users.get(uid)) === null || _a === void 0 ? void 0 : _a.ipOutsideUs) !== null && _b !== void 0 ? _b : guestIpOutsideUsByUid.get(uid)) !== null && _c !== void 0 ? _c : false : false; };
    /** Address-based state when known, else the account's IP region (flagged). */
    const placeFor = (hid, uid, address) => {
        var _a;
        const known = address !== null && address !== void 0 ? address : householdLocation(hid);
        if (known)
            return { location: known, locationFromIp: false, outsideUs: addressOutsideUs(known) };
        const ipUid = userIpLocation(uid) ? uid : str((_a = households.get(hid)) === null || _a === void 0 ? void 0 : _a.ownerId);
        const ip = userIpLocation(ipUid);
        return { location: ip, locationFromIp: Boolean(ip), outsideUs: Boolean(ip) && userIpOutsideUs(ipUid) };
    };
    const boxHeld = new Map();
    const giftOrders = new Map();
    const receivedGiftOrdersByKey = new Map();
    const boxes = [];
    const shopOrders = [];
    const liveBoxHouseholds = new Set();
    const committedBoxHouseholds = new Set();
    const securedBoxes = [];
    for (const d of ordersSnap.docs) {
        const o = d.data();
        const hid = (_13 = (_12 = d.ref.parent.parent) === null || _12 === void 0 ? void 0 : _12.id) !== null && _13 !== void 0 ? _13 : '';
        const playthrough = o.playthrough === true;
        if (o.orderType === 'received_gift') {
            const key = `${hid}/${String((_14 = o.giftInviteId) !== null && _14 !== void 0 ? _14 : d.id)}`;
            const list = (_15 = receivedGiftOrdersByKey.get(key)) !== null && _15 !== void 0 ? _15 : [];
            list.push({ id: d.id, status: (_16 = str(o.status)) !== null && _16 !== void 0 ? _16 : 'unknown', totalCents: num(o.totalCents), createdAt: iso(o.createdAt), playthrough });
            receivedGiftOrdersByKey.set(key, list);
            if (o.holidayId !== HOLIDAY_ID || playthrough || !LIVE.includes(o.status))
                continue;
            if (o.status === 'pending') {
                const c = ms(o.createdAt);
                if (c != null && nowMs - c >= PENDING_TTL_MS)
                    continue;
            }
            const createdMs = (_17 = ms(o.createdAt)) !== null && _17 !== void 0 ? _17 : nowMs;
            const prev = giftOrders.get(key);
            if (!prev || createdMs > prev.createdMs)
                giftOrders.set(key, { createdMs, lines: o.lineItems });
            continue;
        }
        if (o.orderType === 'marketplace') {
            const uid = str(o.userId);
            const u = uid ? users.get(uid) : undefined;
            shopOrders.push((0, shopOrders_1.buildShopOrder)({
                householdId: hid,
                orderId: d.id,
                order: o,
                user: u ? { email: u.email, name: u.name } : null,
                itemNames,
                attribution: attributionLabel(o.attribution),
                location: locationOf(o.shippingAddress),
            }));
            continue;
        }
        const isBox = o.orderType === 'hanukkah_box' || (!o.orderType && o.holidayId === HOLIDAY_ID);
        if (!isBox)
            continue;
        if (o.holidayId === HOLIDAY_ID && !playthrough && LIVE.includes(o.status))
            addLines(boxHeld, o.lineItems);
        if (!playthrough && LIVE.includes(o.status))
            liveBoxHouseholds.add(hid);
        if (!playthrough && LIVE.includes(o.status) && o.status !== 'pending') {
            committedBoxHouseholds.add(hid);
            if (o.holidayId === HOLIDAY_ID) {
                securedBoxes.push({ householdId: hid, securedMs: (_19 = (_18 = ms(o.committedAt)) !== null && _18 !== void 0 ? _18 : ms(o.createdAt)) !== null && _19 !== void 0 ? _19 : 0 });
            }
        }
        const c = customerFor(hid, str(o.userId));
        const lines = linesOf(o.lineItems, c.childNames);
        const addOnCents = addOnTotal(lines);
        const kids = (_20 = num(o.kidCount)) !== null && _20 !== void 0 ? _20 : c.kids;
        const subtotal = num(o.subtotalCents);
        boxes.push(Object.assign(Object.assign({ id: `${hid}/${d.id}`, source: 'order', orderId: d.id, householdId: hid, customer: c.name, email: c.email, test: c.test, kids, status: (_21 = str(o.status)) !== null && _21 !== void 0 ? _21 : 'unknown', playthrough, cardOnFile: c.cardOnFile, boxPriceCents: (_22 = num(o.boxPriceCents)) !== null && _22 !== void 0 ? _22 : (subtotal != null ? subtotal - addOnCents : priceForKids(kids)), addOnCents, subtotalCents: subtotal, shippingCents: num(o.shippingCents), taxCents: num(o.taxCents), creditCents: ((_23 = num(o.creditAppliedCents)) !== null && _23 !== void 0 ? _23 : 0) || ((_24 = num(o.giftCreditAppliedCents)) !== null && _24 !== void 0 ? _24 : 0) + ((_25 = num(o.platformCreditAppliedCents)) !== null && _25 !== void 0 ? _25 : 0), totalCents: num(o.totalCents), updatedAt: (_27 = (_26 = iso(o.updatedAt)) !== null && _26 !== void 0 ? _26 : iso(o.committedAt)) !== null && _27 !== void 0 ? _27 : iso(o.createdAt), committedAt: iso(o.committedAt), attribution: attributionLabel(o.attribution), cardSession: cardSessionFor(hid, str(o.userId), o) }, placeFor(hid, str(o.userId), locationOf(o.shippingAddress))), { answers: c.answers, kosher: c.kosher, kosherNote: c.kosherNote, lines }));
    }
    // A draft only counts as an open box when the household has no live box order.
    for (const [hid, dr] of drafts) {
        if (liveBoxHouseholds.has(hid) || !Array.isArray(dr.lineItems) || dr.lineItems.length === 0)
            continue;
        // Jobs (e.g. inventory-swap) stamp updatedBy with a label, not a uid — fall back to the owner.
        const editor = str(dr.updatedBy);
        const editorUid = editor && users.has(editor) ? editor : null;
        const c = customerFor(hid, editorUid);
        const lines = linesOf(dr.lineItems, c.childNames);
        const addOnCents = addOnTotal(lines);
        const boxPriceCents = priceForKids(c.kids);
        boxes.push(Object.assign(Object.assign({ id: `${hid}/draft`, source: 'draft', orderId: null, householdId: hid, customer: c.name, email: c.email, test: c.test, kids: c.kids, status: 'draft', playthrough: dr.playthrough === true || ((_28 = households.get(hid)) === null || _28 === void 0 ? void 0 : _28.playthrough) === true, cardOnFile: c.cardOnFile, boxPriceCents,
            addOnCents, subtotalCents: boxPriceCents + addOnCents, shippingCents: null, taxCents: null, creditCents: 0, totalCents: null, updatedAt: iso(dr.updatedAt), committedAt: null, attribution: null, cardSession: cardSessionFor(hid, editorUid, null) }, placeFor(hid, editorUid, null)), { answers: c.answers, kosher: c.kosher, kosherNote: c.kosherNote, lines }));
    }
    const guests = buildGuestRows(guestDocs, items, priceForKids);
    const adPeople = [];
    for (const [uid, u] of users) {
        const hid = u.householdId;
        const draftLines = hid ? (_29 = drafts.get(hid)) === null || _29 === void 0 ? void 0 : _29.lineItems : null;
        const hasBox = Boolean(hid && (liveBoxHouseholds.has(hid) || (Array.isArray(draftLines) && draftLines.length > 0)));
        adPeople.push({
            id: uid,
            ad: u.ad,
            account: true,
            test: (0, testAccounts_1.isTest)(u.email, u.name),
            answered: u.answers.jewish != null || u.answers.hanukkah != null || u.answers.hanukkahLevel != null,
            box: hasBox,
            purchase: Boolean(hid && committedBoxHouseholds.has(hid)),
            jewish: u.answers.jewish,
            hanukkah: u.answers.hanukkah,
            firstSeen: u.createdAt,
            outsideUs: u.ipOutsideUs,
        });
    }
    for (const d of guestDocs) {
        const x = d.data();
        const uid = str(x.convertedUid);
        if (uid && users.has(uid))
            continue;
        const guest = (_31 = (_30 = x.snapshot) === null || _30 === void 0 ? void 0 : _30.guest) !== null && _31 !== void 0 ? _31 : {};
        const answered = guestAnsweredSliders(guest);
        const box = Array.isArray(guest.lineItems) && guest.lineItems.length > 0;
        if (!answered && !box)
            continue;
        const a = answered ? guestAnswers(guest) : NO_ANSWERS;
        adPeople.push({
            id: d.id,
            ad: (_32 = adNameOf(x.entry)) !== null && _32 !== void 0 ? _32 : guestNonAdLabel(x.entry),
            account: false,
            test: false,
            answered,
            box,
            purchase: false,
            jewish: a.jewish,
            hanukkah: a.hanukkah,
            firstSeen: iso(x.createdAt),
            outsideUs: ipOutsideUs(x.ipGeo),
        });
    }
    const funnel = [];
    for (const d of guestDocs) {
        const x = d.data();
        const guest = (_34 = (_33 = x.snapshot) === null || _33 === void 0 ? void 0 : _33.guest) !== null && _34 !== void 0 ? _34 : {};
        const steps = guest.stepsReached && typeof guest.stepsReached === 'object' ? guest.stepsReached : {};
        const hasLines = Array.isArray(guest.lineItems) && guest.lineItems.length > 0;
        const kids = Array.isArray(guest.childDrafts) && guest.childDrafts.length > 0;
        const uid = str(x.convertedUid);
        const builder = Object.keys(steps).length > 0 || kids || hasLines || Boolean(str(guest.onboardingStep)) || guest.onboardingComplete === true;
        if (!builder)
            continue;
        const sliders = hasLines || guest.onboardingComplete === true || guestAnsweredSliders(guest) || Boolean(steps.email || steps.building);
        // Before the gate, guests went from the sliders straight to `building`; only email → building is the gate.
        const gateEmail = Boolean(x.gateEmailAt) || Boolean(steps.email && steps.building);
        const u = uid ? users.get(uid) : undefined;
        const hid = (_35 = u === null || u === void 0 ? void 0 : u.householdId) !== null && _35 !== void 0 ? _35 : null;
        const h = hid ? households.get(hid) : undefined;
        funnel.push({
            id: d.id,
            firstSeen: iso(x.createdAt),
            ad: (_36 = adNameOf(x.entry)) !== null && _36 !== void 0 ? _36 : guestNonAdLabel(x.entry),
            test: u ? (0, testAccounts_1.isTest)(u.email) : false,
            outsideUs: ipOutsideUs(x.ipGeo),
            family: kids || Boolean(steps.details) || sliders,
            sliders,
            gateEmail,
            sawBox: guest.boxRevealComplete === true || Boolean(steps.reveal) || Boolean(uid),
            account: Boolean(uid),
            anyEmail: Boolean(uid) || gateEmail || Boolean(x.lastLeadAt),
            card: Boolean(h && (h.cardOnFileAt || h.stripeDefaultPaymentMethodId)),
            purchase: Boolean(hid && committedBoxHouseholds.has(hid)),
        });
    }
    const giftHeld = new Map();
    for (const { lines } of giftOrders.values())
        addLines(giftHeld, lines);
    const gifts = [];
    for (const d of invitesSnap.docs) {
        const g = d.data();
        const isBox = g.kind === 'box' || g.kind === 'credit' ? g.kind === 'box' : Array.isArray(g.lineItems) && g.lineItems.length > 0;
        const paid = g.paymentStatus === 'paid' || (g.paymentStatus == null && Boolean(g.claimEmailSentAt));
        const hid = (_37 = str(g.claimedByHouseholdId)) !== null && _37 !== void 0 ? _37 : '';
        const key = `${hid}/${d.id}`;
        const rec = hid ? (_38 = received.get(key)) !== null && _38 !== void 0 ? _38 : null : null;
        const convertedToCredit = g.status === 'converted_to_credit' || (rec === null || rec === void 0 ? void 0 : rec.status) === 'converted_to_credit';
        const checkoutOrders = (_39 = receivedGiftOrdersByKey.get(key)) !== null && _39 !== void 0 ? _39 : [];
        const checkedOut = checkoutOrders.some((o) => !o.playthrough && LIVE.includes(o.status) && o.status !== 'pending');
        let holding = false;
        if (g.playthrough !== true && isBox && paid && (g.status === 'pending' || g.status === 'claimed')) {
            if (g.status === 'pending' || !hid) {
                addLines(giftHeld, g.lineItems);
                holding = true;
            }
            else if (!giftOrders.has(key) && (rec === null || rec === void 0 ? void 0 : rec.status) !== 'converted_to_credit') {
                addLines(giftHeld, Array.isArray(rec === null || rec === void 0 ? void 0 : rec.lineItems) ? rec === null || rec === void 0 ? void 0 : rec.lineItems : g.lineItems);
                holding = true;
            }
        }
        const recipient = hid ? customerFor(hid, null) : null;
        const lineSource = Array.isArray(rec === null || rec === void 0 ? void 0 : rec.lineItems) ? rec === null || rec === void 0 ? void 0 : rec.lineItems : g.lineItems;
        const shipTo = (_40 = locationOf(g.shippingAddress)) !== null && _40 !== void 0 ? _40 : householdLocation(hid || null);
        const giverUid = str(g.giverUid);
        const giverLocation = userIpLocation(giverUid);
        gifts.push({
            id: d.id,
            giver: str(g.giverName),
            giverEmail: str(g.giverEmail),
            recipientEmail: str(g.recipientEmail),
            recipientName: (_41 = recipient === null || recipient === void 0 ? void 0 : recipient.name) !== null && _41 !== void 0 ? _41 : null,
            recipientAnswers: (_42 = recipient === null || recipient === void 0 ? void 0 : recipient.answers) !== null && _42 !== void 0 ? _42 : NO_ANSWERS,
            kind: isBox ? 'box' : 'credit',
            amountCents: num(g.creditCents),
            paid,
            paymentStatus: (_43 = str(g.paymentStatus)) !== null && _43 !== void 0 ? _43 : (g.claimEmailSentAt ? 'legacy-sent' : null),
            status: convertedToCredit ? 'converted_to_credit' : (_44 = str(g.status)) !== null && _44 !== void 0 ? _44 : 'unknown',
            claimed: Boolean(hid) || g.status === 'claimed',
            checkedOut,
            checkoutOrders,
            holdingStock: holding,
            playthrough: g.playthrough === true,
            test: (0, testAccounts_1.isTest)(str(g.giverEmail), str(g.giverName), str(g.recipientEmail), recipient === null || recipient === void 0 ? void 0 : recipient.email, recipient === null || recipient === void 0 ? void 0 : recipient.name),
            message: str(g.message),
            createdAt: iso(g.createdAt),
            location: shipTo,
            giverLocation,
            outsideUs: giverLocation ? userIpOutsideUs(giverUid) : addressOutsideUs(shipTo),
            lines: linesOf(lineSource, (_45 = recipient === null || recipient === void 0 ? void 0 : recipient.childNames) !== null && _45 !== void 0 ? _45 : new Map()),
        });
    }
    const giftFunnel = buildGiftFunnelRows(giftFunnelSnap.docs.filter((d) => !d.id.startsWith('agenttest')), guestDocs, new Map(invitesSnap.docs.map((d) => [d.id, d.data()])), (uid) => {
        const u = users.get(uid);
        return u ? (0, testAccounts_1.isTest)(u.email) : false;
    });
    const favorites = new Map();
    const favoritesReal = new Map();
    for (const [hid, h] of households) {
        if (!Array.isArray(h.wishlistItemIds))
            continue;
        const real = !customerFor(hid, null).test;
        for (const id of new Set(h.wishlistItemIds.filter((x) => typeof x === 'string'))) {
            favorites.set(id, ((_46 = favorites.get(id)) !== null && _46 !== void 0 ? _46 : 0) + 1);
            if (real)
                favoritesReal.set(id, ((_47 = favoritesReal.get(id)) !== null && _47 !== void 0 ? _47 : 0) + 1);
        }
    }
    const counters = new Map(countersSnap.docs.map((d) => [d.id, d.data()]));
    const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
    const ids = new Set([...items.keys(), ...counters.keys(), ...boxHeld.keys(), ...giftHeld.keys()]);
    const inventory = [];
    const mismatches = [];
    for (const id of ids) {
        const it = items.get(id);
        const c = (_48 = counters.get(id)) !== null && _48 !== void 0 ? _48 : {};
        const heldByBoxes = (_49 = boxHeld.get(id)) !== null && _49 !== void 0 ? _49 : 0;
        const heldByGifts = (_50 = giftHeld.get(id)) !== null && _50 !== void 0 ? _50 : 0;
        const counterAllocated = n0(c.boxAllocatedQty);
        const directSold = n0(c.directSoldQty);
        const directReserved = n0(c.directReservedQty);
        const stock = (_51 = it === null || it === void 0 ? void 0 : it.inventory) !== null && _51 !== void 0 ? _51 : null;
        const setAside = n0(it === null || it === void 0 ? void 0 : it.setAside);
        if (heldByBoxes + heldByGifts !== counterAllocated) {
            mismatches.push({ id, name: (_52 = it === null || it === void 0 ? void 0 : it.name) !== null && _52 !== void 0 ? _52 : id, computed: heldByBoxes + heldByGifts, counter: counterAllocated });
        }
        if (!it)
            continue;
        const shop = (0, catalogAvailability_1.resolveAvailability)(Object.assign({ id }, it), { boxAllocatedQty: counterAllocated, directSoldQty: directSold, directReservedQty: directReserved }, iso(config.lockAt), new Date(nowMs));
        inventory.push({
            id,
            name: it.name,
            stock,
            heldByBoxes,
            heldByGifts,
            counterAllocated,
            directSold,
            directReserved,
            remaining: stock == null ? null : stock - setAside - counterAllocated - directSold - directReserved,
            setAside: it.setAside,
            setAsideFor: it.setAsideFor,
            directCap: it.directSaleCapBeforeLock,
            shopStatus: shop.status,
            shopRemaining: (0, catalogAvailability_1.availabilityRemaining)(shop),
            favorites: (_53 = favorites.get(id)) !== null && _53 !== void 0 ? _53 : 0,
            favoritesReal: (_54 = favoritesReal.get(id)) !== null && _54 !== void 0 ? _54 : 0,
            procured: it.procured,
        });
    }
    boxes.sort((a, b) => { var _a, _b; return String((_a = b.updatedAt) !== null && _a !== void 0 ? _a : '').localeCompare(String((_b = a.updatedAt) !== null && _b !== void 0 ? _b : '')); });
    gifts.sort((a, b) => { var _a, _b; return String((_a = b.createdAt) !== null && _a !== void 0 ? _a : '').localeCompare(String((_b = a.createdAt) !== null && _b !== void 0 ? _b : '')); });
    shopOrders.sort((a, b) => { var _a, _b; return String((_a = b.createdAt) !== null && _a !== void 0 ? _a : '').localeCompare(String((_b = a.createdAt) !== null && _b !== void 0 ? _b : '')); });
    const householdsByOwner = new Map();
    for (const [hid, h] of households) {
        const owner = str(h.ownerId);
        if (owner)
            householdsByOwner.set(owner, [...((_55 = householdsByOwner.get(owner)) !== null && _55 !== void 0 ? _55 : []), hid]);
    }
    const convertedUidByVisitor = new Map();
    for (const d of guestDocs) {
        const uid = str(d.data().convertedUid);
        if (uid)
            convertedUidByVisitor.set(d.id, uid);
    }
    const inventoryEmails = (0, inventoryEmails_1.inventoryEmailStats)({
        sends: inventoryEmailSnap.docs.map((d) => {
            var _a, _b, _c, _d;
            const x = d.data();
            return {
                emailHash: String((_a = x.emailHash) !== null && _a !== void 0 ? _a : d.id),
                kind: x.kind === 'swapped' ? 'swapped' : 'low',
                sentMs: (_c = (_b = ms(x.sentAt)) !== null && _b !== void 0 ? _b : ms(x.createdAt)) !== null && _c !== void 0 ? _c : 0,
                clicked: ((_d = num(x.clicks)) !== null && _d !== void 0 ? _d : 0) > 0,
                uid: str(x.uid),
                visitorId: str(x.visitorId),
                draftKeys: Array.isArray(x.draftKeys) ? x.draftKeys.filter((k) => typeof k === 'string') : [],
            };
        }),
        securedBoxes,
        householdsByOwner,
        convertedUidByVisitor,
    });
    return {
        generatedAt: new Date(nowMs).toISOString(),
        lockAt: iso(config.lockAt),
        counts: {
            households: households.size,
            drafts: drafts.size,
            orders: ordersSnap.size,
            giftInvites: invitesSnap.size,
            catalogItems: items.size,
            guestSessions: guestDocs.length,
        },
        mismatches,
        boxes,
        guests,
        gifts,
        shopOrders,
        inventory,
        adPeople,
        funnel,
        giftFunnel,
        inventoryEmails,
        metaByAd: null,
    };
}
function createAdminBoxesDashboard(db) {
    return (0, sentry_1.onCall)({ secrets: [metaAdsInsights_1.metaAdsAccessToken] }, async (request) => {
        var _a;
        if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
            throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
        if (!(0, guestSessions_1.isAdminToken)(request.auth.token))
            throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
        const [dash, metaByAd, audits] = await Promise.all([
            buildBoxesDashboard(db),
            (0, metaAdsInsights_1.metaStatsByAd)(),
            (0, boxAuditJob_1.loadBoxProblems)(db).catch((err) => {
                logger.warn('adminBoxesDashboard: box problems unavailable', { err: String(err) });
                return { boxProblems: [], boxAuditRun: null, fixLog: [] };
            }),
        ]);
        return Object.assign(Object.assign(Object.assign({}, dash), { metaByAd }), audits);
    });
}
//# sourceMappingURL=adminDashboard.js.map