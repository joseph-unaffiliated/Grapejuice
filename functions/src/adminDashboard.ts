import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onCall } from './sentry';
import { isAdminToken } from './guestSessions';
import { metaAdsAccessToken, metaStatsByAd, type MetaAdStats } from './metaAdsInsights';
import { isTest } from './testAccounts';
import { resolveAvailability, availabilityRemaining } from './catalogAvailability';
import { buildShopOrder, type DashShopOrder } from './shopOrders';
import { INVENTORY_EMAIL_LOG, inventoryEmailStats, type InventoryEmailStats } from './inventoryEmails';

/**
 * Admin "Orders and Inventory" dashboard: one read-only snapshot of Hanukkah box orders,
 * storefront (no-box) orders, open drafts, anonymous (signed-out) boxes, gift invites and
 * inventory holds. Hold math mirrors recomputeBoxAllocations / addOutstandingGiftBoxes in
 * catalogInventory.ts — keep in sync.
 */

const HOLIDAY_ID = 'hanukkah-2026';
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
const LIVE = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const DEFAULT_BOX_CENTS = 8000;
const PER_EXTRA_KID_CENTS = 1000;
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
  /**
   * State ("NY", "ON, Canada"): the order's ship-to, else the household's latest order address, else
   * the account's IP region (`locationFromIp`).
   */
  location: string | null;
  locationFromIp: boolean;
  /** `location` is known to be outside the US. */
  outsideUs: boolean;
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
  /** IP region from the visitor's saves. */
  location: string | null;
  outsideUs: boolean;
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
  /** The giver's IP region. */
  giverLocation: string | null;
  /** The giver's IP is outside the US, or (no giver IP) the ship-to is. */
  outsideUs: boolean;
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
  /** Storefront direct-sale cap before lock (null: box only until lock). */
  directCap: number | null;
  /** What the storefront offers shoppers now (catalogAvailability.resolveAvailability). */
  shopStatus: 'direct' | 'limited' | 'box_only' | 'sold_out';
  shopRemaining: number | null;
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
  /** IP country known and not US. */
  outsideUs: boolean;
};

/**
 * One signed-out box-builder session for the Funnel tab: which steps it got through. Sessions
 * are saved from the first builder screen only since Oct 8, 2026; older ones only once past it.
 */
export type DashFunnelPerson = {
  id: string;
  firstSeen: string | null;
  ad: string;
  /** Converted to a test account. */
  test: boolean;
  outsideUs: boolean;
  family: boolean;
  /** Finished the sliders, so a box was curated. */
  sliders: boolean;
  /** Submitted the email gate (live since Oct 8, 2026). */
  gateEmail: boolean;
  sawBox: boolean;
  account: boolean;
  /** Account, gate email, or a Retention.com lead. */
  anyEmail: boolean;
  card: boolean;
  purchase: boolean;
};

/** Gift funnel steps in order; `email` and `box` only exist on the curated path. */
export const GIFT_FUNNEL_KEYS = [
  'start',
  'path',
  'family',
  'email',
  'box',
  'note',
  'send',
  'checkout',
  'paid',
  'claimed',
] as const;
export type GiftFunnelKey = (typeof GIFT_FUNNEL_KEYS)[number];
const CURATED_ONLY: readonly GiftFunnelKey[] = ['email', 'box'];

/**
 * One visitor in the gift flow for the Gift funnel tab. Step tracking (giftFunnel/{visitorId})
 * started Oct 8, 2026; older rows are signed-out gift drafts placed by the step they stopped on.
 */
export type DashGiftFunnelPerson = {
  id: string;
  firstSeen: string | null;
  lastSeen: string | null;
  ad: string;
  test: boolean;
  outsideUs: boolean;
  location: string | null;
  path: 'credit' | 'curated' | null;
  /** Saw the /gift landing page (tracked rows only). */
  landing: boolean;
  /** Every step reached; reaching a step counts the ones before it. */
  reached: GiftFunnelKey[];
  /** From step tracking, not rebuilt from a saved draft. */
  tracked: boolean;
  signedIn: boolean;
  kids: number | null;
  items: number;
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
  /** Storefront orders with no box, newest first. */
  shopOrders: DashShopOrder[];
  inventory: DashInventoryRow[];
  adPeople: DashAdPerson[];
  funnel: DashFunnelPerson[];
  giftFunnel: DashGiftFunnelPerson[];
  /** Low-stock / sold-out swap emails → secured boxes (inventoryEmails.ts). */
  inventoryEmails: InventoryEmailStats;
  /** Meta's own per-ad results (Grapejuice campaigns), keyed by ad name; null when Meta is unreachable. */
  metaByAd: Record<string, MetaAdStats> | null;
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

/** "Sarah Cohen" → "Sarah". */
const firstNameOf = (name: string | null): string | null => name?.trim().split(/\s+/)[0] || null;

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

/** `ipGeo` written by functions/src/geo.ts → "NY", "ON, Canada", or a country code. */
function ipLocationOf(geo: unknown): string | null {
  if (!geo || typeof geo !== 'object') return null;
  const g = geo as Record<string, unknown>;
  const country = str(g.country);
  const region = str(g.region);
  if (!country) return null;
  if (country === 'US') return region ?? 'US';
  if (country === 'CA') return region ? `${region}, Canada` : 'Canada';
  return country;
}

/** IP country known and not US. No geo counts as US. */
function ipOutsideUs(geo: unknown): boolean {
  const country = geo && typeof geo === 'object' ? str((geo as Record<string, unknown>).country) : null;
  return Boolean(country && country.toUpperCase() !== 'US');
}

/** A `locationOf` label for a Canadian or international address. */
const addressOutsideUs = (location: string | null): boolean => Boolean(location && /(, Canada|\(intl\))$/.test(location));

const META_AD_UNKNOWN = 'Meta, ad unknown';
const DIRECT = 'Direct / no tags';
const NOT_RECORDED = 'Not recorded';

/** Where a non-ad visit came from: a utm_source (newsletters), else the referring site. */
function nonAdSourceOf(...touches: unknown[]): string | null {
  const ts = touches.filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'));
  for (const t of ts) {
    const u = (t.utm && typeof t.utm === 'object' ? t.utm : {}) as Record<string, unknown>;
    const source = str(u.utm_source) ?? str(u.source);
    if (source) return `From ${source}`;
  }
  for (const t of ts) {
    const host = hostOf(t.referrer);
    if (host) return `Referral: ${host}`;
  }
  return null;
}

/** Label for a guest session with no ad name. */
function guestNonAdLabel(entry: unknown): string {
  if (!entry || typeof entry !== 'object') return NOT_RECORDED;
  return nonAdSourceOf(entry) ?? DIRECT;
}

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
      location: ipLocationOf(x.ipGeo),
      outsideUs: ipOutsideUs(x.ipGeo),
      lines,
    });
  }
  rows.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  return rows.slice(0, GUEST_ROW_LIMIT);
}

/** A saved draft's `step` is the page it was on, which means the step before it was done. */
const GIFT_DRAFT_STEP_REACHED: Record<string, GiftFunnelKey> = {
  type: 'start',
  kids: 'path',
  email: 'family',
  note: 'note',
  send: 'send',
  pay: 'checkout',
};

/** giftFunnel step tracking, plus signed-out gift drafts saved before it (or without it). */
export function buildGiftFunnelRows(
  funnelDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  guestDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  invites: Map<string, DocumentData>,
  testUid: (uid: string) => boolean,
): DashGiftFunnelPerson[] {
  const funnelById = new Map(funnelDocs.map((d) => [d.id, d.data()]));
  const guestById = new Map(guestDocs.map((d) => [d.id, d.data()]));
  const ids = new Set(funnelById.keys());
  for (const [id, x] of guestById) if (x.snapshot?.gift?.draft) ids.add(id);

  const rows: DashGiftFunnelPerson[] = [];
  for (const id of ids) {
    const f = funnelById.get(id);
    const g = guestById.get(id);
    const gift: DocumentData | null = g?.snapshot?.gift ?? null;
    const draft: DocumentData | null = gift?.draft ?? null;
    const recorded = new Set<string>(f?.steps && typeof f.steps === 'object' ? Object.keys(f.steps) : []);
    const draftLines = Array.isArray(draft?.lineItems) ? draft.lineItems.length : 0;
    if (draft) {
      recorded.add('path');
      const fromStep = GIFT_DRAFT_STEP_REACHED[str(draft.step) ?? ''];
      if (fromStep) recorded.add(fromStep);
      if (draftLines || str(g?.path) === '/gift/customize') recorded.add('box');
      // The curated email step signs the giver in, which ends the guest session's saves.
      if (str(g?.convertedUid) && gift?.kind === 'customize') recorded.add('email');
    }
    const linked = (Array.isArray(f?.inviteIds) ? f.inviteIds : [])
      .map((i: unknown) => invites.get(String(i)))
      .filter((inv: DocumentData | undefined): inv is DocumentData => Boolean(inv));
    if (linked.length) recorded.add('checkout');
    if (linked.some((inv) => inv.paymentStatus === 'paid')) recorded.add('paid');
    if (linked.some((inv) => inv.status === 'claimed' || str(inv.claimedByHouseholdId))) recorded.add('claimed');

    const rawPath =
      str(f?.path) ??
      str(gift?.kind) ??
      str(draft?.form?.giftPath) ??
      (linked[0] ? (linked[0].kind === 'box' ? 'customize' : 'credit_only') : null);
    const path = rawPath === 'customize' ? 'curated' : rawPath === 'credit_only' ? 'credit' : null;
    const furthest = GIFT_FUNNEL_KEYS.reduce((m, k, i) => (recorded.has(k) ? i : m), -1);
    const reached = GIFT_FUNNEL_KEYS.filter((k, i) => i <= furthest && (path === 'curated' || !CURATED_ONLY.includes(k)));
    const landing = recorded.has('landing');
    if (!reached.length && !landing) continue;

    const uid = str(f?.uid) ?? str(g?.convertedUid);
    const entry = f?.entry ?? g?.entry;
    const geo = f?.ipGeo ?? g?.ipGeo;
    const firstMs = Math.min(ms(f?.createdAt) ?? Infinity, ms(g?.createdAt) ?? Infinity);
    const lastMs = Math.max(ms(f?.updatedAt) ?? -Infinity, ms(g?.updatedAt) ?? -Infinity);
    const kids = path === 'curated' ? (Array.isArray(draft?.childDrafts) ? draft.childDrafts.length : null) : num(draft?.form?.creditKids);
    rows.push({
      id,
      firstSeen: Number.isFinite(firstMs) ? new Date(firstMs).toISOString() : null,
      lastSeen: Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null,
      ad: adNameOf(entry) ?? guestNonAdLabel(entry),
      test:
        (uid ? testUid(uid) : false) ||
        linked.some((inv) => isTest(str(inv.giverEmail), str(inv.recipientEmail))) ||
        isTest(str(draft?.form?.giverEmail), str(draft?.form?.recipientEmail)),
      outsideUs: ipOutsideUs(geo),
      location: ipLocationOf(geo),
      path,
      landing,
      reached,
      tracked: Boolean(f),
      signedIn: Boolean(uid),
      kids,
      items: draftLines,
    });
  }
  rows.sort((a, b) => String(b.lastSeen ?? '').localeCompare(String(a.lastSeen ?? '')));
  return rows;
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
    giftFunnelSnap,
    inventoryEmailSnap,
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
        .select('snapshot', 'entry', 'path', 'createdAt', 'updatedAt', 'convertedUid', 'convertedAt', 'lastLeadAt', 'gateEmailAt', 'resumeCount', 'saveCount', 'ipGeo')
        .get(),
      db.collection('giftFunnel').get(),
      db.collection(INVENTORY_EMAIL_LOG).where('status', '==', 'sent').get(),
    ]);
  const guestDocs = guestSnap.docs.filter((d) => !d.id.startsWith('agenttest'));
  const config = configSnap.data() ?? {};
  const listCents = num(config.boxPriceCents) ?? DEFAULT_BOX_CENTS;
  const priceForKids = (k: number) => listCents + Math.max(0, k - 1) * PER_EXTRA_KID_CENTS;

  const items = new Map<
    string,
    {
      name: string;
      inventory: number | null;
      category: string | null;
      categories: string[] | undefined;
      directSaleCapBeforeLock: number | null;
      sellAfterLock: 'yes' | 'flag' | 'no' | null;
    }
  >();
  for (const d of itemsSnap.docs) {
    const x = d.data();
    items.set(d.id, {
      name: str(x.name) ?? d.id,
      inventory: num(x.inventory),
      category: str(x.category),
      categories: Array.isArray(x.categories) ? x.categories.filter((c: unknown): c is string => typeof c === 'string') : undefined,
      directSaleCapBeforeLock: num(x.directSaleCapBeforeLock),
      sellAfterLock: x.sellAfterLock === 'yes' || x.sellAfterLock === 'flag' || x.sellAfterLock === 'no' ? x.sellAfterLock : null,
    });
  }
  const itemNames = new Map([...items].map(([id, it]) => [id, it.name]));

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
  for (const d of invitesSnap.docs) {
    const u = str(d.data().giverUid);
    if (u) userIds.add(u);
  }
  for (const d of giftFunnelSnap.docs) {
    const u = str(d.data().uid);
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
  // Some profiles lack email/displayName; the Auth record still has them.
  const authByUid = new Map<string, { email: string | null; name: string | null }>();
  const needAuth = userSnaps.filter((s) => !str(s.data()?.email) || !str(s.data()?.displayName)).map((s) => s.id);
  for (let i = 0; i < needAuth.length; i += 100) {
    const { users: records } = await getAuth().getUsers(needAuth.slice(i, i + 100).map((uid) => ({ uid })));
    for (const r of records) authByUid.set(r.uid, { email: r.email ?? null, name: r.displayName ?? null });
  }
  // Slider answers from a converted guest session fill in for accounts with no saved lastBoxAnswers.
  const guestAnswersByUid = new Map<string, DashAnswers>();
  const guestAdByUid = new Map<string, string>();
  const guestNonAdByUid = new Map<string, string>();
  const guestIpLocationByUid = new Map<string, string>();
  const guestIpOutsideUsByUid = new Map<string, boolean>();
  for (const d of guestSnap.docs) {
    const x = d.data();
    const uid = str(x.convertedUid);
    const guest = x.snapshot?.guest;
    if (uid && guest && guestAnsweredSliders(guest)) guestAnswersByUid.set(uid, guestAnswers(guest));
    const ad = uid ? adNameOf(x.entry) : null;
    if (uid && ad) guestAdByUid.set(uid, ad);
    const nonAd = uid && !ad ? nonAdSourceOf(x.entry) : null;
    if (uid && nonAd) guestNonAdByUid.set(uid, nonAd);
    const ipLoc = uid ? ipLocationOf(x.ipGeo) : null;
    if (uid && ipLoc) {
      guestIpLocationByUid.set(uid, ipLoc);
      guestIpOutsideUsByUid.set(uid, ipOutsideUs(x.ipGeo));
    }
  }
  const users = new Map<
    string,
    {
      email: string | null;
      name: string | null;
      answers: DashAnswers;
      householdId: string | null;
      ad: string;
      createdAt: string | null;
      ipLocation: string | null;
      ipOutsideUs: boolean;
    }
  >();
  for (const s of userSnaps) {
    const x = s.data() ?? {};
    const last = x.lastBoxAnswers ?? {};
    const fromGuest = guestAnswersByUid.get(s.id) ?? NO_ANSWERS;
    const hanukkah = score(last.familiarityScore) ?? fromGuest.hanukkah;
    const attr = x.attribution ?? {};
    const fromAuth = authByUid.get(s.id);
    users.set(s.id, {
      email: str(x.email) ?? fromAuth?.email ?? null,
      name: firstNameOf(str(x.displayName) ?? fromAuth?.name ?? null),
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
        (str(attr.fbc) ? META_AD_UNKNOWN : null) ??
        nonAdSourceOf(attr.firstTouch, attr.lastTouch) ??
        (str(attr.unaffiliatedUserID) ? 'Unaffiliated newsletter' : null) ??
        guestNonAdByUid.get(s.id) ??
        (attr.firstTouch || attr.lastTouch ? DIRECT : NOT_RECORDED),
      createdAt: iso(x.createdAt),
      ipLocation: ipLocationOf(x.ipGeo) ?? guestIpLocationByUid.get(s.id) ?? null,
      ipOutsideUs: ipLocationOf(x.ipGeo) ? ipOutsideUs(x.ipGeo) : guestIpOutsideUsByUid.get(s.id) ?? false,
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
      name: u?.name ?? (email ? email.split('@')[0] : null),
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
  const userIpLocation = (uid: string | null) => (uid ? users.get(uid)?.ipLocation ?? guestIpLocationByUid.get(uid) ?? null : null);
  const userIpOutsideUs = (uid: string | null) =>
    uid ? users.get(uid)?.ipOutsideUs ?? guestIpOutsideUsByUid.get(uid) ?? false : false;
  /** Address-based state when known, else the account's IP region (flagged). */
  const placeFor = (hid: string, uid: string | null, address: string | null) => {
    const known = address ?? householdLocation(hid);
    if (known) return { location: known, locationFromIp: false, outsideUs: addressOutsideUs(known) };
    const ipUid = userIpLocation(uid) ? uid : str(households.get(hid)?.ownerId);
    const ip = userIpLocation(ipUid);
    return { location: ip, locationFromIp: Boolean(ip), outsideUs: Boolean(ip) && userIpOutsideUs(ipUid) };
  };

  const boxHeld = new Map<string, number>();
  const giftOrders = new Map<string, { createdMs: number; lines: unknown }>();
  const receivedGiftOrdersByKey = new Map<string, DashGift['checkoutOrders']>();
  const boxes: DashBox[] = [];
  const shopOrders: DashShopOrder[] = [];
  const liveBoxHouseholds = new Set<string>();
  const committedBoxHouseholds = new Set<string>();
  const securedBoxes: Array<{ householdId: string; securedMs: number }> = [];

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
    if (o.orderType === 'marketplace') {
      const uid = str(o.userId);
      const u = uid ? users.get(uid) : undefined;
      shopOrders.push(
        buildShopOrder({
          householdId: hid,
          orderId: d.id,
          order: o,
          user: u ? { email: u.email, name: u.name } : null,
          itemNames,
          attribution: attributionLabel(o.attribution),
          location: locationOf(o.shippingAddress),
        }),
      );
      continue;
    }
    const isBox = o.orderType === 'hanukkah_box' || (!o.orderType && o.holidayId === HOLIDAY_ID);
    if (!isBox) continue;
    if (o.holidayId === HOLIDAY_ID && !playthrough && LIVE.includes(o.status)) addLines(boxHeld, o.lineItems);
    if (!playthrough && LIVE.includes(o.status)) liveBoxHouseholds.add(hid);
    if (!playthrough && LIVE.includes(o.status) && o.status !== 'pending') {
      committedBoxHouseholds.add(hid);
      if (o.holidayId === HOLIDAY_ID) {
        securedBoxes.push({ householdId: hid, securedMs: ms(o.committedAt) ?? ms(o.createdAt) ?? 0 });
      }
    }
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
      ...placeFor(hid, str(o.userId), locationOf(o.shippingAddress)),
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
      ...placeFor(hid, str(dr.updatedBy), null),
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
      outsideUs: u.ipOutsideUs,
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
      ad: adNameOf(x.entry) ?? guestNonAdLabel(x.entry),
      account: false,
      test: false,
      answered,
      box,
      purchase: false,
      jewish: a.jewish,
      hanukkah: a.hanukkah,
      firstSeen: iso(x.createdAt),
      outsideUs: ipOutsideUs(x.ipGeo),
    });
  }

  const funnel: DashFunnelPerson[] = [];
  for (const d of guestDocs) {
    const x = d.data();
    const guest: DocumentData = x.snapshot?.guest ?? {};
    const steps: DocumentData = guest.stepsReached && typeof guest.stepsReached === 'object' ? guest.stepsReached : {};
    const hasLines = Array.isArray(guest.lineItems) && guest.lineItems.length > 0;
    const kids = Array.isArray(guest.childDrafts) && guest.childDrafts.length > 0;
    const uid = str(x.convertedUid);
    const builder =
      Object.keys(steps).length > 0 || kids || hasLines || Boolean(str(guest.onboardingStep)) || guest.onboardingComplete === true;
    if (!builder) continue;
    const sliders =
      hasLines || guest.onboardingComplete === true || guestAnsweredSliders(guest) || Boolean(steps.email || steps.building);
    // Before the gate, guests went from the sliders straight to `building`; only email → building is the gate.
    const gateEmail = Boolean(x.gateEmailAt) || Boolean(steps.email && steps.building);
    const u = uid ? users.get(uid) : undefined;
    const hid = u?.householdId ?? null;
    const h = hid ? households.get(hid) : undefined;
    funnel.push({
      id: d.id,
      firstSeen: iso(x.createdAt),
      ad: adNameOf(x.entry) ?? guestNonAdLabel(x.entry),
      test: u ? isTest(u.email) : false,
      outsideUs: ipOutsideUs(x.ipGeo),
      family: kids || Boolean(steps.details) || sliders,
      sliders,
      gateEmail,
      sawBox: guest.boxRevealComplete === true || Boolean(steps.reveal) || Boolean(uid),
      account: Boolean(uid),
      anyEmail: Boolean(uid) || gateEmail || Boolean(x.lastLeadAt),
      card: Boolean(h && (h.cardOnFileAt || h.stripeDefaultPaymentMethodId)),
      purchase: Boolean(hid && committedBoxHouseholds.has(hid)),
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
    const shipTo = locationOf(g.shippingAddress) ?? householdLocation(hid || null);
    const giverUid = str(g.giverUid);
    const giverLocation = userIpLocation(giverUid);
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
      location: shipTo,
      giverLocation,
      outsideUs: giverLocation ? userIpOutsideUs(giverUid) : addressOutsideUs(shipTo),
      lines: linesOf(lineSource, recipient?.childNames ?? new Map()),
    });
  }

  const giftFunnel = buildGiftFunnelRows(
    giftFunnelSnap.docs.filter((d) => !d.id.startsWith('agenttest')),
    guestDocs,
    new Map(invitesSnap.docs.map((d) => [d.id, d.data()])),
    (uid) => {
      const u = users.get(uid);
      return u ? isTest(u.email) : false;
    },
  );

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
    const shop = resolveAvailability(
      { id, ...it },
      { boxAllocatedQty: counterAllocated, directSoldQty: directSold, directReservedQty: directReserved },
      iso(config.lockAt),
      new Date(nowMs),
    );
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
      directCap: it.directSaleCapBeforeLock,
      shopStatus: shop.status,
      shopRemaining: availabilityRemaining(shop),
      favorites: favorites.get(id) ?? 0,
      favoritesReal: favoritesReal.get(id) ?? 0,
    });
  }
  boxes.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  gifts.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  shopOrders.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

  const householdsByOwner = new Map<string, string[]>();
  for (const [hid, h] of households) {
    const owner = str(h.ownerId);
    if (owner) householdsByOwner.set(owner, [...(householdsByOwner.get(owner) ?? []), hid]);
  }
  const convertedUidByVisitor = new Map<string, string>();
  for (const d of guestDocs) {
    const uid = str(d.data().convertedUid);
    if (uid) convertedUidByVisitor.set(d.id, uid);
  }
  const inventoryEmails = inventoryEmailStats({
    sends: inventoryEmailSnap.docs.map((d) => {
      const x = d.data();
      return {
        emailHash: String(x.emailHash ?? d.id),
        kind: x.kind === 'swapped' ? ('swapped' as const) : ('low' as const),
        sentMs: ms(x.sentAt) ?? ms(x.createdAt) ?? 0,
        clicked: (num(x.clicks) ?? 0) > 0,
        uid: str(x.uid),
        visitorId: str(x.visitorId),
        draftKeys: Array.isArray(x.draftKeys) ? x.draftKeys.filter((k: unknown): k is string => typeof k === 'string') : [],
      };
    }),
    securedBoxes,
    householdsByOwner,
    convertedUidByVisitor,
  });

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
    shopOrders,
    inventory,
    adPeople,
    funnel,
    giftFunnel,
    inventoryEmails,
    metaByAd: null,
  };
}

export function createAdminBoxesDashboard(db: Firestore) {
  return onCall({ secrets: [metaAdsAccessToken] }, async (request): Promise<BoxesDashboard> => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
    if (!isAdminToken(request.auth.token)) throw new HttpsError('permission-denied', 'Admin only.');
    const [dash, metaByAd] = await Promise.all([buildBoxesDashboard(db), metaStatsByAd()]);
    return { ...dash, metaByAd };
  });
}
