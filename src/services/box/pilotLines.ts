import type { BoxLineItem } from '../../types/pilot';

/** Status line on a pilot pick's card in My Box. */
export const PILOT_PICK_META = 'Pilot pick · free';

/** Pilot Participants picks: $0 lines the family can't change or remove once they've joined. */
export function isPilotLine(li: Pick<BoxLineItem, 'program'> | null | undefined): boolean {
  return li?.program === 'pilot';
}

/**
 * `next` with the pilot lines from `prev` put back exactly as they were, for any edit that
 * dropped or changed them. Returns `next` itself when they're untouched.
 */
export function keepPilotLines(prev: BoxLineItem[], next: BoxLineItem[]): BoxLineItem[] {
  const pilot = prev.filter(isPilotLine);
  if (!pilot.length) return next;
  const nextPilot = next.filter(isPilotLine);
  const untouched =
    nextPilot.length === pilot.length &&
    pilot.every((p) => nextPilot.some((n) => n.slotId === p.slotId && n.itemId === p.itemId && n.quantity === p.quantity && n.unitCents === p.unitCents));
  if (untouched) return next;
  return [...next.filter((li) => !isPilotLine(li)), ...pilot];
}
