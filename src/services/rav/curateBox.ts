import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { BoxLineItem, FamiliarityLevel, RavDraftAction } from '../../types/pilot';
import type { CatalogItem } from '../../types/pilot';
import type { ResolvedDeviation } from '../box/buildDefaultBox';
import {
  resolveFreeSlotAddOptions,
  resolveFreeSwapUnitCents,
  resolveIncludedGiftOptions,
} from '../box/sectionUpsells';
import { displaySectionForCatalogItem } from '../../constants/boxDisplaySections';
import { applyRavDraftActions } from './applyRavDraftActions';

export type CurateBoxKid = {
  id: string;
  firstName?: string;
  age: number;
};

export type CurateBoxNote = {
  slotId: string;
  childId?: string;
  itemId: string;
  reason: string;
};

export type CurateBoxAction = {
  type: 'swap';
  slotId: string;
  childId?: string;
  itemId: string;
  reason: string;
};

export type CurateBoxParams = {
  practiceLevel: FamiliarityLevel;
  practiceScore: number;
  kids: CurateBoxKid[];
  adults?: number;
  interests: string[];
  notes: string;
  baseline: BoxLineItem[];
  deviations: ResolvedDeviation[];
  catalog: CatalogItem[];
};

export type CurateBoxResult = {
  notes: CurateBoxNote[];
  actions: CurateBoxAction[];
};

const CURATE_TIMEOUT_MS = 8000;

type AllowedSwap = { slotId: string; optionItemIds: string[] };

function baseSlot(slotId: string): string {
  const match = slotId.match(
    /^(story|gift|wood-dreidel|blank-dreidel|airdry-dreidel|candles)-/
  );
  return match ? match[1] : slotId;
}

/** Included-price swap targets per practice line for the Rav curator allowlist. */
export function buildAllowedSwapsForBox(
  lineItems: BoxLineItem[],
  catalog: CatalogItem[]
): AllowedSwap[] {
  const bySlot = new Map<string, Set<string>>();

  const add = (slotId: string, ids: string[]) => {
    const set = bySlot.get(slotId) ?? new Set<string>();
    for (const id of ids) set.add(id);
    bySlot.set(slotId, set);
  };

  for (const li of lineItems) {
    const item = catalog.find((c) => c.id === li.itemId);
    if (!item) continue;
    const section = displaySectionForCatalogItem(item);
    const slot = li.slotId;
    const base = baseSlot(slot);

    if (base === 'gift' || slot.startsWith('gift')) {
      const opts = resolveIncludedGiftOptions(catalog, li.itemId, 8);
      add(
        slot,
        opts.map((o) => o.id).filter((id) => id !== li.itemId)
      );
      continue;
    }

    if (
      section === 'candles' ||
      section === 'dreidel' ||
      section === 'story' ||
      section === 'presents'
    ) {
      const opts = resolveFreeSlotAddOptions(section, catalog, 8);
      const freeIds = opts
        .filter((o) => {
          if (o.id === li.itemId) return false;
          const cents = resolveFreeSwapUnitCents(item, o, section);
          return cents === 0;
        })
        .map((o) => o.id);
      add(slot, freeIds);
      // Also key by base slot for curator matching.
      if (base !== slot) add(base, freeIds);
    }
  }

  return Array.from(bySlot.entries())
    .filter(([, ids]) => ids.size > 0)
    .map(([slotId, ids]) => ({ slotId, optionItemIds: Array.from(ids) }));
}

function callableMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = String((error as { message: unknown }).message);
    if (msg && msg !== 'INTERNAL') return msg;
  }
  return 'curate failed';
}

/**
 * Fail-open Rav curation pass. Returns null on timeout / error / missing Functions.
 */
export async function curateBox(params: CurateBoxParams): Promise<CurateBoxResult | null> {
  if (!functions) return null;

  const payload = {
    practiceLevel: params.practiceLevel,
    practiceScore: params.practiceScore,
    kids: params.kids,
    adults: params.adults,
    interests: params.interests,
    notes: params.notes,
    baseline: params.baseline.map((li) => ({
      slotId: li.slotId,
      itemId: li.itemId,
      label: li.label,
      quantity: li.quantity,
      childId: li.childId,
    })),
    deviations: params.deviations.map((d) => ({
      slotId: d.slotId,
      childId: d.childId,
      fromItemId: d.fromItemId,
      toItemId: d.toItemId,
    })),
    allowedSwaps: buildAllowedSwapsForBox(params.baseline, params.catalog),
  };

  const fn = httpsCallable<typeof payload, CurateBoxResult>(functions, 'curatePilotBox');

  try {
    const result = await Promise.race([
      fn(payload).then((r) => r.data),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CURATE_TIMEOUT_MS)),
    ]);
    if (!result) return null;
    return {
      notes: Array.isArray(result.notes) ? result.notes : [],
      actions: Array.isArray(result.actions) ? result.actions : [],
    };
  } catch (err) {
    console.warn('[curateBox]', callableMessage(err));
    return null;
  }
}

function lineMatchesNote(li: BoxLineItem, note: CurateBoxNote): boolean {
  if (li.itemId !== note.itemId) return false;
  if (note.childId && li.childId !== note.childId) return false;
  if (note.slotId && li.slotId !== note.slotId && !li.slotId.startsWith(`${note.slotId}-`)) {
    // Still accept if item + child match.
    if (!note.childId) return li.slotId === note.slotId;
  }
  return true;
}

/** Validate included-price swaps, apply them, attach curation notes. Fail-soft. */
export function applyCurateBoxResult(
  lineItems: BoxLineItem[],
  catalog: CatalogItem[],
  result: CurateBoxResult | null,
  deviations: ResolvedDeviation[]
): BoxLineItem[] {
  let next = lineItems.map((li) => ({ ...li }));

  if (result?.actions?.length) {
    const validActions: RavDraftAction[] = [];
    for (const action of result.actions) {
      if (action.type !== 'swap') continue;
      const target = catalog.find((c) => c.id === action.itemId);
      if (!target) continue;
      const idx = next.findIndex(
        (li) =>
          li.slotId === action.slotId ||
          li.slotId.startsWith(`${action.slotId}-`) ||
          (action.childId && li.childId === action.childId && baseSlot(li.slotId) === baseSlot(action.slotId))
      );
      if (idx < 0) continue;
      const source = catalog.find((c) => c.id === next[idx].itemId);
      const section = source
        ? displaySectionForCatalogItem(source)
        : displaySectionForCatalogItem(target);
      const cents = resolveFreeSwapUnitCents(source, target, section);
      if (cents !== 0) continue;
      validActions.push({
        type: 'swap',
        itemId: action.itemId,
        slotId: next[idx].slotId,
        childId: action.childId ?? next[idx].childId,
        reason: action.reason,
      });
    }
    if (validActions.length) {
      const applied = applyRavDraftActions(validActions, next, catalog);
      next = applied.lineItems;
      // Attach reasons from applied swaps.
      for (const action of applied.applied) {
        if (!action.reason) continue;
        next = next.map((li) => {
          if (li.itemId !== action.itemId) return li;
          if (action.childId && li.childId !== action.childId) return li;
          if (action.slotId && li.slotId !== action.slotId && !li.slotId.startsWith(`${baseSlot(action.slotId)}-`)) {
            return li;
          }
          return { ...li, curationNote: action.reason };
        });
      }
    }
  }

  // Notes for rule deviations (and any notes that match remaining lines).
  const notes = result?.notes ?? [];
  for (const note of notes) {
    if (!note.reason?.trim()) continue;
    next = next.map((li) => (lineMatchesNote(li, note) ? { ...li, curationNote: note.reason.trim() } : li));
  }

  // If Rav returned no note for a deviation, leave without a note (no canned fallback).
  void deviations;

  return next;
}
