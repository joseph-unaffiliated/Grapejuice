import type { BoxLineItem, CatalogItem, RavDraftAction } from '../../types/pilot';
import { inferPricingTier, unitCentsForTier } from '../box/pricing';

export type ApplyRavActionsResult = {
  lineItems: BoxLineItem[];
  applied: RavDraftAction[];
  skipped: RavDraftAction[];
};

function catalogLine(item: CatalogItem, slotId: string, childId?: string): BoxLineItem {
  const tier = inferPricingTier(item);
  return {
    slotId,
    itemId: item.id,
    quantity: 1,
    unitCents: unitCentsForTier(tier, item.dollarCostCents),
    childId,
    label: item.name,
  };
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
        next[idx] = catalogLine(item, existing.slotId, existing.childId);
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
