/**
 * Pure helpers for box history (boxHistory.ts): normalize box lines and describe what changed
 * between two versions of a box.
 */

export type HistoryLine = {
  slotId: string;
  itemId: string;
  quantity: number;
  includedQty?: number;
  unitCents: number;
  childId?: string;
  curationNote?: string;
};

export type BoxChange =
  | { type: 'swap'; slotId: string; toSlotId?: string; childId?: string; fromItemId: string; toItemId: string; fromQty: number; toQty: number; fromUnitCents: number; toUnitCents: number }
  | { type: 'add'; slotId: string; childId?: string; itemId: string; qty: number; unitCents: number }
  | { type: 'remove'; slotId: string; childId?: string; itemId: string; qty: number; unitCents: number }
  | { type: 'quantity'; slotId: string; childId?: string; itemId: string; fromQty: number; toQty: number; fromUnitCents: number; toUnitCents: number };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function historyLines(raw: unknown): HistoryLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l) => {
    if (!isRecord(l) || typeof l.slotId !== 'string' || typeof l.itemId !== 'string' || !l.itemId) return [];
    const line: HistoryLine = {
      slotId: l.slotId,
      itemId: l.itemId,
      quantity: num(l.quantity, 1),
      unitCents: num(l.unitCents, 0),
    };
    if (typeof l.includedQty === 'number') line.includedQty = l.includedQty;
    if (typeof l.childId === 'string' && l.childId) line.childId = l.childId;
    if (typeof l.curationNote === 'string' && l.curationNote) line.curationNote = l.curationNote;
    return [line];
  });
}

/**
 * Line-level changes, keyed by slot. A removed and an added line for the same kid (or both
 * household-wide) count as one swap when that pairing is unambiguous — swaps can move a line
 * to a new slot id (e.g. wood dreidel → a craft kit's slot).
 */
export function diffBoxLines(before: HistoryLine[], after: HistoryLine[]): BoxChange[] {
  const prev = new Map(before.map((l) => [l.slotId, l]));
  const next = new Map(after.map((l) => [l.slotId, l]));
  const changes: BoxChange[] = [];
  const removed: HistoryLine[] = [];
  const added: HistoryLine[] = [];

  for (const [slotId, a] of prev) {
    const b = next.get(slotId);
    if (!b) {
      removed.push(a);
      continue;
    }
    if (a.itemId !== b.itemId) {
      changes.push({
        type: 'swap', slotId, childId: b.childId ?? a.childId, fromItemId: a.itemId, toItemId: b.itemId,
        fromQty: a.quantity, toQty: b.quantity, fromUnitCents: a.unitCents, toUnitCents: b.unitCents,
      });
    } else if (a.quantity !== b.quantity || a.unitCents !== b.unitCents) {
      changes.push({
        type: 'quantity', slotId, childId: b.childId, itemId: b.itemId,
        fromQty: a.quantity, toQty: b.quantity, fromUnitCents: a.unitCents, toUnitCents: b.unitCents,
      });
    }
  }
  for (const [slotId, b] of next) if (!prev.has(slotId)) added.push(b);

  const kidKey = (l: HistoryLine) => l.childId ?? '';
  const pairedAdds = new Set<HistoryLine>();
  for (const r of removed) {
    const sameKidRemoved = removed.filter((x) => kidKey(x) === kidKey(r));
    const candidates = added.filter((x) => !pairedAdds.has(x) && kidKey(x) === kidKey(r));
    if (sameKidRemoved.length === 1 && candidates.length === 1) {
      const b = candidates[0];
      pairedAdds.add(b);
      changes.push({
        type: 'swap', slotId: r.slotId, toSlotId: b.slotId, childId: b.childId ?? r.childId,
        fromItemId: r.itemId, toItemId: b.itemId, fromQty: r.quantity, toQty: b.quantity,
        fromUnitCents: r.unitCents, toUnitCents: b.unitCents,
      });
      continue;
    }
    changes.push({ type: 'remove', slotId: r.slotId, childId: r.childId, itemId: r.itemId, qty: r.quantity, unitCents: r.unitCents });
  }
  for (const b of added) {
    if (pairedAdds.has(b)) continue;
    changes.push({ type: 'add', slotId: b.slotId, childId: b.childId, itemId: b.itemId, qty: b.quantity, unitCents: b.unitCents });
  }
  return changes;
}

/** `history/default` per list: set the first time a box has lines, and again on every rebuild. */
export function nextDefault(
  existing: unknown,
  source: string,
  after: HistoryLine[]
): { lineItems: HistoryLine[]; source: string } | null {
  if (!after.length) return null;
  if (!isRecord(existing) || source === 'default-build') {
    return { lineItems: after, source: source === 'default-build' ? 'default-build' : `first-save:${source}` };
  }
  return null;
}

/** Firestore rejects `undefined` values. */
export function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
