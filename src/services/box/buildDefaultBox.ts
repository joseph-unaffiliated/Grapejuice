import type { AgeGroup, BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
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

const BASE_SLOTS = ['candles', 'gelt', 'wrapping', 'playlist', 'lyrics'] as const;
const TREAT_SLOTS = [
  'latke-kit',
  'latke-recipe-media',
  'latke-recipe-printed',
  'sufganiyot-kit',
  'sufganiyot-recipe-media',
  'sufganiyot-recipe-printed',
] as const;
const INCLUDED_KEEPSAKE_SLOTS = ['recipe-binder', 'storage-box'] as const;

function interestScore(item: CatalogItem, interests: ChildInterestId[]): number {
  if (!interests.length) return 0;
  const id = item.id.toLowerCase();
  const slot = item.slotId.toLowerCase();
  const name = item.name.toLowerCase();
  let score = 0;
  if (interests.includes('reading') && (slot.startsWith('story') || name.includes('book'))) score += 3;
  if (interests.includes('crafts') && (id.includes('craft') || name.includes('craft') || name.includes('make your own'))) score += 3;
  if (interests.includes('games') && (slot.includes('dreidel') || slot === 'gelt' || name.includes('dreidel') || name.includes('gelt'))) score += 3;
  if (interests.includes('cooking') && (slot.includes('latke') || slot.includes('sufganiyot') || name.includes('latke') || name.includes('sufganiyot'))) score += 3;
  return score;
}

function pickForSlot(
  items: CatalogItem[],
  slotId: string,
  ageGroup?: AgeGroup,
  interests: ChildInterestId[] = []
): CatalogItem | undefined {
  const pool = items.filter((i) => i.slotId === slotId && !ALA_CARTE_SLOT_IDS.has(i.slotId));
  if (!pool.length) return undefined;
  let candidates = pool;
  if (ageGroup) {
    const ageEligible = pool.filter((i) => i.ageGroups.includes(ageGroup));
    if (ageEligible.length) candidates = ageEligible;
  }
  if (interests.length) {
    const scored = [...candidates].sort((a, b) => interestScore(b, interests) - interestScore(a, interests));
    if (interestScore(scored[0], interests) > 0) return scored[0];
  }
  if (ageGroup) {
    return (
      candidates.find((i) => i.defaultFor.includes(ageGroup)) ??
      candidates.find((i) => i.defaultFor.length === 0) ??
      candidates[0]
    );
  }
  return candidates.find((i) => i.defaultFor.length > 0) ?? candidates.find((i) => i.defaultFor.length === 0) ?? candidates[0];
}

function pushLineItem(lineItems: BoxLineItem[], slotId: string, item: CatalogItem, childId?: string) {
  const tier = inferPricingTier(item);
  lineItems.push({
    slotId: childId ? `${slotId}-${childId}` : slotId,
    itemId: item.id,
    quantity: 1,
    unitCents: unitCentsForTier(tier, item.dollarCostCents),
    childId,
    label: item.name,
  });
}

function pushLineItemById(lineItems: BoxLineItem[], catalog: CatalogItem[], itemId: string, fallbackSlotId: string) {
  const item = catalog.find((c) => c.id === itemId);
  if (!item) return;
  pushLineItem(lineItems, item.slotId || fallbackSlotId, item);
}

export function buildDefaultLineItems(
  catalog: CatalogItem[],
  children: ChildProfile[],
  childInterests: ChildInterestId[] = []
): BoxLineItem[] {
  const lineItems: BoxLineItem[] = [];

  for (const slotId of [...BASE_SLOTS, ...TREAT_SLOTS, ...INCLUDED_KEEPSAKE_SLOTS]) {
    const item = pickForSlot(catalog, slotId);
    if (item) pushLineItem(lineItems, slotId, item);
  }

  // Backward-compatible fallback for older seeded catalogs that still use merged treat slots.
  if (!lineItems.some((li) => li.slotId === 'latke-kit')) {
    pushLineItemById(lineItems, catalog, 'latke-mix', 'latke-kit');
  }
  if (!lineItems.some((li) => li.slotId === 'sufganiyot-kit')) {
    pushLineItemById(lineItems, catalog, 'sufganiyot-kit', 'sufganiyot-kit');
  }
  if (!lineItems.some((li) => li.slotId === 'sufganiyot-recipe-media')) {
    pushLineItemById(lineItems, catalog, 'sufganiyot-recipe-media', 'sufganiyot-recipe-media');
  }
  if (!lineItems.some((li) => li.slotId === 'sufganiyot-recipe-printed')) {
    pushLineItemById(lineItems, catalog, 'sufganiyot-recipe-printed', 'sufganiyot-recipe-printed');
  }

  for (const child of children) {
    const story = pickForSlot(catalog, 'story', child.ageGroup, childInterests);
    if (story) pushLineItem(lineItems, 'story', story, child.id);

    const gift = pickForSlot(catalog, 'gift', child.ageGroup, childInterests);
    if (gift) pushLineItem(lineItems, 'gift', gift, child.id);
  }

  return lineItems;
}

export function catalogSlotId(lineSlotId: string): string {
  const match = lineSlotId.match(/^(story|gift)-/);
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
