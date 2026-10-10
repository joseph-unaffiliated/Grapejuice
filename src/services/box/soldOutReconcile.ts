import type { BoxLineItem, CatalogItem, ChildProfile, InventorySwapNotice } from '../../types/pilot';
import { isSoldOutForBoxes, plannerAgeOf, swapSoldOutLines } from './boxRules';
import { toRulesRow } from './buildDefaultBox';

const MAX_NOTICES = 10;

/** Every unit is held by a secured box, paid gift, or purchase. Drafts never count. */
export function isCatalogItemSoldOut(item: CatalogItem | undefined): boolean {
  return !!item && isSoldOutForBoxes(toRulesRow(item));
}

/**
 * Swap truly sold-out lines in an unsecured draft by the box rules (same as the server's
 * inventory watch), for boxes the server can't see or hasn't reached yet. Returns the
 * same `lines` array when nothing changed.
 */
export function reconcileSoldOutLines(
  lines: BoxLineItem[],
  catalog: CatalogItem[],
  children: ChildProfile[]
): { lines: BoxLineItem[]; notices: InventorySwapNotice[] } {
  if (!catalog.length || !lines.length) return { lines, notices: [] };
  const rows = catalog.map(toRulesRow);
  const ages = new Map(children.map((c) => [c.id, plannerAgeOf(c)]));
  const result = swapSoldOutLines(lines, rows, (id) => (id ? ages.get(id) : undefined));
  if (!result.swaps.length) return { lines, notices: [] };
  const name = (id: string | null) => (id ? catalog.find((c) => c.id === id)?.name ?? id : null);
  const at = new Date().toISOString();
  return {
    lines: result.lines,
    notices: result.swaps.map((s) => ({
      fromItemId: s.fromItemId,
      fromName: name(s.fromItemId) ?? s.fromItemId,
      toItemId: s.toItemId,
      toName: name(s.toItemId),
      at,
    })),
  };
}

export function mergeSwapNotices(prior: InventorySwapNotice[], added: InventorySwapNotice[]): InventorySwapNotice[] {
  if (!added.length) return prior;
  const fresh = new Set(added.map((n) => n.fromItemId));
  return [...prior.filter((n) => !fresh.has(n.fromItemId)), ...added].slice(-MAX_NOTICES);
}

/** "The Lego Menorah sold out, so we swapped in X." */
export function swapNoticeText(n: InventorySwapNotice): string {
  const from = displayName(n.fromName);
  if (!n.toName) return `The ${from} sold out, so we took it out of your box.`;
  return `The ${from} sold out, so we swapped in the ${displayName(n.toName)}.`;
}

/** Catalog names carry quotes for brand words ("Lego" Menorah); emails and notes drop them. */
export function displayName(name: string): string {
  return name.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
}
