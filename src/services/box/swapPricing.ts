/**
 * One price rule for every swap entry point (My Box, mobile sheet, PDP, storefront, modal, Rav).
 *
 * A free (included) line only swaps to something its slot includes — a kid's present slot to
 * the included presents, a story slot to any book, gelt to gelt up to the household allowance,
 * and the rest by the section's boxRules. Anything else is not a swap: it's an add-on on top
 * at its own price, and the included item stays. A paid extra swaps at the target's price.
 */

import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { isGiftSlotLine } from '../../components/box/boxLineDisplay';
import {
  displaySectionForLineItem,
  displaySectionForSlotId,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { geltSizeOf, isGeltSwapUp, type GeltSize } from './boxRules';
import { extraUnitCents } from './pricing';
import {
  isBookishCatalogItem,
  isStuffieCatalogItem,
  resolveFreeSwapUnitCents,
  resolveIncludedGiftOptions,
} from './sectionUpsells';

export type SwapLine = Pick<BoxLineItem, 'slotId' | 'itemId'> & Partial<BoxLineItem>;

export type SwapPricingContext = {
  catalog: CatalogItem[];
  /** Household's biggest included gelt bag (`geltCeilingForPeople`). */
  geltCeiling?: GeltSize;
};

function isBook(item: CatalogItem): boolean {
  return isBookishCatalogItem(item) && !isStuffieCatalogItem(item);
}

/** Section whose rules govern the slot — by slot id first, so gelt in a food slot prices as food. */
export function swapSectionForLine(line: SwapLine, sourceItem?: CatalogItem | null): BoxDisplaySectionId {
  return displaySectionForSlotId(line.slotId) ?? displaySectionForLineItem(line as BoxLineItem, sourceItem);
}

/** True when `target` can take `line`'s place for free. Ignores the line's own price. */
export function isIncludedSwap(
  line: SwapLine,
  sourceItem: CatalogItem | undefined | null,
  target: CatalogItem,
  ctx: SwapPricingContext
): boolean {
  if (!sourceItem || sourceItem.id === target.id) return false;
  if (isGiftSlotLine(line as BoxLineItem)) {
    return resolveIncludedGiftOptions(ctx.catalog, undefined, ctx.catalog.length).some((o) => o.id === target.id);
  }
  const section = swapSectionForLine(line, sourceItem);
  if (section === 'story' || isBook(sourceItem)) return section === 'story' && isBook(target);
  // Books and stuffies only fill story and present slots.
  if (isBookishCatalogItem(target)) return false;
  const from = geltSizeOf(sourceItem);
  const to = geltSizeOf(target);
  if (from && to) return !isGeltSwapUp(from, to, ctx.geltCeiling);
  return resolveFreeSwapUnitCents(sourceItem, target, section) === 0;
}

/**
 * Per-unit price after swapping `target` into `line`: 0 for an included swap, the target's
 * price when `line` is a paid extra, and `undefined` when a free line can't swap to it —
 * callers add it on top instead.
 */
export function swapUnitCents(
  line: SwapLine,
  sourceItem: CatalogItem | undefined | null,
  target: CatalogItem,
  ctx: SwapPricingContext
): number | undefined {
  if (!sourceItem || sourceItem.id === target.id) return undefined;
  if ((line.unitCents ?? 0) > 0) return extraUnitCents(target);
  return isIncludedSwap(line, sourceItem, target, ctx) ? 0 : undefined;
}

/** `options` narrowed to what a free `line` can swap to; a paid line keeps them all. */
export function swapOptionsForLine(
  line: SwapLine,
  sourceItem: CatalogItem | undefined | null,
  options: CatalogItem[],
  ctx: SwapPricingContext
): CatalogItem[] {
  if ((line.unitCents ?? 0) > 0) return options;
  return options.filter((o) => isIncludedSwap(line, sourceItem, o, ctx));
}
