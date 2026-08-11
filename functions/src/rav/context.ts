import { getFirestore } from 'firebase-admin/firestore';
import type { AskPilotRavData, LineItem } from './types';
import { renderBoxRulesContext, type BoxRulesCatalogRow } from './boxRules';

const HOLIDAY_ID = 'hanukkah-2026';
/** Firestore catalog path: catalog/{CATALOG_HOLIDAY}/items/{id} (Airtable sync + app client). */
const CATALOG_HOLIDAY = 'hanukkah';
const CATALOG_SOFT_LIMIT = 90;
const DESC_MAX = 140;

type CatalogRow = {
  id: string;
  name: string;
  slotId: string;
  description: string;
  ageGroups: string[];
  swapOptions: string[];
  category: string;
  brand: string;
  rails: string[];
  pricingTier?: string;
  memberPriceCents?: number;
  nonMemberPriceCents?: number;
  dollarCostCents?: number;
  materials: string;
  interest: string;
  /** Airtable "Default slot" when synced. */
  defaultSlot?: string | null;
  /** Airtable "Box sections" when synced. */
  boxSections?: string[];
  /** Airtable "Default book ages" when synced. */
  defaultBookAges?: Array<string | number>;
  /** Airtable "Default gift ages" when synced. */
  defaultGiftAges?: Array<string | number>;
  /** Age bands this item is a default for (legacy / books sync). */
  defaultFor?: string[];
  inventory?: number | null;
  holdInventory?: boolean | null;
  wrappable?: boolean | null;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim());
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function asNumberArray(v: unknown): Array<string | number> {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'number' && Number.isFinite(x)) return x;
      if (typeof x === 'string' && x.trim()) return x.trim();
      return null;
    })
    .filter((x): x is string | number => x != null);
}

function docToRow(id: string, c: Record<string, unknown>): CatalogRow {
  return {
    id,
    name: typeof c.name === 'string' ? c.name : id,
    slotId: typeof c.slotId === 'string' ? c.slotId : 'extra',
    description: typeof c.description === 'string' ? c.description : '',
    ageGroups: asStringArray(c.ageGroups),
    swapOptions: asStringArray(c.swapOptions).slice(0, 6),
    category: typeof c.category === 'string' ? c.category : '',
    brand: typeof c.brand === 'string' ? c.brand : '',
    rails: asStringArray(c.storefrontRails).slice(0, 4),
    pricingTier: typeof c.pricingTier === 'string' ? c.pricingTier : undefined,
    memberPriceCents: typeof c.memberPriceCents === 'number' ? c.memberPriceCents : undefined,
    nonMemberPriceCents: typeof c.nonMemberPriceCents === 'number' ? c.nonMemberPriceCents : undefined,
    dollarCostCents: typeof c.dollarCostCents === 'number' ? c.dollarCostCents : undefined,
    materials: typeof c.materials === 'string' ? c.materials : '',
    interest: typeof c.interest === 'string' ? c.interest : '',
    defaultSlot: typeof c.defaultSlot === 'string' ? c.defaultSlot : null,
    boxSections: asStringArray(c.boxSections),
    defaultBookAges: asNumberArray(c.defaultBookAges),
    defaultGiftAges: asNumberArray(c.defaultGiftAges),
    defaultFor: asStringArray(c.defaultFor),
    inventory: typeof c.inventory === 'number' ? c.inventory : null,
    holdInventory: typeof c.holdInventory === 'boolean' ? c.holdInventory : null,
    wrappable: typeof c.wrappable === 'boolean' ? c.wrappable : null,
  };
}

function formatCatalogRow(row: CatalogRow, detail: boolean): string {
  const ages = row.ageGroups.length ? ` ages=[${row.ageGroups.join(',')}]` : '';
  const swaps = row.swapOptions.length ? ` swaps=[${row.swapOptions.join(',')}]` : '';
  const cat = row.category ? ` cat=${row.category}` : '';
  const brand = row.brand ? ` brand=${row.brand}` : '';
  const rails = row.rails.length ? ` rails=[${row.rails.join(',')}]` : '';
  const tier = row.pricingTier ? ` tier=${row.pricingTier}` : '';
  const priceBits: string[] = [];
  if (typeof row.memberPriceCents === 'number') priceBits.push(`member=$${(row.memberPriceCents / 100).toFixed(0)}`);
  if (typeof row.nonMemberPriceCents === 'number') {
    priceBits.push(`retail=$${(row.nonMemberPriceCents / 100).toFixed(0)}`);
  } else if (typeof row.dollarCostCents === 'number') {
    priceBits.push(`price=$${(row.dollarCostCents / 100).toFixed(0)}`);
  }
  const price = priceBits.length ? ` ${priceBits.join(' ')}` : '';
  const head = `${row.id} (${row.slotId}): ${row.name}${ages}${cat}${brand}${rails}${tier}${price}${swaps}`;
  if (!detail) return head;
  const extras: string[] = [];
  if (row.description) extras.push(truncate(row.description, DESC_MAX));
  if (row.materials) extras.push(`materials: ${truncate(row.materials, 80)}`);
  if (row.interest) extras.push(`interest: ${row.interest}`);
  return extras.length ? `${head} — ${extras.join(' | ')}` : head;
}

function priorityIdsFromClient(
  surface: AskPilotRavData['surface'],
  userMemory: AskPilotRavData['userMemory']
): string[] {
  const ids: string[] = [];
  const fe = surface?.focusedEntity;
  if (fe && typeof fe === 'object') {
    if (typeof fe.id === 'string' && fe.type === 'product') ids.push(fe.id.trim());
  }
  const browse = Array.isArray(userMemory?.browseRecent) ? userMemory!.browseRecent! : [];
  for (const e of browse.slice(0, 10)) {
    if (e && typeof e.itemId === 'string') ids.push(e.itemId.trim());
  }
  const wish = Array.isArray(userMemory?.wishlist) ? userMemory!.wishlist! : [];
  for (const e of wish.slice(0, 24)) {
    if (e && typeof e.itemId === 'string') ids.push(e.itemId.trim());
  }
  return [...new Set(ids.filter(Boolean))];
}

function scoreRow(row: CatalogRow, priority: Set<string>, focusCategory?: string): number {
  let score = 0;
  if (priority.has(row.id)) score += 100;
  if (focusCategory && row.rails.includes(focusCategory)) score += 20;
  if (focusCategory && row.category.toLowerCase().includes(focusCategory.replace(/-/g, ' '))) score += 10;
  if (row.swapOptions.length) score += 3;
  if (row.description) score += 2;
  if (row.rails.includes('most-loved')) score += 5;
  return score;
}

/** Load catalog/hanukkah/items once for catalog + box-rules context. */
export async function loadCatalogRows(): Promise<CatalogRow[]> {
  const db = getFirestore();
  const snap = await db
    .collection('catalog')
    .doc(CATALOG_HOLIDAY)
    .collection('items')
    .limit(200)
    .get();
  if (snap.empty) return [];
  return snap.docs.map((d) => docToRow(d.id, d.data() as Record<string, unknown>));
}

function toBoxRulesRows(catalog: CatalogRow[]): BoxRulesCatalogRow[] {
  return catalog.map((r) => ({
    id: r.id,
    name: r.name,
    slotId: r.slotId,
    defaultSlot: r.defaultSlot,
    boxSections: r.boxSections,
    defaultBookAges: r.defaultBookAges,
    defaultGiftAges: r.defaultGiftAges,
    ageGroups: r.ageGroups,
    defaultFor: r.defaultFor,
    inventory: r.inventory,
    holdInventory: r.holdInventory,
    wrappable: r.wrappable,
    memberPriceCents: r.memberPriceCents,
  }));
}

/**
 * Rich catalog CONTEXT: prioritize focused/wishlist/browse items with detail lines,
 * then a scored fill of the rest (still capped for tokens).
 * Pass `rows` from loadCatalogRows() to avoid a second Firestore read.
 */
export async function buildCatalogContext(
  surface?: AskPilotRavData['surface'],
  userMemory?: AskPilotRavData['userMemory'],
  rows?: CatalogRow[]
): Promise<string> {
  const catalog = rows ?? (await loadCatalogRows());
  if (!catalog.length) return '';

  const byId = new Map(catalog.map((r) => [r.id, r]));
  const priority = new Set(priorityIdsFromClient(surface, userMemory));

  // Expand priority to swap peers of focused/wishlist items
  for (const id of [...priority]) {
    const row = byId.get(id);
    if (!row) continue;
    for (const swapId of row.swapOptions) priority.add(swapId);
  }

  const focusCategory =
    surface?.focusedEntity?.type === 'category' && typeof surface.focusedEntity.id === 'string'
      ? surface.focusedEntity.id.trim()
      : undefined;

  const ranked = [...catalog].sort(
    (a, b) => scoreRow(b, priority, focusCategory) - scoreRow(a, priority, focusCategory)
  );

  const selected = ranked.slice(0, CATALOG_SOFT_LIMIT);
  const detailIds = new Set(
    [...priority].filter((id) => byId.has(id)).slice(0, 28)
  );

  const lines = selected.map((row) => formatCatalogRow(row, detailIds.has(row.id)));
  return [
    'Catalog (use real ids for actions/panes; prefer detailed lines when recommending):',
    ...lines,
  ].join('\n');
}

/**
 * Hanukkah 2026 box construction rules for Rav.
 * Canonical policy lives in `./boxRules` (not Airtable). Catalog rows optionally annotate live ids.
 */
export async function buildBoxRulesContext(rows?: CatalogRow[]): Promise<string> {
  const catalog = rows ?? (await loadCatalogRows());
  return renderBoxRulesContext(toBoxRulesRows(catalog));
}


export async function buildHouseholdContext(uid: string, clientDraft?: string): Promise<string> {
  const db = getFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) return clientDraft ? `Current box (client): ${clientDraft}` : '';

  const user = userSnap.data() ?? {};
  const householdId = user.householdId as string | undefined;
  const familiarity = user.familiarityLevel as string | undefined;
  const lines: string[] = [];

  if (familiarity) lines.push(`Family familiarity: ${familiarity}`);

  const childrenSnap = await db.collection(`users/${uid}/children`).get();
  if (!childrenSnap.empty) {
    const kids = childrenSnap.docs.map((d) => {
      const c = d.data();
      const name = c.name ? String(c.name) : 'Child';
      const age = c.ageGroup ? String(c.ageGroup) : '?';
      const beam = c.beamStatus ? String(c.beamStatus) : '';
      return `${name} (${age}${beam ? `, beam:${beam}` : ''})`;
    });
    lines.push(`Kids: ${kids.join(', ')}`);
  }

  if (!householdId) {
    if (clientDraft) lines.push(`Current box (client): ${clientDraft}`);
    return lines.join('\n');
  }

  const [draftSnap, configSnap] = await Promise.all([
    db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get(),
    db.doc('config/hanukkah-2026').get(),
  ]);

  const config = configSnap.data() ?? {};
  const lockAt = config.lockAt as string | undefined;
  if (lockAt) {
    const locked = Date.now() >= new Date(lockAt).getTime();
    lines.push(locked ? `Box customization: locked (${lockAt})` : `Box customization open until ${lockAt}`);
  }

  if (clientDraft) {
    lines.push(`Current box (client): ${clientDraft}`);
  } else if (draftSnap.exists) {
    const draft = draftSnap.data() ?? {};
    const items = (draft.lineItems as LineItem[]) ?? [];
    if (items.length) {
      const summary = items
        .map((li) => {
          const name = li.label || li.itemId || li.slotId || 'item';
          const qty = li.quantity && li.quantity > 1 ? ` ×${li.quantity}` : '';
          const kid = li.childId ? ` [${li.childId}]` : '';
          return `${name}${qty}${kid}`;
        })
        .join('; ');
      lines.push(`Current box: ${summary}`);
    } else {
      lines.push('Current box: empty draft');
    }
  } else {
    lines.push('Current box: not started');
  }

  const hhSnap = await db.doc(`households/${householdId}`).get();
  const wishlist = (hhSnap.data()?.wishlistItemIds as string[] | undefined) ?? [];
  if (wishlist.length) {
    lines.push(
      `Wishlist / favorites (prioritize these if recommending box items): ${wishlist.join(', ')}`
    );
  }

  return lines.join('\n');
}

/** Sanitize + format client surface (current screen) for the model. */
export function buildSurfaceContext(raw: AskPilotRavData['surface']): string {
  if (!raw || typeof raw !== 'object') return '';
  const route = typeof raw.route === 'string' ? raw.route.trim() : '';
  const overlay = typeof raw.overlay === 'string' ? raw.overlay.trim() : '';
  const fe = raw.focusedEntity && typeof raw.focusedEntity === 'object' ? raw.focusedEntity : undefined;
  const type = typeof fe?.type === 'string' ? fe.type.trim() : '';
  const id = typeof fe?.id === 'string' ? fe.id.trim() : '';
  const label = typeof fe?.label === 'string' ? fe.label.trim() : '';

  const lines: string[] = ['Screen (co-pilot — user is looking at this now):'];
  if (route) lines.push(`- Route: ${route}`);
  if (overlay) lines.push(`- Rav overlay: ${overlay}`);
  if (type && id) {
    lines.push(`- Focused: ${type} “${label || id}” (id: ${id})`);
  }
  if (lines.length <= 1) return '';
  lines.push(
    'Use this to answer in context of what they see. Prefer helping with the focused item/page before changing subject.'
  );
  return lines.join('\n');
}

/** Sanitize + format non-PII user memory from the client. */
export function buildUserMemoryContext(raw: AskPilotRavData['userMemory']): string {
  if (!raw || typeof raw !== 'object') return '';
  const lines: string[] = [];

  const browse = Array.isArray(raw.browseRecent) ? raw.browseRecent : [];
  const browseLines = browse
    .slice(0, 10)
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const itemId = typeof e.itemId === 'string' ? e.itemId.trim() : '';
      const name = typeof e.name === 'string' ? e.name.trim() : '';
      if (!itemId && !name) return null;
      return `- ${name || itemId}${itemId && name ? ` (${itemId})` : ''}`;
    })
    .filter(Boolean);
  if (browseLines.length) {
    lines.push('Recently viewed products (this device):');
    lines.push(...(browseLines as string[]));
  }

  const wishlist = Array.isArray(raw.wishlist) ? raw.wishlist : [];
  const wishLines = wishlist
    .slice(0, 24)
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const itemId = typeof e.itemId === 'string' ? e.itemId.trim() : '';
      const name = typeof e.name === 'string' ? e.name.trim() : '';
      if (!itemId) return null;
      return `- ${name || itemId}${name ? ` (${itemId})` : ''}`;
    })
    .filter(Boolean);
  if (wishLines.length) {
    lines.push('Wishlist / favorites:');
    lines.push(...(wishLines as string[]));
  }

  const orders = Array.isArray(raw.ordersSummary) ? raw.ordersSummary : [];
  const orderLines = orders
    .slice(0, 5)
    .map((o) => {
      if (!o || typeof o !== 'object') return null;
      const id = typeof o.id === 'string' ? o.id.trim() : '';
      const status = typeof o.status === 'string' ? o.status.trim() : '';
      if (!id) return null;
      const labels = Array.isArray(o.itemLabels)
        ? o.itemLabels.filter((l): l is string => typeof l === 'string' && l.trim().length > 0).slice(0, 8)
        : [];
      const when = typeof o.createdAt === 'string' ? o.createdAt.slice(0, 10) : '';
      const items = labels.length ? `; items: ${labels.join(', ')}` : '';
      return `- Order ${id.slice(0, 8)}… status=${status || '?'}${when ? ` (${when})` : ''}${items}`;
    })
    .filter(Boolean);
  if (orderLines.length) {
    lines.push('Past / upcoming orders (no addresses or payment data):');
    lines.push(...(orderLines as string[]));
  }

  if (!lines.length) return '';
  return `User memory (non-PII — use for personalization; do not invent orders/views):\n${lines.join('\n')}`;
}
