export type RavModeName = 'facilitator' | 'facilitator_kid' | 'personal_shopper' | 'project_partner';

export type BeamMilestoneType = 'bat_mitzvah' | 'bar_mitzvah';

export type RavBlock = {
  type: 'product' | 'curation' | 'swap';
  title: string;
  body?: string;
  itemId?: string;
  slotId?: string;
  swapOptions?: string[];
};

export type RavDraftAction = {
  type: 'swap' | 'add' | 'remove';
  itemId: string;
  slotId?: string;
  childId?: string;
};

/** LLM-authored companion pane hint (client resolves against live catalog/box). */
export type RavPaneHint = {
  kind: 'box' | 'swap_pick' | 'swap_review' | 'curation' | 'product_detail';
  title?: string;
  subtitle?: string;
  slotId?: string;
  itemId?: string;
  /** Catalog ids for swap_pick / curation grids */
  optionItemIds?: string[];
  /** Free-text topic hint: gelt, latke, sufganiyot, candles, … */
  topic?: string;
};

export type RavResponse = {
  text: string;
  blocks: RavBlock[];
  actions?: RavDraftAction[];
  pane?: RavPaneHint | null;
};

export type AskPilotRavData = {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  boxDraftSummary?: string;
  mode?: RavModeName;
  childId?: string;
  /** Client co-pilot: current screen / focused entity */
  surface?: {
    route?: string;
    overlay?: string;
    focusedEntity?: { type?: string; id?: string; label?: string };
  };
  /** Client co-pilot: browse / wishlist / orders (non-PII) */
  userMemory?: {
    browseRecent?: Array<{ itemId?: string; name?: string; viewedAt?: string }>;
    wishlist?: Array<{ itemId?: string; name?: string }>;
    ordersSummary?: Array<{
      id?: string;
      status?: string;
      createdAt?: string;
      itemLabels?: string[];
    }>;
  };
};

export type LineItem = {
  slotId?: string;
  itemId?: string;
  label?: string;
  quantity?: number;
  childId?: string;
};

const PANE_KINDS = new Set(['box', 'swap_pick', 'swap_review', 'curation', 'product_detail']);

/** Normalize/validate optional pane from the model. */
export function sanitizeRavPane(raw: unknown): RavPaneHint | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  const kind = typeof p.kind === 'string' ? p.kind : '';
  if (!PANE_KINDS.has(kind)) return undefined;

  const optionItemIds = Array.isArray(p.optionItemIds)
    ? p.optionItemIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : undefined;

  return {
    kind: kind as RavPaneHint['kind'],
    title: typeof p.title === 'string' ? p.title : undefined,
    subtitle: typeof p.subtitle === 'string' ? p.subtitle : undefined,
    slotId: typeof p.slotId === 'string' ? p.slotId : undefined,
    itemId: typeof p.itemId === 'string' ? p.itemId : undefined,
    optionItemIds: optionItemIds?.length ? optionItemIds : undefined,
    topic: typeof p.topic === 'string' ? p.topic : undefined,
  };
}
