import { FieldValue, type DocumentData, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from './sentry';
import { isAdminToken } from './guestSessions';
import { isTest } from './testAccounts';
import { historyLines, type HistoryLine } from './boxHistoryDiff';
import { lineOriginVsDefault, type DashLineOrigin } from './adminDashboard';
import { shopOrderState } from './shopOrders';

/**
 * Packing list for the warehouse: paid Hanukkah boxes, paid storefront (shop) orders and paid gift
 * boxes that have a ship-to address. Each package gets a box size and each line gets a shared
 * "packed" checkbox. Size and packed state live in `packingPackages/{packageId}` (admin SDK only).
 *
 * Box orders are only "paid" once charged at lock (status confirmed or later), so they appear after lock.
 * Committed boxes (checkout done, card not charged) are included with `awaitingPayment` so the
 * packing page can preview them behind the "Simulate Post-Lock" toggle. They stay out of the
 * default list.
 */

const HOLIDAY_ID = 'hanukkah-2026';
const CHARGED_BOX_STATUSES = ['confirmed', 'shipped', 'delivered'];

/** Charged box orders always pack. Committed orders are the post-lock preview. Everything else stays off the list. */
export function packingBoxCharge(status: unknown): 'charged' | 'awaiting' | 'hidden' {
  const s = String(status ?? '');
  if (CHARGED_BOX_STATUSES.includes(s)) return 'charged';
  if (s === 'committed') return 'awaiting';
  return 'hidden';
}
const PACKING_COLLECTION = 'packingPackages';
const PACKAGE_ID = /^(box|shop|gift)_[A-Za-z0-9_-]{1,200}$/;

/** Box sizes in inches. Default for box orders and gifts is 14×14×6; 10×8×6 is for shop orders only; 14×14×12 is picked by hand when flagged. */
export const PACKING_SIZES = {
  '14x14x6': { label: '14 × 14 × 6 in' },
  '14x14x12': { label: '14 × 14 × 12 in' },
  '10x8x6': { label: '10 × 8 × 6 in' },
} as const;
export type PackingSize = keyof typeof PACKING_SIZES;
const PACKING_SIZE_KEYS = Object.keys(PACKING_SIZES) as PackingSize[];

export type PackingKind = 'box' | 'shop' | 'gift';

export type PackingAddress = {
  name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string | null;
};

export type PackingLine = {
  /** Stable within a package: item + child + occurrence. Used as the packed-map key. */
  key: string;
  itemId: string | null;
  name: string;
  qty: number;
  child: string | null;
  forHousehold: boolean;
  /** Versus the household's default build; null for shop orders and gifts. */
  origin: DashLineOrigin | null;
  /** Pre-wrap chosen for this item. */
  wrap: boolean;
  dimensions: string | null;
  /** Largest of the first three numbers in `dimensions` (inches), or null when unknown. */
  maxInches: number | null;
  packed: boolean;
};

export type PackingPackage = {
  id: string;
  kind: PackingKind;
  /** Order status or gift status, for the label. */
  status: string;
  /** "Order 1A2B3C4D" or "Gift from Sam". */
  reference: string;
  /** Name on the label. */
  recipient: string | null;
  email: string | null;
  test: boolean;
  paidAt: string | null;
  destination: PackingAddress | null;
  kids: Array<{ name: string | null; age: string | null }>;
  sliders: { hanukkah: number | null; jewish: number | null };
  note: string | null;
  recommendedSize: PackingSize;
  /** Flag only: an item is over 12 in or the package holds a lot of units (see mayNeedLargeBox). */
  mayNeedLargeBox: boolean;
  size: PackingSize;
  /** A packer has picked a size (otherwise `size` is the recommendation). */
  sizeSet: boolean;
  /** Committed box whose card has not been charged yet. Hidden unless Simulate Post-Lock is on. */
  awaitingPayment: boolean;
  lines: PackingLine[];
};

export type AdminPackingList = {
  generatedAt: string;
  packages: PackingPackage[];
};

type ItemMeta = { name: string; dimensions: string | null; maxInches: number | null };
type ChildInfo = { name: string | null; age: string | null };
type UserInfo = { email: string | null; name: string | null; last: Record<string, unknown> };

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];

function iso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate().toISOString();
  return null;
}

function score(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : Math.round(Math.max(0, Math.min(100, n)));
}

/** Largest of the first three numbers before any parenthetical: '6.3" h × 5.1" w × 1.4" d' → 6.3. */
export function maxDimensionInches(raw: string | null): number | null {
  if (!raw) return null;
  const main = raw.split('(')[0];
  const nums = [...main.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).slice(0, 3);
  return nums.length ? Math.max(...nums) : null;
}

function addressOf(raw: unknown): PackingAddress | null {
  if (!isRecord(raw)) return null;
  const line1 = str(raw.line1);
  if (!line1) return null;
  return {
    name: str(raw.name),
    line1,
    line2: str(raw.line2),
    city: str(raw.city) ?? '',
    stateProvince: str(raw.stateProvince) ?? '',
    postalCode: str(raw.postalCode) ?? '',
    country: str(raw.country),
  };
}

/** Recommended box: shop orders use 10×8×6; boxes and gifts use 14×14×6. Packers pick a bigger box from the flag. */
export function recommendedSizeFor(kind: PackingKind): PackingSize {
  return kind === 'shop' ? '10x8x6' : '14x14x6';
}

/** An item longer than this (inches, largest dimension) can't fit a 10×8×6 or 14×14×6 box lying flat. */
export const LARGE_BOX_ITEM_INCHES = 12;
/**
 * Total units in a package that count as "a lot of stuff": the 90th percentile of saved default
 * Hanukkah boxes (median 14, p75 16, p90 18). Above this, the package may need a larger box.
 */
export const LARGE_BOX_UNITS = 18;

/** Flag for the packer: an item is too long for the box, or the package holds a lot of units. */
export function mayNeedLargeBox(lines: PackingLine[]): boolean {
  const units = lines.reduce((sum, l) => sum + l.qty, 0);
  return units > LARGE_BOX_UNITS || lines.some((l) => (l.maxInches ?? 0) > LARGE_BOX_ITEM_INCHES);
}

function buildLines(args: {
  raw: unknown;
  items: Map<string, ItemMeta>;
  childName: (childId: string) => string | null;
  defaults: HistoryLine[] | null;
  wrap: ReadonlySet<string>;
}): PackingLine[] {
  const seen = new Map<string, number>();
  const out: PackingLine[] = [];
  for (const raw of Array.isArray(args.raw) ? args.raw : []) {
    if (!raw || typeof raw !== 'object') continue;
    const li = raw as DocumentData;
    const qty = Math.max(0, Math.floor(Number(li.quantity) || 0));
    if (qty <= 0) continue;
    const itemId = str(li.itemId);
    const childId = str(li.childId);
    const meta = itemId ? args.items.get(itemId) : undefined;
    const base = `${itemId ?? str(li.label) ?? '?'}|${childId ?? 'household'}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({
      key: `${base}|${n}`,
      itemId,
      name: meta?.name ?? str(li.label) ?? itemId ?? '?',
      qty,
      child: childId ? args.childName(childId) ?? 'Child' : null,
      forHousehold: !childId,
      origin: lineOriginVsDefault(li, args.defaults),
      wrap: Boolean(itemId && args.wrap.has(itemId)),
      dimensions: meta?.dimensions ?? null,
      maxInches: meta?.maxInches ?? null,
      packed: false,
    });
  }
  return out;
}

const emptySliders = { hanukkah: null, jewish: null };

async function getAllSafe(db: Firestore, refs: DocumentReference[]): Promise<Array<{ id: string; data: () => DocumentData | undefined }>> {
  return refs.length ? db.getAll(...refs) : [];
}

export async function buildAdminPackingList(db: Firestore, nowMs = Date.now()): Promise<AdminPackingList> {
  const [ordersSnap, invitesSnap, receivedSnap, itemsSnap, childrenSnap] = await Promise.all([
    db.collectionGroup('orders').get(),
    db.collection('giftInvites').get(),
    db.collectionGroup('receivedGifts').get(),
    db.collection('catalog/hanukkah/items').get(),
    db.collectionGroup('children').get(),
  ]);

  const items = new Map<string, ItemMeta>();
  for (const d of itemsSnap.docs) {
    const x = d.data();
    const dimensions = str(x.dimensions);
    items.set(d.id, { name: str(x.name) ?? d.id, dimensions, maxInches: maxDimensionInches(dimensions) });
  }

  const childInfoById = new Map<string, ChildInfo>();
  const childrenByOwner = new Map<string, ChildInfo[]>();
  for (const d of childrenSnap.docs) {
    const owner = d.ref.parent.parent;
    if (!owner || owner.parent.id !== 'users') continue;
    const x = d.data();
    const age =
      typeof x.plannerAge === 'number' && Number.isFinite(x.plannerAge)
        ? String(Math.max(0, Math.floor(x.plannerAge)))
        : str(x.ageGroup);
    const info: ChildInfo = { name: str(x.name), age };
    childInfoById.set(d.id, info);
    const list = childrenByOwner.get(owner.id) ?? [];
    list.push(info);
    childrenByOwner.set(owner.id, list);
  }

  // Gift recipients' copies of the gift (customised after claim) and any live checkout order for it.
  const receivedByKey = new Map<string, DocumentData>();
  for (const d of receivedSnap.docs) {
    const hh = d.ref.parent.parent;
    if (hh && hh.parent.id === 'households') receivedByKey.set(`${hh.id}/${d.id}`, d.data());
  }

  type OrderRow = { hid: string; id: string; o: DocumentData; awaitingPayment?: boolean };
  const boxRows: OrderRow[] = [];
  const shopRows: OrderRow[] = [];
  const liveGiftOrderByInvite = new Map<string, DocumentData>();
  for (const d of ordersSnap.docs) {
    const o = d.data();
    const hid = d.ref.parent.parent?.id ?? '';
    if (!hid || o.playthrough === true) continue;
    if (o.orderType === 'received_gift') {
      const inviteId = str(o.giftInviteId);
      if (inviteId && o.holidayId === HOLIDAY_ID && packingBoxCharge(o.status) === 'charged') {
        liveGiftOrderByInvite.set(inviteId, o);
      }
      continue;
    }
    if (o.orderType === 'marketplace') {
      // Paid, not cancelled or fully refunded (a cancelled order with a confirmed date still shows as paid elsewhere).
      const state = shopOrderState(o);
      if (state.paid && state.status !== 'refunded' && state.status !== 'cancelled') shopRows.push({ hid, id: d.id, o });
      continue;
    }
    const isBox = o.orderType === 'hanukkah_box' || (!o.orderType && o.holidayId === HOLIDAY_ID);
    const charge = packingBoxCharge(o.status);
    if (isBox && o.holidayId === HOLIDAY_ID && charge !== 'hidden') {
      boxRows.push({ hid, id: d.id, o, awaitingPayment: charge === 'awaiting' });
    }
  }

  // Per-household reads for the paid boxes: household (owner fallback), draft (wrap fallback), default build.
  const boxHids = [...new Set(boxRows.map((r) => r.hid))];
  const [hhSnaps, draftSnaps, histSnaps] = await Promise.all([
    getAllSafe(db, boxHids.map((hid) => db.doc(`households/${hid}`))),
    getAllSafe(db, boxHids.map((hid) => db.doc(`households/${hid}/boxDrafts/${HOLIDAY_ID}`))),
    getAllSafe(db, boxHids.map((hid) => db.doc(`households/${hid}/boxDrafts/${HOLIDAY_ID}/history/default`))),
  ]);
  const householdById = new Map<string, DocumentData>(hhSnaps.map((s) => [s.id, s.data() ?? {}]));
  const draftByHid = new Map<string, DocumentData>(boxHids.map((hid, i) => [hid, draftSnaps[i]?.data() ?? {}]));
  const defaultsByHid = new Map<string, HistoryLine[] | null>(
    boxHids.map((hid, i) => {
      const def = histSnaps[i]?.data()?.box;
      const lines = historyLines(isRecord(def) ? def.lineItems : null);
      return [hid, lines.length ? lines : null];
    }),
  );

  // Users: box owners and shop buyers, for email, name, slider answers and the Rav note.
  const userIds = new Set<string>();
  for (const r of boxRows) {
    const uid = str(r.o.userId) ?? str(householdById.get(r.hid)?.ownerId);
    if (uid) userIds.add(uid);
  }
  for (const r of shopRows) {
    const uid = str(r.o.userId);
    if (uid) userIds.add(uid);
  }
  const userSnaps = await getAllSafe(db, [...userIds].map((uid) => db.doc(`users/${uid}`)));
  const usersById = new Map<string, UserInfo>();
  for (const s of userSnaps) {
    const x = s.data() ?? {};
    usersById.set(s.id, {
      email: str(x.email),
      name: str(x.displayName)?.split(/\s+/)[0] ?? null,
      last: isRecord(x.lastBoxAnswers) ? x.lastBoxAnswers : {},
    });
  }

  const packages: Array<Omit<PackingPackage, 'size' | 'sizeSet' | 'mayNeedLargeBox'>> = [];

  for (const r of boxRows) {
    const hh = householdById.get(r.hid) ?? {};
    const uid = str(r.o.userId) ?? str(hh.ownerId);
    const user = uid ? usersById.get(uid) : undefined;
    const last = user?.last ?? {};
    const wrap = new Set(strList(r.o.wrapSelectedItemIds ?? draftByHid.get(r.hid)?.wrapSelectedItemIds));
    const kids = uid ? childrenByOwner.get(uid) ?? [] : [];
    const shipping = addressOf(r.o.shippingAddress);
    const lines = buildLines({
      raw: r.o.lineItems,
      items,
      childName: (id) => childInfoById.get(id)?.name ?? null,
      defaults: defaultsByHid.get(r.hid) ?? null,
      wrap,
    });
    packages.push({
      id: `box_${r.hid}_${r.id}`,
      kind: 'box',
      status: str(r.o.status) ?? 'unknown',
      reference: `Order ${r.id.slice(0, 8).toUpperCase()}`,
      recipient: shipping?.name ?? user?.name ?? null,
      email: str(r.o.guestEmail) ?? user?.email ?? null,
      test: isTest(str(r.o.guestEmail) ?? user?.email, user?.name, shipping?.name),
      paidAt: iso(r.o.confirmedAt) ?? iso(r.o.committedAt) ?? iso(r.o.createdAt),
      destination: shipping,
      kids: kids.map((k) => ({ name: k.name, age: k.age })),
      sliders: {
        hanukkah: score(last.familiarityScore),
        jewish: score(last.practiceFrequencyScore),
      },
      note: str(last.ravNotes) ?? null,
      recommendedSize: '14x14x6',
      awaitingPayment: r.awaitingPayment === true,
      lines,
    });
  }

  for (const d of invitesSnap.docs) {
    const g = d.data();
    const isBox =
      g.kind === 'box' || g.kind === 'credit' ? g.kind === 'box' : Array.isArray(g.lineItems) && g.lineItems.length > 0;
    if (!isBox || g.playthrough === true || g.status === 'converted_to_credit') continue;
    const paid = g.paymentStatus === 'paid' || (g.paymentStatus == null && Boolean(g.claimEmailSentAt));
    if (!paid) continue;

    const claimedHid = str(g.claimedByHouseholdId);
    const rec = claimedHid ? receivedByKey.get(`${claimedHid}/${d.id}`) : undefined;
    const liveOrder = liveGiftOrderByInvite.get(d.id);
    const shipping = addressOf(liveOrder?.shippingAddress) ?? addressOf(g.shippingAddress);
    // Ship only when there is an address; QA gifts without one are skipped.
    if (!shipping) continue;

    const rawLines = liveOrder && Array.isArray(liveOrder.lineItems) ? liveOrder.lineItems : rec?.lineItems ?? g.lineItems;
    const wrap = new Set(strList(liveOrder?.wrapSelectedItemIds ?? rec?.wrapSelectedItemIds ?? g.wrapSelectedItemIds));
    const lines = buildLines({
      raw: rawLines,
      items,
      childName: (id) => childInfoById.get(id)?.name ?? null,
      defaults: null,
      wrap,
    });
    const giver = str(g.giverName) ?? str(g.giverEmail) ?? 'a giver';
    packages.push({
      id: `gift_${d.id}`,
      kind: 'gift',
      status: str(g.status) ?? 'unknown',
      reference: `Gift from ${giver}`,
      recipient: shipping.name ?? str(g.recipientName) ?? str(g.recipientEmail),
      email: str(g.recipientEmail),
      test: isTest(str(g.giverEmail), str(g.giverName), str(g.recipientEmail), shipping.name),
      paidAt: iso(g.claimEmailSentAt) ?? iso(g.createdAt),
      destination: shipping,
      kids: [],
      sliders: emptySliders,
      note: str(g.message),
      recommendedSize: '14x14x6',
      awaitingPayment: false,
      lines,
    });
  }

  for (const r of shopRows) {
    const user = str(r.o.userId) ? usersById.get(str(r.o.userId) as string) : undefined;
    const shipping = addressOf(r.o.shippingAddress);
    const email = str(r.o.guestEmail) ?? user?.email ?? str(r.o.shippingAddress?.email);
    const lines = buildLines({
      raw: r.o.lineItems,
      items,
      childName: () => null,
      defaults: null,
      wrap: new Set(strList(r.o.wrapSelectedItemIds)),
    });
    packages.push({
      id: `shop_${r.hid}_${r.id}`,
      kind: 'shop',
      status: shopOrderState(r.o).status,
      reference: `Order ${r.id.slice(0, 8).toUpperCase()}`,
      recipient: shipping?.name ?? user?.name ?? null,
      email,
      test: isTest(email, user?.name),
      paidAt: iso(r.o.confirmedAt) ?? iso(r.o.createdAt),
      destination: shipping,
      kids: [],
      sliders: emptySliders,
      note: null,
      recommendedSize: recommendedSizeFor('shop'),
      awaitingPayment: false,
      lines,
    });
  }

  // Shared packing state: chosen size and packed lines, one doc per package.
  const stored = await getAllSafe(
    db,
    packages.map((p) => db.doc(`${PACKING_COLLECTION}/${p.id}`)),
  );
  const storedById = new Map<string, DocumentData>(stored.map((s) => [s.id, s.data() ?? {}]));

  const out: PackingPackage[] = packages.map((p) => {
    const state = storedById.get(p.id) ?? {};
    const packedMap = isRecord(state.packed) ? state.packed : {};
    const picked = typeof state.size === 'string' && (PACKING_SIZE_KEYS as string[]).includes(state.size)
      ? (state.size as PackingSize)
      : null;
    const lines = p.lines.map((l) => ({ ...l, packed: packedMap[l.key] === true }));
    return {
      ...p,
      lines,
      mayNeedLargeBox: mayNeedLargeBox(lines),
      size: picked ?? p.recommendedSize,
      sizeSet: picked != null,
    };
  });

  out.sort((a, b) => (a.paidAt ?? '').localeCompare(b.paidAt ?? ''));

  return { generatedAt: new Date(nowMs).toISOString(), packages: out };
}

const PACKING_CALL_OPTS = {
  timeoutSeconds: 300,
  memory: '1GiB' as const,
};

export function createAdminPacking(db: Firestore) {
  const getAdminPacking = onCall(PACKING_CALL_OPTS, async (request): Promise<AdminPackingList> => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
    if (!isAdminToken(request.auth.token)) throw new HttpsError('permission-denied', 'Admin only.');
    return buildAdminPackingList(db);
  });

  /** Set a line's packed flag, or a package's box size. Shared across admins. */
  const setAdminPackingState = onCall(PACKING_CALL_OPTS, async (request): Promise<{ ok: true }> => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
    if (!isAdminToken(request.auth.token)) throw new HttpsError('permission-denied', 'Admin only.');
    const data = (request.data ?? {}) as { packageId?: unknown; lineKey?: unknown; packed?: unknown; size?: unknown };
    const packageId = typeof data.packageId === 'string' ? data.packageId : '';
    if (!PACKAGE_ID.test(packageId)) throw new HttpsError('invalid-argument', 'Unknown package.');

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.token.email ?? request.auth.uid,
    };
    const lineKey = typeof data.lineKey === 'string' ? data.lineKey : '';
    if (lineKey) {
      if (lineKey.length > 300) throw new HttpsError('invalid-argument', 'Line key too long.');
      update.packed = { [lineKey]: data.packed === true };
    }
    if (data.size !== undefined) {
      if (typeof data.size !== 'string' || !(PACKING_SIZE_KEYS as string[]).includes(data.size)) {
        throw new HttpsError('invalid-argument', 'Unknown box size.');
      }
      update.size = data.size;
    }
    if (!lineKey && data.size === undefined) throw new HttpsError('invalid-argument', 'Nothing to update.');

    await db.doc(`${PACKING_COLLECTION}/${packageId}`).set(update, { merge: true });
    return { ok: true };
  });

  return { getAdminPacking, setAdminPackingState };
}
