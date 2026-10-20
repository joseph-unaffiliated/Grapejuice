"use strict";
/**
 * Box construction / swap / pricing policy for Hanukkah curated boxes.
 *
 * SOURCE OF TRUTH for Rav CONTEXT. Client mirror: `src/services/box/boxRules.ts`
 * (keep in sync). Pure planners + catalog resolution; no firebase-admin.
 */
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
exports.GELT_LITTLE_EQUIVALENT = exports.SECTION_RULES = exports.STOCK_POLICY = exports.WRAP_POLICY = exports.DONATE_POLICY = exports.PRICING_POLICY = exports.REPRESENTATIVE_AGE_BY_BAND = exports.SECTION_ID_BY_TITLE = exports.BOX_SECTION_ORDER = void 0;
exports.representativeAgeForBand = representativeAgeForBand;
exports.ageGroupForNumericAge = ageGroupForNumericAge;
exports.defaultAdults = defaultAdults;
exports.planGelt = planGelt;
exports.geltSlotForSize = geltSlotForSize;
exports.defaultGiftKindForAge = defaultGiftKindForAge;
exports.defaultGiftKindOrder = defaultGiftKindOrder;
exports.giftKindFallbackOrder = giftKindFallbackOrder;
exports.planGifts = planGifts;
exports.rowStockLeft = rowStockLeft;
exports.swapReserveUnits = swapReserveUnits;
exports.rowRemainingWithDrafts = rowRemainingWithDrafts;
exports.isLowWithDrafts = isLowWithDrafts;
exports.isSoldOutForBoxes = isSoldOutForBoxes;
exports.isDefaultEligible = isDefaultEligible;
exports.canAssignUnit = canAssignUnit;
exports.giftDefaultScore = giftDefaultScore;
exports.rankGiftKindsForAge = rankGiftKindsForAge;
exports.resolveCandlesRow = resolveCandlesRow;
exports.planCandlesDefault = planCandlesDefault;
exports.planFoodDefaults = planFoodDefaults;
exports.planDreidels = planDreidels;
exports.listBoxCentsForKids = listBoxCentsForKids;
exports.planKnowNothingOutline = planKnowNothingOutline;
exports.planPracticeDreidels = planPracticeDreidels;
exports.planCuratedOutline = planCuratedOutline;
exports.resolveByDefaultSlot = resolveByDefaultSlot;
exports.resolveBookForAge = resolveBookForAge;
exports.resolveGiftKind = resolveGiftKind;
exports.soldOutReplacement = soldOutReplacement;
exports.plannerAgeOf = plannerAgeOf;
exports.swapSoldOutLines = swapSoldOutLines;
exports.annotateSlot = annotateSlot;
exports.renderBoxRulesContext = renderBoxRulesContext;
/** Matches Airtable Full Catalog "Box sections" choices (order = UI order). */
exports.BOX_SECTION_ORDER = [
    'Light Candles',
    'Play Dreidel',
    'Eat & Drink',
    'Tell the Story',
    'Give Presents',
];
exports.SECTION_ID_BY_TITLE = {
    'Light Candles': 'candles',
    'Play Dreidel': 'dreidel',
    'Eat & Drink': 'food',
    'Tell the Story': 'story',
    'Give Presents': 'presents',
};
/**
 * Representative numeric ages for gift/book planners when intake only has a band.
 * 3–5 → 5 so know-nothing smoke matches the CONTEXT example (1 kid age 5).
 */
exports.REPRESENTATIVE_AGE_BY_BAND = {
    '0-2': 1,
    '3-5': 5,
    '6-8': 7,
    '9-12': 10,
};
function representativeAgeForBand(band) {
    return exports.REPRESENTATIVE_AGE_BY_BAND[band];
}
function ageGroupForNumericAge(age) {
    const n = Math.max(0, Math.floor(age));
    if (n <= 2)
        return '0-2';
    if (n <= 5)
        return '3-5';
    if (n <= 8)
        return '6-8';
    return '9-12';
}
exports.PRICING_POLICY = {
    listBoxCents: 8000,
    /** Applied even when that kid's lines are donated. */
    perExtraKidCents: 1000,
    holidayId: 'hanukkah-2026',
    shipWindowLabel: 'Nov 24',
    shipping: 'free for pilot',
};
exports.DONATE_POLICY = {
    removesFromSectionLists: true,
    summaryAtMemberPrice: true,
    tooltip: true,
    /** Donating never reduces box price. */
    reducesBoxPrice: false,
};
exports.WRAP_POLICY = {
    defaultSlot: 'wrapping-paper',
    /** Same member price as wrapping paper; catalog wrap-service role. */
    preWrapSlot: 'pre-wrap',
    /** Pre-wrap covers any number of wrappable presents; this is only how many get marked by default. */
    defaultPreWrapPicks: 3,
    /** Paper can be added back on top of pre-wrap (extra). */
    paperOnTopOfPreWrap: 'extra',
    /** Storefront-only wrap add-on — out of scope for box CONTEXT for now. */
    storefrontOnlyWrapOutOfScope: true,
    /**
     * Wrappable kinds when catalog `wrappable` is unset.
     * NOT: gelt, mixes, normal/electric candles.
     */
    wrappableKinds: [
        'books',
        'toys',
        'diy-candles',
        'menorahs',
        'dreidels',
    ],
    notWrappableKinds: [
        'gelt',
        'mixes',
        'candles-normal',
        'candles-electric',
    ],
};
exports.STOCK_POLICY = {
    /** Prefer gifts with Inventory ≥ 2; never assign the last unit. */
    minInventoryToAssign: 2,
    /**
     * Share of starting inventory held back from defaults so the item stays
     * available as a swap for shoppers who ask for it.
     */
    swapReserveFraction: 0.15,
    /**
     * Stop defaulting once this few units remain after real holds AND every
     * unsecured account draft. Drafts hold nothing, so the count can go below zero.
     */
    lowRemainingWithDrafts: 5,
    /** Restockable: drafts don't count against these, only real holds (same 5-left line). */
    draftCountExemptIds: ['latke-kit', 'sufganiyot-kit'],
    /** Books: infinite / no hold (Hold inventory unchecked). */
    booksHoldInventory: false,
    dualHomeBrowseOk: true,
    /** Same catalog id twice → confirm in UX; not a hard code block. */
    duplicateCatalogIdConfirmOnly: true,
};
/** Name/id/slotId patterns when Default slot is missing on the row. */
const DEFAULT_SLOT_PATTERNS = {
    candles: [
        /^candles$/,
        /^(?!.*(?:electric|myo|diy|make.?your.?own|roll.?your.?own|sheet)).*\bcandles?\b/i,
    ],
    'wood-dreidel': [/wood.*dreidel|dreidel.*wood/i, /^wood-dreidel$/i],
    'blank-dreidel': [
        /blank.*dreidel|dreidel.*blank|draw.?your.?own.*dreidel/i,
        /^blank-dreidel$/i,
        /^draw-your-own-dreidel$/i,
    ],
    'airdry-dreidel': [
        /air.?dry|clay.*dreidel|dreidel.*clay|airdry.*clay.*dreidel/i,
        /^airdry-dreidel$/i,
        /^airdry-clay-dreidel$/i,
    ],
    'gelt-small': [
        /gelt.*small|small.*gelt|little.?bag.*gelt|gelt.*little.?bag/i,
        /^gelt-small$/i,
        /^little-bag-of-gelt/i,
    ],
    'gelt-medium': [
        /gelt.*medium|medium.*gelt|big.?bag.*gelt|gelt.*big.?bag/i,
        /^gelt-medium$/i,
        /^gelt$/,
        /^big-bag-of-gelt$/i,
    ],
    'gelt-party': [
        /gelt.*party|party.*gelt|party.?bag.*gelt/i,
        /^gelt-party$/i,
        /^party-bag-of-gelt$/i,
    ],
    // Broad food tokens still match; scoring prefers mix/kit and excludes plush/stuffie.
    'latke-mix': [/latke/i, /latke-kit|latke-mix/i],
    'sufganiyot-mix': [/sufgan/i, /sufganiyot-kit|sufganiyot-mix/i],
    'wrapping-paper': [/wrapping|wrap.*paper/i, /^wrapping$/],
    'pre-wrap': [/pre.?wrap|prewrap|wrap.?service/i],
};
const FOOD_MIX_SLOTS = new Set(['latke-mix', 'sufganiyot-mix']);
const PLUSHISH_RE = /plush|stuffie|softie|stuffed/;
const MIX_OR_KIT_RE = /(?:^|[\s_-])(mix|kit)(?:$|[\s_-])|\b(mix|kit)\b/;
const GIFT_KIND_PATTERNS = {
    stuffie: [/stuffie|plush|softie/i],
    'wood-toy-menorah': [/wood.*(toy.?)?menorah|toy.?menorah.*wood|play.?menorah/i],
    airdry: [/air.?dry|clay.*dreidel/i],
    blank: [/blank.*dreidel|draw.?your.?own.*dreidel/i],
    'lego-menorah': [/lego.*menorah|menorah.*lego/i],
    'diy-candles': [/diy.*candle|make.?your.?own.*candle|myo.*candle|roll.?your.?own.*candle/i],
    'extra-book': [/book/i],
};
exports.SECTION_RULES = [
    {
        id: 'candles',
        title: 'Light Candles',
        notes: [
            'Default: candles only (not a menorah).',
            'Beeswax candles default until near their swap reserve, then roll-your-own, then electric.',
            'Upsells are add-only; when added from this section they appear here.',
        ],
        slots: [
            {
                defaultKind: 'candles',
                role: 'default',
                swaps: [
                    { targetSlotOrKind: 'diy-candles', price: 'included', note: 'MYO / make-your-own candles' },
                    { targetSlotOrKind: 'electric-candles', price: 'included' },
                    { targetSlotOrKind: 'donate', price: 'donate' },
                ],
                upsells: [
                    { targetSlotOrKind: 'menorah', price: 'extra' },
                    { targetSlotOrKind: 'extra-candles', price: 'extra' },
                    { targetSlotOrKind: 'toy-menorahs', price: 'extra', note: 'lego, wood, or stuffie menorahs' },
                ],
            },
        ],
    },
    {
        id: 'dreidel',
        title: 'Play Dreidel',
        notes: [
            "Scale: 1 dreidel per person, kids and adults (2 adults when the family didn't say).",
            "Gelt: one Little Bag's worth per person (Little 1, Big 3, Party 12). Gelt added on top is free while it fits that allowance; past it, it is paid.",
            'At 5+ kids: mix wood / airdry / blank by age (older → activity); no consolidation.',
        ],
        slots: [
            {
                defaultKind: 'wood-dreidel',
                role: 'default',
                swaps: [
                    { targetSlotOrKind: 'blank-dreidel', price: 'included' },
                    { targetSlotOrKind: 'airdry-dreidel', price: 'included' },
                    { targetSlotOrKind: 'brass-dreidel', price: 'extra' },
                    { targetSlotOrKind: 'slipcast-dreidel', price: 'extra' },
                    { targetSlotOrKind: 'more-dreidels', price: 'extra' },
                    { targetSlotOrKind: 'donate', price: 'donate' },
                ],
                upsells: [{ targetSlotOrKind: 'dreidel-stuffie', price: 'extra' }],
            },
            {
                defaultKind: 'gelt (see gelt planner)',
                role: 'default',
                swaps: [
                    {
                        targetSlotOrKind: 'gelt-small×3',
                        price: 'included',
                        note: 'From a Big Bag default: three Little Bags, same chocolate',
                    },
                    { targetSlotOrKind: 'more-gelt-small', price: 'extra' },
                    { targetSlotOrKind: 'more-gelt-medium', price: 'extra' },
                    { targetSlotOrKind: 'gelt-party', price: 'extra' },
                    { targetSlotOrKind: 'donate', price: 'donate' },
                ],
            },
        ],
    },
    {
        id: 'food',
        title: 'Eat & Drink',
        notes: [
            'Always two food slots: latke kit + sufganiyot kit by default. When one kit is nearly gone its slot gets the other kit (two of one kit is fine), then a Big Bag of gelt.',
            'Each food slot holds exactly one of: a latke kit, a sufganiyot kit, cookie cutters, one Big Bag of gelt, or three Little Bags of gelt. Each slot swaps on its own, and both may hold the same thing (two latke kits is fine).',
            'Gelt in a food slot is extra to the household gelt allowance. Swapping a food slot to Little Bags gives three; swapping back to a kit gives one.',
            'Applesauce spice mix ships inside the latke kit; there is no separate applesauce item.',
        ],
        slots: [
            {
                defaultKind: 'latke-mix',
                role: 'default',
                swaps: [
                    { targetSlotOrKind: 'sufganiyot-mix', price: 'included' },
                    { targetSlotOrKind: 'cookie-cutters', price: 'included' },
                    { targetSlotOrKind: 'gelt-medium', price: 'included' },
                    { targetSlotOrKind: 'gelt-small×3', price: 'included' },
                    { targetSlotOrKind: 'gelt-party', price: 'extra' },
                    { targetSlotOrKind: 'latke-stuffie', price: 'extra' },
                    { targetSlotOrKind: 'donate', price: 'donate' },
                ],
            },
            {
                defaultKind: 'sufganiyot-mix',
                role: 'default',
                swaps: [
                    { targetSlotOrKind: 'latke-mix', price: 'included' },
                    { targetSlotOrKind: 'cookie-cutters', price: 'included' },
                    { targetSlotOrKind: 'gelt-medium', price: 'included' },
                    { targetSlotOrKind: 'gelt-small×3', price: 'included' },
                    { targetSlotOrKind: 'gelt-party', price: 'extra' },
                    { targetSlotOrKind: 'sufganiyah-stuffie', price: 'extra' },
                    { targetSlotOrKind: 'donate', price: 'donate' },
                ],
            },
        ],
    },
    {
        id: 'story',
        title: 'Tell the Story',
        notes: [
            'One book per kid; default from catalog Default book ages (or known mapping).',
            'Swap any book (recommend closer ages first); donate OK; more books = extra.',
            'Instruction booklet is never listed — physical insert only, not a catalog line.',
        ],
        slots: [
            {
                defaultKind: 'story-book (per kid, age-default)',
                role: 'default',
                swaps: [
                    { targetSlotOrKind: 'any-book', price: 'included', note: 'prefer closer ages first' },
                    { targetSlotOrKind: 'donate', price: 'donate' },
                    { targetSlotOrKind: 'more-books', price: 'extra' },
                ],
            },
        ],
    },
    {
        id: 'presents',
        title: 'Give Presents',
        notes: [
            'Wrapping paper default; swap to pre-wrap (same price as paper) for any number of wrappable items.',
            'Pre-wrap has no limit: every wrappable present is wrapped at the same price. Paper added back on top of pre-wrap = extra.',
            'Per kid: one present from (toy menorah | blank/clay dreidel | stuffie | extra book | DIY candles); donate OK (empty slot).',
            'Prefer distinct gifts across kids; stock-aware.',
        ],
        slots: [
            {
                defaultKind: 'wrapping-paper',
                role: 'default',
                swaps: [
                    {
                        targetSlotOrKind: 'pre-wrap',
                        price: 'included',
                        note: 'same price as paper; covers every wrappable item',
                    },
                    { targetSlotOrKind: 'donate', price: 'donate' },
                ],
                upsells: [
                    { targetSlotOrKind: 'wrapping-paper', price: 'extra', note: 'add paper back on top of pre-wrap' },
                ],
            },
            {
                defaultKind: 'gift (per kid — see gift-by-age)',
                role: 'default',
                swaps: [
                    { targetSlotOrKind: 'toy-menorah', price: 'included' },
                    { targetSlotOrKind: 'blank-dreidel', price: 'included' },
                    { targetSlotOrKind: 'airdry-dreidel', price: 'included' },
                    { targetSlotOrKind: 'stuffie', price: 'included' },
                    { targetSlotOrKind: 'extra-book', price: 'included' },
                    { targetSlotOrKind: 'diy-candles', price: 'included' },
                    { targetSlotOrKind: 'donate', price: 'donate', note: 'slot empty' },
                ],
            },
        ],
    },
];
// —— Planners ————————————————————————————————————————————————————————————
function defaultAdults(adults) {
    return adults != null && adults >= 0 ? adults : 2;
}
/**
 * Little Bags' worth of chocolate in each bag: Little 2 big + 5 little coins (26g), Big 5 + 20
 * (80g), Party 20 + 80 (320g).
 */
exports.GELT_LITTLE_EQUIVALENT = { small: 1, medium: 3, party: 12 };
/**
 * Gelt defaults, one Little Bag's worth per person (kids + adults):
 * 1 kid in a 3-person household → one Big Bag; 5+ kids → Big Bags for each 3 people plus
 * Little Bags for the rest; everyone else → a Little Bag each. Never a Party Bag.
 */
function planGelt(inputs) {
    const kidCount = inputs.kids.length;
    const people = kidCount + defaultAdults(inputs.adults);
    if (kidCount === 1 && people === 3)
        return { size: 'medium', quantity: 1, mixedDefault: false };
    if (kidCount >= 5) {
        const big = Math.floor(people / 3);
        const rest = people % 3;
        return rest
            ? { size: 'medium', quantity: big, mixedDefault: true, also: { size: 'small', quantity: rest } }
            : { size: 'medium', quantity: big, mixedDefault: false };
    }
    return { size: 'small', quantity: Math.max(1, people), mixedDefault: false };
}
function geltSlotForSize(size) {
    if (size === 'small')
        return 'gelt-small';
    if (size === 'party')
        return 'gelt-party';
    return 'gelt-medium';
}
/**
 * Default present by age: toddler play menorah 0–2, a stuffie 3–5, an airdry clay kit
 * (menorah or dreidel) 6+. Never a book, gelt, or any other gift; those stay free swaps.
 */
function defaultGiftKindForAge(age) {
    return defaultGiftKindOrder(age)[0];
}
/** Kinds a default present can be at this age, best first; low stock falls through. */
function defaultGiftKindOrder(age) {
    const n = Math.max(0, Math.floor(age));
    if (n <= 2)
        return ['wood-toy-menorah', 'stuffie'];
    if (n <= 5)
        return ['stuffie', 'airdry'];
    return ['airdry', 'stuffie'];
}
/**
 * Siblings can share these kinds; each kid then gets a different row (another stuffie
 * character, the other clay kit). One toddler play menorah per box.
 */
const SHAREABLE_GIFT_KINDS = new Set(['stuffie', 'airdry']);
/**
 * Default present kinds for this age, best first. With catalog rows: kinds with a row
 * above its swap reserve keep the age order, then kinds that can still spare a unit.
 */
function giftKindFallbackOrder(age, catalog) {
    const order = defaultGiftKindOrder(age);
    if (!(catalog === null || catalog === void 0 ? void 0 : catalog.length))
        return order;
    const ranked = rankGiftKindsForAge(catalog, age);
    const rest = order.filter((k) => !ranked.includes(k) && giftKindHasAssignableRow(catalog, k, age));
    const out = [...ranked, ...rest];
    return out.length ? out : order;
}
function planGifts(inputs, excludeKinds = new Set()) {
    const used = new Set();
    return inputs.kids.map((kid, kidIndex) => {
        var _a, _b;
        const order = giftKindFallbackOrder(kid.age, inputs.catalog).filter((k) => !excludeKinds.has(k));
        const kind = (_b = (_a = order.find((k) => !used.has(k) || SHAREABLE_GIFT_KINDS.has(k))) !== null && _a !== void 0 ? _a : order[0]) !== null && _b !== void 0 ? _b : defaultGiftKindForAge(kid.age);
        used.add(kind);
        return { kidIndex, age: kid.age, kind };
    });
}
// —— Stock-aware defaults ————————————————————————————————————————————————
/** Units left for boxes; null = untracked (books, unset inventory). */
function rowStockLeft(row) {
    if (typeof row.stockLeft === 'number' && Number.isFinite(row.stockLeft)) {
        return Math.max(0, Math.floor(row.stockLeft));
    }
    if (typeof row.inventory === 'number' && Number.isFinite(row.inventory)) {
        return Math.max(0, Math.floor(row.inventory));
    }
    return null;
}
/** Units held back from defaults so the item stays available as a swap. */
function swapReserveUnits(row) {
    const inventory = typeof row.inventory === 'number' && Number.isFinite(row.inventory) ? Math.max(0, row.inventory) : 0;
    return Math.max(exports.STOCK_POLICY.minInventoryToAssign, Math.ceil(inventory * exports.STOCK_POLICY.swapReserveFraction));
}
/**
 * Units left after real holds and every unsecured account draft. Internal only: it can
 * go negative and never blocks adding or swapping. Null = untracked.
 */
function rowRemainingWithDrafts(row) {
    const left = rowStockLeft(row);
    if (left == null)
        return null;
    if (exports.STOCK_POLICY.draftCountExemptIds.includes(row.id))
        return left;
    const held = typeof row.draftHeld === 'number' && Number.isFinite(row.draftHeld) ? Math.max(0, Math.floor(row.draftHeld)) : 0;
    return left - held;
}
/** Few enough left (counting drafts) to stop defaulting it and warn draft holders. */
function isLowWithDrafts(row) {
    const remaining = rowRemainingWithDrafts(row);
    return remaining != null && remaining <= exports.STOCK_POLICY.lowRemainingWithDrafts;
}
/** Every unit is held by a secured box, paid gift, or purchase. */
function isSoldOutForBoxes(row) {
    const left = rowStockLeft(row);
    return left != null && left <= 0;
}
/** Above its swap reserve and not low counting drafts (or untracked) — OK to hand out as a default. */
function isDefaultEligible(row) {
    const left = rowStockLeft(row);
    return left == null || (left > swapReserveUnits(row) && !isLowWithDrafts(row));
}
/** Can spare a unit without handing out the last one. */
function canAssignUnit(row) {
    const left = rowStockLeft(row);
    return left == null || left >= exports.STOCK_POLICY.minInventoryToAssign;
}
function rowCoversGiftAge(row, age) {
    var _a;
    return ((_a = row.defaultGiftAges) !== null && _a !== void 0 ? _a : []).map(String).includes(String(Math.floor(age)));
}
/** Untagged rows serve any age; tagged rows only their Default gift ages. */
function rowServesGiftAge(row, age) {
    var _a;
    return !((_a = row.defaultGiftAges) !== null && _a !== void 0 ? _a : []).length || rowCoversGiftAge(row, age);
}
/**
 * Stock headroom above the swap reserve, spread over the ages the gift serves.
 * A toddler-only gift with 100 left outranks an all-ages stuffie with 100 left.
 */
function giftDefaultScore(row) {
    var _a;
    const left = rowStockLeft(row);
    if (left == null)
        return 0;
    const ages = Math.max(1, ((_a = row.defaultGiftAges) !== null && _a !== void 0 ? _a : []).length);
    return (left - swapReserveUnits(row)) / ages;
}
function giftKindRows(catalog, kind, age) {
    const patterns = GIFT_KIND_PATTERNS[kind];
    const ofKind = (rows) => rows.filter((r) => patterns.some((re) => re.test(haystack(r))));
    const ageTagged = catalog.filter((r) => { var _a; return ((_a = r.defaultGiftAges) !== null && _a !== void 0 ? _a : []).length > 0; });
    const tagged = ofKind(ageTagged);
    const matches = tagged.length ? tagged : ofKind(catalog);
    if (age == null)
        return matches;
    const covering = matches.filter((r) => rowCoversGiftAge(r, age));
    return covering.length ? covering : matches;
}
function giftKindHasAssignableRow(catalog, kind, age) {
    return giftKindRows(catalog, kind, age).some(canAssignUnit);
}
/** Default kinds for this age with a row above its swap reserve, in age order. */
function rankGiftKindsForAge(catalog, age) {
    return defaultGiftKindOrder(age).filter((kind) => giftKindRows(catalog, kind, age).some((r) => rowServesGiftAge(r, age) && isDefaultEligible(r)));
}
const ELECTRIC_CANDLES_RE = /electric.*candle|candle.*electric|led.*candle/i;
/** Catalog row behind a candles kind (beeswax default, roll-your-own, electric). */
function resolveCandlesRow(catalog, kind) {
    if (!(catalog === null || catalog === void 0 ? void 0 : catalog.length))
        return undefined;
    if (kind === 'diy-candles')
        return resolveGiftKind(catalog, 'diy-candles');
    if (kind === 'electric-candles')
        return catalog.find((r) => ELECTRIC_CANDLES_RE.test(haystack(r)));
    return resolveByDefaultSlot(catalog, 'candles');
}
const CANDLES_FALLBACK_ORDER = ['candles', 'diy-candles', 'electric-candles'];
/**
 * Keep the preferred candles while it's above its swap reserve; then the next
 * option in beeswax → roll-your-own → electric order that is; when none is,
 * whichever has the most real stock left.
 */
function planCandlesDefault(catalog, preferred = 'candles') {
    var _a, _b, _c, _d;
    if (!(catalog === null || catalog === void 0 ? void 0 : catalog.length))
        return preferred;
    const order = [preferred, ...CANDLES_FALLBACK_ORDER.filter((k) => k !== preferred)];
    const options = order
        .map((kind) => ({ kind, row: resolveCandlesRow(catalog, kind) }))
        .filter((o) => !!o.row);
    return ((_d = (_b = (_a = options.find((o) => isDefaultEligible(o.row))) === null || _a === void 0 ? void 0 : _a.kind) !== null && _b !== void 0 ? _b : (_c = options
        .filter((o) => canAssignUnit(o.row))
        .sort((a, b) => { var _a, _b; return ((_a = rowStockLeft(b.row)) !== null && _a !== void 0 ? _a : Infinity) - ((_b = rowStockLeft(a.row)) !== null && _b !== void 0 ? _b : Infinity); })[0]) === null || _c === void 0 ? void 0 : _c.kind) !== null && _d !== void 0 ? _d : preferred);
}
/**
 * What fills each of the two food slots (latke slot, then sufganiyot slot) — always two.
 * A kit down to its swap reserve gives its slot to the other kit (two of one kit is fine),
 * then to a Big Bag of gelt; with nothing spare, whichever option has the most left.
 */
function planFoodDefaults(catalog) {
    const both = ['latke-mix', 'sufganiyot-mix'];
    if (!(catalog === null || catalog === void 0 ? void 0 : catalog.length))
        return both;
    return both.map((preferred) => {
        var _a, _b, _c, _d;
        const order = [preferred, ...both.filter((s) => s !== preferred), 'gelt-medium'];
        const options = order
            .map((slot) => ({ slot, row: resolveByDefaultSlot(catalog, slot) }))
            .filter((o) => !!o.row);
        return ((_d = (_b = (_a = options.find((o) => isDefaultEligible(o.row))) === null || _a === void 0 ? void 0 : _a.slot) !== null && _b !== void 0 ? _b : (_c = options
            .filter((o) => canAssignUnit(o.row))
            .sort((a, b) => { var _a, _b; return ((_a = rowStockLeft(b.row)) !== null && _a !== void 0 ? _a : 0) - ((_b = rowStockLeft(a.row)) !== null && _b !== void 0 ? _b : 0); })[0]) === null || _c === void 0 ? void 0 : _c.slot) !== null && _d !== void 0 ? _d : preferred);
    });
}
/**
 * Dreidel assignment by kid (used for mixed 5+ boxes).
 * Under 5 kids → all wood; `buildDefaultLineItems` materializes one household
 * wood line at kids+adults (1 per person), not one line per kid.
 * 5+ → mix by age (older → blank/airdry activity), still one line per kid.
 */
function planDreidels(inputs) {
    const kidCount = inputs.kids.length;
    return inputs.kids.map((kid, kidIndex) => {
        let kind = 'wood-dreidel';
        if (kidCount >= 5) {
            if (kid.age >= 8)
                kind = 'blank-dreidel';
            else if (kid.age >= 5)
                kind = 'airdry-dreidel';
            else
                kind = 'wood-dreidel';
        }
        return { kidIndex, age: kid.age, kind };
    });
}
function listBoxCentsForKids(kidCount) {
    const extras = Math.max(0, kidCount - 1);
    return exports.PRICING_POLICY.listBoxCents + extras * exports.PRICING_POLICY.perExtraKidCents;
}
/** Simple know-nothing outline used in CONTEXT + as a planner sketch. */
function planKnowNothingOutline(inputs = { kids: [{ age: 5 }] }) {
    const adults = defaultAdults(inputs.adults);
    const gelt = planGelt(inputs);
    const dreidels = planDreidels(inputs);
    const candlesDefault = planCandlesDefault(inputs.catalog, 'candles');
    const gifts = planGifts(inputs, new Set(candlesDefault === 'diy-candles' ? ['diy-candles'] : []));
    return {
        inputs: { kids: inputs.kids, adults },
        listCents: listBoxCentsForKids(inputs.kids.length),
        gelt,
        dreidels,
        gifts,
        booksPerKid: inputs.kids.length,
        presentsPerKid: inputs.kids.length,
        foodDefaults: planFoodDefaults(inputs.catalog),
        wrapDefault: 'wrapping-paper',
        candlesDefault,
    };
}
function giftConflictsWithPractice(gift, practiceKinds) {
    if (gift === 'airdry' && practiceKinds.has('airdry-dreidel'))
        return true;
    if (gift === 'blank' && practiceKinds.has('blank-dreidel'))
        return true;
    if (gift === 'diy-candles' && practiceKinds.has('diy-candles'))
        return true;
    return false;
}
function practiceKindsForKid(candlesKind, dreidels, kidIndex) {
    const kinds = new Set();
    if (candlesKind === 'diy-candles')
        kinds.add('diy-candles');
    const d = dreidels.find((x) => x.kidIndex === kidIndex);
    if (d && d.kind !== 'wood-dreidel')
        kinds.add(d.kind);
    return kinds;
}
/**
 * Dreidel assignment under practice intensity.
 * Wood stays a household “1 per person” set at every practice level — we do not
 * peel craft kits into the practice slot (those stay gift/swap choices).
 */
function planPracticeDreidels(inputs, _practice) {
    void _practice;
    return planDreidels(inputs);
}
/**
 * Practice-intensity curated outline: traditional on the left, deliberate
 * deviations on the right. Returns deviations that were kept after gift dedupe.
 */
function planCuratedOutline(inputs = { kids: [{ age: 5 }] }) {
    var _a, _b;
    const practice = (_a = inputs.practice) !== null && _a !== void 0 ? _a : 'minimal';
    const base = planKnowNothingOutline(inputs);
    if (practice === 'minimal') {
        return Object.assign(Object.assign({}, base), { practice, deviations: [] });
    }
    const candlesDefault = practice === 'all-in' ? planCandlesDefault(inputs.catalog, 'diy-candles') : base.candlesDefault;
    // Dreidels stay on the know-nothing household wood set (never split for practice).
    const dreidels = planDreidels(inputs);
    // Presents follow the age rule at every practice level.
    let gifts = base.gifts.map((g) => (Object.assign({}, g)));
    // Dedupe: never put the same kind in a kid's practice slot and gift slot.
    // Prefer reassigning the gift; if no alternative, drop the practice deviation.
    for (const g of gifts) {
        const kinds = practiceKindsForKid(candlesDefault, dreidels, g.kidIndex);
        if (!giftConflictsWithPractice(g.kind, kinds))
            continue;
        const usedByOthers = new Set(gifts.filter((x) => x.kidIndex !== g.kidIndex).map((x) => x.kind));
        const alt = giftKindFallbackOrder(g.age, inputs.catalog).find((k) => k !== g.kind &&
            !usedByOthers.has(k) &&
            !giftConflictsWithPractice(k, kinds));
        if (alt) {
            g.kind = alt;
        }
        // If still conflicting (e.g. diy-candles gift vs diy candles practice), finalCandles
        // resolution below drops the practice candles deviation rather than peeling wood.
    }
    // If diy candles still conflicts with any unresolved diy-candles gift, drop candles deviation.
    let finalCandles = candlesDefault;
    if (finalCandles === 'diy-candles') {
        const stillConflicts = gifts.some((g) => g.kind === 'diy-candles' &&
            giftConflictsWithPractice(g.kind, practiceKindsForKid(finalCandles, dreidels, g.kidIndex)));
        if (stillConflicts) {
            finalCandles = base.candlesDefault === 'diy-candles' ? 'candles' : base.candlesDefault;
        }
    }
    // Re-assert distinct gift kinds across kids after practice conflict resolution.
    {
        const claimed = new Set();
        gifts = gifts.map((g) => {
            if (!claimed.has(g.kind) || SHAREABLE_GIFT_KINDS.has(g.kind)) {
                claimed.add(g.kind);
                return g;
            }
            const kinds = practiceKindsForKid(finalCandles, dreidels, g.kidIndex);
            const alt = giftKindFallbackOrder(g.age, inputs.catalog).find((k) => k !== g.kind && !claimed.has(k) && !giftConflictsWithPractice(k, kinds));
            if (!alt)
                return g;
            claimed.add(alt);
            return Object.assign(Object.assign({}, g), { kind: alt });
        });
    }
    const traditionalDreidels = planDreidels(inputs);
    const traditionalGifts = base.gifts;
    const deviations = [];
    if (finalCandles !== base.candlesDefault) {
        deviations.push({
            section: 'candles',
            slotId: 'candles',
            fromKind: base.candlesDefault,
            toKind: finalCandles,
        });
    }
    for (const d of dreidels) {
        const traditional = traditionalDreidels.find((t) => t.kidIndex === d.kidIndex);
        const fromKind = (_b = traditional === null || traditional === void 0 ? void 0 : traditional.kind) !== null && _b !== void 0 ? _b : 'wood-dreidel';
        if (d.kind === fromKind)
            continue;
        // Only record as a deliberate practice deviation when leaving wood for craft.
        if (fromKind === 'wood-dreidel' && d.kind !== 'wood-dreidel') {
            deviations.push({
                section: 'dreidel',
                slotId: d.kind,
                fromKind,
                toKind: d.kind,
                kidIndex: d.kidIndex,
            });
        }
        else if (fromKind !== d.kind) {
            deviations.push({
                section: 'dreidel',
                slotId: d.kind,
                fromKind,
                toKind: d.kind,
                kidIndex: d.kidIndex,
            });
        }
    }
    for (const g of gifts) {
        const traditional = traditionalGifts.find((t) => t.kidIndex === g.kidIndex);
        if (!traditional || traditional.kind === g.kind)
            continue;
        deviations.push({
            section: 'presents',
            slotId: 'gift',
            fromKind: traditional.kind,
            toKind: g.kind,
            kidIndex: g.kidIndex,
        });
    }
    return Object.assign(Object.assign({}, base), { practice, candlesDefault: finalCandles, dreidels,
        gifts,
        deviations });
}
// —— Catalog resolution ————————————————————————————————————————————————
function haystack(row) {
    var _a;
    return `${row.id} ${row.name} ${(_a = row.slotId) !== null && _a !== void 0 ? _a : ''}`.toLowerCase();
}
function isPlushish(row) {
    return PLUSHISH_RE.test(haystack(row));
}
/**
 * Rank catalog rows for a Default slot. Food mix slots must never resolve to
 * plush/stuffie (those belong under Give Presents); prefer mix/kit SKUs.
 */
function scoreDefaultSlotCandidate(row, slot) {
    var _a;
    const h = haystack(row);
    const slotId = (_a = row.slotId) !== null && _a !== void 0 ? _a : '';
    const patterns = DEFAULT_SLOT_PATTERNS[slot];
    const tagged = row.defaultSlot === slot;
    const patternHit = patterns.some((re) => re.test(h) || re.test(slotId));
    if (!tagged && !patternHit)
        return 0;
    if (FOOD_MIX_SLOTS.has(slot) && isPlushish(row))
        return 0;
    let score = 0;
    if (tagged)
        score += 100;
    if (patternHit)
        score += 10;
    if (row.id === slot || slotId === slot)
        score += 40;
    if (slot === 'latke-mix') {
        if (row.id === 'latke-mix' || row.id === 'latke-kit' || slotId === 'latke-kit' || slotId === 'latke-mix') {
            score += 40;
        }
    }
    if (slot === 'sufganiyot-mix') {
        if (row.id === 'sufganiyot-mix' ||
            row.id === 'sufganiyot-kit' ||
            slotId === 'sufganiyot-kit' ||
            slotId === 'sufganiyot-mix') {
            score += 40;
        }
    }
    if (FOOD_MIX_SLOTS.has(slot)) {
        if (MIX_OR_KIT_RE.test(h) || MIX_OR_KIT_RE.test(slotId))
            score += 50;
        if (/recipe/.test(h) || /recipe/.test(slotId))
            score -= 25;
    }
    return score;
}
function resolveByDefaultSlot(catalog, slot) {
    if (!(catalog === null || catalog === void 0 ? void 0 : catalog.length))
        return undefined;
    let best;
    let bestScore = 0;
    for (const row of catalog) {
        const score = scoreDefaultSlotCandidate(row, slot);
        if (score > bestScore) {
            bestScore = score;
            best = row;
        }
    }
    return bestScore > 0 ? best : undefined;
}
/** Book whose Default book ages sit closest to `age` (e.g. a 15-year-old gets the 12 default). */
function nearestDefaultBook(catalog, age) {
    var _a;
    let best;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of catalog) {
        for (const raw of (_a = row.defaultBookAges) !== null && _a !== void 0 ? _a : []) {
            const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
            if (!Number.isFinite(n))
                continue;
            const distance = Math.abs(n - age);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = row;
            }
        }
    }
    return best;
}
const isStoryRow = (r) => {
    var _a, _b;
    return ((_a = r.slotId) !== null && _a !== void 0 ? _a : '').startsWith('story') ||
        /book/i.test(haystack(r)) ||
        ((_b = r.boxSections) !== null && _b !== void 0 ? _b : []).some((s) => /story/i.test(s));
};
/**
 * Default book for a kid's age. `avoid` (books already in the box) steers siblings to a
 * different title; it only gives way when every book is taken.
 *
 * Stock gates books the same way gifts are gated: default-eligible titles first
 * (untracked books always are), then anything that can still spare a unit. A
 * sold-out tracked title is never handed out as a default.
 */
function resolveBookForAge(catalog, age, avoid) {
    if (!(catalog === null || catalog === void 0 ? void 0 : catalog.length))
        return undefined;
    // Books being wound down ('Hold inventory') are the last resort at every tier:
    // only picked when no ordinary title fits.
    const ordinary = catalog.filter((r) => r.holdInventory !== true);
    const windingDown = catalog.filter((r) => r.holdInventory === true);
    for (const pool of [ordinary, windingDown]) {
        if (!pool.length)
            continue;
        const eligible = pool.filter((r) => isDefaultEligible(r));
        const fromEligible = pickBook(eligible, age, avoid);
        if (fromEligible)
            return fromEligible;
        const spare = pool.filter((r) => !isSoldOutForBoxes(r) && canAssignUnit(r));
        const fromSpare = pickBook(spare, age, avoid);
        if (fromSpare)
            return fromSpare;
    }
    return undefined;
}
function pickBook(catalog, age, avoid) {
    var _a, _b;
    if (!catalog.length)
        return undefined;
    if (avoid === null || avoid === void 0 ? void 0 : avoid.size) {
        const rest = catalog.filter((r) => !avoid.has(r.id));
        const picked = (_b = (_a = exactDefaultBook(rest, age)) !== null && _a !== void 0 ? _a : cheapNearbyDefaultBook(rest, age)) !== null && _b !== void 0 ? _b : pickBookForAge(rest, age);
        if (picked && isStoryRow(picked))
            return picked;
    }
    return pickBookForAge(catalog, age);
}
function bookAgeDistance(row, age) {
    var _a;
    const ages = ((_a = row.defaultBookAges) !== null && _a !== void 0 ? _a : [])
        .map((raw) => (typeof raw === 'number' ? raw : parseInt(String(raw), 10)))
        .filter((n) => Number.isFinite(n));
    return ages.length ? Math.min(...ages.map((n) => Math.abs(n - Math.floor(age)))) : null;
}
function exactDefaultBook(catalog, age) {
    return catalog.find((r) => bookAgeDistance(r, age) === 0);
}
/**
 * A second book (the kid's own default is taken): the cheapest default book within a
 * year of their age, or among the nearest ones when none is that close.
 */
function cheapNearbyDefaultBook(catalog, age) {
    var _a;
    const scored = catalog.flatMap((r) => {
        const d = bookAgeDistance(r, age);
        return d == null ? [] : [{ r, d }];
    });
    if (!scored.length)
        return undefined;
    const window = Math.max(1, Math.min(...scored.map((s) => s.d)));
    const price = (r) => { var _a; return (_a = r.memberPriceCents) !== null && _a !== void 0 ? _a : Number.POSITIVE_INFINITY; };
    return (_a = scored.filter((s) => s.d <= window).sort((x, y) => price(x.r) - price(y.r) || x.d - y.d)[0]) === null || _a === void 0 ? void 0 : _a.r;
}
function pickBookForAge(catalog, age) {
    var _a, _b;
    if (!catalog.length)
        return undefined;
    const ageStr = String(Math.floor(age));
    const tagged = catalog.find((r) => { var _a; return ((_a = r.defaultBookAges) !== null && _a !== void 0 ? _a : []).map(String).includes(ageStr); });
    if (tagged)
        return tagged;
    const nearest = nearestDefaultBook(catalog, Math.floor(age));
    if (nearest)
        return nearest;
    const band = ageGroupForNumericAge(age);
    const pool = catalog.filter(isStoryRow);
    const candidates = pool.length ? pool : catalog;
    return ((_b = (_a = candidates.find((r) => { var _a; return ((_a = r.defaultFor) !== null && _a !== void 0 ? _a : []).includes(band); })) !== null && _a !== void 0 ? _a : candidates.find((r) => { var _a; return ((_a = r.ageGroups) !== null && _a !== void 0 ? _a : []).includes(band); })) !== null && _b !== void 0 ? _b : undefined);
}
/**
 * Catalog row for a gift kind. Several rows can share a kind (four stuffies,
 * clay dreidel + clay menorah): prefer rows tagged for `age` that a sibling doesn't
 * already have (`avoidIds`), above their swap reserve, with the most stock headroom;
 * catalog order breaks ties.
 */
function resolveGiftKind(catalog, kind, age, avoidIds) {
    if (!(catalog === null || catalog === void 0 ? void 0 : catalog.length))
        return undefined;
    const candidates = giftKindRows(catalog, kind, age);
    if (candidates.length <= 1)
        return candidates[0];
    const assignable = candidates.filter(canAssignUnit);
    const fresh = (avoidIds === null || avoidIds === void 0 ? void 0 : avoidIds.size) ? assignable.filter((r) => !avoidIds.has(r.id)) : assignable;
    const pool = fresh.length ? fresh : assignable.length ? assignable : candidates;
    return [...pool].sort((a, b) => Number(isDefaultEligible(b)) - Number(isDefaultEligible(a)) ||
        giftDefaultScore(b) - giftDefaultScore(a))[0];
}
function giftKindOfRow(row) {
    const h = haystack(row);
    return Object.keys(GIFT_KIND_PATTERNS).find((kind) => kind !== 'extra-book' && GIFT_KIND_PATTERNS[kind].some((re) => re.test(h)));
}
function isGiftLineSlot(slotId) {
    return slotId === 'gift' || slotId.startsWith('gift-');
}
function bestReplacement(rows) {
    var _a;
    const usable = rows.filter((r) => !!r && !isSoldOutForBoxes(r));
    return (_a = usable.find(isDefaultEligible)) !== null && _a !== void 0 ? _a : usable.find(canAssignUnit);
}
/**
 * What replaces a sold-out line, by the same rules that build a box: the
 * candles fallback for candles, the kid's next gift kind for gifts, the same
 * default slot or gift kind otherwise. Prefers rows that pass the default rule,
 * then anything that can spare a unit. Undefined → drop the line.
 */
function soldOutReplacement(catalog, line, options = {}) {
    var _a, _b, _c, _d, _e, _f;
    const soldOut = catalog.find((r) => r.id === line.itemId);
    if (!soldOut)
        return undefined;
    const avoid = new Set([line.itemId, ...((_a = options.avoidIds) !== null && _a !== void 0 ? _a : [])]);
    const pool = catalog.filter((r) => !avoid.has(r.id) && !isSoldOutForBoxes(r));
    const paid = ((_b = line.unitCents) !== null && _b !== void 0 ? _b : 0) > 0;
    const age = options.age;
    const candleKind = CANDLES_FALLBACK_ORDER.find((k) => { var _a; return ((_a = resolveCandlesRow(catalog, k)) === null || _a === void 0 ? void 0 : _a.id) === line.itemId; });
    if (candleKind && !isGiftLineSlot(line.slotId)) {
        return bestReplacement(CANDLES_FALLBACK_ORDER.filter((k) => k !== candleKind)
            .map((k) => resolveCandlesRow(catalog, k))
            .filter((r) => r && !avoid.has(r.id)));
    }
    // A story line always stays a book: the kid's age-appropriate title that isn't
    // already in the box (never dropped, unlike an unlisted paid add-on).
    if (isStoryRow(soldOut)) {
        const kidAge = age !== null && age !== void 0 ? age : Number((_d = ((_c = soldOut.defaultBookAges) !== null && _c !== void 0 ? _c : [])[0]) !== null && _d !== void 0 ? _d : 5);
        return resolveBookForAge(pool, kidAge, avoid);
    }
    const kind = giftKindOfRow(soldOut);
    const sameKind = kind ? giftKindRows(pool, kind, age) : [];
    if (isGiftLineSlot(line.slotId) && !paid) {
        const kidAge = age !== null && age !== void 0 ? age : Number((_f = ((_e = soldOut.defaultGiftAges) !== null && _e !== void 0 ? _e : [])[0]) !== null && _f !== void 0 ? _f : 5);
        const claimedKinds = new Set([...avoid].map((id) => catalog.find((r) => r.id === id)).flatMap((r) => (r ? [giftKindOfRow(r)] : [])));
        const otherKinds = giftKindFallbackOrder(kidAge, pool)
            .filter((k) => k !== kind && !claimedKinds.has(k))
            .map((k) => resolveGiftKind(pool, k, kidAge));
        return bestReplacement([...sameKind, ...otherKinds]);
    }
    const slot = Object.keys(DEFAULT_SLOT_PATTERNS).find((s) => { var _a; return ((_a = resolveByDefaultSlot(catalog, s)) === null || _a === void 0 ? void 0 : _a.id) === line.itemId; });
    const slotPeers = slot
        ? pool
            .map((r) => ({ r, score: scoreDefaultSlotCandidate(r, slot) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((x) => x.r)
        : [];
    return bestReplacement([...sameKind, ...slotPeers]);
}
/** Planner age for a kid's band or explicit planner age; undefined when unknown. */
function plannerAgeOf(kid) {
    if (!kid)
        return undefined;
    if (typeof kid.plannerAge === 'number' && Number.isFinite(kid.plannerAge))
        return Math.max(0, Math.floor(kid.plannerAge));
    const band = kid.ageGroup;
    return band === '0-2' || band === '3-5' || band === '6-8' || band === '9-12'
        ? representativeAgeForBand(band)
        : undefined;
}
/**
 * Replace every truly sold-out line in a draft (see `soldOutReplacement`); lines
 * with no replacement are dropped. Quantity and price stay as they were.
 * Pilot Participants picks are never swapped: they're fixed once the family joins.
 * Returns the same array when nothing changed.
 */
function swapSoldOutLines(lines, catalog, ageForChild = () => undefined) {
    var _a;
    const byId = new Map(catalog.map((r) => [r.id, r]));
    const soldOut = (line) => {
        if (line.program === 'pilot')
            return false;
        const row = byId.get(line.itemId);
        return !!row && isSoldOutForBoxes(row);
    };
    if (!lines.some(soldOut))
        return { lines, swaps: [] };
    const inBox = new Set(lines.map((l) => l.itemId));
    const swaps = [];
    const out = [];
    for (const line of lines) {
        if (!soldOut(line)) {
            out.push(line);
            continue;
        }
        const replacement = soldOutReplacement(catalog, line, {
            age: ageForChild(line.childId),
            avoidIds: inBox,
        });
        if (!swaps.some((s) => s.fromItemId === line.itemId)) {
            swaps.push({ fromItemId: line.itemId, toItemId: (_a = replacement === null || replacement === void 0 ? void 0 : replacement.id) !== null && _a !== void 0 ? _a : null });
        }
        if (!replacement)
            continue;
        inBox.add(replacement.id);
        const { curationNote: _note } = line, rest = __rest(line, ["curationNote"]);
        out.push(Object.assign(Object.assign({}, rest), { itemId: replacement.id, label: replacement.name }));
    }
    return { lines: out, swaps };
}
function annotateSlot(catalog, slot) {
    const row = resolveByDefaultSlot(catalog, slot);
    return row ? `${slot}→${row.id}` : slot;
}
// —— CONTEXT renderer ————————————————————————————————————————————————————
function formatSwap(s) {
    const note = s.note ? ` (${s.note})` : '';
    return `${s.targetSlotOrKind}[${s.price}]${note}`;
}
function formatUpsell(u) {
    const note = u.note ? ` (${u.note})` : '';
    return `${u.targetSlotOrKind}[${u.price}]${note}`;
}
/**
 * Concise plain-text Box rules block for Rav CONTEXT.
 * Optionally annotates default slots with live catalog ids when rows are provided.
 */
function renderBoxRulesContext(catalog) {
    const example = planKnowNothingOutline({ kids: [{ age: 5 }], catalog });
    const geltEx = example.gelt;
    const giftEx = example.gifts[0];
    const catalogHints = [];
    if (catalog === null || catalog === void 0 ? void 0 : catalog.length) {
        const slots = [
            'candles',
            'wood-dreidel',
            'gelt-medium',
            'gelt-small',
            'gelt-party',
            'latke-mix',
            'sufganiyot-mix',
            'wrapping-paper',
            'pre-wrap',
        ];
        for (const slot of slots) {
            const row = resolveByDefaultSlot(catalog, slot);
            if (row)
                catalogHints.push(`${slot}=${row.id}`);
        }
        const book5 = resolveBookForAge(catalog, 5);
        if (book5)
            catalogHints.push(`default-book-age-5=${book5.id}`);
        const stuffie = resolveGiftKind(catalog, 'stuffie');
        if (stuffie)
            catalogHints.push(`gift-stuffie≈${stuffie.id}`);
    }
    const exampleCandles = resolveCandlesRow(catalog, example.candlesDefault);
    const exampleFood = example.foodDefaults.length
        ? example.foodDefaults.map((slot) => annotateSlot(catalog, slot)).join(' + ')
        : '(no food options left)';
    const exampleGift = resolveGiftKind(catalog, giftEx.kind, giftEx.age);
    const sectionBlocks = exports.SECTION_RULES.map((sec) => {
        var _a;
        const slotLines = sec.slots.map((slot) => {
            var _a;
            const swaps = slot.swaps.map(formatSwap).join('; ');
            const ups = ((_a = slot.upsells) === null || _a === void 0 ? void 0 : _a.length)
                ? `; upsells: ${slot.upsells.map(formatUpsell).join('; ')}`
                : '';
            return `  • ${slot.defaultKind}: swaps → ${swaps}${ups}`;
        });
        const notes = ((_a = sec.notes) !== null && _a !== void 0 ? _a : []).map((n) => `  · ${n}`).join('\n');
        return `${sec.title} (${sec.id}):\n${slotLines.join('\n')}${notes ? `\n${notes}` : ''}`;
    }).join('\n');
    const lines = [
        'Box rules (Hanukkah 2026 — enforce when suggesting or mutating the box):',
        `- Holiday id: ${exports.PRICING_POLICY.holidayId}`,
        `- Sections (order, catalog items only): ${exports.BOX_SECTION_ORDER.join(' → ')}`,
        '- Instruction booklet: never listed / never mutable — physical insert only.',
        '',
        'How swaps and adds work (every section):',
        '- An included line swaps only to its slot\'s [included] options, at no charge; the new item replaces it.',
        '- [extra] items and anything not listed are never swaps: they are add-ons on top at their price, and the included item stays.',
        '- A paid line (marked "paid" in Current box) swaps at the new item\'s price.',
        '- Removing an included item donates it to a family who wouldn\'t otherwise celebrate. The box price stays the same, and they can add it back free until lock.',
        '- Adding into an empty included slot is free (an empty food slot takes any food-slot option, even a second of the same kit).',
        '',
        'Simple default (know-nothing, 1 kid age 5):',
        `- Light Candles: ${example.candlesDefault}${exampleCandles ? `→${exampleCandles.id}` : ''} (not menorah)`,
        `- Play Dreidel: ${annotateSlot(catalog, 'wood-dreidel')} ×${1 + defaultAdults()} (1 per person: the kid + 2 adults) + ${annotateSlot(catalog, geltSlotForSize(geltEx.size))} ×${geltEx.quantity}`,
        `- Eat & Drink: ${exampleFood} (always two food slots; a nearly-gone kit is replaced by the other kit, then a Big Bag; latke kit includes applesauce spice mix)`,
        `- Tell the Story: 1 age-default book for the 5yo${resolveBookForAge(catalog, 5) ? ` (${resolveBookForAge(catalog, 5).id})` : ''}`,
        `- Give Presents: ${annotateSlot(catalog, 'wrapping-paper')} + gift=${giftEx.kind}${exampleGift ? `≈${exampleGift.id}` : ''}`,
        '',
        'Section swap graphs:',
        sectionBlocks,
        '',
        'Gelt planner (free gelt = one Little Bag\'s worth per person, kids + adults; adults default 2 if unknown):',
        '- Exchange by chocolate: Little = 1, Big = 3, Party = 12',
        '- 1 kid in a 3-person household → Big ×1; otherwise Little × people',
        '- 5+ kids → Big × floor(people/3) + Little × the remainder; never a Party Bag by default',
        '- Gelt swaps convert at the exchange rate, never above the allowance (Big → 3 Little); Party is paid unless 12+ people',
        '- Gelt added on top is free while the box\'s free gelt (outside the food slots) fits the allowance; past it, it is paid',
        '- Gelt filling a food slot (one Big Bag or three Little Bags) does not count toward the allowance',
        '',
        'Scaling with kids:',
        '- 1 book + 1 present per kid; 1 dreidel per person; gelt as above',
        '- 5+ kids dreidels: mix wood/airdry/blank by age (older → activity); no consolidation',
        '',
        'Gift defaults (prefer distinct across kids; never last unit; books infinite/no hold):',
        '- Presents by age: toddler play menorah 0–2 (a second toddler gets a stuffie), a stuffie 3–5 (siblings get different characters), an airdry clay menorah or dreidel 6+ (siblings get the other kit). Never default a book or gelt as the present; draw-your-own dreidel, Lego menorah and roll-your-own candles are free present swaps, not defaults.',
        `- Stock-led within those: the stuffie character or clay kit with the most stock left goes first. Items within ~${Math.round(exports.STOCK_POLICY.swapReserveFraction * 100)}% of their starting inventory stop being defaults but stay available as swaps.`,
        '- Fallback age table when stock is unknown: 0 stuffie, 1 wood-toy-menorah, 2 stuffie, 3 stuffie, 4 airdry, 5 stuffie, 6 lego-menorah, 7 blank, 8 DIY-candles; 9+ bias blank/DIY/lego/airdry/books',
        '- When suggesting gifts, swaps, or add-ons, lean toward items with plenty left (Catalog left=N).',
        '- Items marked low are still fair game for an explicit, exact match: the shopper names the item (says "Lego" → lego menorah) or states the need it uniquely solves (fire / open-flame / candle-safety worry → electric candles). Use them then, as long as any are left. A loose affinity ("likes building", "crafty") is not enough when an item is low — pick a well-stocked option instead.',
        '- Dual-home browse OK; same catalog id twice → confirm in UX (not a hard block)',
        '',
        'Practice level policy (onboarding slider — current practice intensity, NOT knowledge):',
        '- Left / minimal: household does little Hanukkah now — traditional defaults (beeswax candles, wooden dreidel, age-default book + gift).',
        '- Middle / moderate: keep traditional wood dreidel household set + beeswax candles; presents follow the age rule.',
        '- Right / all-in: fuller practice — roll-your-own candles when it doesn’t collide with a DIY gift; wood dreidel stays the household set; presents still follow the age rule.',
        '- Wood dreidel / gelt are household “1 per person” sets — never peel one unit out for a craft kit or per-kid airdry/blank practice line; swap the whole set or leave it. Craft kits stay gift/swap/add-more choices.',
        '- Never put the same kind in a kid practice slot and gift slot; reassign gift first, else drop the practice deviation (candles DIY ↔ DIY gift).',
        '- Siblings never get the identical present by default (different stuffie characters, the other clay kit). Matching gifts only when the shopper explicitly asks.',
        '- Explaining a deliberate swap: one short sentence in your voice — why this household got the less-traditional pick. Do not recite this policy.',
        '',
        'Pricing:',
        `- List ~$${exports.PRICING_POLICY.listBoxCents / 100} + $${exports.PRICING_POLICY.perExtraKidCents / 100}/kid after first (even if donated)`,
        `- Example 1 kid: $${listBoxCentsForKids(1) / 100}; 2 kids: $${listBoxCentsForKids(2) / 100}`,
        `- Shipping ${exports.PRICING_POLICY.shipping} (${exports.PRICING_POLICY.shipWindowLabel}). Prefer CONTEXT lock line over inventing dates.`,
        '- included → covered by box; extras / upsells → catalog member/retail prices',
        '',
        'Donate:',
        '- Removing an included item donates it (shown as donated, value at member price); no box price reduction',
        '- Donated items go to a family who wouldn\'t otherwise celebrate; the family can add them back free until lock',
        '',
        'Wrap:',
        `- Default ${exports.WRAP_POLICY.defaultSlot}; pre-wrap same price, covers any number of wrappable presents (one wrap choice per box)`,
        `- Wrappable: ${exports.WRAP_POLICY.wrappableKinds.join(', ')}. NOT: ${exports.WRAP_POLICY.notWrappableKinds.join(', ')}`,
        '- Prefer catalog Wrappable checkbox when present. Storefront-only wrap add-on out of scope for box CONTEXT.',
        '',
        'Catalog identity:',
        '- Resolve defaults by Default slot / Default book ages tags when present; else known name/slug patterns',
        '- Only use real catalog ids from CONTEXT — do not invent SKUs',
        catalogHints.length ? `- Resolved defaults: ${catalogHints.join(', ')}` : '- (no catalog rows annotated this turn)',
        '',
        'Customize until lock; never checkout or charge — send them to My Box → Checkout',
        'Prefer swap/add/remove that respect these rules; client confirms before apply',
    ];
    return lines.join('\n');
}
//# sourceMappingURL=boxRules.js.map