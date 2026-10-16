"use strict";
/**
 * Pure helpers for box history (boxHistory.ts): normalize box lines and describe what changed
 * between two versions of a box.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyLines = historyLines;
exports.diffBoxLines = diffBoxLines;
exports.nextDefault = nextDefault;
exports.withoutUndefined = withoutUndefined;
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
function historyLines(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw.flatMap((l) => {
        if (!isRecord(l) || typeof l.slotId !== 'string' || typeof l.itemId !== 'string' || !l.itemId)
            return [];
        const line = {
            slotId: l.slotId,
            itemId: l.itemId,
            quantity: num(l.quantity, 1),
            unitCents: num(l.unitCents, 0),
        };
        if (typeof l.includedQty === 'number')
            line.includedQty = l.includedQty;
        if (typeof l.childId === 'string' && l.childId)
            line.childId = l.childId;
        if (typeof l.curationNote === 'string' && l.curationNote)
            line.curationNote = l.curationNote;
        return [line];
    });
}
/**
 * Line-level changes, keyed by slot. A removed and an added line for the same kid (or both
 * household-wide) count as one swap when that pairing is unambiguous — swaps can move a line
 * to a new slot id (e.g. wood dreidel → a craft kit's slot).
 */
function diffBoxLines(before, after) {
    var _a, _b;
    const prev = new Map(before.map((l) => [l.slotId, l]));
    const next = new Map(after.map((l) => [l.slotId, l]));
    const changes = [];
    const removed = [];
    const added = [];
    for (const [slotId, a] of prev) {
        const b = next.get(slotId);
        if (!b) {
            removed.push(a);
            continue;
        }
        if (a.itemId !== b.itemId) {
            changes.push({
                type: 'swap', slotId, childId: (_a = b.childId) !== null && _a !== void 0 ? _a : a.childId, fromItemId: a.itemId, toItemId: b.itemId,
                fromQty: a.quantity, toQty: b.quantity, fromUnitCents: a.unitCents, toUnitCents: b.unitCents,
            });
        }
        else if (a.quantity !== b.quantity || a.unitCents !== b.unitCents) {
            changes.push({
                type: 'quantity', slotId, childId: b.childId, itemId: b.itemId,
                fromQty: a.quantity, toQty: b.quantity, fromUnitCents: a.unitCents, toUnitCents: b.unitCents,
            });
        }
    }
    for (const [slotId, b] of next)
        if (!prev.has(slotId))
            added.push(b);
    const kidKey = (l) => { var _a; return (_a = l.childId) !== null && _a !== void 0 ? _a : ''; };
    const pairedAdds = new Set();
    for (const r of removed) {
        const sameKidRemoved = removed.filter((x) => kidKey(x) === kidKey(r));
        const candidates = added.filter((x) => !pairedAdds.has(x) && kidKey(x) === kidKey(r));
        if (sameKidRemoved.length === 1 && candidates.length === 1) {
            const b = candidates[0];
            pairedAdds.add(b);
            changes.push({
                type: 'swap', slotId: r.slotId, toSlotId: b.slotId, childId: (_b = b.childId) !== null && _b !== void 0 ? _b : r.childId,
                fromItemId: r.itemId, toItemId: b.itemId, fromQty: r.quantity, toQty: b.quantity,
                fromUnitCents: r.unitCents, toUnitCents: b.unitCents,
            });
            continue;
        }
        changes.push({ type: 'remove', slotId: r.slotId, childId: r.childId, itemId: r.itemId, qty: r.quantity, unitCents: r.unitCents });
    }
    for (const b of added) {
        if (pairedAdds.has(b))
            continue;
        changes.push({ type: 'add', slotId: b.slotId, childId: b.childId, itemId: b.itemId, qty: b.quantity, unitCents: b.unitCents });
    }
    return changes;
}
/** `history/default` per list: set the first time a box has lines, and again on every rebuild. */
function nextDefault(existing, source, after) {
    if (!after.length)
        return null;
    if (!isRecord(existing) || source === 'default-build') {
        return { lineItems: after, source: source === 'default-build' ? 'default-build' : `first-save:${source}` };
    }
    return null;
}
/** Firestore rejects `undefined` values. */
function withoutUndefined(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=boxHistoryDiff.js.map