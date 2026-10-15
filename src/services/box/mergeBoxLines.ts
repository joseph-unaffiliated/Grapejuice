import type { BoxLineItem } from '../../types/pilot';

function lineKey(li: BoxLineItem): string {
  const entries = Object.entries(li).filter(([, v]) => v !== undefined);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

function bySlot(lines: BoxLineItem[]): Map<string, BoxLineItem> {
  return new Map(lines.map((li) => [li.slotId, li]));
}

/**
 * Apply only the slots this tab changed (`base` → `mine`) on top of what the server has now
 * (`theirs`), so a repair or another tab's edit isn't overwritten by a stale copy. A slot both
 * sides changed takes this tab's version.
 */
export function mergeBoxLines(base: BoxLineItem[], mine: BoxLineItem[], theirs: BoxLineItem[]): BoxLineItem[] {
  const b = bySlot(base);
  const m = bySlot(mine);
  const changed = (slotId: string) => {
    const was = b.get(slotId);
    const now = m.get(slotId);
    if (!was || !now) return !!was !== !!now;
    return lineKey(was) !== lineKey(now);
  };
  const out: BoxLineItem[] = [];
  const seen = new Set<string>();
  for (const li of theirs) {
    seen.add(li.slotId);
    if (!changed(li.slotId)) {
      out.push(li);
      continue;
    }
    const now = m.get(li.slotId);
    if (now) out.push(now);
  }
  for (const li of mine) {
    if (!seen.has(li.slotId) && changed(li.slotId)) out.push(li);
  }
  return out;
}

export function sameBoxLines(a: BoxLineItem[], b: BoxLineItem[]): boolean {
  return a.length === b.length && a.every((li, i) => lineKey(li) === lineKey(b[i]!));
}
