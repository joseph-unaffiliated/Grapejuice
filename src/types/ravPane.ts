/**
 * Rav companion pane contract
 *
 * Phase 1: box view after Rav replies (client intent + LLM pane).
 * Phase 2: swap review (park actions) + swap pick (browse options).
 * Phase 3: LLM returns optional `pane` hint; client resolves against live catalog/box.
 */

import type { RavDraftAction } from './pilot';

export type RavPaneKind = 'box' | 'swap_review' | 'swap_pick' | 'curation' | 'product_detail';

export type RavPaneProposal = {
  actionType: 'swap' | 'add' | 'remove';
  slotId?: string;
  fromItemId?: string;
  toItemId?: string;
  reason?: string;
};

export type RavTreatPathOption = {
  id: 'latke' | 'sufganiyot' | string;
  label: string;
  description?: string;
  kitItemId: string;
  /** Line slotIds to remove if this path is chosen. */
  removeSlotIds: string[];
};

/** Wire shape for pane contents (client-built now; LLM may emit later). */
export type RavPanePayload = {
  kind: RavPaneKind;
  title?: string;
  subtitle?: string;
  proposals?: RavPaneProposal[];
  pendingActions?: RavDraftAction[];
  /**
   * Items that remain / take the place of removals (e.g. chosen treat-path kits).
   * Display-only — not applied as draft actions.
   */
  replacingWithItemIds?: string[];
  /** After Apply succeeds in-pane. */
  reviewStatus?: 'pending' | 'applied';
  focusSlotId?: string;
  itemId?: string;
  /** swap_pick */
  pickMode?: 'slot_alts' | 'treat_path';
  currentItemId?: string;
  optionItemIds?: string[];
  treatPaths?: RavTreatPathOption[];
};

export type RavCompanionPaneState = {
  open: boolean;
  kind: RavPaneKind;
  source: 'user' | 'mock' | 'rav' | 'block';
  title?: string;
  subtitle?: string;
  payload?: RavPanePayload;
};

export type OpenRavCompanionPaneInput = Omit<RavCompanionPaneState, 'open'>;

export const CLOSED_RAV_COMPANION_PANE: RavCompanionPaneState = {
  open: false,
  kind: 'box',
  source: 'user',
};
