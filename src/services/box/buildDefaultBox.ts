import type { BoxLineItem, CatalogItem, ChildProfile, PracticeLevel } from '../../types/pilot';
import {
  ALA_CARTE_SLOT_IDS,
  boxAddOnUnitCents,
  inferPricingTier,
  unitCentsForTier,
  chargeableLineTotal,
  orderSubtotalCents,
  SHIPPING_FLAT_CENTS,
  DEFAULT_BOX_PRICE_CENTS,
  EXTRA_FLAT_CENTS,
} from './pricing';
import {
  defaultAdults,
  geltSlotForSize,
  planCuratedOutline,
  representativeAgeForBand,
  resolveBookForAge,
  resolveByDefaultSlot,
  resolveGiftKind,
  type BoxRulesCatalogRow,
  type CandlesKind,
  type DefaultSlotId,
  type DreidelKind,
  type GiftKindId,
  type IntakeAgeGroup,
  type PracticeDeviation,
} from './boxRules';

function toRulesRow(item: CatalogItem): BoxRulesCatalogRow {
  return {
    id: item.id,
    name: item.name,
    slotId: item.slotId,
    defaultSlot: item.defaultSlot ?? null,
    boxSections: item.boxSections,
    defaultBookAges: item.defaultBookAges,
    defaultGiftAges: item.defaultGiftAges,
    ageGroups: item.ageGroups,
    defaultFor: item.defaultFor,
    inventory: item.inventory ?? null,
    holdInventory: item.holdInventory ?? null,
    wrappable: item.wrappable ?? null,
    memberPriceCents: item.memberPriceCents,
  };
}

function findById(catalog: CatalogItem[], id: string | undefined): CatalogItem | undefined {
  if (!id) return undefined;
  return catalog.find((c) => c.id === id);
}

/** Soft fallback when Default-slot patterns miss (e.g. classic wood dreidel named oddly). */
function resolveDreidelFallback(catalog: CatalogItem[]): CatalogItem | undefined {
  const scored = catalog
    .filter((c) => !ALA_CARTE_SLOT_IDS.has(c.slotId))
    .map((c) => {
      const h = `${c.id} ${c.name} ${c.slotId}`.toLowerCase();
      if (!/dreidel/.test(h)) return { c, score: 0 };
      if (/plush|stuffie|baby|brass|slipcast|pre.?wrap/.test(h)) return { c, score: 0 };
      let score = 1;
      if (/wood/.test(h)) score += 3;
      if (c.slotId === 'gift' || c.slot === 'gift') score += 1;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.c;
}

function resolveSlotItem(
  catalog: CatalogItem[],
  rows: BoxRulesCatalogRow[],
  slot: DefaultSlotId
): CatalogItem | undefined {
  const row = resolveByDefaultSlot(rows, slot);
  const hit = findById(catalog, row?.id);
  if (hit) return hit;
  if (slot === 'wood-dreidel' || slot === 'blank-dreidel' || slot === 'airdry-dreidel') {
    return resolveDreidelFallback(catalog);
  }
  return undefined;
}

function resolveCandlesItem(
  catalog: CatalogItem[],
  rows: BoxRulesCatalogRow[],
  kind: CandlesKind
): CatalogItem | undefined {
  if (kind === 'diy-candles') {
    const row = resolveGiftKind(rows, 'diy-candles');
    return findById(catalog, row?.id);
  }
  return resolveSlotItem(catalog, rows, 'candles');
}

function resolveDreidelKindItem(
  catalog: CatalogItem[],
  rows: BoxRulesCatalogRow[],
  kind: DreidelKind
): CatalogItem | undefined {
  return resolveSlotItem(catalog, rows, kind);
}

function kidsFromChildren(children: ChildProfile[]): { age: number; child: ChildProfile }[] {
  return children.map((child) => {
    if (typeof child.plannerAge === 'number' && Number.isFinite(child.plannerAge)) {
      return { age: Math.max(0, Math.floor(child.plannerAge)), child };
    }
    const band = child.ageGroup as IntakeAgeGroup;
    const age = representativeAgeForBand(band);
    return { age, child };
  });
}

function pushLineItem(
  lineItems: BoxLineItem[],
  slotId: string,
  item: CatalogItem,
  childId?: string
) {
  // Know-nothing defaults are covered by the Hanukkah box list price.
  // Catalog `alaCarte` / member prices apply on the storefront or true extras, not here.
  lineItems.push({
    slotId: childId ? `${slotId}-${childId}` : slotId,
    itemId: item.id,
    quantity: 1,
    includedQty: 1,
    unitCents: 0,
    childId,
    label: item.name,
  });
}

export type ResolvedDeviation = {
  section: PracticeDeviation['section'];
  slotId: string;
  fromKind: string;
  toKind: string;
  fromItemId?: string;
  toItemId: string;
  childId?: string;
  kidIndex?: number;
};

export type CuratedBoxResult = {
  lineItems: BoxLineItem[];
  deviations: ResolvedDeviation[];
  practice: PracticeLevel;
};

export type BuildCuratedBoxOptions = {
  practice?: PracticeLevel;
  adults?: number;
  childInterests?: string[];
};

/**
 * Practice-intensity curated box. Returns line items plus resolved deviations
 * (for Rav reasons / further refinement).
 */
export function buildCuratedBox(
  catalog: CatalogItem[],
  children: ChildProfile[],
  options: BuildCuratedBoxOptions = {}
): CuratedBoxResult {
  const practice: PracticeLevel = options.practice ?? 'minimal';
  const lineItems: BoxLineItem[] = [];
  if (!catalog.length) return { lineItems, deviations: [], practice };

  const paired = kidsFromChildren(children);
  const outline = planCuratedOutline({
    kids: paired.map((p) => ({ age: p.age })),
    adults: options.adults,
    practice,
  });
  const rows = catalog.map(toRulesRow);

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[box] curated outline', {
      practice: outline.practice,
      kids: outline.inputs.kids,
      adults: outline.inputs.adults,
      listCents: outline.listCents,
      gelt: outline.gelt,
      dreidels: outline.dreidels,
      gifts: outline.gifts,
      candlesDefault: outline.candlesDefault,
      deviations: outline.deviations,
    });
  }

  const candles = resolveCandlesItem(catalog, rows, outline.candlesDefault);
  if (candles) pushLineItem(lineItems, 'candles', candles);

  // Wood-eligible kids + adults share a household wood line (same “1 per person”
  // coverage as gelt). Craft kits replace that kid’s wood share; adults never get craft.
  const woodAssignments = outline.dreidels.filter((d) => d.kind === 'wood-dreidel');
  const craftAssignments = outline.dreidels.filter((d) => d.kind !== 'wood-dreidel');
  const adultsN = defaultAdults(outline.inputs.adults);
  const woodKidCount = woodAssignments.length;

  const woodQty = woodKidCount > 0 ? householdPracticeQty(
    { length: woodKidCount },
    adultsN,
  ) : 0;

  if (woodQty > 0) {
    const item = resolveDreidelKindItem(catalog, rows, 'wood-dreidel');
    if (item) {
      lineItems.push({
        slotId: 'wood-dreidel',
        itemId: item.id,
        quantity: woodQty,
        includedQty: woodQty,
        unitCents: 0,
        label: item.name,
      });
    }
  }

  for (const d of craftAssignments) {
    const item = resolveDreidelKindItem(catalog, rows, d.kind);
    const child = paired[d.kidIndex]?.child;
    if (item && child) pushLineItem(lineItems, d.kind, item, child.id);
  }

  const geltSlot = geltSlotForSize(outline.gelt.size);
  const gelt = resolveSlotItem(catalog, rows, geltSlot);
  if (gelt) {
    const geltQty = Math.max(1, outline.gelt.quantity);
    lineItems.push({
      slotId: geltSlot,
      itemId: gelt.id,
      quantity: geltQty,
      includedQty: geltQty,
      unitCents: 0,
      label: gelt.name,
    });
  }

  for (const foodSlot of outline.foodDefaults) {
    const item = resolveSlotItem(catalog, rows, foodSlot);
    if (item) pushLineItem(lineItems, foodSlot, item);
  }

  for (const p of paired) {
    const bookRow = resolveBookForAge(rows, p.age);
    const book = findById(catalog, bookRow?.id);
    if (book) pushLineItem(lineItems, 'story', book, p.child.id);
  }

  const wrap = resolveSlotItem(catalog, rows, outline.wrapDefault);
  if (wrap) pushLineItem(lineItems, outline.wrapDefault, wrap);

  for (const g of outline.gifts) {
    const giftRow = resolveGiftKind(rows, g.kind);
    const gift = findById(catalog, giftRow?.id);
    const child = paired[g.kidIndex]?.child;
    if (gift && child) pushLineItem(lineItems, 'gift', gift, child.id);
  }

  const traditionalCandles = resolveCandlesItem(catalog, rows, 'candles');
  const traditionalWood = resolveDreidelKindItem(catalog, rows, 'wood-dreidel');

  const deviations: ResolvedDeviation[] = [];
  for (const d of outline.deviations) {
    let toItem: CatalogItem | undefined;
    let fromItemId: string | undefined;
    let childId: string | undefined;
    let slotId = d.slotId;

    if (d.section === 'candles') {
      toItem = resolveCandlesItem(catalog, rows, d.toKind as CandlesKind);
      fromItemId = traditionalCandles?.id;
      slotId = 'candles';
    } else if (d.section === 'dreidel') {
      toItem = resolveDreidelKindItem(catalog, rows, d.toKind as DreidelKind);
      fromItemId =
        d.fromKind === 'wood-dreidel'
          ? traditionalWood?.id
          : resolveDreidelKindItem(catalog, rows, d.fromKind as DreidelKind)?.id;
      const child = d.kidIndex != null ? paired[d.kidIndex]?.child : undefined;
      childId = child?.id;
      slotId = childId ? `${d.toKind}-${childId}` : d.toKind;
    } else if (d.section === 'presents') {
      toItem = findById(catalog, resolveGiftKind(rows, d.toKind as GiftKindId)?.id);
      fromItemId = resolveGiftKind(rows, d.fromKind as GiftKindId)?.id;
      const child = d.kidIndex != null ? paired[d.kidIndex]?.child : undefined;
      childId = child?.id;
      slotId = childId ? `gift-${childId}` : 'gift';
    }

    if (!toItem) continue;
    deviations.push({
      section: d.section,
      slotId,
      fromKind: d.fromKind,
      toKind: d.toKind,
      fromItemId,
      toItemId: toItem.id,
      childId,
      kidIndex: d.kidIndex,
    });
  }

  return { lineItems, deviations, practice };
}

/**
 * Know-nothing default box from shared planners (`boxRules.ts`).
 * Resolves SKUs from the live catalog (Default slot tags when present, else name/slug).
 * Thin wrapper around `buildCuratedBox` at practice `'minimal'`.
 */
export function buildDefaultLineItems(
  catalog: CatalogItem[],
  children: ChildProfile[],
  _childInterests: string[] = [],
  adults?: number
): BoxLineItem[] {
  return buildCuratedBox(catalog, children, {
    practice: 'minimal',
    adults,
    childInterests: _childInterests,
  }).lineItems;
}

export function catalogSlotId(lineSlotId: string): string {
  const withoutExtra = lineSlotId.replace(/::x$/i, '');
  const match = withoutExtra.match(/^(story|gift|wood-dreidel|blank-dreidel|airdry-dreidel)-/);
  return match ? match[1] : withoutExtra;
}

/**
 * Household “1 per person” count for wood/airdry/blank dreidel and small gelt.
 * Prefer an existing free gelt line qty (same headcount), then explicit adults,
 * and only then `defaultAdults` (2) when adults are unknown.
 */
export function householdPracticeQty(
  kids: ChildProfile[] | { length: number },
  adults?: number,
  lineItems?: BoxLineItem[]
): number {
  const kidCount = kids.length;
  if (kidCount < 1) return Math.max(1, defaultAdults(adults));
  if (kidCount >= 5) return 1; // party gelt / special cases — callers usually skip

  if (lineItems?.length) {
    const geltFree = lineItems
      .filter((li) => {
        const base = catalogSlotId(li.slotId);
        return (
          (base === 'gelt' ||
            base === 'gelt-small' ||
            base === 'gelt-medium' ||
            base === 'gelt-party' ||
            base.startsWith('gelt')) &&
          !li.slotId.includes('::x') &&
          (li.unitCents ?? 0) === 0
        );
      })
      .reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
    if (geltFree >= kidCount) return geltFree;
  }

  if (adults != null && adults >= 0) return kidCount + adults;
  // Unknown adults: do not invent +2 when a coherent free wood qty already matches gelt-less kid+1 heuristics.
  return kidCount + defaultAdults(adults);
}

/**
 * True when free-adding this SKU into a vacant dreidel/gelt practice should use
 * full household qty (not a single unit).
 */
export function isHouseholdPracticeCatalogItem(item: {
  id: string;
  name?: string;
  slotId?: string;
  defaultSlot?: string;
}): boolean {
  const slot = `${item.defaultSlot ?? ''} ${item.slotId ?? ''} ${item.id} ${item.name ?? ''}`.toLowerCase();
  return (
    /wood.?dreidel|classic.?wooden.?dreidel/.test(slot) ||
    /airdry|clay.?dreidel/.test(slot) ||
    /blank.?dreidel|draw.?your.?own.?dreidel/.test(slot) ||
    /gelt/.test(slot)
  );
}

/**
 * Upgrade wood dreidel drafts to household qty (kids + adults).
 * Also converts paid overflow back into free units when free qty is short of the
 * household allotment (e.g. qty 3 with only 1 free + 2 paid after a low baseline).
 */
export function repairWoodDreidelHouseholdQty(
  lineItems: BoxLineItem[],
  kids: ChildProfile[],
  adults?: number
): { lineItems: BoxLineItem[]; dirty: boolean } {
  const kidCount = kids.length;
  if (kidCount < 1 || kidCount >= 5) return { lineItems, dirty: false };

  const woodLines = lineItems.filter((li) => catalogSlotId(li.slotId) === 'wood-dreidel');
  if (woodLines.length === 0) return { lineItems, dirty: false };

  const targetQty = householdPracticeQty(kids, adults, lineItems);
  const freeLines = woodLines.filter(
    (li) => !li.slotId.includes('::x') && (li.unitCents ?? 0) === 0
  );
  const paidLines = woodLines.filter(
    (li) => li.slotId.includes('::x') || (li.unitCents ?? 0) > 0
  );
  const freeQty = freeLines.reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
  const paidQty = paidLines.reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
  const totalQty = freeQty + paidQty;
  const persistedIncluded = freeLines.reduce(
    (s, li) => s + Math.max(0, li.includedQty ?? 0),
    0
  );

  // Already at (or above) household size — never inflate further via defaultAdults=2.
  if (freeQty >= targetQty && Math.max(freeQty, persistedIncluded) >= targetQty) {
    return { lineItems, dirty: false };
  }
  // Prefer gelt as SOT: if free wood already equals gelt headcount, leave it.
  if (lineItems.length) {
    const geltQty = householdPracticeQty(kids, adults != null ? adults : 0, lineItems);
    // When adults unknown, householdPracticeQty may still return kid+2; if free wood
    // matches gelt qty and gelt was used, stop.
    const geltFree = lineItems
      .filter((li) => {
        const base = catalogSlotId(li.slotId);
        return (
          (base.startsWith('gelt') || base === 'gelt') &&
          !li.slotId.includes('::x') &&
          (li.unitCents ?? 0) === 0
        );
      })
      .reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
    if (geltFree >= kidCount && freeQty === geltFree && paidQty === 0) {
      return { lineItems, dirty: false };
    }
    void geltQty;
  }

  // Legacy short seeds, or free allotment below household size with paid overflow.
  const looksLikeOldPerKidDefault =
    kidCount >= 2 &&
    woodLines.length === kidCount &&
    woodLines.every((li) => Math.max(1, li.quantity || 1) === 1) &&
    totalQty === kidCount;
  const looksLikeShortHousehold =
    freeLines.length === 1 &&
    freeQty < targetQty &&
    (Math.max(1, freeLines[0].includedQty ?? freeQty) === kidCount ||
      Math.max(1, freeLines[0].includedQty ?? freeQty) === 1 ||
      paidQty > 0);
  const needsPaidAbsorb = freeQty < targetQty && (paidQty > 0 || totalQty < targetQty);

  if (!looksLikeOldPerKidDefault && !looksLikeShortHousehold && !needsPaidAbsorb) {
    return { lineItems, dirty: false };
  }

  const template = freeLines[0] ?? paidLines[0] ?? woodLines[0]!;
  // Fill free allotment to household target; absorb paid overflow into free first.
  // Never grow past gelt headcount when gelt is present and adults were omitted.
  const geltCap = lineItems
    .filter((li) => {
      const base = catalogSlotId(li.slotId);
      return (
        (base.startsWith('gelt') || base === 'gelt') &&
        !li.slotId.includes('::x') &&
        (li.unitCents ?? 0) === 0
      );
    })
    .reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
  const cappedTarget =
    adults == null && geltCap >= kidCount ? Math.min(targetQty, geltCap) : targetQty;
  const seededFreeQty = Math.max(cappedTarget, freeQty);
  const consumedFromPaid = Math.min(paidQty, Math.max(0, seededFreeQty - freeQty));
  const paidLeft = paidQty - consumedFromPaid;

  const next = lineItems.filter((li) => catalogSlotId(li.slotId) !== 'wood-dreidel');
  next.push({
    slotId: 'wood-dreidel',
    itemId: template.itemId,
    quantity: seededFreeQty,
    includedQty: seededFreeQty,
    unitCents: 0,
    label: template.label,
  });
  if (paidLeft > 0) {
    next.push({
      slotId: 'wood-dreidel::x',
      itemId: template.itemId,
      quantity: paidLeft,
      unitCents: paidLines[0]?.unitCents && paidLines[0].unitCents > 0 ? paidLines[0].unitCents : 100,
      label: template.label,
    });
  }
  return { lineItems: next, dirty: true };
}

/**
 * Re-price books/gifts that were added as extras at $0 (old Add-more bug).
 * Leaves true per-kid `story-{childId}` / `gift-{childId}` lines alone, and never
 * touches practice defaults (wood dreidel, candles, gelt, food kits, etc.).
 */
export function repairExtraPerKidPricing(
  lineItems: BoxLineItem[],
  catalog: CatalogItem[]
): { lineItems: BoxLineItem[]; dirty: boolean } {
  let dirty = false;
  const byId = new Map(catalog.map((c) => [c.id, c]));
  /** Concrete practice slots — never reprice these as à la carte extras. */
  const practiceSlots = new Set([
    'wood-dreidel',
    'blank-dreidel',
    'airdry-dreidel',
    'candles',
    'latke-mix',
    'latke-kit',
    'sufganiyot-mix',
    'sufganiyot-kit',
    'applesauce',
    'gelt',
    'gelt-small',
    'gelt-medium',
    'gelt-party',
    'wrapping-paper',
    'wrapping',
    'pre-wrap',
  ]);
  const next = lineItems.map((li) => {
    if (li.unitCents > 0) return li;
    const base = catalogSlotId(li.slotId);
    if (practiceSlots.has(base)) return li;
    const isPerKidSlot =
      (base === 'story' || base === 'gift') &&
      (li.slotId.startsWith(`${base}-`) || !!li.childId);
    if (isPerKidSlot) return li;

    const item = byId.get(li.itemId);
    if (!item) return li;
    // Wood dreidel SKU even if the line slot was already mangled to addon-*.
    if (
      item.slotId === 'wood-dreidel' ||
      item.defaultSlot === 'wood-dreidel' ||
      /wood.*dreidel|classic.*wooden.*dreidel/i.test(`${item.id} ${item.name}`)
    ) {
      return li;
    }
    const tier = inferPricingTier(item);
    if (tier !== 'perKid' && li.slotId !== 'story' && li.slotId !== 'gift') return li;

    const cents = boxAddOnUnitCents(item);
    if (cents <= 0) return li;
    dirty = true;
    return {
      ...li,
      unitCents: cents,
      slotId: li.slotId.startsWith('addon-') ? li.slotId : `addon-${li.itemId}`,
      childId: undefined,
    };
  });
  return { lineItems: next, dirty };
}

/**
 * Keep free household wood as one included practice line (merge stray free copies /
 * restore SKUs wrongly rewritten to `addon-*`). Paid overflow (`::x` / unitCents > 0)
 * is preserved — extras beyond the included set are à la carte, same as gelt +.
 */
export function repairWoodDreidelIncluded(
  lineItems: BoxLineItem[],
  catalog?: CatalogItem[]
): { lineItems: BoxLineItem[]; dirty: boolean } {
  const byId = catalog ? new Map(catalog.map((c) => [c.id, c])) : undefined;
  const isWoodSku = (li: BoxLineItem): boolean => {
    if (catalogSlotId(li.slotId) === 'wood-dreidel') return true;
    const item = byId?.get(li.itemId);
    if (!item) {
      return /wood.*dreidel|classic.*wooden.*dreidel/i.test(`${li.itemId} ${li.label ?? ''}`);
    }
    return (
      item.slotId === 'wood-dreidel' ||
      item.defaultSlot === 'wood-dreidel' ||
      /wood.*dreidel|classic.*wooden.*dreidel/i.test(`${item.id} ${item.name}`)
    );
  };

  const woodFree: BoxLineItem[] = [];
  const woodPaid: BoxLineItem[] = [];
  const rest: BoxLineItem[] = [];
  for (const li of lineItems) {
    if (!isWoodSku(li)) {
      rest.push(li);
      continue;
    }
    if (li.slotId.includes('::x') || (li.unitCents ?? 0) > 0) {
      woodPaid.push(li);
      continue;
    }
    woodFree.push(li);
  }

  if (!woodFree.length) {
    return { lineItems, dirty: false };
  }

  const qty = woodFree.reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
  const includedQty = Math.max(
    qty,
    ...woodFree.map((li) => Math.max(0, li.includedQty ?? 0))
  );
  const needsMerge =
    woodFree.length > 1 ||
    woodFree.some((li) => catalogSlotId(li.slotId) !== 'wood-dreidel');
  if (!needsMerge) return { lineItems, dirty: false };

  const template = woodFree[0]!;
  return {
    dirty: true,
    lineItems: [
      ...rest,
      {
        ...template,
        slotId: 'wood-dreidel',
        quantity: qty,
        includedQty,
        unitCents: 0,
        childId: undefined,
      },
      ...woodPaid,
    ],
  };
}

export function totalCents(lineItems: BoxLineItem[], boxPriceCents = DEFAULT_BOX_PRICE_CENTS): number {
  return orderSubtotalCents(lineItems, boxPriceCents);
}

export { orderSubtotalCents, SHIPPING_FLAT_CENTS };

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Catalog / home rails — whole dollars, no cents (Figma 384:487). */
export function formatCatalogDollars(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

export { EXTRA_FLAT_CENTS, DEFAULT_BOX_PRICE_CENTS, chargeableLineTotal, inferPricingTier, unitCentsForTier };

/** Re-export age-band mapping for previews / docs. */
export { representativeAgeForBand, REPRESENTATIVE_AGE_BY_BAND } from './boxRules';
export type { IntakeAgeGroup } from './boxRules';
