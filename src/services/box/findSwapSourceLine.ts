/**
 * Resolve which box line a catalog SKU can replace.
 * Only true swap-graph matches (swapOptions / boxRules kinds / same slot) —
 * not broad same-section peers — so product CTAs don't offer Swap for add-ons.
 *
 * Mirrors My Box's per-line swap shelf exactly: an item is "swap in"-able only if
 * it appears in some line's swap options. Per-kid gift lines swap among the
 * included gift set, so a gift-slot Lego menorah never makes other menorahs swappable.
 *
 * When `withinSection` is set (modal opened from a My Box practice section),
 * only lines in that display section are candidates — e.g. a plush opened from
 * Light the Candles cannot swap a menorah, but may swap from Play Dreidel.
 */

import { isBookishCatalogItem, resolveIncludedGiftOptions, resolveSwapOptionsForItem } from './sectionUpsells';
import { isGiftSlotLine } from '../../components/box/boxLineDisplay';
import {
  displaySectionForLineItem,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import type { GeltSize } from './boxRules';

export type SwapSourceOptions = {
  /** Household's default gelt bag; a free gelt swap never goes bigger. */
  geltCeiling?: GeltSize;
};

/** What a box line can be swapped for — same sets My Box shows on the line's Swap shelf. */
function swapOptionsForLine(
  li: BoxLineItem,
  current: CatalogItem,
  catalog: CatalogItem[],
  opts?: SwapSourceOptions
): CatalogItem[] {
  if (isGiftSlotLine(li)) return resolveIncludedGiftOptions(catalog, li.itemId, 48);
  return resolveSwapOptionsForItem(current, catalog, 48, { includeSectionPeers: false, geltCeiling: opts?.geltCeiling });
}

/**
 * Box lines this item can replace (lowest unitCents first).
 */
export function findSwapSourceLines(
  item: CatalogItem,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[],
  withinSection?: BoxDisplaySectionId | null,
  opts?: SwapSourceOptions
): BoxLineItem[] {
  const matches: BoxLineItem[] = [];

  for (const li of lineItems) {
    if (li.itemId === item.id) continue;
    // Paid extras aren't swapped laterally (same rule as My Box cards).
    if ((li.unitCents ?? 0) > 0) continue;
    const current = catalog.find((c) => c.id === li.itemId);
    if (!current) continue;
    if (withinSection) {
      if (displaySectionForLineItem(li, current) !== withinSection) continue;
    }
    if (swapOptionsForLine(li, current, catalog, opts).some((o) => o.id === item.id)) {
      matches.push(li);
    }
  }

  if (!matches.length) {
    const book = includedBookLine(item, lineItems, catalog, withinSection);
    if (book) matches.push(book);
  }

  matches.sort((a, b) => (a.unitCents ?? 0) - (b.unitCents ?? 0));
  return matches;
}

/** Any other included book can be swapped for this one. Books aren't in the slot swap graph. */
function includedBookLine(
  item: CatalogItem,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[],
  withinSection?: BoxDisplaySectionId | null
): BoxLineItem | null {
  if (withinSection && withinSection !== 'story') return null;
  if (!isBookishCatalogItem(item)) return null;
  for (const li of lineItems) {
    if (li.itemId === item.id) continue;
    if ((li.unitCents ?? 0) > 0) continue;
    const current = catalog.find((c) => c.id === li.itemId);
    if (!current || !isBookishCatalogItem(current)) continue;
    if (displaySectionForLineItem(li, current) !== 'story') continue;
    return li;
  }
  return null;
}

/**
 * Box line this item can replace, if any.
 * Prefers the lowest-priced matching line when several qualify.
 */
export function findSwapSourceLine(
  item: CatalogItem,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[],
  withinSection?: BoxDisplaySectionId | null,
  opts?: SwapSourceOptions
): BoxLineItem | null {
  return findSwapSourceLines(item, lineItems, catalog, withinSection, opts)[0] ?? null;
}
