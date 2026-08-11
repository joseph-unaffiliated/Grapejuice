/**
 * Box construction / swap / pricing policy for Hanukkah curated boxes.
 *
 * CLIENT MIRROR — drives My Box / reveal defaults via `buildDefaultBox`.
 * Source for Rav CONTEXT: `functions/src/rav/boxRules.ts` (keep in sync).
 * Pure planners + catalog resolution; no firebase-admin.
 */

/** Matches Airtable Full Catalog "Box sections" choices (order = UI order). */
export const BOX_SECTION_ORDER = [
  'Light Candles',
  'Play Dreidel',
  'Eat & Drink',
  'Tell the Story',
  'Give Presents',
] as const;

export type BoxSectionTitle = (typeof BOX_SECTION_ORDER)[number];

export type BoxSectionId = 'candles' | 'dreidel' | 'food' | 'story' | 'presents';

export const SECTION_ID_BY_TITLE: Record<BoxSectionTitle, BoxSectionId> = {
  'Light Candles': 'candles',
  'Play Dreidel': 'dreidel',
  'Eat & Drink': 'food',
  'Tell the Story': 'story',
  'Give Presents': 'presents',
};

/** Matches Airtable Full Catalog "Default slot" choices when tagged. */
export type DefaultSlotId =
  | 'candles'
  | 'wood-dreidel'
  | 'blank-dreidel'
  | 'airdry-dreidel'
  | 'gelt-small'
  | 'gelt-medium'
  | 'gelt-party'
  | 'latke-mix'
  | 'sufganiyot-mix'
  | 'applesauce'
  | 'wrapping-paper'
  | 'pre-wrap';

/** Gift kinds for per-kid present defaults (catalog gift-eligible rows, not Default slots). */
export type GiftKindId =
  | 'stuffie'
  | 'wood-toy-menorah'
  | 'airdry'
  | 'blank'
  | 'lego-menorah'
  | 'diy-candles'
  | 'extra-book';

export type SwapPrice = 'included' | 'extra' | 'donate';

export type SwapOffer = {
  /** Default slot, gift kind, or free-text catalog kind (e.g. "cookie-cutters", "napkins"). */
  targetSlotOrKind: string;
  price: SwapPrice;
  note?: string;
};

export type UpsellOffer = {
  targetSlotOrKind: string;
  price: 'extra';
  note?: string;
};

export type BoxKid = { age: number };

export type DefaultBoxInputs = {
  kids: BoxKid[];
  /** Adults in household; default 2 when unknown. */
  adults?: number;
};

export type GeltSize = 'small' | 'medium' | 'party';

export type GeltPlan = {
  size: GeltSize;
  quantity: number;
  /** Never mix sizes in the *default* build; user may buy a mix later. */
  mixedDefault: false;
};

export type DreidelKind = 'wood-dreidel' | 'blank-dreidel' | 'airdry-dreidel';

export type DreidelAssignment = {
  kidIndex: number;
  age: number;
  kind: DreidelKind;
};

export type GiftAssignment = {
  kidIndex: number;
  age: number;
  kind: GiftKindId;
};

/** Intake age bands (ChildrenScreen / ChildProfile). */
export type IntakeAgeGroup = '0-2' | '3-5' | '6-8' | '9-12';

/**
 * Representative numeric ages for gift/book planners when intake only has a band.
 * 3–5 → 5 so know-nothing smoke matches the CONTEXT example (1 kid age 5).
 */
export const REPRESENTATIVE_AGE_BY_BAND: Record<IntakeAgeGroup, number> = {
  '0-2': 1,
  '3-5': 5,
  '6-8': 7,
  '9-12': 10,
};

export function representativeAgeForBand(band: IntakeAgeGroup): number {
  return REPRESENTATIVE_AGE_BY_BAND[band];
}

export function ageGroupForNumericAge(age: number): IntakeAgeGroup {
  const n = Math.max(0, Math.floor(age));
  if (n <= 2) return '0-2';
  if (n <= 5) return '3-5';
  if (n <= 8) return '6-8';
  return '9-12';
}

/** Minimal catalog shape for CONTEXT annotation (Firestore / Airtable-synced fields). */
export type BoxRulesCatalogRow = {
  id: string;
  name: string;
  slotId?: string;
  defaultSlot?: string | null;
  boxSections?: string[];
  defaultBookAges?: Array<string | number>;
  defaultGiftAges?: Array<string | number>;
  /** When Default book ages unset — prefer story rows tagged for this band. */
  ageGroups?: string[];
  defaultFor?: string[];
  inventory?: number | null;
  holdInventory?: boolean | null;
  wrappable?: boolean | null;
  memberPriceCents?: number;
};

export const PRICING_POLICY = {
  listBoxCents: 8000,
  /** Applied even when that kid's lines are donated. */
  perExtraKidCents: 1000,
  holidayId: 'hanukkah-2026',
  shipWindowLabel: 'Nov 15–20',
  shipping: 'free for pilot',
} as const;

export const DONATE_POLICY = {
  removesFromSectionLists: true,
  summaryAtMemberPrice: true,
  tooltip: true,
  /** Donating never reduces box price. */
  reducesBoxPrice: false,
} as const;

export const WRAP_POLICY = {
  defaultSlot: 'wrapping-paper' as DefaultSlotId,
  /** Same member price as wrapping paper; catalog wrap-service role. */
  preWrapSlot: 'pre-wrap' as DefaultSlotId,
  includedPreWrapSlots: 3,
  /** 4+ wrappable items → one extra wrap charge (catalog price). */
  extraWrapChargeAt: 4,
  /** Paper can be added back on top of pre-wrap (extra). */
  paperOnTopOfPreWrap: 'extra' as const,
  /** Storefront-only wrap add-on — out of scope for box CONTEXT for now. */
  storefrontOnlyWrapOutOfScope: true,
  /**
   * Wrappable kinds when catalog `wrappable` is unset.
   * NOT: gelt, mixes, normal/electric candles, napkins.
   */
  wrappableKinds: [
    'books',
    'toys',
    'diy-candles',
    'menorahs',
    'dreidels',
  ] as const,
  notWrappableKinds: [
    'gelt',
    'mixes',
    'candles-normal',
    'candles-electric',
    'napkins',
  ] as const,
} as const;

export const STOCK_POLICY = {
  /** Prefer gifts with Inventory ≥ 2; never assign the last unit. */
  minInventoryToAssign: 2,
  /** Books: infinite / no hold (Hold inventory unchecked). */
  booksHoldInventory: false,
  dualHomeBrowseOk: true,
  /** Same catalog id twice → confirm in UX; not a hard code block. */
  duplicateCatalogIdConfirmOnly: true,
} as const;

/** Name/id/slotId patterns when Default slot is missing on the row. */
const DEFAULT_SLOT_PATTERNS: Record<DefaultSlotId, RegExp[]> = {
  candles: [/^candles$/, /candle(?!.*electric|.*myo|.*diy|.*make)/i],
  'wood-dreidel': [/wood.*dreidel|dreidel.*wood/i, /^wood-dreidel$/i],
  'blank-dreidel': [/blank.*dreidel|dreidel.*blank/i, /^blank-dreidel$/i],
  'airdry-dreidel': [/air.?dry|clay.*dreidel|dreidel.*clay/i, /^airdry-dreidel$/i],
  'gelt-small': [/gelt.*small|small.*gelt/i, /^gelt-small$/i],
  'gelt-medium': [/gelt.*medium|medium.*gelt/i, /^gelt-medium$/i, /^gelt$/],
  'gelt-party': [/gelt.*party|party.*gelt/i, /^gelt-party$/i],
  // Broad food tokens still match; scoring prefers mix/kit and excludes plush/stuffie.
  'latke-mix': [/latke/i, /latke-kit|latke-mix/i],
  'sufganiyot-mix': [/sufgan/i, /sufganiyot-kit|sufganiyot-mix/i],
  applesauce: [/applesauce|apple.?sauce/i],
  'wrapping-paper': [/wrapping|wrap.*paper/i, /^wrapping$/],
  'pre-wrap': [/pre.?wrap|prewrap|wrap.?service/i],
};

const FOOD_MIX_SLOTS = new Set<DefaultSlotId>(['latke-mix', 'sufganiyot-mix']);
const PLUSHISH_RE = /plush|stuffie|softie|stuffed/;
const MIX_OR_KIT_RE = /(?:^|[\s_-])(mix|kit)(?:$|[\s_-])|\b(mix|kit)\b/;

const GIFT_KIND_PATTERNS: Record<GiftKindId, RegExp[]> = {
  stuffie: [/stuffie|plush|softie/i],
  'wood-toy-menorah': [/wood.*(toy.?)?menorah|toy.?menorah.*wood|play.?menorah/i],
  airdry: [/air.?dry|clay.*dreidel/i],
  blank: [/blank.*dreidel/i],
  'lego-menorah': [/lego.*menorah|menorah.*lego/i],
  'diy-candles': [/diy.*candle|make.?your.?own.*candle|myo.*candle/i],
  'extra-book': [/book/i],
};

// —— Section swap graphs ————————————————————————————————————————————————

export type SectionSlotRule = {
  /** Logical default for the know-nothing / planner path. */
  defaultKind: string;
  role: 'default' | 'optional';
  swaps: SwapOffer[];
  upsells?: UpsellOffer[];
  notes?: string[];
};

export type SectionRules = {
  id: BoxSectionId;
  title: BoxSectionTitle;
  slots: SectionSlotRule[];
  notes?: string[];
};

export const SECTION_RULES: SectionRules[] = [
  {
    id: 'candles',
    title: 'Light Candles',
    notes: [
      'Default: candles only (not a menorah).',
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
      'Scale: 1 wood dreidel per kid (adults never get a default dreidel).',
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
            targetSlotOrKind: 'gelt-small×2',
            price: 'included',
            note: 'From medium default: two small bags no charge',
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
      'NO XOR: latke mix + sufganiyot mix + applesauce all default together.',
      'Latke and sufganiyot swap independently; box may end with no mixes.',
      'Applesauce: donate or add-more (paid) only — no lateral swaps.',
    ],
    slots: [
      {
        defaultKind: 'latke-mix',
        role: 'default',
        swaps: [
          { targetSlotOrKind: 'cookie-cutters', price: 'included' },
          { targetSlotOrKind: 'napkins', price: 'included' },
          { targetSlotOrKind: 'gelt-medium', price: 'included' },
          { targetSlotOrKind: 'gelt-small×2', price: 'included' },
          { targetSlotOrKind: 'gelt-party', price: 'extra' },
          { targetSlotOrKind: 'latke-stuffie', price: 'extra' },
          { targetSlotOrKind: 'donate', price: 'donate' },
        ],
      },
      {
        defaultKind: 'sufganiyot-mix',
        role: 'default',
        swaps: [
          { targetSlotOrKind: 'cookie-cutters', price: 'included' },
          { targetSlotOrKind: 'napkins', price: 'included' },
          { targetSlotOrKind: 'gelt-medium', price: 'included' },
          { targetSlotOrKind: 'gelt-small×2', price: 'included' },
          { targetSlotOrKind: 'gelt-party', price: 'extra' },
          { targetSlotOrKind: 'sufganiya-stuffie', price: 'extra' },
          { targetSlotOrKind: 'donate', price: 'donate' },
        ],
      },
      {
        defaultKind: 'applesauce',
        role: 'default',
        swaps: [
          { targetSlotOrKind: 'donate', price: 'donate' },
          { targetSlotOrKind: 'add-more-applesauce', price: 'extra', note: 'paid add; no lateral SKU swaps' },
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
      'Wrapping paper default; swap to pre-wrap (same price as paper) for up to 3 wrappable items.',
      'Unused pre-wrap slots OK; 4+ wrappable → one extra wrap charge; paper on top of pre-wrap = extra.',
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
            note: 'same price as paper; covers up to 3 wrappable items',
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

export function defaultAdults(adults?: number): number {
  return adults != null && adults >= 0 ? adults : 2;
}

/**
 * Gelt defaults — never mix sizes in the default build.
 * 1 kid → medium; 2–4 kids → all small × (kids + adults); 5+ → party only.
 */
export function planGelt(inputs: DefaultBoxInputs): GeltPlan {
  const kidCount = inputs.kids.length;
  const adults = defaultAdults(inputs.adults);
  if (kidCount <= 0) {
    return { size: 'medium', quantity: 1, mixedDefault: false };
  }
  if (kidCount === 1) {
    return { size: 'medium', quantity: 1, mixedDefault: false };
  }
  if (kidCount >= 5) {
    return { size: 'party', quantity: 1, mixedDefault: false };
  }
  return { size: 'small', quantity: kidCount + adults, mixedDefault: false };
}

export function geltSlotForSize(size: GeltSize): DefaultSlotId {
  if (size === 'small') return 'gelt-small';
  if (size === 'party') return 'gelt-party';
  return 'gelt-medium';
}

/** Fixed defaults ages 0–8; 9+ bias blank / DIY / lego / airdry / books. */
export function defaultGiftKindForAge(age: number): GiftKindId {
  const clamped = Math.max(0, Math.floor(age));
  const map: Record<number, GiftKindId> = {
    0: 'stuffie',
    1: 'wood-toy-menorah',
    2: 'stuffie',
    3: 'stuffie',
    4: 'airdry',
    5: 'stuffie',
    6: 'lego-menorah',
    7: 'blank',
    8: 'diy-candles',
  };
  if (clamped in map) return map[clamped];
  // 9+: prefer activity / older picks
  return 'blank';
}

/** Preference order when stock blocks the primary pick (9+ and fallbacks). */
export function giftKindFallbackOrder(age: number): GiftKindId[] {
  const primary = defaultGiftKindForAge(age);
  if (age >= 9) {
    const older: GiftKindId[] = ['blank', 'diy-candles', 'lego-menorah', 'airdry', 'extra-book', 'stuffie', 'wood-toy-menorah'];
    return [primary, ...older.filter((k) => k !== primary)];
  }
  const general: GiftKindId[] = [
    primary,
    'stuffie',
    'blank',
    'airdry',
    'wood-toy-menorah',
    'lego-menorah',
    'diy-candles',
    'extra-book',
  ];
  return [...new Set(general)];
}

export function planGifts(inputs: DefaultBoxInputs): GiftAssignment[] {
  return inputs.kids.map((kid, kidIndex) => ({
    kidIndex,
    age: kid.age,
    kind: defaultGiftKindForAge(kid.age),
  }));
}

/**
 * Dreidel assignment: 1 per kid.
 * Under 5 kids → all wood. 5+ → mix by age (older → blank/airdry activity).
 */
export function planDreidels(inputs: DefaultBoxInputs): DreidelAssignment[] {
  const kidCount = inputs.kids.length;
  return inputs.kids.map((kid, kidIndex) => {
    let kind: DreidelKind = 'wood-dreidel';
    if (kidCount >= 5) {
      if (kid.age >= 8) kind = 'blank-dreidel';
      else if (kid.age >= 5) kind = 'airdry-dreidel';
      else kind = 'wood-dreidel';
    }
    return { kidIndex, age: kid.age, kind };
  });
}

export function listBoxCentsForKids(kidCount: number): number {
  const extras = Math.max(0, kidCount - 1);
  return PRICING_POLICY.listBoxCents + extras * PRICING_POLICY.perExtraKidCents;
}

/** Simple know-nothing outline used in CONTEXT + as a planner sketch. */
export function planKnowNothingOutline(inputs: DefaultBoxInputs = { kids: [{ age: 5 }] }) {
  const adults = defaultAdults(inputs.adults);
  const gelt = planGelt(inputs);
  const dreidels = planDreidels(inputs);
  const gifts = planGifts(inputs);
  return {
    inputs: { kids: inputs.kids, adults },
    listCents: listBoxCentsForKids(inputs.kids.length),
    gelt,
    dreidels,
    gifts,
    booksPerKid: inputs.kids.length,
    presentsPerKid: inputs.kids.length,
    foodDefaults: ['latke-mix', 'sufganiyot-mix', 'applesauce'] as const,
    wrapDefault: 'wrapping-paper' as const,
    candlesDefault: 'candles' as const,
  };
}

// —— Catalog resolution ————————————————————————————————————————————————

function haystack(row: BoxRulesCatalogRow): string {
  return `${row.id} ${row.name} ${row.slotId ?? ''}`.toLowerCase();
}

function isPlushish(row: BoxRulesCatalogRow): boolean {
  return PLUSHISH_RE.test(haystack(row));
}

/**
 * Rank catalog rows for a Default slot. Food mix slots must never resolve to
 * plush/stuffie (those belong under Give Presents); prefer mix/kit SKUs.
 */
function scoreDefaultSlotCandidate(row: BoxRulesCatalogRow, slot: DefaultSlotId): number {
  const h = haystack(row);
  const slotId = row.slotId ?? '';
  const patterns = DEFAULT_SLOT_PATTERNS[slot];
  const tagged = row.defaultSlot === slot;
  const patternHit = patterns.some((re) => re.test(h) || re.test(slotId));
  if (!tagged && !patternHit) return 0;

  if (FOOD_MIX_SLOTS.has(slot) && isPlushish(row)) return 0;

  let score = 0;
  if (tagged) score += 100;
  if (patternHit) score += 10;
  if (row.id === slot || slotId === slot) score += 40;

  if (slot === 'latke-mix') {
    if (row.id === 'latke-mix' || row.id === 'latke-kit' || slotId === 'latke-kit' || slotId === 'latke-mix') {
      score += 40;
    }
  }
  if (slot === 'sufganiyot-mix') {
    if (
      row.id === 'sufganiyot-mix' ||
      row.id === 'sufganiyot-kit' ||
      slotId === 'sufganiyot-kit' ||
      slotId === 'sufganiyot-mix'
    ) {
      score += 40;
    }
  }

  if (FOOD_MIX_SLOTS.has(slot)) {
    if (MIX_OR_KIT_RE.test(h) || MIX_OR_KIT_RE.test(slotId)) score += 50;
    if (/recipe/.test(h) || /recipe/.test(slotId)) score -= 25;
  }

  return score;
}

export function resolveByDefaultSlot(
  catalog: BoxRulesCatalogRow[] | undefined,
  slot: DefaultSlotId
): BoxRulesCatalogRow | undefined {
  if (!catalog?.length) return undefined;
  let best: BoxRulesCatalogRow | undefined;
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

export function resolveBookForAge(
  catalog: BoxRulesCatalogRow[] | undefined,
  age: number
): BoxRulesCatalogRow | undefined {
  if (!catalog?.length) return undefined;
  const ageStr = String(Math.floor(age));
  const tagged = catalog.find((r) =>
    (r.defaultBookAges ?? []).map(String).includes(ageStr)
  );
  if (tagged) return tagged;

  const band = ageGroupForNumericAge(age);
  const storyish = (r: BoxRulesCatalogRow) =>
    (r.slotId ?? '').startsWith('story') ||
    /book/i.test(haystack(r)) ||
    (r.boxSections ?? []).some((s) => /story/i.test(s));

  const pool = catalog.filter(storyish);
  const candidates = pool.length ? pool : catalog;
  return (
    candidates.find((r) => (r.defaultFor ?? []).includes(band)) ??
    candidates.find((r) => (r.ageGroups ?? []).includes(band)) ??
    undefined
  );
}

export function resolveGiftKind(
  catalog: BoxRulesCatalogRow[] | undefined,
  kind: GiftKindId
): BoxRulesCatalogRow | undefined {
  if (!catalog?.length) return undefined;
  const ageTagged = catalog.filter((r) => (r.defaultGiftAges ?? []).length > 0);
  const pool = ageTagged.length ? ageTagged : catalog;
  const patterns = GIFT_KIND_PATTERNS[kind];
  return pool.find((r) => patterns.some((re) => re.test(haystack(r))));
}

export function annotateSlot(
  catalog: BoxRulesCatalogRow[] | undefined,
  slot: DefaultSlotId
): string {
  const row = resolveByDefaultSlot(catalog, slot);
  return row ? `${slot}→${row.id}` : slot;
}

// —— CONTEXT renderer ————————————————————————————————————————————————————

function formatSwap(s: SwapOffer): string {
  const note = s.note ? ` (${s.note})` : '';
  return `${s.targetSlotOrKind}[${s.price}]${note}`;
}

function formatUpsell(u: UpsellOffer): string {
  const note = u.note ? ` (${u.note})` : '';
  return `${u.targetSlotOrKind}[${u.price}]${note}`;
}

/**
 * Concise plain-text Box rules block for Rav CONTEXT.
 * Optionally annotates default slots with live catalog ids when rows are provided.
 */
export function renderBoxRulesContext(catalog?: BoxRulesCatalogRow[]): string {
  const example = planKnowNothingOutline({ kids: [{ age: 5 }] });
  const geltEx = example.gelt;
  const giftEx = example.gifts[0];

  const catalogHints: string[] = [];
  if (catalog?.length) {
    const slots: DefaultSlotId[] = [
      'candles',
      'wood-dreidel',
      'gelt-medium',
      'gelt-small',
      'gelt-party',
      'latke-mix',
      'sufganiyot-mix',
      'applesauce',
      'wrapping-paper',
      'pre-wrap',
    ];
    for (const slot of slots) {
      const row = resolveByDefaultSlot(catalog, slot);
      if (row) catalogHints.push(`${slot}=${row.id}`);
    }
    const book5 = resolveBookForAge(catalog, 5);
    if (book5) catalogHints.push(`default-book-age-5=${book5.id}`);
    const stuffie = resolveGiftKind(catalog, 'stuffie');
    if (stuffie) catalogHints.push(`gift-stuffie≈${stuffie.id}`);
  }

  const sectionBlocks = SECTION_RULES.map((sec) => {
    const slotLines = sec.slots.map((slot) => {
      const swaps = slot.swaps.map(formatSwap).join('; ');
      const ups = slot.upsells?.length
        ? `; upsells: ${slot.upsells.map(formatUpsell).join('; ')}`
        : '';
      return `  • ${slot.defaultKind}: swaps → ${swaps}${ups}`;
    });
    const notes = (sec.notes ?? []).map((n) => `  · ${n}`).join('\n');
    return `${sec.title} (${sec.id}):\n${slotLines.join('\n')}${notes ? `\n${notes}` : ''}`;
  }).join('\n');

  const lines = [
    'Box rules (Hanukkah 2026 — enforce when suggesting or mutating the box):',
    `- Holiday id: ${PRICING_POLICY.holidayId}`,
    `- Sections (order, catalog items only): ${BOX_SECTION_ORDER.join(' → ')}`,
    '- Instruction booklet: never listed / never mutable — physical insert only.',
    '',
    'Simple default (know-nothing, 1 kid age 5):',
    `- Light Candles: ${annotateSlot(catalog, 'candles')} (not menorah)`,
    `- Play Dreidel: ${annotateSlot(catalog, 'wood-dreidel')} + ${annotateSlot(catalog, geltSlotForSize(geltEx.size))} ×${geltEx.quantity}`,
    `- Eat & Drink: ${annotateSlot(catalog, 'latke-mix')} + ${annotateSlot(catalog, 'sufganiyot-mix')} + ${annotateSlot(catalog, 'applesauce')} (NO XOR — both mixes default)`,
    `- Tell the Story: 1 age-default book for the 5yo${resolveBookForAge(catalog, 5) ? ` (${resolveBookForAge(catalog, 5)!.id})` : ''}`,
    `- Give Presents: ${annotateSlot(catalog, 'wrapping-paper')} + gift=${giftEx.kind}${resolveGiftKind(catalog, giftEx.kind) ? `≈${resolveGiftKind(catalog, giftEx.kind)!.id}` : ''}`,
    '',
    'Section swap graphs:',
    sectionBlocks,
    '',
    'Gelt planner (default build never mixes sizes; user may buy a mix later):',
    '- 1 kid → medium ×1',
    '- 2–4 kids → small × (kids + adults); adults default 2 if unknown',
    '- 5+ kids → party ×1 only',
    '',
    'Scaling with kids:',
    '- 1 book + 1 present + 1 dreidel per kid; gelt as above',
    '- 5+ kids dreidels: mix wood/airdry/blank by age (older → activity); no consolidation',
    '',
    'Gift-by-age defaults (prefer distinct across kids; stock-aware Inventory≥2, never last unit; books infinite/no hold):',
    '- 0 stuffie, 1 wood-toy-menorah, 2 stuffie, 3 stuffie, 4 airdry, 5 stuffie, 6 lego-menorah, 7 blank, 8 DIY-candles; 9+ bias blank/DIY/lego/airdry/books',
    '- Dual-home browse OK; same catalog id twice → confirm in UX (not a hard block)',
    '',
    'Pricing:',
    `- List ~$${PRICING_POLICY.listBoxCents / 100} + $${PRICING_POLICY.perExtraKidCents / 100}/kid after first (even if donated)`,
    `- Example 1 kid: $${listBoxCentsForKids(1) / 100}; 2 kids: $${listBoxCentsForKids(2) / 100}`,
    `- Shipping ${PRICING_POLICY.shipping} (${PRICING_POLICY.shipWindowLabel}). Prefer CONTEXT lock line over inventing dates.`,
    '- included → covered by box; extras / upsells → catalog member/retail prices',
    '',
    'Donate:',
    '- Remove from section lists; roll up Donated value at member price in summary (tooltip); no box price reduction',
    '',
    'Wrap:',
    `- Default ${WRAP_POLICY.defaultSlot}; pre-wrap same price, covers ≤${WRAP_POLICY.includedPreWrapSlots} wrappable; ${WRAP_POLICY.extraWrapChargeAt}+ → one extra wrap charge`,
    `- Wrappable: ${WRAP_POLICY.wrappableKinds.join(', ')}. NOT: ${WRAP_POLICY.notWrappableKinds.join(', ')}`,
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
