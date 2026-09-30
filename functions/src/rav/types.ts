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
  /** Optional one-sentence why this mutation was chosen. */
  reason?: string;
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

/** Rav-requested in-app navigation (sanitized against an allowlist). */
export type RavNavigate = {
  path: string;
  label: string;
};

export type RavResponse = {
  text: string;
  blocks: RavBlock[];
  actions?: RavDraftAction[];
  pane?: RavPaneHint | null;
  navigate?: RavNavigate | null;
};

export type AskPilotRavData = {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  boxDraftSummary?: string;
  /** Practice intensity (guests have no user doc — client sends this). */
  familiarityLevel?: 'minimal' | 'moderate' | 'all-in';
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

const NAVIGATE_EXACT = new Set([
  '/box',
  '/store',
  '/checkout',
  '/orders',
  '/my-gifts',
  '/account',
  '/story',
  '/passover',
  '/gift',
]);
const NAVIGATE_PATTERNS = [/^\/store\/[a-z0-9-]{1,48}$/, /^\/product\/[a-z0-9-]{1,96}$/];

const NAVIGATE_DEFAULT_LABELS: Record<string, string> = {
  '/box': 'your box',
  '/store': 'the store',
  '/checkout': 'checkout',
  '/orders': 'your orders',
  '/my-gifts': 'your gifts',
  '/account': 'your account',
  '/story': 'our story',
  '/passover': 'Passover',
  '/gift': 'send a gift',
};

/** Keep only allowlisted in-app paths; drop query/hash and anything external. */
export function sanitizeRavNavigate(raw: unknown): RavNavigate | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const n = raw as Record<string, unknown>;
  if (typeof n.path !== 'string') return undefined;
  let path = n.path.trim().toLowerCase().split(/[?#]/)[0] ?? '';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  const allowed = NAVIGATE_EXACT.has(path) || NAVIGATE_PATTERNS.some((re) => re.test(path));
  if (!allowed) return undefined;
  const rawLabel = typeof n.label === 'string' ? n.label.trim().slice(0, 48) : '';
  const label =
    rawLabel ||
    NAVIGATE_DEFAULT_LABELS[path] ||
    path.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ||
    'that page';
  return { path, label };
}

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
