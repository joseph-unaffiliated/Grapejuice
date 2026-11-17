/** How many of an item the comps list can still give out. */

export type CompAnchor = { remaining: number | null; held: number };

/**
 * `anchor` is a live count (from the stock counters) at a moment when comps held `anchor.held`.
 * Later assignments move the number from there. With no anchor, the dashboard figure stands,
 * because it may already include holds and subtracting them again would double-count.
 */
export function shownCompLeft(
  dashboardRemaining: number | null,
  heldNow: number,
  anchor: CompAnchor | undefined,
): number | null {
  if (!anchor) return dashboardRemaining;
  if (anchor.remaining == null) return null;
  return anchor.remaining - (heldNow - anchor.held);
}

/** A dashboard refresh has caught up when its figure is no higher than the live one. */
export function dashboardCaughtUp(
  dashboardRemaining: number,
  expectedRemaining: number,
): boolean {
  return dashboardRemaining <= expectedRemaining;
}
