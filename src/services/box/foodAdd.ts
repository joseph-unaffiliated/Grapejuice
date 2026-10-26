import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { extraUnitCents } from './pricing';
import { foodSlotQuantity, nextVacantFoodSlotId } from './includedAudit';

/**
 * The latke kit and the sufganiyot kit are products. `latke-mix` and `sufganiyot-mix`
 * are the two spots they sit in. Adding a kit takes its own spot when that spot is
 * open, otherwise the other open spot, otherwise a paid add-on.
 */
const HOME_SLOT: Record<string, string> = {
  'latke-kit': 'latke-mix',
  'sufganiyot-kit': 'sufganiyot-mix',
};

export type FoodAddPlacement = {
  slotId: string;
  unitCents: number;
  includedQty: number;
  quantity: number;
};

export function foodAddPlacement(
  item: Pick<CatalogItem, 'id' | 'name' | 'memberPriceCents' | 'dollarCostCents'>,
  lineItems: Array<Pick<BoxLineItem, 'slotId'> & { unitCents?: number; quantity?: number }>
): FoodAddPlacement | null {
  const home = HOME_SLOT[item.id];
  if (!home) return null;
  const quantity = foodSlotQuantity(item);
  const used = new Set(lineItems.map((li) => li.slotId));
  const open = nextVacantFoodSlotId(lineItems);
  const slotId = open && !used.has(home) ? home : open;
  if (slotId && !used.has(slotId)) {
    return { slotId, unitCents: 0, includedQty: quantity, quantity };
  }
  return {
    slotId: `addon-${item.id}`,
    unitCents: extraUnitCents(item as CatalogItem),
    includedQty: 0,
    quantity: 1,
  };
}
