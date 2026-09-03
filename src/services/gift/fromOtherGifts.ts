import {
  EXTRA_FLAT_CENTS,
  inferPricingTier,
  unitCentsForTier,
} from '../box/pricing';
import type { BoxLineItem, CatalogItem, ReceivedGift } from '../../types/pilot';

/** Price when adding an item from another gift into the primary gift box. */
export function unitCentsForGiftTransfer(item: CatalogItem): number {
  const tier = inferPricingTier(item);
  const priced = unitCentsForTier(tier, item.dollarCostCents ?? 0);
  // Included / per-kid lines become a paid add-on when transferred.
  return priced > 0 ? priced : EXTRA_FLAT_CENTS;
}

export function giftTransferLine(item: CatalogItem): BoxLineItem {
  return {
    slotId: item.slotId || 'addon',
    itemId: item.id,
    quantity: 1,
    unitCents: unitCentsForGiftTransfer(item),
    label: item.name,
  };
}

/** Items in other gifts that are not already in the primary box (by itemId). */
export function collectFromOtherGifts(
  primaryLineItemIds: Set<string> | string[],
  primaryGiftInviteId: string,
  allGifts: ReceivedGift[],
  catalogById: Map<string, CatalogItem>
): Array<{ item: CatalogItem; fromGiverName: string; giftInviteId: string }> {
  const inPrimary =
    primaryLineItemIds instanceof Set ? primaryLineItemIds : new Set(primaryLineItemIds);
  const seen = new Set<string>();
  const out: Array<{ item: CatalogItem; fromGiverName: string; giftInviteId: string }> = [];

  for (const gift of allGifts) {
    if (gift.giftInviteId === primaryGiftInviteId) continue;
    if (gift.kind !== 'box') continue;
    // Available or already converted — still show what they curated.
    if (gift.status !== 'available' && gift.status !== 'converted_to_credit') continue;
    for (const li of gift.lineItems ?? []) {
      if (!li.itemId || inPrimary.has(li.itemId) || seen.has(li.itemId)) continue;
      const item = catalogById.get(li.itemId);
      if (!item) continue;
      seen.add(li.itemId);
      out.push({
        item,
        fromGiverName: gift.giverName || 'another gift',
        giftInviteId: gift.giftInviteId,
      });
    }
  }
  return out;
}
