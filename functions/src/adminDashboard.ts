import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from './sentry';

/**
 * Admin "Boxes and gifts" dashboard: one read-only snapshot of Hanukkah box orders,
 * open drafts, gift invites and inventory holds. Hold math mirrors
 * recomputeBoxAllocations / addOutstandingGiftBoxes in catalogInventory.ts — keep in sync.
 */

const HOLIDAY_ID = 'hanukkah-2026';
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
const LIVE = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const DEFAULT_BOX_CENTS = 8000;
const PER_EXTRA_KID_CENTS = 1000;
const ADMIN_EMAIL = /^(brendan|joseph|maya)(\+[^@]*)?@unaffiliated\.co$/i;

export type DashLine = {
  itemId: string | null;
  name: string;
  qty: number;
  unitCents: number;
  addOn: boolean;
  child: string | null;
  forHousehold: boolean;
};

export type DashBox = {
  id: string;
  source: 'order' | 'draft';
  orderId: string | null;
  householdId: string;
  customer: string | null;
  email: string | null;
  test: boolean;
  kids: number;
  status: string;
  playthrough: boolean;
  cardOnFile: boolean;
  boxPriceCents: number;
  addOnCents: number;
  subtotalCents: number | null;
  shippingCents: number | null;
  taxCents: number | null;
  creditCents: number;
  totalCents: number | null;
  updatedAt: string | null;
  committedAt: string | null;
  attribution: string | null;
  lines: DashLine[];
};

export type DashGift = {
  id: string;
  giver: string | null;
  giverEmail: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  kind: 'box' | 'credit';
  amountCents: number | null;
  paid: boolean;
  paymentStatus: string | null;
  status: string;
  claimed: boolean;
  checkedOut: boolean;
  checkoutOrders: Array<{ id: string; status: string; totalCents: number | null; createdAt: string | null; playthrough: boolean }>;
  holdingStock: boolean;
  playthrough: boolean;
  test: boolean;
  message: string | null;
  createdAt: string | null;
  lines: DashLine[];
};

export type DashInventoryRow = {
  id: string;
  name: string;
  stock: number | null;
  heldByBoxes: number;
  heldByGifts: number;
  counterAllocated: number;
  directSold: number;
  directReserved: number;
  remaining: number | null;
  favorites: number;
  favoritesReal: number;
};

export type BoxesDashboard = {
  generatedAt: string;
  lockAt: string | null;
  counts: { households: number; drafts: number; orders: number; giftInvites: number; catalogItems: number };
  mismatches: Array<{ id: string; name: string; computed: number; counter: number }>;
  boxes: DashBox[];
  gifts: DashGift[];
  inventory: DashInventoryRow[];
};

function iso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate().toISOString();
  return null;
}
const ms = (v: unknown): number | null => {
  const s = iso(v);
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : null;
};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function addLines(totals: Map<string, number>, lines: unknown): void {
  if (!Array.isArray(lines)) return;
  for (const li of lines) {
    const id = String(li?.itemId ?? '').trim();
    if (!id) continue;
    const q = Math.max(1, Math.floor(Number(li.quantity) || 1));
    totals.set(id, (totals.get(id) ?? 0) + q);
  }
}

/** Team and QA accounts: @unaffiliated.co, placeholder domains, or anything from Joseph or Brendan. */
function isTest(...vals: Array<string | null | undefined>): boolean {
  return vals.some((v) => {
    if (!v) return false;
    const s = v.toLowerCase();
    return /@unaffiliated?(\.co)?$/.test(s) || /@(a\.com|example\.com)$/.test(s) || /joseph|jweissgold|brendan/.test(s);
  });
}

function attributionLabel(a: unknown): string | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const parts = [o.utm_source ?? o.utmSource ?? o.source, o.utm_campaign ?? o.utmCampaign ?? o.campaign].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  return parts.length ? parts.join(' / ') : null;
}

export async function buildBoxesDashboard(db: Firestore, nowMs = Date.now()): Promise<BoxesDashboard> {
  const [configSnap, hhSnap, ordersSnap, invitesSnap, itemsSnap, countersSnap, draftsSnap, childrenSnap, receivedSnap] =
    await Promise.all([
      db.doc(`config/${HOLIDAY_ID}`).get(),
      db.collection('households').get(),
      db.collectionGroup('orders').get(),
      db.collection('giftInvites').get(),
      db.collection('catalog/hanukkah/items').get(),
      db.collection('catalog/hanukkah/inventory').get(),
      db.collectionGroup('boxDrafts').get(),
      db.collectionGroup('children').get(),
      db.collectionGroup('receivedGifts').get(),
    ]);
  const config = configSnap.data() ?? {};
  const listCents = num(config.boxPriceCents) ?? DEFAULT_BOX_CENTS;
  const priceForKids = (k: number) => listCents + Math.max(0, k - 1) * PER_EXTRA_KID_CENTS;

  const items = new Map<string, { name: string; inventory: number | null }>();
  for (const d of itemsSnap.docs) {
    const x = d.data();
    items.set(d.id, { name: str(x.name) ?? d.id, inventory: num(x.inventory) });
  }

  const households = new Map<string, DocumentData>();
  const userIds = new Set<string>();
  for (const d of hhSnap.docs) {
    const h = d.data();
    households.set(d.id, h);
    if (str(h.ownerId)) userIds.add(h.ownerId);
  }
  for (const d of ordersSnap.docs) {
    const u = str(d.data().userId);
    if (u) userIds.add(u);
  }

  const childNamesByUser = new Map<string, Map<string, string | null>>();
  for (const d of childrenSnap.docs) {
    const owner = d.ref.parent.parent;
    if (!owner || owner.parent.id !== 'users') continue;
    const m = childNamesByUser.get(owner.id) ?? new Map<string, string | null>();
    m.set(d.id, str(d.data().name));
    childNamesByUser.set(owner.id, m);
  }
  const userRefs = [...userIds].map((uid) => db.doc(`users/${uid}`));
  const userSnaps = userRefs.length ? await db.getAll(...userRefs) : [];
  const users = new Map<string, { email: string | null; name: string | null }>();
  for (const s of userSnaps) {
    const x = s.data() ?? {};
    users.set(s.id, { email: str(x.email), name: str(x.displayName) });
  }

  const drafts = new Map<string, DocumentData>();
  for (const d of draftsSnap.docs) {
    const hh = d.ref.parent.parent;
    if (d.id === HOLIDAY_ID && hh && hh.parent.id === 'households') drafts.set(hh.id, d.data());
  }
  const received = new Map<string, DocumentData>();
  for (const d of receivedSnap.docs) {
    const hh = d.ref.parent.parent;
    if (hh && hh.parent.id === 'households') received.set(`${hh.id}/${d.id}`, d.data());
  }

  const customerFor = (hid: string, uid: string | null) => {
    const h = households.get(hid) ?? {};
    const owner = uid ?? str(h.ownerId);
    const u = owner ? users.get(owner) : undefined;
    const email = u?.email ?? null;
    const childNames = (owner && childNamesByUser.get(owner)) || new Map<string, string | null>();
    return {
      name: u?.name ?? (email ? email.split('@')[0] : null) ?? str(h.name),
      email,
      test: isTest(email, u?.name),
      kids: Math.max(1, childNames.size),
      childNames,
      cardOnFile: Boolean(h.cardOnFileAt || h.stripeDefaultPaymentMethodId),
    };
  };

  const lineView = (li: DocumentData, childNames: Map<string, string | null>): DashLine => {
    const itemId = str(li.itemId);
    const unitCents = num(li.unitCents) ?? 0;
    const childId = str(li.childId);
    return {
      itemId,
      name: (itemId && items.get(itemId)?.name) || str(li.label) || itemId || '?',
      qty: Math.max(0, Math.floor(Number(li.quantity) || 0)),
      unitCents,
      addOn: unitCents > 0,
      child: childId ? childNames.get(childId) ?? 'child' : null,
      forHousehold: !childId,
    };
  };
  const linesOf = (raw: unknown, childNames: Map<string, string | null>) =>
    (Array.isArray(raw) ? raw : []).filter(Boolean).map((li) => lineView(li, childNames));
  const addOnTotal = (lines: DashLine[]) =>
    lines.filter((l) => l.addOn).reduce((s, l) => s + l.unitCents * Math.max(1, l.qty), 0);

  const boxHeld = new Map<string, number>();
  const giftOrders = new Map<string, { createdMs: number; lines: unknown }>();
  const receivedGiftOrdersByKey = new Map<string, DashGift['checkoutOrders']>();
  const boxes: DashBox[] = [];
  const liveBoxHouseholds = new Set<string>();

  for (const d of ordersSnap.docs) {
    const o = d.data();
    const hid = d.ref.parent.parent?.id ?? '';
    const playthrough = o.playthrough === true;
    if (o.orderType === 'received_gift') {
      const key = `${hid}/${String(o.giftInviteId ?? d.id)}`;
      const list = receivedGiftOrdersByKey.get(key) ?? [];
      list.push({ id: d.id, status: str(o.status) ?? 'unknown', totalCents: num(o.totalCents), createdAt: iso(o.createdAt), playthrough });
      receivedGiftOrdersByKey.set(key, list);
      if (o.holidayId !== HOLIDAY_ID || playthrough || !LIVE.includes(o.status)) continue;
      if (o.status === 'pending') {
        const c = ms(o.createdAt);
        if (c != null && nowMs - c >= PENDING_TTL_MS) continue;
      }
      const createdMs = ms(o.createdAt) ?? nowMs;
      const prev = giftOrders.get(key);
      if (!prev || createdMs > prev.createdMs) giftOrders.set(key, { createdMs, lines: o.lineItems });
      continue;
    }
    const isBox = o.orderType === 'hanukkah_box' || (!o.orderType && o.holidayId === HOLIDAY_ID);
    if (!isBox) continue;
    if (o.holidayId === HOLIDAY_ID && !playthrough && LIVE.includes(o.status)) addLines(boxHeld, o.lineItems);
    if (!playthrough && LIVE.includes(o.status)) liveBoxHouseholds.add(hid);
    const c = customerFor(hid, str(o.userId));
    const lines = linesOf(o.lineItems, c.childNames);
    const addOnCents = addOnTotal(lines);
    const kids = num(o.kidCount) ?? c.kids;
    const subtotal = num(o.subtotalCents);
    boxes.push({
      id: `${hid}/${d.id}`,
      source: 'order',
      orderId: d.id,
      householdId: hid,
      customer: c.name,
      email: c.email,
      test: c.test,
      kids,
      status: str(o.status) ?? 'unknown',
      playthrough,
      cardOnFile: c.cardOnFile,
      boxPriceCents: num(o.boxPriceCents) ?? (subtotal != null ? subtotal - addOnCents : priceForKids(kids)),
      addOnCents,
      subtotalCents: subtotal,
      shippingCents: num(o.shippingCents),
      taxCents: num(o.taxCents),
      creditCents:
        (num(o.creditAppliedCents) ?? 0) || (num(o.giftCreditAppliedCents) ?? 0) + (num(o.platformCreditAppliedCents) ?? 0),
      totalCents: num(o.totalCents),
      updatedAt: iso(o.updatedAt) ?? iso(o.committedAt) ?? iso(o.createdAt),
      committedAt: iso(o.committedAt),
      attribution: attributionLabel(o.attribution),
      lines,
    });
  }

  // A draft only counts as an open box when the household has no live box order.
  for (const [hid, dr] of drafts) {
    if (liveBoxHouseholds.has(hid) || !Array.isArray(dr.lineItems) || dr.lineItems.length === 0) continue;
    const c = customerFor(hid, str(dr.updatedBy));
    const lines = linesOf(dr.lineItems, c.childNames);
    const addOnCents = addOnTotal(lines);
    const boxPriceCents = priceForKids(c.kids);
    boxes.push({
      id: `${hid}/draft`,
      source: 'draft',
      orderId: null,
      householdId: hid,
      customer: c.name,
      email: c.email,
      test: c.test,
      kids: c.kids,
      status: 'draft',
      playthrough: dr.playthrough === true || households.get(hid)?.playthrough === true,
      cardOnFile: c.cardOnFile,
      boxPriceCents,
      addOnCents,
      subtotalCents: boxPriceCents + addOnCents,
      shippingCents: null,
      taxCents: null,
      creditCents: 0,
      totalCents: null,
      updatedAt: iso(dr.updatedAt),
      committedAt: null,
      attribution: null,
      lines,
    });
  }

  const giftHeld = new Map<string, number>();
  for (const { lines } of giftOrders.values()) addLines(giftHeld, lines);
  const gifts: DashGift[] = [];
  for (const d of invitesSnap.docs) {
    const g = d.data();
    const isBox =
      g.kind === 'box' || g.kind === 'credit' ? g.kind === 'box' : Array.isArray(g.lineItems) && g.lineItems.length > 0;
    const paid = g.paymentStatus === 'paid' || (g.paymentStatus == null && Boolean(g.claimEmailSentAt));
    const hid = str(g.claimedByHouseholdId) ?? '';
    const key = `${hid}/${d.id}`;
    const rec = hid ? received.get(key) ?? null : null;
    const convertedToCredit = g.status === 'converted_to_credit' || rec?.status === 'converted_to_credit';
    const checkoutOrders = receivedGiftOrdersByKey.get(key) ?? [];
    const checkedOut = checkoutOrders.some((o) => !o.playthrough && LIVE.includes(o.status) && o.status !== 'pending');
    let holding = false;
    if (g.playthrough !== true && isBox && paid && (g.status === 'pending' || g.status === 'claimed')) {
      if (g.status === 'pending' || !hid) {
        addLines(giftHeld, g.lineItems);
        holding = true;
      } else if (!giftOrders.has(key) && rec?.status !== 'converted_to_credit') {
        addLines(giftHeld, Array.isArray(rec?.lineItems) ? rec?.lineItems : g.lineItems);
        holding = true;
      }
    }
    const recipient = hid ? customerFor(hid, null) : null;
    const lineSource = Array.isArray(rec?.lineItems) ? rec?.lineItems : g.lineItems;
    gifts.push({
      id: d.id,
      giver: str(g.giverName),
      giverEmail: str(g.giverEmail),
      recipientEmail: str(g.recipientEmail),
      recipientName: recipient?.name ?? null,
      kind: isBox ? 'box' : 'credit',
      amountCents: num(g.creditCents),
      paid,
      paymentStatus: str(g.paymentStatus) ?? (g.claimEmailSentAt ? 'legacy-sent' : null),
      status: convertedToCredit ? 'converted_to_credit' : str(g.status) ?? 'unknown',
      claimed: Boolean(hid) || g.status === 'claimed',
      checkedOut,
      checkoutOrders,
      holdingStock: holding,
      playthrough: g.playthrough === true,
      test: isTest(str(g.giverEmail), str(g.giverName), str(g.recipientEmail), recipient?.email, recipient?.name),
      message: str(g.message),
      createdAt: iso(g.createdAt),
      lines: linesOf(lineSource, recipient?.childNames ?? new Map()),
    });
  }

  const favorites = new Map<string, number>();
  const favoritesReal = new Map<string, number>();
  for (const [hid, h] of households) {
    if (!Array.isArray(h.wishlistItemIds)) continue;
    const real = !customerFor(hid, null).test;
    for (const id of new Set(h.wishlistItemIds.filter((x: unknown): x is string => typeof x === 'string'))) {
      favorites.set(id, (favorites.get(id) ?? 0) + 1);
      if (real) favoritesReal.set(id, (favoritesReal.get(id) ?? 0) + 1);
    }
  }

  const counters = new Map(countersSnap.docs.map((d) => [d.id, d.data()]));
  const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const ids = new Set([...items.keys(), ...counters.keys(), ...boxHeld.keys(), ...giftHeld.keys()]);
  const inventory: DashInventoryRow[] = [];
  const mismatches: BoxesDashboard['mismatches'] = [];
  for (const id of ids) {
    const it = items.get(id);
    const c = counters.get(id) ?? {};
    const heldByBoxes = boxHeld.get(id) ?? 0;
    const heldByGifts = giftHeld.get(id) ?? 0;
    const counterAllocated = n0(c.boxAllocatedQty);
    const directSold = n0(c.directSoldQty);
    const directReserved = n0(c.directReservedQty);
    const stock = it?.inventory ?? null;
    if (heldByBoxes + heldByGifts !== counterAllocated) {
      mismatches.push({ id, name: it?.name ?? id, computed: heldByBoxes + heldByGifts, counter: counterAllocated });
    }
    if (!it) continue;
    inventory.push({
      id,
      name: it.name,
      stock,
      heldByBoxes,
      heldByGifts,
      counterAllocated,
      directSold,
      directReserved,
      remaining: stock == null ? null : stock - counterAllocated - directSold - directReserved,
      favorites: favorites.get(id) ?? 0,
      favoritesReal: favoritesReal.get(id) ?? 0,
    });
  }
  boxes.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  gifts.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

  return {
    generatedAt: new Date(nowMs).toISOString(),
    lockAt: iso(config.lockAt),
    counts: {
      households: households.size,
      drafts: drafts.size,
      orders: ordersSnap.size,
      giftInvites: invitesSnap.size,
      catalogItems: items.size,
    },
    mismatches,
    boxes,
    gifts,
    inventory,
  };
}

export function createAdminBoxesDashboard(db: Firestore) {
  return onCall(async (request): Promise<BoxesDashboard> => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
    const email = (request.auth.token.email as string | undefined) ?? '';
    if (!ADMIN_EMAIL.test(email)) throw new HttpsError('permission-denied', 'Admin only.');
    return buildBoxesDashboard(db);
  });
}
