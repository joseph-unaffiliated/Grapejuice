import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
import type { ChildInterestId } from '../../constants/childInterests';
import {
  ALA_CARTE_SLOT_IDS,
  inferPricingTier,
  unitCentsForTier,
  chargeableLineTotal,
  orderSubtotalCents,
  SHIPPING_FLAT_CENTS,
  DEFAULT_BOX_PRICE_CENTS,
  EXTRA_FLAT_CENTS,
} from './pricing';
import {
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
  _childInterests: ChildInterestId[] = []
): BoxLineItem[] {
  const lineItems: BoxLineItem[] = [];
  if (!catalog.length) return lineItems;

  const paired = kidsFromChildren(children.length ? children : [{ id: 'preview-0', ageGroup: '3-5' }]);
  const outline = planKnowNothingOutline({
    kids: paired.map((p) => ({ age: p.age })),
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

  for (const d of outline.dreidels) {
    const item = resolveSlotItem(catalog, rows, d.kind);
    const child = paired[d.kidIndex]?.child;
    if (item && child) pushLineItem(lineItems, d.kind, item, child.id);
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
