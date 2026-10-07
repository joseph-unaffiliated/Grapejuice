import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from './sentry';

/**
 * Admin "Boxes and gifts" dashboard: one read-only snapshot of Hanukkah box orders,
 * open drafts, anonymous (signed-out) boxes, gift invites and inventory holds. Hold math mirrors
 * recomputeBoxAllocations / addOutstandingGiftBoxes in catalogInventory.ts — keep in sync.
 */

const HOLIDAY_ID = 'hanukkah-2026';
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
const LIVE = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const DEFAULT_BOX_CENTS = 8000;
const PER_EXTRA_KID_CENTS = 1000;
const ADMIN_EMAIL = /^(brendan|joseph|maya)(\+[^@]*)?@unaffiliated\.co$/i;
const GUEST_ROW_LIMIT = 500;
/** Onboarding steps after the two sliders — reaching one means the scores are real answers, not defaults. */
const STEPS_AFTER_SLIDERS = ['rav-question', 'building', 'reveal'];

/** Onboarding slider answers, 0–100. Hanukkah: "don't really do it" → "all eight nights"; jewish: "almost never" → "every day". */
export type DashAnswers = {
  hanukkah: number | null;
  /** Set when only the coarse level was saved (older accounts). */
  hanukkahLevel: string | null;
  jewish: number | null;
};

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
  /** Ship-to state ("NY", "ON, Canada"); drafts fall back to the household's latest order address. */
  location: string | null;
  answers: DashAnswers;
  lines: DashLine[];
};

export type DashGuest = {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  /** Furthest point reached: started onboarding, answered the sliders, built a box, or saw the reveal. */
  stage: 'started' | 'answered' | 'built' | 'revealed' | 'gift';
  step: string | null;
  kids: number;
  boxPriceCents: number;
  addOnCents: number;
  answers: DashAnswers;
  source: string | null;
  landingPath: string | null;
  lastPath: string | null;
  converted: boolean;
  convertedAt: string | null;
  leadAt: string | null;
  resumeCount: number;
  saveCount: number;
  gift: { kind: string | null; giverName: string | null; recipientEmail: string | null; items: number } | null;
  lines: DashLine[];
};

export type DashGift = {
  id: string;
  giver: string | null;
  giverEmail: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  recipientAnswers: DashAnswers;
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
  /** Ship-to state: the giver-entered address, else the recipient household's latest order address. */
  location: string | null;
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

/** One person per row for the By ad tab: raw slider answers (scored client-side) and how far they got. */
export type DashAdPerson = {
  id: string;
  /** utm_content (the Meta ad name), or "Meta, ad unknown" / "Not from an ad". */
  ad: string;
  account: boolean;
  test: boolean;
  answered: boolean;
  box: boolean;
  /** Committed (not pending) box order. */
  purchase: boolean;
  jewish: number | null;
  hanukkah: number | null;
  firstSeen: string | null;
};

export type BoxesDashboard = {
  generatedAt: string;
  lockAt: string | null;
  counts: {
    households: number;
    drafts: number;
    orders: number;
    giftInvites: number;
    catalogItems: number;
    guestSessions: number;
  };
  mismatches: Array<{ id: string; name: string; computed: number; counter: number }>;
  boxes: DashBox[];
  guests: DashGuest[];
  gifts: DashGift[];
  inventory: DashInventoryRow[];
  adPeople: DashAdPerson[];
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
    return /@unaffiliated?(\.co)?$/.test(s) || /@(a\.com|test\.com|example\.com)$/.test(s) || /joseph|jweissgold|brendan/.test(s);
  });
}

const score = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(Math.max(0, Math.min(100, n)));
};
const NO_ANSWERS: DashAnswers = { hanukkah: null, hanukkahLevel: null, jewish: null };

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function guestSourceLabel(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;
  const fromUtm = attributionLabel(e.utm);
  if (fromUtm) return fromUtm;
  if (str(e.fbclid)) return 'Meta (fbclid)';
  return hostOf(e.referrer);
}

function attributionLabel(a: unknown): string | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const parts = [o.utm_source ?? o.utmSource ?? o.source, o.utm_campaign ?? o.utmCampaign ?? o.campaign].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  return parts.length ? parts.join(' / ') : null;
}

const US_STATES: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO',
  CONNECTICUT: 'CT', DELAWARE: 'DE', 'DISTRICT OF COLUMBIA': 'DC', FLORIDA: 'FL', GEORGIA: 'GA',
  HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY',
  LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
  MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
  OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
  VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY', 'PUERTO RICO': 'PR',
};
const CA_PROVINCES: Record<string, string> = {
  ALBERTA: 'AB', 'BRITISH COLUMBIA': 'BC', MANITOBA: 'MB', 'NEW BRUNSWICK': 'NB',
  'NEWFOUNDLAND AND LABRADOR': 'NL', NEWFOUNDLAND: 'NL', 'NOVA SCOTIA': 'NS', ONTARIO: 'ON',
  'PRINCE EDWARD ISLAND': 'PE', QUEBEC: 'QC', QUÉBEC: 'QC', SASKATCHEWAN: 'SK',
  'NORTHWEST TERRITORIES': 'NT', NUNAVUT: 'NU', YUKON: 'YT',
};
const US_CODES = new Set(Object.values(US_STATES));
const CA_CODES = new Set(Object.values(CA_PROVINCES));

/**
 * State only — the dashboard never carries street addresses. The address form defaults country to
 * US, so Canada is inferred from the province.
 */
function locationOf(addr: unknown): string | null {
  if (!addr || typeof addr !== 'object') return null;
  const a = addr as Record<string, unknown>;
  const raw = typeof a.stateProvince === 'string' ? a.stateProvince.trim().replace(/\.|\s+(?=\s)/g, '').toUpperCase() : '';
  if (!raw) return null;
  const ca = CA_PROVINCES[raw] ?? (CA_CODES.has(raw) ? raw : null);
  const us = US_STATES[raw] ?? (US_CODES.has(raw) ? raw : null);
  if (ca && (a.country === 'CA' || !us)) return `${ca}, Canada`;
  if (us) return us;
  return a.country === 'OTHER' ? `${raw} (intl)` : raw;
}

const META_AD_UNKNOWN = 'Meta, ad unknown';
const NOT_FROM_AD = 'Not from an ad';

/** Ad name from a touch (`{ utm, fbclid }`) or a guest entry; utm keys may be bare or utm_-prefixed. */
function adNameOf(touch: unknown): string | null {
  if (!touch || typeof touch !== 'object') return null;
  const t = touch as Record<string, unknown>;
  const u = (t.utm && typeof t.utm === 'object' ? t.utm : {}) as Record<string, unknown>;
  const content = str(u.utm_content) ?? str(u.content);
  if (content) return content;
  const source = (str(u.utm_source) ?? str(u.source))?.toLowerCase();
  return source === 'meta' || str(t.fbclid) ? META_AD_UNKNOWN : null;
}

function guestAnsweredSliders(guest: DocumentData): boolean {
  return (
    guest.onboardingComplete === true ||
    guest.boxRevealComplete === true ||
    STEPS_AFTER_SLIDERS.includes(String(guest.onboardingStep)) ||
    (Array.isArray(guest.lineItems) && guest.lineItems.length > 0 && guest.buildBoxPath === true)
  );
}

function guestAnswers(guest: DocumentData): DashAnswers {
  return { hanukkah: score(guest.familiarityScore), hanukkahLevel: null, jewish: score(guest.practiceFrequencyScore) };
}

/** Signed-out visitors' saved boxes (guestSessions). Favorites-only browsing is left out. */
function buildGuestRows(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  items: Map<string, { name: string }>,
  priceForKids: (kids: number) => number,
): DashGuest[] {
  const rows: DashGuest[] = [];
  for (const d of docs) {
    const x = d.data();
    const guest: DocumentData = x.snapshot?.guest ?? {};
    const gift: DocumentData | null = x.snapshot?.gift ?? null;
    const giftDraft: DocumentData | null = gift?.draft ?? null;
    const kidDrafts = (Array.isArray(guest.childDrafts) ? guest.childDrafts : []).filter(
      (c: DocumentData) => c && c.role !== 'adult',
    );
    const rawLines: unknown[] = Array.isArray(guest.lineItems) ? guest.lineItems : [];
    const step = str(guest.onboardingStep);
    if (!rawLines.length && !step && !kidDrafts.length && !giftDraft && guest.boxRevealComplete !== true) continue;

    const kidLabels = new Map<string, string>();
    kidDrafts.forEach((c: DocumentData, i: number) => {
      const age = num(c.plannerAge);
      kidLabels.set(`guest-${i}`, `Kid ${i + 1}${age != null ? ` (${age >= 18 ? '18+' : age})` : ''}`);
    });
    const lines: DashLine[] = rawLines.filter(Boolean).map((raw) => {
      const li = raw as DocumentData;
      const itemId = str(li.itemId);
      const unitCents = num(li.unitCents) ?? 0;
      const childId = str(li.childId);
      return {
        itemId,
        name: (itemId && items.get(itemId)?.name) || str(li.label) || itemId || '?',
        qty: Math.max(0, Math.floor(Number(li.quantity) || 0)),
        unitCents,
        addOn: unitCents > 0,
        child: childId ? kidLabels.get(childId) ?? 'child' : null,
        forHousehold: !childId,
      };
    });
    const answered = guestAnsweredSliders(guest);
    const stage: DashGuest['stage'] = guest.boxRevealComplete
      ? 'revealed'
      : lines.length
        ? 'built'
        : answered
          ? 'answered'
          : step || kidDrafts.length
            ? 'started'
            : 'gift';
    const kids = Math.max(1, kidDrafts.length);
    const giftLines = Array.isArray(giftDraft?.lineItems) ? giftDraft?.lineItems.length : 0;
    rows.push({
      id: d.id,
      createdAt: iso(x.createdAt),
      updatedAt: iso(x.updatedAt),
      stage,
      step,
      kids,
      boxPriceCents: priceForKids(kids),
      addOnCents: lines.filter((l) => l.addOn).reduce((s, l) => s + l.unitCents * Math.max(1, l.qty), 0),
      answers: answered ? guestAnswers(guest) : NO_ANSWERS,
      source: guestSourceLabel(x.entry),
      landingPath: str(x.entry?.landingPath),
      lastPath: str(x.path),
      converted: Boolean(str(x.convertedUid)),
      convertedAt: iso(x.convertedAt),
      leadAt: iso(x.lastLeadAt),
      resumeCount: num(x.resumeCount) ?? 0,
      saveCount: num(x.saveCount) ?? 0,
      gift: giftDraft
        ? {
            kind: str(gift?.kind),
            giverName: str(giftDraft.form?.giverName),
            recipientEmail: str(giftDraft.form?.recipientEmail),
            items: giftLines,
          }
        : null,
      lines,
    });
  }
  rows.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  return rows.slice(0, GUEST_ROW_LIMIT);
}

export async function buildBoxesDashboard(db: Firestore, nowMs = Date.now()): Promise<BoxesDashboard> {
  const [
    configSnap,
    hhSnap,
    ordersSnap,
    invitesSnap,
    itemsSnap,
    countersSnap,
    draftsSnap,
    childrenSnap,
    receivedSnap,
    guestSnap,
  ] = await Promise.all([
      db.doc(`config/${HOLIDAY_ID}`).get(),
      db.collection('households').get(),
      db.collectionGroup('orders').get(),
      db.collection('giftInvites').get(),
      db.collection('catalog/hanukkah/items').get(),
      db.collection('catalog/hanukkah/inventory').get(),
      db.collectionGroup('boxDrafts').get(),
      db.collectionGroup('children').get(),
      db.collectionGroup('receivedGifts').get(),
      db
        .collection('guestSessions')
        .select('snapshot', 'entry', 'path', 'createdAt', 'updatedAt', 'convertedUid', 'convertedAt', 'lastLeadAt', 'resumeCount', 'saveCount')
        .get(),
    ]);
  const guestDocs = guestSnap.docs.filter((d) => !d.id.startsWith('agenttest'));
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
  // Slider answers from a converted guest session fill in for accounts with no saved lastBoxAnswers.
  const guestAnswersByUid = new Map<string, DashAnswers>();
  const guestAdByUid = new Map<string, string>();
  for (const d of guestSnap.docs) {
    const x = d.data();
    const uid = str(x.convertedUid);
    const guest = x.snapshot?.guest;
    if (uid && guest && guestAnsweredSliders(guest)) guestAnswersByUid.set(uid, guestAnswers(guest));
    const ad = uid ? adNameOf(x.entry) : null;
    if (uid && ad) guestAdByUid.set(uid, ad);
  }
  const users = new Map<
    string,
    { email: string | null; name: string | null; answers: DashAnswers; householdId: string | null; ad: string; createdAt: string | null }
  >();
  for (const s of userSnaps) {
    const x = s.data() ?? {};
    const last = x.lastBoxAnswers ?? {};
    const fromGuest = guestAnswersByUid.get(s.id) ?? NO_ANSWERS;
    const hanukkah = score(last.familiarityScore) ?? fromGuest.hanukkah;
    const attr = x.attribution ?? {};
    users.set(s.id, {
      email: str(x.email),
      name: str(x.displayName),
      answers: {
        hanukkah,
        hanukkahLevel: hanukkah == null ? str(last.familiarityLevel) ?? str(x.familiarityLevel) : null,
        jewish: score(last.practiceFrequencyScore) ?? fromGuest.jewish,
      },
      householdId: str(x.householdId),
      ad:
        adNameOf(attr.firstTouch) ??
        adNameOf(attr.lastTouch) ??
        guestAdByUid.get(s.id) ??
        (str(attr.fbc) ? META_AD_UNKNOWN : NOT_FROM_AD),
      createdAt: iso(x.createdAt),
    });
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
      answers: u?.answers ?? NO_ANSWERS,
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

  const latestLocation = new Map<string, { createdMs: number; location: string }>();
  for (const d of ordersSnap.docs) {
    const hid = d.ref.parent.parent?.id;
    const location = locationOf(d.data().shippingAddress);
    if (!hid || !location) continue;
    const createdMs = ms(d.data().createdAt) ?? 0;
    const prev = latestLocation.get(hid);
    if (!prev || createdMs > prev.createdMs) latestLocation.set(hid, { createdMs, location });
  }
  const householdLocation = (hid: string | null) => (hid ? latestLocation.get(hid)?.location ?? null : null);

  const boxHeld = new Map<string, number>();
  const giftOrders = new Map<string, { createdMs: number; lines: unknown }>();
  const receivedGiftOrdersByKey = new Map<string, DashGift['checkoutOrders']>();
  const boxes: DashBox[] = [];
  const liveBoxHouseholds = new Set<string>();
  const committedBoxHouseholds = new Set<string>();

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
    if (!playthrough && LIVE.includes(o.status) && o.status !== 'pending') committedBoxHouseholds.add(hid);
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
      location: locationOf(o.shippingAddress) ?? householdLocation(hid),
      answers: c.answers,
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
      location: householdLocation(hid),
      answers: c.answers,
      lines,
    });
  }

  const guests = buildGuestRows(guestDocs, items, priceForKids);

  const adPeople: DashAdPerson[] = [];
  for (const [uid, u] of users) {
    const hid = u.householdId;
    const draftLines = hid ? drafts.get(hid)?.lineItems : null;
    const hasBox = Boolean(hid && (liveBoxHouseholds.has(hid) || (Array.isArray(draftLines) && draftLines.length > 0)));
    adPeople.push({
      id: uid,
      ad: u.ad,
      account: true,
      test: isTest(u.email, u.name),
      answered: u.answers.jewish != null || u.answers.hanukkah != null || u.answers.hanukkahLevel != null,
      box: hasBox,
      purchase: Boolean(hid && committedBoxHouseholds.has(hid)),
      jewish: u.answers.jewish,
      hanukkah: u.answers.hanukkah,
      firstSeen: u.createdAt,
    });
  }
  for (const d of guestDocs) {
    const x = d.data();
    const uid = str(x.convertedUid);
    if (uid && users.has(uid)) continue;
    const guest: DocumentData = x.snapshot?.guest ?? {};
    const answered = guestAnsweredSliders(guest);
    const box = Array.isArray(guest.lineItems) && guest.lineItems.length > 0;
    if (!answered && !box) continue;
    const a = answered ? guestAnswers(guest) : NO_ANSWERS;
    adPeople.push({
      id: d.id,
      ad: adNameOf(x.entry) ?? NOT_FROM_AD,
      account: false,
      test: false,
      answered,
      box,
      purchase: false,
      jewish: a.jewish,
      hanukkah: a.hanukkah,
      firstSeen: iso(x.createdAt),
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
      recipientAnswers: recipient?.answers ?? NO_ANSWERS,
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
      location: locationOf(g.shippingAddress) ?? householdLocation(hid || null),
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
      guestSessions: guestDocs.length,
    },
    mismatches,
    boxes,
    guests,
    gifts,
    inventory,
    adPeople,
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
