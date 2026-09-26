/**
 * Resolve which box line a catalog SKU can replace.
 * Only true swap-graph matches (swapOptions / boxRules kinds / same slot) —
 * not broad same-section peers — so product CTAs don't offer Swap for add-ons.
 *
 * When `withinSection` is set (modal opened from a My Box practice section),
 * only lines in that display section are candidates — e.g. a plush opened from
 * Light the Candles cannot swap a menorah, but may swap from Play Dreidel.
 */

import { resolveSwapOptionsForItem } from './sectionUpsells';
import {
  displaySectionForLineItem,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';

/**
 * Box lines this item can replace (lowest unitCents first).
 */
export function findSwapSourceLines(
  item: CatalogItem,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[],
  withinSection?: BoxDisplaySectionId | null
): BoxLineItem[] {
  const matches: BoxLineItem[] = [];

  for (const li of lineItems) {
    if (li.itemId === item.id) continue;
    const current = catalog.find((c) => c.id === li.itemId);
    if (!current) continue;
    if (withinSection) {
      if (displaySectionForLineItem(li, current) !== withinSection) continue;
    }
    const opts = resolveSwapOptionsForItem(current, catalog, 48, {
      includeSectionPeers: false,
    });
    if (opts.some((o) => o.id === item.id)) {
      matches.push(li);
    }
  }

  matches.sort((a, b) => (a.unitCents ?? 0) - (b.unitCents ?? 0));
  return matches;
}

/**
 * Box line this item can replace, if any.
 * Prefers the lowest-priced matching line when several qualify.
 */
export function findSwapSourceLine(
  item: CatalogItem,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[],
  withinSection?: BoxDisplaySectionId | null
): BoxLineItem | null {
  return findSwapSourceLines(item, lineItems, catalog, withinSection)[0] ?? null;
}
