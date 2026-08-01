/**
 * Client-side detection for companion-pane intents.
 */

import type { BoxLineItem, CatalogItem, RavDraftAction } from '../../types/pilot';
import type { RavPaneProposal, RavTreatPathOption } from '../../types/ravPane';
import { catalogSlotId } from '../box/buildDefaultBox';

const BOX_VIEW_PATTERNS: RegExp[] = [
  /\bwhat'?s?\s+in\s+(my|our|the)\s+box\b/,
  /\bshow\s+(me\s+)?(my|our|the)\s+box\b/,
  /\bopen\s+(my|our|the)\s+box\b/,
  /\bsee\s+(my|our|the)\s+box\b/,
  /\bview\s+(my|our|the)\s+box\b/,
  /\b(my|our)\s+box\s+contents?\b/,
  /\bwhat'?s?\s+inside\s+(my|our|the)\s+box\b/,
  /\blist\s+(my|our|the)\s+box\b/,
  /\bwhat\s+(do\s+i|items?\s+do\s+i|do\s+we)\s+have\s+in\s+(my|our|the)\s+box\b/,
  /\bitems?\s+in\s+(my|our|the)\s+box\b/,
];

const OPTIONS_FOLLOWUP =
  /^(show(\s+me)?\s+options|options|what(\s+are)?(\s+my|\s+the)?\s+options|any(\s+other)?\s+options|see\s+options)[?.!]*$/i;

const SWAP_BROWSE_PATTERNS: RegExp[] = [
  /\bswap\b/,
  /\bswitch\b/,
  /\breplace\b/,
  /\bchoose\s+between\b/,
  /\bhelp\s+me\s+choose\b/,
  /\blatkes?\s+or\s+sufgan/,
  /\bsufgan\w*\s+or\s+latkes?\b/,
  /\bdifferent\s+types?\s+of\b/,
  /\bshow(\s+me)?\s+options\b/,
  /\bwhat(\s+are)?(\s+my|\s+the)?\s+options\b/,
  /\bother\s+options\b/,
];

const LATKE_SLOT_PREFIXES = ['latke-kit', 'latke-recipe-media', 'latke-recipe-printed'];
const SUF_SLOT_PREFIXES = ['sufganiyot-kit', 'sufganiyot-recipe-media', 'sufganiyot-recipe-printed'];

function prefixesForTreatPath(pathId: string): string[] | null {
  if (pathId === 'latke') return LATKE_SLOT_PREFIXES;
  if (pathId === 'sufganiyot') return SUF_SLOT_PREFIXES;
  return null;
}

function otherPrefixesForTreatPath(pathId: string): string[] | null {
  if (pathId === 'latke') return SUF_SLOT_PREFIXES;
  if (pathId === 'sufganiyot') return LATKE_SLOT_PREFIXES;
  return null;
}

function pickCatalogItemForTreatSlot(slotId: string, catalog: CatalogItem[]): CatalogItem | undefined {
  if (slotId === 'latke-kit') {
    return catalog.find((c) => c.id === 'latke-mix') ?? catalog.find((c) => c.slotId === 'latke-kit');
  }
  return catalog.find((c) => c.id === slotId) ?? catalog.find((c) => c.slotId === slotId);
}

function lineForTreatSlot(lineItems: BoxLineItem[], slotId: string): BoxLineItem | undefined {
  return lineItems.find((li) => li.slotId === slotId || li.slotId.startsWith(`${slotId}-`));
}

export function isBoxViewIntent(message: string): boolean {
  const t = message.trim().toLowerCase().replace(/[?!.,]+$/g, '');
  if (!t) return false;
  return BOX_VIEW_PATTERNS.some((re) => re.test(t));
}

export function isSwapBrowseIntent(message: string, recentUserMessages: string[] = []): boolean {
  const t = message.trim().toLowerCase();
  if (!t) return false;
  if (SWAP_BROWSE_PATTERNS.some((re) => re.test(t))) return true;
  if (OPTIONS_FOLLOWUP.test(t)) {
    return recentUserMessages.some((m) => SWAP_BROWSE_PATTERNS.some((re) => re.test(m.toLowerCase())));
  }
  return false;
}

/** Drop inline product cards when the companion box pane is handling that UI. */
export function stripProductBlocksForBoxPane<T extends { type: string }>(blocks: T[]): T[] {
  return blocks.filter((b) => b.type !== 'product');
}

/** Drop swap/product cards when a companion pane is handling those changes. */
export function stripBlocksForSwapReview<T extends { type: string }>(blocks: T[]): T[] {
  return blocks.filter((b) => b.type !== 'product' && b.type !== 'swap');
}

function findLineIndex(lineItems: BoxLineItem[], slotId?: string, itemId?: string): number {
  if (slotId) {
    const idx = lineItems.findIndex(
      (li) => li.slotId === slotId || li.slotId.startsWith(`${slotId}-`)
    );
    if (idx >= 0) return idx;
  }
  if (itemId) return lineItems.findIndex((li) => li.itemId === itemId);
  return -1;
}

function slotsInBox(lineItems: BoxLineItem[], prefixes: string[]): string[] {
  return lineItems
    .filter((li) => prefixes.some((p) => li.slotId === p || li.slotId.startsWith(`${p}-`)))
    .map((li) => li.slotId);
}

function resolveTopicCorpus(message: string, recentUserMessages: string[]): string {
  const t = message.trim().toLowerCase();
  if (OPTIONS_FOLLOWUP.test(t)) {
    return [message, ...recentUserMessages].join(' ').toLowerCase();
  }
  return t;
}

function altsForLine(
  li: BoxLineItem,
  catalog: CatalogItem[]
): CatalogItem[] {
  const current = catalog.find((c) => c.id === li.itemId);
  const ids = current?.swapOptions?.length ? current.swapOptions : [];
  const resolved = catalogSlotId(li.slotId);
  if (ids.length) {
    return ids
      .map((id) => catalog.find((c) => c.id === id))
      .filter((c): c is CatalogItem => !!c && c.id !== li.itemId);
  }
  return catalog.filter((c) => c.slotId === resolved && c.id !== li.itemId);
}

export type SwapPickBuild = {
  title: string;
  subtitle: string;
  pickMode: 'slot_alts' | 'treat_path';
  focusSlotId?: string;
  currentItemId?: string;
  optionItemIds: string[];
  treatPaths?: RavTreatPathOption[];
};

/**
 * Build a browse/pick plan from the user message (+ recent context) and live catalog.
 */
export function buildSwapPickPlan(
  message: string,
  recentUserMessages: string[],
  lineItems: BoxLineItem[],
  catalog: CatalogItem[]
): SwapPickBuild | null {
  const corpus = resolveTopicCorpus(message, recentUserMessages);

  // Latkes vs sufganiyot — mutually exclusive treat paths
  if (/\blatke|\bsufgan/.test(corpus)) {
    const latkeKit = catalog.find((c) => c.id === 'latke-mix' || c.slotId === 'latke-kit');
    const sufKit = catalog.find((c) => c.id === 'sufganiyot-kit' || c.slotId === 'sufganiyot-kit');
    if (!latkeKit && !sufKit) return null;
    const treatPaths: RavTreatPathOption[] = [];
    if (latkeKit) {
      treatPaths.push({
        id: 'latke',
        label: 'Latkes',
        description: 'Faster, more forgiving with kids around',
        kitItemId: latkeKit.id,
        removeSlotIds: slotsInBox(lineItems, SUF_SLOT_PREFIXES),
      });
    }
    if (sufKit) {
      treatPaths.push({
        id: 'sufganiyot',
        label: 'Sufganiyot',
        description: 'More involved — dough, oil, time',
        kitItemId: sufKit.id,
        removeSlotIds: slotsInBox(lineItems, LATKE_SLOT_PREFIXES),
      });
    }
    return {
      title: 'Latkes or sufganiyot',
      subtitle: 'Pick a path — we’ll adjust your box',
      pickMode: 'treat_path',
      optionItemIds: treatPaths.map((p) => p.kitItemId),
      treatPaths,
    };
  }

  // Gelt / named slot topics
  const topicSlot =
    /\bgelt\b/.test(corpus)
      ? 'gelt'
      : /\bcandle/.test(corpus)
        ? 'candles'
        : /\bdreidel\b/.test(corpus)
          ? 'dreidel'
          : /\bwrapping|wrap\b/.test(corpus)
            ? 'wrapping'
            : null;

  let targetLine: BoxLineItem | undefined;
  if (topicSlot) {
    targetLine = lineItems.find((li) => catalogSlotId(li.slotId) === topicSlot);
  }
  if (!targetLine && /\bswap|switch|replace|options\b/.test(corpus)) {
    // Fall back to first line that has alternatives
    targetLine = lineItems.find((li) => altsForLine(li, catalog).length > 0);
  }
  if (!targetLine && topicSlot) {
    // Topic known but not in box — still show catalog items for that slot
    const slotItems = catalog.filter((c) => c.slotId === topicSlot);
    if (!slotItems.length) return null;
    return {
      title: topicSlot === 'gelt' ? 'Gelt options' : `Options for ${topicSlot}`,
      subtitle:
        slotItems.length <= 1
          ? 'Only one option in the catalog right now'
          : 'Tap one to add or swap into your box',
      pickMode: 'slot_alts',
      focusSlotId: topicSlot,
      optionItemIds: slotItems.map((c) => c.id),
    };
  }
  if (!targetLine) return null;

  const alts = altsForLine(targetLine, catalog);
  const current = catalog.find((c) => c.id === targetLine!.itemId);
  const optionItemIds = [targetLine.itemId, ...alts.map((a) => a.id)].filter(
    (id, i, arr) => arr.indexOf(id) === i
  );

  return {
    title: current?.name ? `Swap: ${current.name}` : 'Swap options',
    subtitle:
      alts.length === 0
        ? 'Only one option in the catalog right now'
        : 'Tap an option to stage a swap',
    pickMode: 'slot_alts',
    focusSlotId: targetLine.slotId,
    currentItemId: targetLine.itemId,
    optionItemIds,
  };
}

/**
 * Turn a treat-path pick into remove (other path) + add (chosen path if missing) actions.
 * Always recomputes from the live draft (don't trust stale removeSlotIds from pane open).
 */
export function actionsForTreatPath(
  path: RavTreatPathOption,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[]
): RavDraftAction[] {
  const actions: RavDraftAction[] = [];

  const otherPrefixes =
    otherPrefixesForTreatPath(path.id) ??
    null;
  const removeSlotIds = otherPrefixes
    ? slotsInBox(lineItems, otherPrefixes)
    : path.removeSlotIds.filter((slotId) => lineItems.some((li) => li.slotId === slotId));

  for (const slotId of removeSlotIds) {
    const li = lineItems.find((x) => x.slotId === slotId);
    if (!li) continue;
    actions.push({ type: 'remove', itemId: li.itemId, slotId });
  }

  const keepPrefixes = prefixesForTreatPath(path.id);
  if (keepPrefixes) {
    for (const slotId of keepPrefixes) {
      if (lineForTreatSlot(lineItems, slotId)) continue;
      const item = pickCatalogItemForTreatSlot(slotId, catalog);
      if (!item) continue;
      actions.push({ type: 'add', itemId: item.id, slotId: item.slotId || slotId });
    }
  } else if (path.kitItemId && !lineItems.some((li) => li.itemId === path.kitItemId)) {
    const item = catalog.find((c) => c.id === path.kitItemId);
    if (item) {
      actions.push({ type: 'add', itemId: item.id, slotId: item.slotId });
    }
  }

  return actions;
}

/**
 * Items that will be in the box for the chosen treat path after apply
 * (already present, or catalog defaults that will be added).
 */
export function keepItemIdsForTreatPath(
  path: RavTreatPathOption,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[]
): string[] {
  const keepPrefixes = prefixesForTreatPath(path.id);
  if (!keepPrefixes) {
    if (path.kitItemId) return [path.kitItemId];
    return [];
  }

  const ids: string[] = [];
  for (const slotId of keepPrefixes) {
    const existing = lineForTreatSlot(lineItems, slotId);
    if (existing) {
      ids.push(existing.itemId);
      continue;
    }
    const item = pickCatalogItemForTreatSlot(slotId, catalog);
    if (item) ids.push(item.id);
  }
  return ids;
}

/** True when the box already matches this treat path (chosen present, other absent). */
export function isTreatPathAlreadyActive(
  path: RavTreatPathOption,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[]
): boolean {
  return actionsForTreatPath(path, lineItems, catalog).length === 0;
}

/**
 * Turn a slot alt pick into a swap (or add) action.
 */
export function actionForSlotAltPick(
  itemId: string,
  focusSlotId: string | undefined,
  currentItemId: string | undefined,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[]
): RavDraftAction | null {
  const item = catalog.find((c) => c.id === itemId);
  if (!item) return null;
  if (currentItemId && itemId === currentItemId) return null;

  const slotId = focusSlotId ?? item.slotId;
  const idx = findLineIndex(lineItems, slotId, currentItemId);
  if (idx >= 0) {
    return { type: 'swap', itemId, slotId: lineItems[idx].slotId };
  }
  return { type: 'add', itemId, slotId: slotId ?? item.slotId };
}

/**
 * Turn Rav draft actions into review-pane proposals.
 */
export function buildSwapReviewFromActions(
  actions: RavDraftAction[],
  lineItems: BoxLineItem[],
  catalog: CatalogItem[]
): { proposals: RavPaneProposal[]; pendingActions: RavDraftAction[] } {
  const proposals: RavPaneProposal[] = [];
  const pendingActions: RavDraftAction[] = [];
  const byId = new Map(catalog.map((c) => [c.id, c]));

  for (const action of actions) {
    if (action.type === 'swap') {
      const to = byId.get(action.itemId);
      if (!to) continue;
      const idx = findLineIndex(lineItems, action.slotId, undefined);
      const fromItemId = idx >= 0 ? lineItems[idx].itemId : undefined;
      const slotId = (idx >= 0 ? lineItems[idx].slotId : action.slotId) ?? to.slotId;
      if (!slotId) continue;
      proposals.push({
        actionType: 'swap',
        slotId,
        fromItemId,
        toItemId: to.id,
      });
      pendingActions.push({ ...action, slotId });
      continue;
    }

    if (action.type === 'add') {
      const to = byId.get(action.itemId);
      if (!to) continue;
      if (lineItems.some((li) => li.itemId === to.id)) continue;
      proposals.push({
        actionType: 'add',
        slotId: action.slotId ?? to.slotId,
        toItemId: to.id,
      });
      pendingActions.push(action);
      continue;
    }

    if (action.type === 'remove') {
      const idx = findLineIndex(lineItems, action.slotId, action.itemId);
      if (idx < 0) continue;
      const li = lineItems[idx];
      proposals.push({
        actionType: 'remove',
        slotId: li.slotId,
        fromItemId: li.itemId,
      });
      pendingActions.push(action);
    }
  }

  return { proposals, pendingActions };
}
