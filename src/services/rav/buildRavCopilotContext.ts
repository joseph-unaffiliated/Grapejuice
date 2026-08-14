import { useBrowsingHistoryStore } from '../../stores/browsingHistoryStore';
import { ordersService } from '../firestore/orders';
import type { CatalogItem, PilotOrder } from '../../types/pilot';
import type {
  RavCopilotClientContext,
  RavFocusedEntity,
  RavOrderMemorySummary,
  RavSurfaceContext,
  RavUserMemoryContext,
} from './ravCopilotTypes';

const BROWSE_LIMIT = 10;
const WISHLIST_LIMIT = 24;
const ORDERS_LIMIT = 5;
const ORDER_ITEM_LABEL_LIMIT = 8;

function leafRouteName(state: {
  index?: number;
  routes?: Array<{ name: string; state?: unknown; params?: object }>;
} | undefined): string | undefined {
  if (!state?.routes?.length) return undefined;
  const index = state.index ?? 0;
  const route = state.routes[index];
  if (!route) return undefined;
  if (route.state) return leafRouteName(route.state as typeof state);
  return route.name;
}

function inferFocusedFromRoute(
  routeName: string | undefined,
  params: Record<string, unknown> | undefined
): RavFocusedEntity | undefined {
  if (!routeName) return undefined;
  switch (routeName) {
    case 'CatalogProduct': {
      const slug = typeof params?.slug === 'string' ? params.slug : undefined;
      if (!slug) return undefined;
      return { type: 'product', id: slug, label: slug };
    }
    case 'StorefrontCategory': {
      const category = typeof params?.category === 'string' ? params.category : 'collection';
      const q = typeof params?.q === 'string' ? params.q : undefined;
      return {
        type: 'category',
        id: category,
        label: q ? `Search: ${q}` : category,
      };
    }
    case 'MyBox':
      return { type: 'box', id: 'hanukkah-2026', label: 'Hanukkah 2026 Box' };
    case 'StorefrontHome':
      return { type: 'home', id: 'store', label: 'Store home' };
    case 'StorefrontOurStory':
      return { type: 'content', id: 'our-story', label: 'Our Story' };
    case 'StorefrontPassover':
      return { type: 'content', id: 'passover-2027', label: 'Passover 2027' };
    case 'GiftLanding':
      return { type: 'content', id: 'landing-gift', label: 'Gift landing' };
    case 'CulturalLanding':
      return { type: 'content', id: 'landing-cultural', label: 'Jewish, your way' };
    case 'InterfaithLanding':
      return { type: 'content', id: 'landing-interfaith', label: 'Interfaith landing' };
    case 'ConvenienceLanding':
      return { type: 'content', id: 'landing-convenience', label: 'Easy delivery' };
    case 'LastMinuteLanding':
      return { type: 'content', id: 'landing-last-minute', label: 'Last-minute ready' };
    case 'ForYourHomeLanding':
      return { type: 'content', id: 'landing-for-your-home', label: 'For your home' };
    case 'History':
      return { type: 'content', id: 'history', label: 'History' };
    case 'Checkout':
      return { type: 'content', id: 'checkout', label: 'Checkout' };
    default:
      return undefined;
  }
}

function sanitizeOrder(order: PilotOrder): RavOrderMemorySummary {
  const itemLabels = (order.lineItems ?? [])
    .map((li) => (li.label || li.itemId || '').trim())
    .filter(Boolean)
    .slice(0, ORDER_ITEM_LABEL_LIMIT);
  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    itemLabels,
  };
}

/**
 * Build surface + userMemory for a Rav ask.
 * No email, phone, address, payment, or other PII.
 */
export async function buildRavCopilotClientContext(opts: {
  navigationState?: Parameters<typeof leafRouteName>[0];
  /** Prefer store value when screen published a richer label (e.g. product name). */
  publishedFocus?: RavFocusedEntity | null;
  overlay: RavSurfaceContext['overlay'];
  wishlistIds: string[];
  catalog: CatalogItem[];
  householdId?: string | null;
}): Promise<RavCopilotClientContext> {
  const route = leafRouteName(opts.navigationState) ?? 'unknown';
  const routeParams = (() => {
    const state = opts.navigationState;
    if (!state?.routes?.length) return undefined;
    const index = state.index ?? 0;
    const routeEntry = state.routes[index];
    // Walk to leaf for params
    let cur: { name: string; state?: unknown; params?: object } | undefined = routeEntry;
    while (cur?.state && typeof cur.state === 'object' && cur.state !== null && 'routes' in cur.state) {
      const nested = cur.state as { index?: number; routes?: Array<{ name: string; state?: unknown; params?: object }> };
      const i = nested.index ?? 0;
      cur = nested.routes?.[i];
    }
    return cur?.params as Record<string, unknown> | undefined;
  })();

  const inferred = inferFocusedFromRoute(route, routeParams);
  const focusedEntity = opts.publishedFocus ?? inferred;

  const surface: RavSurfaceContext = {
    route,
    focusedEntity,
    overlay: opts.overlay,
  };

  const browseRecent = useBrowsingHistoryStore
    .getState()
    .entries.slice(0, BROWSE_LIMIT)
    .map((e) => ({ itemId: e.itemId, name: e.name, viewedAt: e.viewedAt }));

  const byId = new Map(opts.catalog.map((c) => [c.id, c.name]));
  const wishlist = opts.wishlistIds.slice(0, WISHLIST_LIMIT).map((itemId) => ({
    itemId,
    name: byId.get(itemId),
  }));

  let ordersSummary: RavOrderMemorySummary[] = [];
  if (opts.householdId) {
    try {
      const orders = await ordersService.listForHousehold(opts.householdId);
      ordersSummary = orders.slice(0, ORDERS_LIMIT).map(sanitizeOrder);
    } catch {
      ordersSummary = [];
    }
  }

  const userMemory: RavUserMemoryContext = {
    browseRecent,
    wishlist,
    ordersSummary,
  };

  return { surface, userMemory };
}

/** Format for logs / debugging — not sent as-is. */
export function formatCopilotContextPreview(ctx: RavCopilotClientContext): string {
  const route = ctx.surface?.route ?? '?';
  const focus = ctx.surface?.focusedEntity
    ? `${ctx.surface.focusedEntity.type}:${ctx.surface.focusedEntity.id}`
    : 'none';
  const browse = ctx.userMemory?.browseRecent.length ?? 0;
  const wish = ctx.userMemory?.wishlist.length ?? 0;
  const orders = ctx.userMemory?.ordersSummary.length ?? 0;
  return `route=${route} focus=${focus} browse=${browse} wishlist=${wish} orders=${orders}`;
}
