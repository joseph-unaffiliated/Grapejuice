import type { BoxLineItem, CatalogItem, RavDraftAction } from '../../types/pilot';
import { boxAddOnUnitCents, extraUnitCents } from '../box/pricing';
import { swapUnitCents } from '../box/swapPricing';
import { geltSizeOf, geltSwapQuantity, isGeltSwapUp, type GeltSize } from '../box/boxRules';
import { displaySectionForCatalogItem } from '../../constants/boxDisplaySections';
import { includedPracticeSlotVacant } from '../../components/box/boxLineDisplay';

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
        const fromGelt = sourceItem ? geltSizeOf(sourceItem) : null;
        const toGelt = geltSizeOf(item);
        if (fromGelt && toGelt) {
          // Free gelt swaps stay at or under the biggest included bag and keep the same chocolate.
          if (isGeltSwapUp(fromGelt, toGelt, options?.geltCeiling)) {
            skipped.push(action);
            continue;
          }
          const qty = geltSwapQuantity(fromGelt, toGelt, existing.quantity ?? 1, options?.geltHeadcount ?? 1);
          next[idx] = { ...catalogLine(item, existing.slotId, existing.childId, 0), quantity: qty, includedQty: qty };
        } else {
          const unit = swapUnitCents(existing, sourceItem, item, { catalog, geltCeiling: options?.geltCeiling });
          // Not an included swap: Rav adds it on top and the included item stays.
          if (unit === undefined) next.push(catalogLine(item, `addon-${item.id}`, undefined, addUnitCents(item, next)));
          else next[idx] = catalogLine(item, existing.slotId, existing.childId, unit);
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
      if (next.some((li) => li.itemId === item.id)) {
        skipped.push(action);
        continue;
      }
      const slotId = action.slotId ?? item.slotId ?? `extra-${item.id}`;
      const childId = action.childId;
      const newSlot = childId && !slotId.includes(childId) ? `${slotId}-${childId}` : slotId;
      next.push(catalogLine(item, newSlot, childId, addUnitCents(item, next)));
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
      return `${li.slotId}:${li.itemId ?? li.label}${qty}${kid}`;
    })
    .join('; ');
}
