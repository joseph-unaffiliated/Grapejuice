import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
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
  planKnowNothingOutline,
  representativeAgeForBand,
  resolveBookForAge,
  resolveByDefaultSlot,
  resolveGiftKind,
  type BoxRulesCatalogRow,
  type DefaultSlotId,
  type IntakeAgeGroup,
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
    unitCents: 0,
    childId,
    label: item.name,
  });
}

/**
 * Know-nothing default box from shared planners (`boxRules.ts`).
 * Resolves SKUs from the live catalog (Default slot tags when present, else name/slug).
 */
export function buildDefaultLineItems(
  catalog: CatalogItem[],
  children: ChildProfile[],
  _childInterests: string[] = [],
  adults?: number
): BoxLineItem[] {
  const lineItems: BoxLineItem[] = [];
  if (!catalog.length) return lineItems;

  const paired = kidsFromChildren(children);
  const outline = planKnowNothingOutline({
    kids: paired.map((p) => ({ age: p.age })),
    adults,
  });
  const rows = catalog.map(toRulesRow);

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // Once per build — helps smoke-test section/line expectations.
    console.log('[box] know-nothing outline', {
      kids: outline.inputs.kids,
      adults: outline.inputs.adults,
      listCents: outline.listCents,
      gelt: outline.gelt,
      dreidels: outline.dreidels,
      gifts: outline.gifts,
      foodDefaults: outline.foodDefaults,
      wrapDefault: outline.wrapDefault,
      candlesDefault: outline.candlesDefault,
    });
  }

  const candles = resolveSlotItem(catalog, rows, 'candles');
  if (candles) pushLineItem(lineItems, 'candles', candles);

  // Under 5 kids → all wood: one household line at kids + adults (same share as gelt).
  // 5+ → mixed kinds stay one line per kid.
  const allWood =
    outline.dreidels.length > 0 &&
    outline.dreidels.every((d) => d.kind === 'wood-dreidel');
  if (allWood) {
    const item = resolveSlotItem(catalog, rows, 'wood-dreidel');
    if (item) {
      const kidCount = paired.length;
      const woodQty =
        kidCount <= 1
          ? Math.max(1, kidCount)
          : kidCount + defaultAdults(outline.inputs.adults);
      lineItems.push({
        slotId: 'wood-dreidel',
        itemId: item.id,
        quantity: woodQty,
        includedQty: woodQty,
        unitCents: 0,
        label: item.name,
      });
    }
  } else {
    for (const d of outline.dreidels) {
      const item = resolveSlotItem(catalog, rows, d.kind);
      const child = paired[d.kidIndex]?.child;
      if (item && child) pushLineItem(lineItems, d.kind, item, child.id);
    }
  }

  const geltSlot = geltSlotForSize(outline.gelt.size);
  const gelt = resolveSlotItem(catalog, rows, geltSlot);
  if (gelt) {
    // One line, quantity from planGelt (e.g. 2 kids + 2 adults → small ×4).
    // Do not use pushLineItem here — it hardcodes quantity: 1.
    const geltQty = Math.max(1, outline.gelt.quantity);
    const geltLine: BoxLineItem = {
      slotId: geltSlot,
      itemId: gelt.id,
      quantity: geltQty,
      includedQty: geltQty,
      unitCents: 0,
      label: gelt.name,
    };
    lineItems.push(geltLine);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[box] gelt line', geltLine);
    }
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

  return lineItems;
}

export function catalogSlotId(lineSlotId: string): string {
  const match = lineSlotId.match(/^(story|gift|wood-dreidel|blank-dreidel|airdry-dreidel)-/);
  return match ? match[1] : lineSlotId;
}

/**
 * Upgrade old “1 wood dreidel per kid” drafts to household qty (kids + adults)
 * when the box still looks like the previous know-nothing default.
 */
export function repairWoodDreidelHouseholdQty(
  lineItems: BoxLineItem[],
  kids: ChildProfile[],
  adults?: number
): { lineItems: BoxLineItem[]; dirty: boolean } {
  const kidCount = kids.length;
  if (kidCount < 2 || kidCount >= 5) return { lineItems, dirty: false };

  const woodLines = lineItems.filter((li) => catalogSlotId(li.slotId) === 'wood-dreidel');
  if (woodLines.length === 0) return { lineItems, dirty: false };

  const totalQty = woodLines.reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
  const targetQty = kidCount + defaultAdults(adults);
  if (totalQty >= targetQty) return { lineItems, dirty: false };

  // Old default: one qty-1 line per kid (or a single line already at kidCount).
  const looksLikeOldPerKidDefault =
    woodLines.length === kidCount &&
    woodLines.every((li) => Math.max(1, li.quantity || 1) === 1) &&
    totalQty === kidCount;
  const looksLikeShortHousehold =
    woodLines.length === 1 &&
    Math.max(1, woodLines[0].includedQty ?? woodLines[0].quantity ?? 1) === kidCount;

  if (!looksLikeOldPerKidDefault && !looksLikeShortHousehold) {
    return { lineItems, dirty: false };
  }

  const template = woodLines[0];
  const next = lineItems.filter((li) => catalogSlotId(li.slotId) !== 'wood-dreidel');
  next.push({
    slotId: 'wood-dreidel',
    itemId: template.itemId,
    quantity: targetQty,
    includedQty: targetQty,
    unitCents: 0,
    label: template.label,
  });
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
 * Classic wood dreidel practice lines are always included ($0).
 * Also restores SKUs that were wrongly rewritten to `addon-*` by older repairs,
 * merging any stray copies into a single household wood line.
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

  const wood: BoxLineItem[] = [];
  const rest: BoxLineItem[] = [];
  let droppedExtras = false;
  for (const li of lineItems) {
    if (!isWoodSku(li)) {
      rest.push(li);
      continue;
    }
    // Drop paid overflow units — household wood is included at the free qty.
    if (li.slotId.includes('::x')) {
      droppedExtras = true;
      continue;
    }
    wood.push(li);
  }
  if (!wood.length) {
    return droppedExtras ? { lineItems: rest, dirty: true } : { lineItems, dirty: false };
  }

  const qty = wood.reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
  const includedQty = Math.max(
    qty,
    ...wood.map((li) => Math.max(0, li.includedQty ?? 0))
  );
  const needsFix =
    droppedExtras ||
    wood.length > 1 ||
    wood.some((li) => li.unitCents > 0 || catalogSlotId(li.slotId) !== 'wood-dreidel');
  if (!needsFix) return { lineItems, dirty: false };

  const template = wood[0]!;
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
