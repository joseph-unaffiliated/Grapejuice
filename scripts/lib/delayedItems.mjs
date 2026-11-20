/**
 * Catalog items that are delayed and ship on a separate label. Used by the ShipStation split
 * script and by the packing slips, so both agree on which lines leave the box.
 */
export const DELAYED_ITEM_IDS = new Set([
  "toddler-play-menorah",
  "solid-brass-dreidel",
  "slipcast-dreidel",
]);

export function isDelayedItemId(itemId) {
  return typeof itemId === "string" && DELAYED_ITEM_IDS.has(itemId);
}
