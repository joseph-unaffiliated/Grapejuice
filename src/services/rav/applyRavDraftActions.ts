import type { BoxLineItem, CatalogItem, RavDraftAction } from '../../types/pilot';
import { boxAddOnUnitCents, extraUnitCents } from '../box/pricing';
import { geltAddFitsAllowance, swapQuantities, swapUnitCents } from '../box/swapPricing';
import { geltSizeOf, type GeltSize } from '../box/boxRules';
import { foodAddPlacement } from '../box/foodAdd';
import { foodSlotQuantity } from '../box/includedAudit';
import { isIncludedFoodSlotOption } from '../box/sectionUpsells';
import { displaySectionForCatalogItem } from '../../constants/boxDisplaySections';
import { includedPracticeSlotVacant, uniqueSlotForFreeSectionAdd } from '../../components/box/boxLineDisplay';

export type ApplyRavActionsResult = {
  lineItems: BoxLineItem[];
  applied: RavDraftAction[];
  skipped: RavDraftAction[];
};

function catalogLine(
  item: CatalogItem,
  slotId: string,
  childId?: string,
  unitCentsOverride?: number
): BoxLineItem {
  return {
    slotId,
    itemId: item.id,
    quantity: 1,
    unitCents: unitCentsOverride ?? boxAddOnUnitCents(item),
    childId,
    label: item.name,
  };
}

/** An added item is free only when it fills its practice's empty included slot. */
function addUnitCents(item: CatalogItem, lineItems: BoxLineItem[]): number {
  const unit = boxAddOnUnitCents(item);
  if (unit > 0) return unit;
  return includedPracticeSlotVacant(displaySectionForCatalogItem(item), lineItems) ? 0 : extraUnitCents(item);
}

function findLineIndex(lineItems: BoxLineItem[], slotId?: string, itemId?: string): number {
  if (slotId) {
    const idx = lineItems.findIndex(
      (li) => li.slotId === slotId || li.slotId.startsWith(`${slotId}-`)
    );
    if (idx >= 0) return idx;
  }
  if (itemId) return lineItems.findIndex((li) => li.itemId === itemId);
  return -1;
}

export type ApplyRavActionsOptions = {
  locked?: boolean;
  /** People a party bag of gelt covers (kids + adults); sizes gelt swaps. */
  geltHeadcount?: number;
  /** Household's default gelt bag; Rav may restore up to it but never past it. */
  geltCeiling?: GeltSize;
};

/** Apply Rav-returned draft mutations locally (never checkout). */
export function applyRavDraftActions(
  actions: RavDraftAction[] | undefined,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[],
  options?: ApplyRavActionsOptions
): ApplyRavActionsResult {
  if (!actions?.length || options?.locked) {
    return { lineItems, applied: [], skipped: options?.locked ? actions ?? [] : [] };
  }

  let next = [...lineItems];
  const applied: RavDraftAction[] = [];
  const skipped: RavDraftAction[] = [];

  for (const action of actions) {
    const item = catalog.find((c) => c.id === action.itemId);

    if (action.type === 'remove') {
      const before = next.length;
      next = next.filter((li) => {
        if (action.itemId && li.itemId === action.itemId) return false;
        if (action.slotId && (li.slotId === action.slotId || li.slotId.startsWith(`${action.slotId}-`))) {
          return false;
        }
        return true;
      });
      if (next.length < before) applied.push(action);
      else skipped.push(action);
      continue;
    }

    if (!item || (typeof item.boxStockLeft === 'number' && item.boxStockLeft <= 0)) {
      skipped.push(action);
      continue;
    }

    if (action.type === 'swap') {
      const slotId = action.slotId ?? item.slotId;
      if (!slotId) {
        skipped.push(action);
        continue;
      }
      const idx = findLineIndex(next, slotId, action.itemId);
      if (idx >= 0) {
        const existing = next[idx];
        const sourceItem = catalog.find((c) => c.id === existing.itemId);
        const unit = swapUnitCents(existing, sourceItem, item, { catalog, geltCeiling: options?.geltCeiling });
        if (unit === undefined) {
          // Not an included swap: Rav adds it on top and the included item stays.
          next.push(catalogLine(item, `addon-${item.id}`, undefined, addUnitCents(item, next)));
        } else {
          // Gelt keeps the same chocolate; a food slot holds one kit, one Big Bag or three Little Bags.
          const q = swapQuantities(existing, sourceItem, item, options?.geltHeadcount ?? 1);
          next[idx] = {
            ...catalogLine(item, existing.slotId, existing.childId, unit),
            ...(q ? { quantity: q.quantity, ...(unit === 0 ? { includedQty: q.quantity } : {}) } : {}),
          };
        }
      } else {
        const childId = action.childId;
        const newSlot = childId ? `${slotId}-${childId}` : slotId;
        next.push(catalogLine(item, newSlot, childId, addUnitCents(item, next)));
      }
      applied.push(action);
      continue;
    }

    if (action.type === 'add') {
      // An empty food slot takes any food-slot option free, even a second of the same kit.
      if (isIncludedFoodSlotOption(item) && includedPracticeSlotVacant('food', next)) {
        const placed = foodAddPlacement(item, next);
        const quantity = placed?.quantity ?? foodSlotQuantity(item);
        next.push({
          ...catalogLine(item, placed?.slotId ?? uniqueSlotForFreeSectionAdd('food', item, next), undefined, 0),
          quantity,
          includedQty: quantity,
        });
        applied.push(action);
        continue;
      }
      if (next.some((li) => li.itemId === item.id)) {
        skipped.push(action);
        continue;
      }
      const unit = geltSizeOf(item)
        ? geltAddFitsAllowance(item, {
            catalog,
            lineItems: next,
            people: options?.geltHeadcount ?? 1,
            wrapSelectedCount: 0,
          })
          ? 0
          : extraUnitCents(item)
        : addUnitCents(item, next);
      const foodPaid = isIncludedFoodSlotOption(item) && unit > 0;
      const slotId = foodPaid ? `addon-${item.id}` : action.slotId ?? item.slotId ?? `extra-${item.id}`;
      const childId = action.childId;
      const newSlot = !foodPaid && childId && !slotId.includes(childId) ? `${slotId}-${childId}` : slotId;
      next.push(catalogLine(item, newSlot, childId, unit));
      applied.push(action);
      continue;
    }

    skipped.push(action);
  }

  return { lineItems: next, applied, skipped };
}

/** Summarize draft for Rav context (client → callable). */
export function summarizeLineItemsForRav(lineItems: BoxLineItem[]): string {
  if (!lineItems.length) return 'empty';
  return lineItems
    .map((li) => {
      const qty = li.quantity > 1 ? ` ×${li.quantity}` : '';
      const kid = li.childId ? ` [child:${li.childId}]` : '';
      const price = (li.unitCents ?? 0) > 0 ? ` (paid $${(li.unitCents / 100).toFixed(0)} each)` : ' (included)';
      return `${li.slotId}:${li.itemId ?? li.label}${qty}${kid}${price}`;
    })
    .join('; ');
}
