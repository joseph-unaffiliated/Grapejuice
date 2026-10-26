import { displaySectionForCatalogItem } from '../../constants/boxDisplaySections';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { foodAddPlacement } from './foodAdd';
import { boxAddOnUnitCents, inferPricingTier } from './pricing';

/**
 * Put a product the shopper picked before onboarding into the curated box.
 * Included practice items replace the default in that section. Everything else
 * is added on top, at the same price as "Add to box".
 */
export function foldItemIntoCuratedBox(
  items: BoxLineItem[],
  catalog: CatalogItem[],
  itemId: string | null | undefined
): BoxLineItem[] {
  if (!itemId) return items;
  const item = catalog.find((c) => c.id === itemId);
  if (!item) return items;
  if (items.some((li) => li.itemId === item.id)) return items;

  if (inferPricingTier(item) === 'included') {
    const section = displaySectionForCatalogItem(item);
    const idx = items.findIndex((li) => {
      if (li.childId || (li.unitCents ?? 0) > 0) return false;
      const src = catalog.find((c) => c.id === li.itemId);
      return !!src && displaySectionForCatalogItem(src) === section;
    });
    if (idx >= 0) {
      const next = items.slice();
      const prev = next[idx]!;
      next[idx] = {
        ...prev,
        itemId: item.id,
        label: item.name,
        unitCents: 0,
        quantity: Math.max(1, prev.quantity ?? 1),
      };
      return next;
    }
  }

  const food = foodAddPlacement(item, items);
  if (food) {
    return [
      ...items,
      {
        slotId: food.slotId,
        itemId: item.id,
        quantity: food.quantity,
        unitCents: food.unitCents,
        includedQty: food.includedQty,
        label: item.name,
        displaySectionId: 'food' as const,
      },
    ];
  }

  return [
    ...items,
    {
      slotId: item.slotId,
      itemId: item.id,
      quantity: 1,
      unitCents: boxAddOnUnitCents(item),
      label: item.name,
      displaySectionId: displaySectionForCatalogItem(item),
    },
  ];
}
