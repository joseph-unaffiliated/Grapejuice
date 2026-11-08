import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall, onSchedule } from './sentry';
import { isAdminToken } from './guestSessions';
import { metaAdsAccessToken, metaStatsByAd, type MetaAdStats } from './metaAdsInsights';
import { isTest } from './testAccounts';
import { resolveAvailability, availabilityRemaining } from './catalogAvailability';
import { giftInviteCoveredByOrder } from './catalogInventory';
import { buildShopOrder, type DashShopOrder } from './shopOrders';
import { INVENTORY_EMAIL_LOG, inventoryEmailStats, type InventoryEmailStats } from './inventoryEmails';
import { stripe } from './stripe';
import { loadBoxProblems, type DashBoxAuditRun, type DashBoxProblem } from './boxAuditJob';
import type { BoxFixLogEntry } from './boxProblemFixes';
import * as logger from './logger';
import {
  checkoutSessionFromStripeMetadata,
  classifyCheckoutSession,
  type CheckoutSessionDoc,
  type CheckoutSessionView,
} from './checkoutSession';
import { diffBoxLines, historyLines, type HistoryLine } from './boxHistoryDiff';

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

/** How a line relates to the box they were first handed (`history/default`). */
export type DashLineOrigin = 'default' | 'changed' | 'added';

export type DashLine = {
  itemId: string | null;
  name: string;
  qty: number;
  unitCents: number;
  addOn: boolean;
  child: string | null;
  forHousehold: boolean;
  /** Versus the default-build box; null when we have no default snapshot. */
  origin: DashLineOrigin | null;
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
  /** Kid ages for the summary (planner age when known, else age band). */
  kidAges: string[];
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
  /** When the box order was placed, or the draft document was first written. */
  createdAt: string | null;
  updatedAt: string | null;
  committedAt: string | null;
  attribution: string | null;
  /** Card on file: the session that saved it (else the one that committed the address). */
  cardSession: CheckoutSessionView | null;
  /**
   * State ("NY", "ON, Canada"): the order's ship-to, else the household's latest order address, else
   * the account's IP region (`locationFromIp`).
   */
  location: string | null;
  locationFromIp: boolean;
  /** `location` is known to be outside the US. */
  outsideUs: boolean;
  answers: DashAnswers;
  /** Onboarding note or a message to Rav says the household keeps kosher. */
  kosher: boolean;
  /** The note or message that set `kosher`. */
  kosherNote: string | null;
  /** Full free-text onboarding note for Rav (`ravNotes`). */
  note: string | null;
  /** Customer (and Rav) swaps recorded in box history after the default build. */
  swaps: number;
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
  /** Copies physically ordered (Airtable "Procured"); display-only, null when unset. */
  procured: number | null;
  /** Copies kept back from sale (Airtable "Set aside"). */
  setAside: number | null;
  /** Why those copies are kept (Airtable "Set aside for"). */
  setAsideFor: string | null;
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

/**
 * One person can have two guest records: their visitor id changed mid-box, and the new record
 * kept the same `stepsReached` timestamps while the email gate was written to the old id. Records
 * sharing any exact step timestamp are one person. Flags are OR'd across the group, the record that
 * passed the gate (else the earliest) is the representative, and `firstSeen` is the earliest.
 */
export function mergeTwinFunnelPeople(rows: { person: DashFunnelPerson; stepMs: number[] }[]): DashFunnelPerson[] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    let x = i;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const firstRowWithMs = new Map<number, number>();
  rows.forEach((row, i) => {
    for (const ms of row.stepMs) {
      const prev = firstRowWithMs.get(ms);
      if (prev === undefined) firstRowWithMs.set(ms, i);
      else parent[find(i)] = find(prev);
    }
  });
  const groups = new Map<number, DashFunnelPerson[]>();
  rows.forEach((row, i) => {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(row.person);
    else groups.set(root, [row.person]);
  });
  const out: DashFunnelPerson[] = [];
  for (const people of groups.values()) {
    const ranked = [...people].sort(
      (a, b) => Number(b.gateEmail) - Number(a.gateEmail) || (a.firstSeen ?? '').localeCompare(b.firstSeen ?? '')
    );
    const rep = ranked[0];
    const firstSeen = people.map((p) => p.firstSeen).filter((s): s is string => Boolean(s)).sort()[0] ?? null;
    out.push({
      ...rep,
      firstSeen,
      test: people.some((p) => p.test),
      outsideUs: people.some((p) => p.outsideUs),
      family: people.some((p) => p.family),
      sliders: people.some((p) => p.sliders),
      gateEmail: people.some((p) => p.gateEmail),
      sawBox: people.some((p) => p.sawBox),
      account: people.some((p) => p.account),
      anyEmail: people.some((p) => p.anyEmail),
      card: people.some((p) => p.card),
      purchase: people.some((p) => p.purchase),
    });
  }
  return out;
}

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
  /** Boxes whose included-items audit lists problems (boxAuditJob.ts). */
  boxProblems?: DashBoxProblem[];
  /** Totals from the latest daily box audit sweep. */
  boxAuditRun?: DashBoxAuditRun | null;
  /** Fixes chosen on Box problems, waiting on a cause. */
  fixLog?: BoxFixLogEntry[];
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
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

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

/** "We keep kosher" / "kosher home". Not a product description. */
const KOSHER_WORD = /\bkosher\b/i;
function kosherQuote(text: string): string | null {
  if (!KOSHER_WORD.test(text)) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 180 ? `${flat.slice(0, 177)}…` : flat;
}

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

export function guestAnsweredSliders(guest: DocumentData): boolean {
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
        origin: null,
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

const CARD_SESSION_BACKFILL_PER_LOAD = 40;
/** GCS object holding the precomputed Orders & Inventory payload (avoids on-demand timeouts). */
const BOXES_DASH_CACHE_PATH = 'adminCache/boxesDashboard.json';
/** Serve cache when fresher than this; otherwise rebuild (or wait for the schedule). */
const BOXES_DASH_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Cards saved before sessions were recorded: rebuild the session once from the SetupIntent's
 * metadata and keep it on the household. Mutates `households` so this load shows it.
 */
async function backfillCardSessions(db: Firestore, households: Map<string, DocumentData>): Promise<void> {
  const client = stripe;
  if (!client) return;
  const todo = [...households]
    .filter(
      ([, h]) =>
        (h.cardOnFileAt || h.stripeDefaultPaymentMethodId) &&
        !h.cardOnFileSession &&
        !h.cardOnFileSessionMissing &&
        str(h.stripeCustomerId),
    )
    .slice(0, CARD_SESSION_BACKFILL_PER_LOAD);
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(
      todo.slice(i, i + 8).map(async ([hid, h]) => {
        try {
          const list = await client.setupIntents.list({ customer: String(h.stripeCustomerId), limit: 10 });
          const ok = list.data.filter((si) => si.status === 'succeeded');
          const pmOf = (si: (typeof ok)[number]) =>
            typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id;
          const si = ok.find((s) => pmOf(s) === h.stripeDefaultPaymentMethodId) ?? ok[0];
          const at = str(h.cardOnFileAt) ?? (si ? new Date(si.created * 1000).toISOString() : null);
          const session = si && at ? checkoutSessionFromStripeMetadata(si.metadata, at) : null;
          const patch = session ? { cardOnFileSession: session } : { cardOnFileSessionMissing: true };
          await db.doc(`households/${hid}`).set(patch, { merge: true });
          Object.assign(h, patch);
        } catch (err) {
          logger.warn('Card session backfill failed', { householdId: hid, err: String(err) });
        }
      }),
    );
  }
}

/** How a box line relates to the household's default build (`history/default`). Null when no default is known. */
export function lineOriginVsDefault(li: DocumentData, defaults: HistoryLine[] | null): DashLineOrigin | null {
  if (!defaults?.length) return null;
  const itemId = str(li.itemId);
  if (!itemId) return null;
  const unitCents = num(li.unitCents) ?? 0;
  if (unitCents > 0) return 'added';
  const slotId = str(li.slotId);
  const childId = str(li.childId) ?? undefined;
  const sameSlot = defaults.filter((d) => d.slotId === slotId && (d.childId ?? undefined) === childId);
  if (sameSlot.some((d) => d.itemId === itemId)) return 'default';
  if (sameSlot.length) return 'changed';
  // Swaps can move a line to a new slot id; match by child when the slot renamed.
  const sameChild = defaults.filter((d) => (d.childId ?? undefined) === childId && d.itemId === itemId);
  if (sameChild.length) return 'default';
  const childHadOther = defaults.some((d) => (d.childId ?? undefined) === childId && d.itemId !== itemId);
  if (childId && childHadOther && !defaults.some((d) => d.itemId === itemId && (d.childId ?? undefined) === childId)) {
    return 'changed';
  }
  if (defaults.some((d) => d.itemId === itemId)) return 'default';
  return 'added';
}

const sessionDoc = (v: unknown): CheckoutSessionDoc | null =>
  v && typeof v === 'object' && typeof (v as CheckoutSessionDoc).at === 'string' ? (v as CheckoutSessionDoc) : null;

export async function buildBoxesDashboard(
  db: Firestore,
  nowMs = Date.now(),
  opts: { backfillCards?: boolean } = {},
): Promise<BoxesDashboard> {
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
    chatSnap,
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
      db.collectionGroup('aiChats').select('messages').get(),
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
      procured: number | null;
      setAside: number | null;
      setAsideFor: string | null;
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
      procured: num(x.procured),
      setAside: num(x.setAside),
      setAsideFor: str(x.setAsideFor),
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
  // Stripe SetupIntent lookups are slow; only the scheduled rebuild opts in.
  if (opts.backfillCards) await backfillCardSessions(db, households);
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
  const childAgesByUser = new Map<string, string[]>();
  for (const d of childrenSnap.docs) {
    const owner = d.ref.parent.parent;
    if (!owner || owner.parent.id !== 'users') continue;
    const x = d.data();
    const m = childNamesByUser.get(owner.id) ?? new Map<string, string | null>();
    m.set(d.id, str(x.name));
    childNamesByUser.set(owner.id, m);
    const age =
      typeof x.plannerAge === 'number' && Number.isFinite(x.plannerAge)
        ? String(Math.max(0, Math.floor(x.plannerAge)))
        : str(x.ageGroup);
    if (age) {
      const ages = childAgesByUser.get(owner.id) ?? [];
      ages.push(age);
      childAgesByUser.set(owner.id, ages);
    }
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
  const userTouches = new Map<string, unknown[]>();
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
      kosherNote: string | null;
      note: string | null;
    }
  >();
  const kosherFromChat = new Map<string, string>();
  for (const d of chatSnap.docs) {
    const uid = d.ref.parent.parent?.id;
    if (!uid || d.ref.parent.id !== 'aiChats' || kosherFromChat.has(uid)) continue;
    const msgs = d.data().messages;
    if (!Array.isArray(msgs)) continue;
    for (const m of msgs) {
      if (!m || m.role === 'assistant') continue;
      const quote = kosherQuote(String(m.content ?? ''));
      if (quote) {
        kosherFromChat.set(uid, quote);
        break;
      }
    }
  }
  for (const s of userSnaps) {
    const x = s.data() ?? {};
    const last = x.lastBoxAnswers ?? {};
    const fromGuest = guestAnswersByUid.get(s.id) ?? NO_ANSWERS;
    const hanukkah = score(last.familiarityScore) ?? fromGuest.hanukkah;
    const attr = x.attribution ?? {};
    userTouches.set(s.id, [attr.lastTouch, attr.firstTouch].filter(Boolean));
    const fromAuth = authByUid.get(s.id);
    const note = str(last.ravNotes) ?? str(x.ravNotes) ?? null;
    // Prefer ages on saved child profiles; fall back to onboarding drafts.
    if (!childAgesByUser.has(s.id) && Array.isArray(last.childDrafts)) {
      const ages: string[] = [];
      for (const raw of last.childDrafts) {
        if (!raw || typeof raw !== 'object') continue;
        const draft = raw as Record<string, unknown>;
        if (draft.role === 'adult') continue;
        const age =
          typeof draft.plannerAge === 'number' && Number.isFinite(draft.plannerAge)
            ? String(Math.max(0, Math.floor(draft.plannerAge)))
            : str(draft.ageGroup);
        if (age) ages.push(age);
      }
      if (ages.length) childAgesByUser.set(s.id, ages);
    }
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
      kosherNote: kosherQuote(note ?? '') ?? kosherFromChat.get(s.id) ?? null,
      note,
    });
  }

  const drafts = new Map<string, DocumentData>();
  // Drafts never stored their own createdAt, so the document's create time is when the box began.
  const draftCreatedAt = new Map<string, string>();
  for (const d of draftsSnap.docs) {
    const hh = d.ref.parent.parent;
    if (d.id === HOLIDAY_ID && hh && hh.parent.id === 'households') {
      drafts.set(hh.id, d.data());
      draftCreatedAt.set(hh.id, d.createTime.toDate().toISOString());
    }
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
      kosher: Boolean(u?.kosherNote),
      kosherNote: u?.kosherNote ?? null,
      note: u?.note ?? null,
      kids: Math.max(1, childNames.size || (owner ? childAgesByUser.get(owner)?.length ?? 0 : 0)),
      kidAges: owner ? childAgesByUser.get(owner) ?? [] : [],
      childNames,
      cardOnFile: Boolean(h.cardOnFileAt || h.stripeDefaultPaymentMethodId),
    };
  };

  const cardSessionFor = (
    hid: string,
    uid: string | null,
    order: DocumentData | null,
  ): CheckoutSessionView | null => {
    const h = households.get(hid) ?? {};
    if (!(h.cardOnFileAt || h.stripeDefaultPaymentMethodId)) return null;
    const s = sessionDoc(h.cardOnFileSession) ?? sessionDoc(order?.checkoutSession);
    if (!s) return null;
    const owner = uid ?? str(h.ownerId);
    const oa = (order?.attribution && typeof order.attribution === 'object' ? order.attribution : {}) as Record<string, unknown>;
    return classifyCheckoutSession(s, [oa.lastTouch, oa.firstTouch, ...((owner && userTouches.get(owner)) || [])]);
  };

  const lineOrigin = lineOriginVsDefault;
  const lineView = (
    li: DocumentData,
    childNames: Map<string, string | null>,
    defaults: HistoryLine[] | null,
    preWrap: ReadonlySet<string> = new Set(),
  ): DashLine => {
    const itemId = str(li.itemId);
    const unitCents = num(li.unitCents) ?? 0;
    const childId = str(li.childId);
    const baseName = (itemId && items.get(itemId)?.name) || str(li.label) || itemId || '?';
    return {
      itemId,
      name: itemId && preWrap.has(itemId) ? `${baseName} (pre-wrapped)` : baseName,
      qty: Math.max(0, Math.floor(Number(li.quantity) || 0)),
      unitCents,
      addOn: unitCents > 0,
      child: childId ? childNames.get(childId) ?? 'child' : null,
      forHousehold: !childId,
      origin: lineOrigin(li, defaults),
    };
  };
  const preWrapIds = (raw: unknown): Set<string> =>
    new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && id.length > 0) : []);
  const linesOf = (
    raw: unknown,
    childNames: Map<string, string | null>,
    defaults: HistoryLine[] | null = null,
    preWrap: ReadonlySet<string> = new Set(),
  ) =>
    (Array.isArray(raw) ? raw : [])
      .filter(Boolean)
      .map((li) => lineView(li as DocumentData, childNames, defaults, preWrap));
  const addOnTotal = (lines: DashLine[]) =>
    lines.filter((l) => l.addOn).reduce((s, l) => s + l.unitCents * Math.max(1, l.qty), 0);

  /** Default-build snapshot + customer/Rav swap counts from box history. */
  const defaultLinesByHousehold = new Map<string, HistoryLine[]>();
  const swapsByHousehold = new Map<string, number>();
  const historyHouseholdIds = new Set<string>([...drafts.keys()]);
  for (const d of ordersSnap.docs) {
    const o = d.data();
    const hid = d.ref.parent.parent?.id;
    if (!hid) continue;
    const isBox = o.orderType === 'hanukkah_box' || (!o.orderType && o.holidayId === HOLIDAY_ID);
    if (isBox) historyHouseholdIds.add(hid);
  }
  const historyIds = [...historyHouseholdIds];
  for (let i = 0; i < historyIds.length; i += 40) {
    const chunk = historyIds.slice(i, i + 40);
    await Promise.all(
      chunk.map(async (hid) => {
        const hist = db.collection(`households/${hid}/boxDrafts/${HOLIDAY_ID}/history`);
        const [defaultSnap, entriesSnap] = await Promise.all([
          hist.doc('default').get(),
          hist.where('list', '==', 'box').select('source', 'changes').get(),
        ]);
        const def = defaultSnap.data()?.box;
        const lines = historyLines(isRecord(def) ? def.lineItems : null);
        if (lines.length) defaultLinesByHousehold.set(hid, lines);
        let swaps = 0;
        for (const e of entriesSnap.docs) {
          if (e.id === 'default') continue;
          const source = str(e.data().source);
          if (source !== 'customer' && source !== 'rav') continue;
          const changes = e.data().changes;
          if (!Array.isArray(changes)) continue;
          for (const ch of changes) {
            if (ch && typeof ch === 'object' && (ch as { type?: string }).type === 'swap') swaps += 1;
          }
        }
        // If history never recorded swaps, still surface net swaps vs the default snapshot.
        if (!swaps && lines.length) {
          // Filled later per-box when we have current lines; store 0 for now.
        }
        swapsByHousehold.set(hid, swaps);
      }),
    );
  }
  const swapsFor = (hid: string, currentRaw: unknown): number => {
    const recorded = swapsByHousehold.get(hid) ?? 0;
    if (recorded > 0) return recorded;
    const defaults = defaultLinesByHousehold.get(hid);
    if (!defaults?.length) return 0;
    return diffBoxLines(defaults, historyLines(currentRaw)).filter((c) => c.type === 'swap').length;
  };

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
    const defaults = defaultLinesByHousehold.get(hid) ?? null;
    const lines = linesOf(o.lineItems, c.childNames, defaults, preWrapIds(drafts.get(hid)?.wrapSelectedItemIds));
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
      kidAges: c.kidAges,
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
      createdAt: iso(o.createdAt),
      updatedAt: iso(o.updatedAt) ?? iso(o.committedAt) ?? iso(o.createdAt),
      committedAt: iso(o.committedAt),
      attribution: attributionLabel(o.attribution),
      cardSession: cardSessionFor(hid, str(o.userId), o),
      ...placeFor(hid, str(o.userId), locationOf(o.shippingAddress)),
      answers: c.answers,
      kosher: c.kosher,
      kosherNote: c.kosherNote,
      note: c.note,
      swaps: swapsFor(hid, o.lineItems),
      lines,
    });
  }

  // A draft only counts as an open box when the household has no live box order.
  for (const [hid, dr] of drafts) {
    if (liveBoxHouseholds.has(hid) || !Array.isArray(dr.lineItems) || dr.lineItems.length === 0) continue;
    // Identity is the household owner. updatedBy is whoever last saved the draft (an admin or a
    // test login can edit a customer's box), so using it would rename the customer and hide the
    // row as a test account.
    const c = customerFor(hid, null);
    const defaults = defaultLinesByHousehold.get(hid) ?? null;
    const lines = linesOf(dr.lineItems, c.childNames, defaults, preWrapIds(dr.wrapSelectedItemIds));
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
      kidAges: c.kidAges,
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
      createdAt: draftCreatedAt.get(hid) ?? null,
      updatedAt: iso(dr.updatedAt),
      committedAt: null,
      attribution: null,
      cardSession: cardSessionFor(hid, null, null),
      ...placeFor(hid, null, null),
      answers: c.answers,
      kosher: c.kosher,
      kosherNote: c.kosherNote,
      note: c.note,
      swaps: swapsFor(hid, dr.lineItems),
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

  const funnelRows: { person: DashFunnelPerson; stepMs: number[] }[] = [];
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
    funnelRows.push({
      person: {
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
      },
      stepMs: Object.values(steps).filter((v): v is number => typeof v === 'number'),
    });
  }
  const funnel = mergeTwinFunnelPeople(funnelRows);

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
      if (giftInviteCoveredByOrder(giftOrders.keys(), d.id)) {
        // The recipient order above already holds these lines.
      } else if (g.status === 'pending' || !hid) {
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
      lines: linesOf(lineSource, recipient?.childNames ?? new Map(), null, preWrapIds(g.wrapSelectedItemIds)),
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
    const setAside = n0(it?.setAside);
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
      remaining: stock == null ? null : stock - setAside - counterAllocated - directSold - directReserved,
      setAside: it.setAside,
      setAsideFor: it.setAsideFor,
      directCap: it.directSaleCapBeforeLock,
      shopStatus: shop.status,
      shopRemaining: availabilityRemaining(shop),
      favorites: favorites.get(id) ?? 0,
      favoritesReal: favoritesReal.get(id) ?? 0,
      procured: it.procured,
    });
  }
  boxes.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
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

async function readBoxesDashboardCache(): Promise<BoxesDashboard | null> {
  try {
    const [buf] = await getStorage().bucket().file(BOXES_DASH_CACHE_PATH).download();
    const parsed = JSON.parse(buf.toString('utf8')) as BoxesDashboard;
    if (!parsed?.generatedAt || !Array.isArray(parsed.boxes)) return null;
    return parsed;
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code !== 404 && code !== '404') {
      logger.warn('adminBoxesDashboard: cache read failed', { err: String(err) });
    }
    return null;
  }
}

async function writeBoxesDashboardCache(dash: BoxesDashboard): Promise<void> {
  await getStorage().bucket().file(BOXES_DASH_CACHE_PATH).save(JSON.stringify(dash), {
    contentType: 'application/json',
    resumable: false,
    metadata: { cacheControl: 'private, max-age=60' },
  });
}

async function assembleBoxesDashboard(db: Firestore, opts: { backfillCards?: boolean } = {}): Promise<BoxesDashboard> {
  const [dash, metaByAd, audits] = await Promise.all([
    buildBoxesDashboard(db, Date.now(), { backfillCards: opts.backfillCards }),
    metaStatsByAd(),
    loadBoxProblems(db).catch((err) => {
      logger.warn('adminBoxesDashboard: box problems unavailable', { err: String(err) });
      return { boxProblems: [], boxAuditRun: null, fixLog: [] };
    }),
  ]);
  return { ...dash, metaByAd, ...audits };
}

const BOXES_DASH_CALL_OPTS = {
  secrets: [metaAdsAccessToken],
  timeoutSeconds: 300,
  memory: '2GiB' as const,
};

/** Rebuild every 2 minutes so the admin page can serve a warm snapshot instead of scanning live. */
export const scheduledBoxesDashboard = onSchedule(
  {
    schedule: 'every 2 minutes',
    timeZone: 'America/New_York',
    secrets: [metaAdsAccessToken],
    memory: '2GiB',
    timeoutSeconds: 300,
  },
  async () => {
    const db = getFirestore();
    try {
      const dash = await assembleBoxesDashboard(db, { backfillCards: true });
      await writeBoxesDashboardCache(dash);
      logger.info('adminBoxesDashboard: cache refreshed', {
        generatedAt: dash.generatedAt,
        boxes: dash.boxes.length,
        guests: dash.guests.length,
      });
    } catch (err) {
      logger.error('adminBoxesDashboard: scheduled rebuild failed', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
);

export function createAdminBoxesDashboard(db: Firestore) {
  return onCall(BOXES_DASH_CALL_OPTS, async (request): Promise<BoxesDashboard> => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
    if (!isAdminToken(request.auth.token)) throw new HttpsError('permission-denied', 'Admin only.');
    const force = Boolean((request.data as { refresh?: unknown } | null)?.refresh);

    if (!force) {
      const cached = await readBoxesDashboardCache();
      const age = cached ? Date.now() - Date.parse(cached.generatedAt) : Infinity;
      if (cached && Number.isFinite(age) && age >= 0 && age < BOXES_DASH_CACHE_MAX_AGE_MS) {
        return cached;
      }
    }

    const dash = await assembleBoxesDashboard(db, { backfillCards: false });
    void writeBoxesDashboardCache(dash).catch((err) => {
      logger.warn('adminBoxesDashboard: cache write failed', { err: String(err) });
    });
    return dash;
  });
}
