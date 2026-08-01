/**
 * Resolve an LLM pane hint into client companion-pane open state.
 */
import type { BoxLineItem, CatalogItem, RavDraftAction } from '../../types/pilot';
import type { OpenRavCompanionPaneInput, RavPaneKind } from '../../types/ravPane';
import {
  buildSwapPickPlan,
  buildSwapReviewFromActions,
} from './ravCompanionIntent';

export type RavPaneHint = {
  kind: RavPaneKind;
  title?: string;
  subtitle?: string;
  slotId?: string;
  itemId?: string;
  optionItemIds?: string[];
  topic?: string;
};

export function sanitizeClientPane(raw: unknown): RavPaneHint | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  const kind = typeof p.kind === 'string' ? p.kind : '';
  const allowed: RavPaneKind[] = ['box', 'swap_pick', 'swap_review', 'curation', 'product_detail'];
  if (!allowed.includes(kind as RavPaneKind)) return undefined;
  const optionItemIds = Array.isArray(p.optionItemIds)
    ? p.optionItemIds.filter((id): id is string => typeof id === 'string' && !!id.trim())
    : undefined;
  return {
    kind: kind as RavPaneKind,
    title: typeof p.title === 'string' ? p.title : undefined,
    subtitle: typeof p.subtitle === 'string' ? p.subtitle : undefined,
    slotId: typeof p.slotId === 'string' ? p.slotId : undefined,
    itemId: typeof p.itemId === 'string' ? p.itemId : undefined,
    optionItemIds: optionItemIds?.length ? optionItemIds : undefined,
    topic: typeof p.topic === 'string' ? p.topic : undefined,
  };
}

type ResolveArgs = {
  pane: RavPaneHint;
  message: string;
  recentUserMessages: string[];
  lineItems: BoxLineItem[];
  catalog: CatalogItem[];
  actions?: RavDraftAction[];
};

/**
 * Turn a sanitized LLM pane (+ optional actions) into an open-pane request.
 * Returns null if the hint can't be realized against live data.
 */
export function resolveRavPaneToOpen(args: ResolveArgs): OpenRavCompanionPaneInput | null {
  const { pane, message, recentUserMessages, lineItems, catalog, actions } = args;

  if (pane.kind === 'box') {
    return {
      kind: 'box',
      source: 'rav',
      title: pane.title ?? 'Your box',
      subtitle: pane.subtitle ?? 'Live draft from your Hanukkah box',
    };
  }

  if (pane.kind === 'swap_review') {
    if (!actions?.length) return null;
    const { proposals, pendingActions } = buildSwapReviewFromActions(actions, lineItems, catalog);
    if (!pendingActions.length) return null;
    return {
      kind: 'swap_review',
      source: 'rav',
      title: pane.title ?? 'Review changes',
      subtitle: pane.subtitle ?? 'Confirm before updating your box',
      payload: { kind: 'swap_review', proposals, pendingActions },
    };
  }

  if (pane.kind === 'product_detail') {
    const itemId = pane.itemId;
    if (!itemId || !catalog.some((c) => c.id === itemId)) return null;
    return {
      kind: 'product_detail',
      source: 'rav',
      title: pane.title ?? catalog.find((c) => c.id === itemId)?.name ?? 'Product',
      subtitle: pane.subtitle,
      payload: { kind: 'product_detail', itemId },
    };
  }

  if (pane.kind === 'swap_pick' || pane.kind === 'curation') {
    // Explicit option ids from the model
    if (pane.optionItemIds?.length) {
      const ids = pane.optionItemIds.filter((id) => catalog.some((c) => c.id === id));
      if (!ids.length) return null;
      const current =
        pane.slotId != null
          ? lineItems.find((li) => li.slotId === pane.slotId || li.slotId.startsWith(`${pane.slotId}-`))
          : undefined;
      return {
        kind: 'swap_pick',
        source: 'rav',
        title: pane.title ?? (pane.kind === 'curation' ? 'Picks for you' : 'Options'),
        subtitle: pane.subtitle ?? 'Tap an option to continue',
        payload: {
          kind: 'swap_pick',
          pickMode: 'slot_alts',
          focusSlotId: pane.slotId ?? current?.slotId,
          currentItemId: current?.itemId,
          optionItemIds: ids,
        },
      };
    }

    // Topic / slot / message fallback via existing client planner
    const topicMessage = [pane.topic, pane.slotId, message].filter(Boolean).join(' ');
    const plan = buildSwapPickPlan(topicMessage, recentUserMessages, lineItems, catalog);
    if (!plan) return null;
    return {
      kind: 'swap_pick',
      source: 'rav',
      title: pane.title ?? plan.title,
      subtitle: pane.subtitle ?? plan.subtitle,
      payload: {
        kind: 'swap_pick',
        pickMode: plan.pickMode,
        focusSlotId: pane.slotId ?? plan.focusSlotId,
        currentItemId: plan.currentItemId,
        optionItemIds: plan.optionItemIds,
        treatPaths: plan.treatPaths,
      },
    };
  }

  return null;
}
