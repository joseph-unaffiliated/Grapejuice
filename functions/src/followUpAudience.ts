import { createHash, randomInt } from 'crypto';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { isTest } from './testAccounts';

/**
 * Customer-list side of the Meta follow-up audience. The website audience only holds browsers that
 * fired BoxFollowUp in the last 30 days; this list adds account holders who built a box but never
 * added a card, plus static lead lists stored as hashes in STATIC_ROWS_DOC.
 * Shared by scheduledFollowUpListAudience (followUpListAudience.ts) and
 * scripts/meta-followup-list-audience.mjs, which loads this file in plain Node: keep runtime
 * imports to crypto and pure local modules.
 */

export const FOLLOW_UP_HOLIDAY_ID = 'hanukkah-2026';
/** "Follow-up - builders no payment + form list", targeted by the follow-up ad set. */
export const FOLLOW_UP_LIST_AUDIENCE_ID = '120247911418820519';
export const META_AD_ACCOUNT = 'act_1311852520406314';
/** Hashed lead-list rows: { rows: [{ em, ph, fn, ln }], count, seededAt }. Never readable by clients. */
export const STATIC_ROWS_DOC = 'adminConfig/metaFollowupStatic';
/** Order statuses that mean the household already paid (or committed a card). */
export const PAID_ORDER_STATUSES = ['committed', 'confirmed', 'shipped', 'delivered'];
export const AUDIENCE_SCHEMA = ['EMAIL', 'PHONE', 'FN', 'LN'] as const;
const PROTECTED_AUDIENCES = new Set(['120247150226310519']);
const GRAPH = 'https://graph.facebook.com/v21.0';
const BATCH = 10000;

/** One AUDIENCE_SCHEMA row of SHA-256 hashes, '' for missing keys. */
export type HashedRow = string[];

export type FollowUpHousehold = {
  draftLineItems: unknown;
  cardOnFileAt?: unknown;
  stripeDefaultPaymentMethodId?: unknown;
  orderStatuses: unknown[];
  email: string | null;
};

export type FollowUpSkipReason = 'no_box' | 'card_on_file' | 'paid_order' | 'no_email' | 'test';

function boxItemCount(lineItems: unknown): number {
  if (!Array.isArray(lineItems)) return 0;
  return lineItems.reduce<number>((sum, line) => {
    const qty = line && typeof line === 'object' ? (line as { quantity?: unknown }).quantity : 0;
    return sum + (typeof qty === 'number' && qty > 0 ? qty : 0);
  }, 0);
}

function hasPaid(h: Pick<FollowUpHousehold, 'cardOnFileAt' | 'stripeDefaultPaymentMethodId' | 'orderStatuses'>): boolean {
  return (
    Boolean(h.cardOnFileAt || h.stripeDefaultPaymentMethodId) ||
    h.orderStatuses.some((s) => typeof s === 'string' && PAID_ORDER_STATUSES.includes(s))
  );
}

export function followUpSkipReason(h: FollowUpHousehold): FollowUpSkipReason | null {
  if (boxItemCount(h.draftLineItems) === 0) return 'no_box';
  if (h.cardOnFileAt || h.stripeDefaultPaymentMethodId) return 'card_on_file';
  if (hasPaid(h)) return 'paid_order';
  if (!normalizeEmail(h.email)) return 'no_email';
  if (isTest(h.email)) return 'test';
  return null;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

/** Digits with country code; bare 10-digit numbers are taken as US. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) return `1${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().toLowerCase().replace(/[^\p{L}]/gu, '');
  return name || null;
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export type AudiencePerson = { email?: unknown; phone?: unknown; firstName?: unknown; lastName?: unknown };

/** Hashed row, or null with neither email nor phone. */
export function hashedAudienceRow(p: AudiencePerson): HashedRow | null {
  const email = normalizeEmail(p.email);
  const phone = normalizePhone(p.phone);
  if (!email && !phone) return null;
  const hash = (v: string | null) => (v ? sha256(v) : '');
  return [hash(email), hash(phone), hash(normalizeName(p.firstName)), hash(normalizeName(p.lastName))];
}

/** Drops rows whose email hash (or, without an email, phone hash) was already seen. */
export function dedupeAudienceRows(rows: HashedRow[]): { rows: HashedRow[]; duplicates: number } {
  const seen = new Set<string>();
  const out: HashedRow[] = [];
  for (const row of rows) {
    const key = row[0] ? `e:${row[0]}` : `p:${row[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return { rows: out, duplicates: rows.length - out.length };
}

/** Firestore can't nest arrays, so stored rows are maps of the non-empty hashes. */
export type StoredRow = { em?: string; ph?: string; fn?: string; ln?: string };

export function toStoredRow(row: HashedRow): StoredRow {
  const [em, ph, fn, ln] = row;
  return { ...(em ? { em } : {}), ...(ph ? { ph } : {}), ...(fn ? { fn } : {}), ...(ln ? { ln } : {}) };
}

export function fromStoredRow(row: StoredRow): HashedRow | null {
  const hex = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : '');
  const out = [hex(row?.em), hex(row?.ph), hex(row?.fn), hex(row?.ln)];
  return out[0] || out[1] ? out : null;
}

/** Builders first, then static rows minus anyone whose email hash belongs to a paying household. */
export function combineFollowUpRows(
  builderRows: HashedRow[],
  staticRows: HashedRow[],
  paidEmailHashes: Set<string>
): { rows: HashedRow[]; duplicates: number; staticPaid: number } {
  const unpaidStatic = staticRows.filter((r) => !(r[0] && paidEmailHashes.has(r[0])));
  const { rows, duplicates } = dedupeAudienceRows([...builderRows, ...unpaidStatic]);
  return { rows, duplicates, staticPaid: staticRows.length - unpaidStatic.length };
}

export type BuilderSelection = {
  rows: HashedRow[];
  paidEmailHashes: Set<string>;
  skipped: Partial<Record<FollowUpSkipReason, number>>;
};

/** Account holders with a box draft, no card and no paid order (test accounts skipped). Read-only. */
export async function selectBuilderRows(db: Firestore): Promise<BuilderSelection> {
  const [householdSnap, draftSnap, orderSnap, userSnap] = await Promise.all([
    db.collection('households').select('ownerId', 'cardOnFileAt', 'stripeDefaultPaymentMethodId').get(),
    db.collectionGroup('boxDrafts').get(),
    db.collectionGroup('orders').select('status').get(),
    db.collection('users').select('email', 'displayName', 'phone').get(),
  ]);
  const users = new Map(userSnap.docs.map((d) => [d.id, d.data()]));
  const statusesByHousehold = new Map<string, unknown[]>();
  for (const d of orderSnap.docs) {
    const hh = d.ref.parent.parent;
    if (hh?.parent.id !== 'households') continue;
    statusesByHousehold.set(hh.id, [...(statusesByHousehold.get(hh.id) ?? []), d.data().status]);
  }
  const households = new Map(householdSnap.docs.map((d) => [d.id, d.data()]));
  const ownerOf = (h: DocumentData | undefined) =>
    typeof h?.ownerId === 'string' ? users.get(h.ownerId) : undefined;

  const paidEmailHashes = new Set<string>();
  for (const [hid, h] of households) {
    const email = normalizeEmail(ownerOf(h)?.email);
    if (email && hasPaid({ ...h, orderStatuses: statusesByHousehold.get(hid) ?? [] })) paidEmailHashes.add(sha256(email));
  }

  const rows: HashedRow[] = [];
  const skipped: BuilderSelection['skipped'] = {};
  for (const d of draftSnap.docs) {
    const hh = d.ref.parent.parent;
    if (d.id !== FOLLOW_UP_HOLIDAY_ID || hh?.parent.id !== 'households') continue;
    const h = households.get(hh.id);
    const owner = ownerOf(h);
    const reason = followUpSkipReason({
      draftLineItems: d.data().lineItems,
      cardOnFileAt: h?.cardOnFileAt,
      stripeDefaultPaymentMethodId: h?.stripeDefaultPaymentMethodId,
      orderStatuses: statusesByHousehold.get(hh.id) ?? [],
      email: typeof owner?.email === 'string' ? owner.email : null,
    });
    if (reason) {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
      continue;
    }
    const [firstName, ...rest] = String(owner?.displayName ?? '').trim().split(/\s+/);
    const lastName = rest[rest.length - 1];
    const row = hashedAudienceRow({ email: owner?.email, phone: owner?.phone, firstName, lastName });
    if (row) rows.push(row);
  }
  return { rows, paidEmailHashes, skipped };
}

/** Rows stored by `scripts/meta-followup-list-audience.mjs --seed-static`, or null when never seeded. */
export async function loadStaticRows(db: Firestore): Promise<HashedRow[] | null> {
  const snap = await db.doc(STATIC_ROWS_DOC).get();
  if (!snap.exists) return null;
  const stored = snap.data()?.rows;
  return Array.isArray(stored) ? stored.map(fromStoredRow).filter((r): r is HashedRow => r !== null) : [];
}

type GraphFetch = (url: string, init?: { method?: string; body?: URLSearchParams }) => Promise<{ json(): Promise<unknown> }>;

async function graph(
  fetchImpl: GraphFetch,
  token: string,
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, any>> {
  const body = new URLSearchParams({ access_token: token });
  for (const [k, v] of Object.entries(params)) body.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const res = await fetchImpl(method === 'GET' ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`, {
    method,
    ...(method === 'GET' ? {} : { body }),
  });
  const json = (await res.json()) as Record<string, any>;
  if (json.error) throw new Error(`Meta ${method} ${path.split('/')[0]}: ${json.error.message}`);
  return json;
}

export async function createFollowUpListAudience(token: string, name: string, fetchImpl: GraphFetch = fetch): Promise<string> {
  const made = await graph(fetchImpl, token, 'POST', `${META_AD_ACCOUNT}/customaudiences`, {
    name,
    subtype: 'CUSTOM',
    customer_file_source: 'USER_PROVIDED_ONLY',
    description: 'Box builders without a card on file, plus lead lists. Refreshed daily by scheduledFollowUpListAudience.',
  });
  return String(made.id);
}

/**
 * Replace (not append) the audience's members so people who paid drop off. Refuses anything but a
 * customer-list audience in META_AD_ACCOUNT, and an empty list (which would wipe the audience).
 */
export async function replaceAudienceMembers(
  audienceId: string,
  rows: HashedRow[],
  token: string,
  fetchImpl: GraphFetch = fetch
): Promise<{ received: number; invalid: number }> {
  if (PROTECTED_AUDIENCES.has(audienceId)) throw new Error(`Refusing to write to protected audience ${audienceId}`);
  if (!rows.length) throw new Error('Refusing to replace the audience with an empty list');
  const target = await graph(fetchImpl, token, 'GET', audienceId, { fields: 'subtype,account_id' });
  if (target.subtype !== 'CUSTOM' || `act_${target.account_id}` !== META_AD_ACCOUNT) {
    throw new Error(`Audience ${audienceId} is not a customer list in ${META_AD_ACCOUNT}`);
  }
  const sessionId = randomInt(1, 2 ** 47);
  let received = 0;
  let invalid = 0;
  for (let i = 0, seq = 1; i < rows.length; i += BATCH, seq++) {
    const r = await graph(fetchImpl, token, 'POST', `${audienceId}/usersreplace`, {
      session: {
        session_id: sessionId,
        batch_seq: seq,
        last_batch_flag: i + BATCH >= rows.length,
        estimated_num_total: rows.length,
      },
      payload: { schema: AUDIENCE_SCHEMA, data: rows.slice(i, i + BATCH) },
    });
    received += Number(r.num_received ?? 0);
    invalid += Number(r.num_invalid_entries ?? 0);
  }
  return { received, invalid };
}
