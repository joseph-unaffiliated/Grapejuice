import type { BoxLineItem, CatalogItem, RavDraftAction } from '../../types/pilot';
import { boxAddOnUnitCents } from '../box/pricing';
import { resolveFreeSwapUnitCents } from '../box/sectionUpsells';
import { displaySectionForCatalogItem } from '../../constants/boxDisplaySections';

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

/**
 * Price for a Rav-driven `'swap'` action. `'included'`-policy targets (per boxRules)
 * stay $0 even when the catalog's own pricing tier says otherwise; `'extra'`-policy /
 * undocumented targets fall back to the standard add-on price.
 */
function swapUnitCents(sourceItem: CatalogItem | undefined, targetItem: CatalogItem): number {
  const sectionId = sourceItem ? displaySectionForCatalogItem(sourceItem) : displaySectionForCatalogItem(targetItem);
  return resolveFreeSwapUnitCents(sourceItem, targetItem, sectionId) ?? boxAddOnUnitCents(targetItem);
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

    if (!item) {
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
        next[idx] = catalogLine(item, existing.slotId, existing.childId, swapUnitCents(sourceItem, item));
      } else {
        const childId = action.childId;
        const newSlot = childId ? `${slotId}-${childId}` : slotId;
        next.push(catalogLine(item, newSlot, childId));
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
      next.push(catalogLine(item, newSlot, childId));
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
