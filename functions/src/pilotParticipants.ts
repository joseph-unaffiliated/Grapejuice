/**
 * Pilot Participants (docs/RESEARCH_PARTICIPANT_PROGRAM_BRIEF.md): invited families add three free
 * items to their Hanukkah box and agree to finish the post-Hanukkah survey by Jan 15, or be charged
 * for those items. Phase 1 here: invites, the enroll page's data, enrolling, and keeping the pilot
 * lines on the box. Survey tracking, the deferred charge and refunds come later.
 *
 * - pilotInvites/{token}: one per email, made by an admin (adminPilotParticipants) or by the
 *   auto-invite sweep (runPilotAutoInvites, `source: 'auto'`). Joseph emails the link himself and
 *   ticks `emailedAt` / `followUpAt` in the admin; nothing here sends it.
 * - pilotEnrollments/{householdId}: picks (price snapshot), agreement record, status
 *   `awaiting_checkout` (picks are in the draft; the box isn't checked out yet) → `enrolled`.
 * - adminConfig/pilotParticipants (optional): `itemIds` overrides the approved list and its order.
 *
 * Pilot lines are $0 box lines with `program: 'pilot'` and `deferredChargeCents`. The enrollment is
 * their source of truth: order syncs and checkout merge them back in, and a draft write that drops
 * them is healed. They can't be changed or removed once joined.
 */
import { randomBytes } from 'node:crypto';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue, getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as logger from './logger';
import { guestAnsweredSliders } from './adminDashboard';
import { isTest } from './testAccounts';
import { onCall, HttpsError, withSentry } from './sentry';
import { appOrigin, isAdminToken } from './guestSessions';
import { enforceRateLimits, normalizeEmail } from './loginLinks';
import { findOrCreateAccountByEmail } from './promotions';
import { requestIp } from './geo';
import { sendEmail } from './email';
import { catalogEmailImage } from './emailItems';
import {
  assertBoxLinesWithinInventory,
  HOLIDAY_ID,
  inventoryDocRef,
  parseCounters,
  recomputeBoxAllocations,
} from './catalogInventory';
import {
  agreementHash,
  formatPilotDay,
  formatPilotDollars,
  isAutoInviteEligible,
  isPilotLine,
  maskEmail,
  mergePilotLines,
  pickProblem,
  pilotAgreementText,
  pilotLineFor,
  PILOT_AGREEMENT_VERSION,
  PILOT_DEFAULT_ITEMS,
  PILOT_PICK_COUNT,
  PILOT_SURVEY_DUE_AT,
  PILOT_SURVEY_DUE_LABEL,
  type PilotLine,
  type PilotPick,
} from './pilotRules';

const CATALOG_HOLIDAY = 'hanukkah';
const OPEN_ORDER_STATUSES = new Set(['committed', 'pending']);
const JOINED_STATUSES = new Set(['enrolled', 'awaiting_checkout']);
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

type Line = { itemId?: string; quantity?: number; program?: unknown; [key: string]: unknown };

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

function pilotLink(token: string): string {
  return `${appOrigin()}/pilot/${token}`;
}

function linesOf(raw: unknown): Line[] {
  return Array.isArray(raw) ? (raw.filter((l) => l && typeof l === 'object') as Line[]) : [];
}

async function boxConfig(db: Firestore): Promise<{ lockAt: string | null; arrivesBy: string | null }> {
  const data = (await db.doc(`config/${HOLIDAY_ID}`).get()).data() ?? {};
  return {
    lockAt: typeof data.lockAt === 'string' ? data.lockAt : null,
    arrivesBy: typeof data.estimatedDeliveryBy === 'string' ? data.estimatedDeliveryBy : null,
  };
}

function isPast(iso: string | null | undefined): boolean {
  return !!iso && Date.now() >= new Date(iso).getTime();
}

/** Approved ids in display order: adminConfig/pilotParticipants.itemIds when set, else the brief's nine. */
async function approvedItems(db: Firestore): Promise<Array<{ id: string; name: string }>> {
  const ids = (await db.doc('adminConfig/pilotParticipants').get()).data()?.itemIds;
  if (!Array.isArray(ids) || !ids.length) return [...PILOT_DEFAULT_ITEMS];
  const names = new Map(PILOT_DEFAULT_ITEMS.map((i) => [i.id, i.name]));
  return ids
    .filter((id): id is string => typeof id === 'string' && !!id)
    .map((id) => ({ id, name: names.get(id) ?? '' }));
}

type CatalogRow = { id: string; name: string; memberPriceCents: number; imageUrl: string | null; remaining: number | null };

/** Catalog rows with how many units are left for boxes (null = untracked). */
async function catalogRows(db: Firestore, ids: string[]): Promise<Map<string, CatalogRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const [items, inv] = await Promise.all([
    db.getAll(...unique.map((id) => db.doc(`catalog/${CATALOG_HOLIDAY}/items/${id}`))),
    db.getAll(...unique.map((id) => inventoryDocRef(db, id))),
  ]);
  const rows = new Map<string, CatalogRow>();
  items.forEach((snap, i) => {
    if (!snap.exists) return;
    const d = snap.data() ?? {};
    const thumbs = Array.isArray(d.imageThumbUrls) ? d.imageThumbUrls : [];
    const inventory = typeof d.inventory === 'number' && Number.isFinite(d.inventory) ? Math.floor(d.inventory) : null;
    const c = parseCounters(inv[i]?.data());
    const used = (c.boxAllocatedQty ?? 0) + (c.directReservedQty ?? 0) + (c.directSoldQty ?? 0);
    rows.set(snap.id, {
      id: snap.id,
      name: str(d.name) || snap.id,
      memberPriceCents: typeof d.memberPriceCents === 'number' ? Math.round(d.memberPriceCents) : 0,
      imageUrl: str(thumbs[0]) || str(d.imageUrl) || null,
      remaining: inventory == null ? null : inventory - used,
    });
  });
  return rows;
}

type OpenBox = {
  householdId: string;
  draftRef: FirebaseFirestore.DocumentReference;
  draftLines: Line[];
  draftExists: boolean;
  order: { ref: FirebaseFirestore.DocumentReference; data: DocumentData } | null;
};

/** The household's draft and its open (committed or pending, not marketplace) Hanukkah box order. */
async function loadBox(db: Firestore, householdId: string): Promise<OpenBox> {
  const draftRef = db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`);
  const [draftSnap, ordersSnap] = await Promise.all([
    draftRef.get(),
    db.collection(`households/${householdId}/orders`).where('holidayId', '==', HOLIDAY_ID).get(),
  ]);
  const open = ordersSnap.docs
    .filter((d) => {
      const o = d.data();
      return OPEN_ORDER_STATUSES.has(str(o.status)) && (o.orderType ?? 'hanukkah_box') === 'hanukkah_box';
    })
    .sort((a, b) => (b.createTime?.toMillis() ?? 0) - (a.createTime?.toMillis() ?? 0))[0];
  return {
    householdId,
    draftRef,
    draftLines: linesOf(draftSnap.data()?.lineItems),
    draftExists: draftSnap.exists,
    order: open ? { ref: open.ref, data: open.data() } : null,
  };
}

async function householdOf(db: Firestore, uid: string): Promise<string> {
  const hh = str((await db.doc(`users/${uid}`).get()).data()?.householdId);
  if (!hh) throw new HttpsError('failed-precondition', 'Your account isn’t set up yet. Build your box first.');
  return hh;
}

function boxItemsView(lines: Line[], rows: Map<string, CatalogRow>) {
  const qty = new Map<string, number>();
  for (const li of lines) {
    if (isPilotLine(li)) continue;
    const id = str(li.itemId);
    if (!id) continue;
    qty.set(id, (qty.get(id) ?? 0) + Math.max(1, Math.floor(Number(li.quantity) || 1)));
  }
  return [...qty.entries()].map(([itemId, quantity]) => ({
    itemId,
    name: rows.get(itemId)?.name ?? itemId,
    imageUrl: rows.get(itemId)?.imageUrl ?? null,
    quantity,
  }));
}

function addressLine(order: DocumentData | undefined): string | null {
  const a = order?.shippingAddress as Record<string, unknown> | undefined;
  if (!a) return null;
  const parts = [str(a.city), str(a.stateProvince)].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

// ---------------------------------------------------------------------------
// Enrollment lines: the source of truth for pilot lines on a box
// ---------------------------------------------------------------------------

async function enrollmentLines(db: Firestore, householdId: string): Promise<PilotLine[] | null> {
  const e = (await db.doc(`pilotEnrollments/${householdId}`).get()).data();
  if (!e || !JOINED_STATUSES.has(str(e.status))) return null;
  return (Array.isArray(e.picks) ? (e.picks as PilotPick[]) : []).map(pilotLineFor);
}

/**
 * Box lines with the household's pilot lines merged in. Order sync and checkout call this on the
 * draft's lines so a client save can never drop or reprice them.
 */
export async function withPilotLines<L extends Line>(
  db: Firestore,
  householdId: string,
  lines: L[]
): Promise<{ lines: Array<L | PilotLine>; changed: boolean }> {
  const pilot = await enrollmentLines(db, householdId);
  if (!pilot) return { lines, changed: false };
  return mergePilotLines(lines, pilot);
}

/** After checkout: an `awaiting_checkout` enrollment is now on a committed order. */
export async function markPilotEnrollmentCommitted(db: Firestore, householdId: string, orderId: string): Promise<void> {
  const ref = db.doc(`pilotEnrollments/${householdId}`);
  const e = (await ref.get()).data();
  if (!e || str(e.status) !== 'awaiting_checkout') return;
  const now = new Date().toISOString();
  await ref.update({ status: 'enrolled', orderId, enrolledAt: now, updatedAt: now });
  if (str(e.inviteToken)) {
    await db.doc(`pilotInvites/${e.inviteToken}`).update({ status: 'enrolled', enrolledAt: now }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Admin: invites and the status list
// ---------------------------------------------------------------------------

type AdminActor = { uid: string; email: string };

type InviteSource = 'auto' | 'manual';

const AUTO_ACTOR: AdminActor = { uid: 'auto', email: 'auto' };

async function createInvite(
  db: Firestore,
  actor: AdminActor,
  input: Record<string, unknown>,
  extra: { source?: InviteSource; jewishScore?: number | null } = {}
) {
  const email = normalizeEmail(input.email);
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
  if (!name) throw new HttpsError('invalid-argument', 'Enter their name.');

  const existing = await db.collection('pilotInvites').where('email', '==', email).get();
  const live = existing.docs.find((d) => str(d.data().status) !== 'cancelled');
  if (live) return { token: live.id, link: pilotLink(live.id), existing: true, accountCreated: false };

  const account = await findOrCreateAccountByEmail(db, email, firstNameOf(name) || null);
  const { lockAt } = await boxConfig(db);
  const token = randomBytes(16).toString('base64url');
  await db.doc(`pilotInvites/${token}`).create({
    email,
    name,
    uid: account.uid,
    householdId: account.householdId,
    accountCreated: account.accountCreated,
    status: 'invited',
    expiresAt: lockAt,
    createdByUid: actor.uid,
    createdByEmail: actor.email,
    createdAt: new Date().toISOString(),
    source: extra.source ?? 'manual',
    ...(typeof extra.jewishScore === 'number' ? { jewishScore: extra.jewishScore } : {}),
  });
  logger.info('pilot invite created', { accountCreated: account.accountCreated, source: extra.source ?? 'manual' });
  return { token, link: pilotLink(token), existing: false, accountCreated: account.accountCreated };
}

/** State / province label for admin (no street). Mirrors adminDashboard.locationOf, trimmed down. */
function adminLocationOf(addr: unknown): string | null {
  if (!addr || typeof addr !== 'object') return null;
  const a = addr as Record<string, unknown>;
  const raw = typeof a.stateProvince === 'string' ? a.stateProvince.trim().replace(/\.|\s+/g, ' ').toUpperCase() : '';
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, ' ');
  if (a.country === 'CA' || /\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|NT|NU|YT)\b/.test(compact)) {
    const m = compact.match(/\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|NT|NU|YT)\b/);
    return m ? `${m[1]}, Canada` : `${compact}, Canada`;
  }
  if (/^[A-Z]{2}$/.test(compact)) return compact;
  if (a.country === 'OTHER') return `${compact} (intl)`;
  return compact.length <= 24 ? compact : compact.slice(0, 24);
}

function adminIpLocation(geo: unknown): string | null {
  if (!geo || typeof geo !== 'object') return null;
  const g = geo as Record<string, unknown>;
  const country = str(g.country);
  const region = str(g.region);
  if (!country) return null;
  if (country === 'US') return region || 'US';
  if (country === 'CA') return region ? `${region}, Canada` : 'Canada';
  return country;
}

function ageLabel(plannerAge: unknown): string | null {
  if (typeof plannerAge !== 'number' || !Number.isFinite(plannerAge)) return null;
  const n = Math.max(0, Math.floor(plannerAge));
  return n >= 18 ? '18+' : String(n);
}

/** Chunked getAll — Firestore caps at 100 refs. */
async function getAllChunked(db: Firestore, refs: FirebaseFirestore.DocumentReference[]) {
  const out: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += 100) {
    out.push(...(await db.getAll(...refs.slice(i, i + 100))));
  }
  return out;
}

async function listInvites(db: Firestore) {
  const [invites, enrollments] = await Promise.all([
    db.collection('pilotInvites').orderBy('createdAt', 'desc').get(),
    db.collection('pilotEnrollments').get(),
  ]);
  const byToken = new Map(enrollments.docs.map((d) => [str(d.data().inviteToken), d.data()]));

  const householdIds = [
    ...new Set(invites.docs.map((d) => str(d.data().householdId) || str(byToken.get(d.id)?.householdId)).filter(Boolean)),
  ];
  const uids = [...new Set(invites.docs.map((d) => str(d.data().uid)).filter(Boolean))];

  const [userSnaps, draftSnaps, childrenSnap, openOrdersSnap, itemSnaps] = await Promise.all([
    uids.length ? getAllChunked(db, uids.map((uid) => db.doc(`users/${uid}`))) : Promise.resolve([]),
    householdIds.length
      ? getAllChunked(db, householdIds.map((hid) => db.doc(`households/${hid}/boxDrafts/${HOLIDAY_ID}`)))
      : Promise.resolve([]),
    uids.length ? db.collectionGroup('children').get() : Promise.resolve(null),
    householdIds.length
      ? db
          .collectionGroup('orders')
          // Index is status + holidayId (firestore.indexes.json).
          .where('status', 'in', [...OPEN_ORDER_STATUSES])
          .where('holidayId', '==', HOLIDAY_ID)
          .get()
      : Promise.resolve(null),
    db.collection(`catalog/${CATALOG_HOLIDAY}/items`).select('name').get(),
  ]);

  const users = new Map(userSnaps.map((s) => [s.id, s.data() ?? {}]));
  const drafts = new Map<string, DocumentData>();
  for (const s of draftSnaps) {
    const hid = s.ref.parent.parent?.id;
    if (hid && s.exists) drafts.set(hid, s.data() ?? {});
  }
  const kidAgesByUid = new Map<string, number[]>();
  if (childrenSnap) {
    const want = new Set(uids);
    for (const d of childrenSnap.docs) {
      const owner = d.ref.parent.parent;
      if (!owner || owner.parent.id !== 'users' || !want.has(owner.id)) continue;
      const age = ageLabel(d.data().plannerAge);
      if (age == null) continue;
      const n = age === '18+' ? 18 : Number(age);
      const list = kidAgesByUid.get(owner.id) ?? [];
      list.push(n);
      kidAgesByUid.set(owner.id, list);
    }
  }
  for (const [, ages] of kidAgesByUid) ages.sort((a, b) => a - b);

  const orderByHousehold = new Map<string, DocumentData>();
  if (openOrdersSnap) {
    const want = new Set(householdIds);
    for (const d of openOrdersSnap.docs) {
      const hid = d.ref.parent.parent?.id;
      if (!hid || !want.has(hid)) continue;
      const o = d.data();
      if ((o.orderType ?? 'hanukkah_box') !== 'hanukkah_box') continue;
      // Prefer committed over pending when both exist.
      const prev = orderByHousehold.get(hid);
      if (!prev || (str(prev.status) === 'pending' && str(o.status) === 'committed')) {
        orderByHousehold.set(hid, { ...o, _orderId: d.id });
      }
    }
  }

  const itemName = new Map(itemSnaps.docs.map((d) => [d.id, str(d.data().name) || d.id]));

  const boxItemNames = (lines: Line[]) => {
    const qty = new Map<string, { name: string; n: number }>();
    for (const li of lines) {
      const id = str(li.itemId);
      if (!id) continue;
      const name = itemName.get(id) || str((li as { label?: unknown }).label) || id;
      const prev = qty.get(id);
      const n = Math.max(1, Math.floor(Number(li.quantity) || 1));
      qty.set(id, { name, n: (prev?.n ?? 0) + n });
    }
    return [...qty.values()].map(({ name, n }) => (n > 1 ? `${name} ×${n}` : name));
  };

  return invites.docs.map((d) => {
    const i = d.data();
    const e = byToken.get(d.id);
    const picks = Array.isArray(e?.picks) ? (e!.picks as PilotPick[]) : [];
    const householdId = str(i.householdId) || str(e?.householdId) || null;
    const uid = str(i.uid);
    const user = uid ? users.get(uid) : undefined;
    const last = (user?.lastBoxAnswers ?? {}) as DocumentData;
    const jewishFromUser = scoreOf(last.practiceFrequencyScore);
    const jewishScore =
      typeof i.jewishScore === 'number' ? i.jewishScore : jewishFromUser;
    const hanukkahScore = scoreOf(last.familiarityScore);
    const order = householdId ? orderByHousehold.get(householdId) : undefined;
    const draft = householdId ? drafts.get(householdId) : undefined;
    const orderLines = order ? linesOf(order.lineItems) : [];
    const draftLines = draft ? linesOf(draft.lineItems) : [];
    const boxKind: 'order' | 'draft' | 'none' = order
      ? 'order'
      : draftLines.length
        ? 'draft'
        : 'none';
    const boxItems = boxItemNames(orderLines.length ? orderLines : draftLines);
    const addr = order?.shippingAddress;
    const location =
      adminLocationOf(addr) || adminIpLocation(user?.ipGeo) || null;
    const locationFromIp = !adminLocationOf(addr) && !!adminIpLocation(user?.ipGeo);
    const ages = uid ? kidAgesByUid.get(uid) ?? [] : [];
    const kidAges = ages.map((n) => (n >= 18 ? '18+' : String(n)));

    return {
      token: d.id,
      link: pilotLink(d.id),
      email: str(i.email),
      name: str(i.name),
      status: str(e?.status) || str(i.status) || 'invited',
      accountCreated: i.accountCreated === true,
      createdAt: str(i.createdAt),
      createdByEmail: str(i.createdByEmail),
      source: (i.source === 'auto' ? 'auto' : 'manual') as InviteSource,
      jewishScore,
      hanukkahScore,
      householdId,
      location,
      locationFromIp,
      kidAges,
      boxKind,
      boxItems,
      emailedAt: str(i.emailedAt) || null,
      followUpAt: str(i.followUpAt) || null,
      openedAt: str(i.openedAt) || null,
      enrolledAt: str(e?.enrolledAt) || null,
      joinedAt: str(e?.createdAt) || null,
      picks: picks.map((p) => p.name),
      deferredTotalCents: typeof e?.deferredTotalCents === 'number' ? e.deferredTotalCents : 0,
      quoteConsent: e?.quoteConsent === true,
      orderId: str(e?.orderId) || str(order?._orderId) || null,
    };
  });
}

async function cancelInvite(db: Firestore, input: Record<string, unknown>) {
  const token = str(input.token);
  if (!TOKEN_RE.test(token)) throw new HttpsError('invalid-argument', 'Invite not found.');
  const ref = db.doc(`pilotInvites/${token}`);
  const invite = (await ref.get()).data();
  if (!invite) throw new HttpsError('not-found', 'Invite not found.');
  const joined = await db.collection('pilotEnrollments').where('inviteToken', '==', token).limit(1).get();
  if (!joined.empty) throw new HttpsError('failed-precondition', 'They’ve already joined, so the invite can’t be cancelled.');
  await ref.update({ status: 'cancelled', cancelledAt: new Date().toISOString() });
  return { ok: true };
}

/** Ticks or clears "Emailed" (`emailedAt`) or "Follow-up sent" (`followUpAt`) on an invite. */
async function markSent(db: Firestore, actor: AdminActor, input: Record<string, unknown>, field: 'emailed' | 'followUp') {
  const token = str(input.token);
  if (!TOKEN_RE.test(token)) throw new HttpsError('invalid-argument', 'Invite not found.');
  const ref = db.doc(`pilotInvites/${token}`);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Invite not found.');
  const at = new Date().toISOString();
  await ref.update(
    input.done === true
      ? { [`${field}At`]: at, [`${field}ByEmail`]: actor.email }
      : { [`${field}At`]: FieldValue.delete(), [`${field}ByEmail`]: FieldValue.delete() }
  );
  return { ok: true, at: input.done === true ? at : null };
}

const scoreOf = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(100, v))) : null;

export type AutoInviteFamily = { email: string; name: string; jewishScore: number; householdId: string };

/**
 * Invites every family that qualifies (pilotRules.isAutoInviteEligible): Jewish practice at or
 * under 59 (a 50 is kept only when Hanukkah is also answered and under 60), a
 * real first name and an email, a Hanukkah draft with items and no checked-out box. Anyone with an
 * invite already (cancelled included) or an enrollment is left alone. Stops once the box locks.
 * Scores and names are read the way the Boxes dashboard reads them (adminDashboard.ts).
 */
export async function runPilotAutoInvites(
  db: Firestore,
  opts: { dryRun?: boolean } = {}
): Promise<{ dryRun: boolean; locked: boolean; created: number; families: AutoInviteFamily[] }> {
  const dryRun = opts.dryRun === true;
  const { lockAt } = await boxConfig(db);
  if (isPast(lockAt)) return { dryRun, locked: true, created: 0, families: [] };

  const [draftsSnap, ordersSnap, invitesSnap, enrollSnap, guestSnap] = await Promise.all([
    db.collectionGroup('boxDrafts').get(),
    db.collectionGroup('orders').select('orderType', 'holidayId', 'status', 'playthrough').get(),
    db.collection('pilotInvites').select('email', 'householdId').get(),
    db.collection('pilotEnrollments').select().get(),
    db.collection('guestSessions').select('convertedUid', 'snapshot.guest').get(),
  ]);

  const committed = new Set<string>();
  for (const d of ordersSnap.docs) {
    const o = d.data();
    const hid = d.ref.parent.parent?.id;
    const isBox = o.orderType === 'hanukkah_box' || (!o.orderType && o.holidayId === HOLIDAY_ID);
    if (hid && isBox && o.playthrough !== true && ['committed', 'confirmed', 'shipped', 'delivered'].includes(o.status)) {
      committed.add(hid);
    }
  }
  const invitedEmails = new Set(invitesSnap.docs.map((d) => str(d.data().email).toLowerCase()).filter(Boolean));
  const invitedHouseholds = new Set([
    ...invitesSnap.docs.map((d) => str(d.data().householdId)).filter(Boolean),
    ...enrollSnap.docs.map((d) => d.id),
  ]);

  const drafts = new Map<string, DocumentData>();
  for (const d of draftsSnap.docs) {
    const hh = d.ref.parent.parent;
    if (d.id !== HOLIDAY_ID || !hh || hh.parent.id !== 'households') continue;
    const x = d.data();
    if (!linesOf(x.lineItems).length || committed.has(hh.id) || invitedHouseholds.has(hh.id)) continue;
    drafts.set(hh.id, x);
  }
  if (!drafts.size) return { dryRun, locked: false, created: 0, families: [] };

  const hhSnaps = await db.getAll(...[...drafts.keys()].map((hid) => db.doc(`households/${hid}`)));
  const ownerByHousehold = new Map<string, { ownerId: string; playthrough: boolean }>();
  for (const s of hhSnaps) {
    const ownerId = str(s.data()?.ownerId);
    if (ownerId) ownerByHousehold.set(s.id, { ownerId, playthrough: s.data()?.playthrough === true });
  }
  const ownerIds = [...new Set([...ownerByHousehold.values()].map((o) => o.ownerId))];
  const userSnaps = ownerIds.length ? await db.getAll(...ownerIds.map((uid) => db.doc(`users/${uid}`))) : [];
  const userById = new Map(userSnaps.map((s) => [s.id, s.data() ?? {}]));

  // Some profiles lack email/displayName; the Auth record still has them.
  const authByUid = new Map<string, { email: string | null; name: string | null }>();
  const needAuth = ownerIds.filter((uid) => !str(userById.get(uid)?.email) || !str(userById.get(uid)?.displayName));
  for (let i = 0; i < needAuth.length; i += 100) {
    const { users } = await getAuth().getUsers(needAuth.slice(i, i + 100).map((uid) => ({ uid })));
    for (const r of users) authByUid.set(r.uid, { email: r.email ?? null, name: r.displayName ?? null });
  }

  // Slider answers from a converted guest session fill in for accounts with no saved lastBoxAnswers.
  const guestScores = new Map<string, { jewish: number; hanukkah: number | null }>();
  for (const d of guestSnap.docs) {
    const x = d.data();
    const uid = str(x.convertedUid);
    const guest = x.snapshot?.guest;
    const s = guest ? scoreOf(guest.practiceFrequencyScore) : null;
    if (uid && guest && s != null && guestAnsweredSliders(guest)) {
      guestScores.set(uid, { jewish: s, hanukkah: scoreOf(guest.familiarityScore) });
    }
  }

  const families: AutoInviteFamily[] = [];
  for (const [hid, draft] of drafts) {
    const owner = ownerByHousehold.get(hid);
    if (!owner) continue;
    const u = userById.get(owner.ownerId) ?? {};
    const auth = authByUid.get(owner.ownerId);
    const email = (str(u.email) || auth?.email || '').trim().toLowerCase() || null;
    const name = (str(u.displayName) || auth?.name || '').trim() || null;
    const savedPractice = scoreOf(u.lastBoxAnswers?.practiceFrequencyScore);
    const guest = guestScores.get(owner.ownerId);
    const jewish = savedPractice ?? guest?.jewish ?? null;
    const hanukkah =
      savedPractice != null ? scoreOf(u.lastBoxAnswers?.familiarityScore) : (guest?.hanukkah ?? null);
    const eligible = isAutoInviteEligible({
      jewish,
      hanukkah,
      email,
      name,
      hasDraftLines: true,
      committed: false,
      playthrough: owner.playthrough || draft.playthrough === true,
      isTest: isTest(email),
      alreadyInvited: !!email && invitedEmails.has(email),
    });
    if (eligible && !families.some((f) => f.email === email)) {
      families.push({ email: email!, name: name!, jewishScore: jewish!, householdId: hid });
    }
  }

  let created = 0;
  if (!dryRun) {
    for (const f of families) {
      try {
        const r = await createInvite(db, AUTO_ACTOR, { email: f.email, name: f.name }, { source: 'auto', jewishScore: f.jewishScore });
        if (!r.existing) created += 1;
      } catch (err) {
        logger.error('pilot auto invite failed', { householdId: f.householdId, err: String(err) });
      }
    }
  }
  logger.info('pilot auto invites', { dryRun, eligible: families.length, created });
  return { dryRun, locked: false, created, families };
}

export const adminPilotParticipants = onCall(async (request) => {
  if (!request.auth?.uid || !isAdminToken(request.auth.token)) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
  const actor: AdminActor = {
    uid: request.auth.uid,
    email: typeof request.auth.token.email === 'string' ? request.auth.token.email : '',
  };
  const input = (request.data ?? {}) as Record<string, unknown>;
  const db = getFirestore();
  switch (input.action) {
    case 'list':
      return { invites: await listInvites(db) };
    case 'createInvite':
      return createInvite(db, actor, input);
    case 'cancelInvite':
      return cancelInvite(db, input);
    case 'markEmailed':
      return markSent(db, actor, input, 'emailed');
    case 'markFollowUp':
      return markSent(db, actor, input, 'followUp');
    case 'autoInvite': {
      const r = await runPilotAutoInvites(db, { dryRun: input.dryRun === true });
      return { dryRun: r.dryRun, locked: r.locked, created: r.created, eligible: r.families.length };
    }
    default:
      throw new HttpsError('invalid-argument', 'Unknown action.');
  }
});

// ---------------------------------------------------------------------------
// The enroll page
// ---------------------------------------------------------------------------

async function liveInvite(db: Firestore, token: string): Promise<{ ref: FirebaseFirestore.DocumentReference; data: DocumentData } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const ref = db.doc(`pilotInvites/${token}`);
  const snap = await ref.get();
  const data = snap.data();
  if (!data || str(data.status) === 'cancelled') return null;
  return { ref, data };
}

function inviteMatches(invite: DocumentData, auth: { uid: string; token: Record<string, unknown> }): boolean {
  const email = typeof auth.token.email === 'string' ? auth.token.email.trim().toLowerCase() : '';
  return auth.uid === str(invite.uid) || (!!email && email === str(invite.email));
}

function joinedView(e: DocumentData, rows: Map<string, CatalogRow>) {
  const picks = (Array.isArray(e.picks) ? (e.picks as PilotPick[]) : []).map((p) => ({
    itemId: p.itemId,
    name: p.name,
    deferredChargeCents: p.deferredChargeCents,
    imageUrl: rows.get(p.itemId)?.imageUrl ?? null,
  }));
  return {
    status: str(e.status) as 'enrolled' | 'awaiting_checkout',
    picks,
    totalCents: typeof e.deferredTotalCents === 'number' ? e.deferredTotalCents : 0,
  };
}

/**
 * Everything the /pilot/:token page needs. Signed out it only says whose invite it is; an unknown,
 * cancelled or expired token says nothing about the program.
 */
export const getPilotInvite = onCall(async (request) => {
  const db = getFirestore();
  const token = str(request.data?.token).trim();
  if (!request.auth?.uid) await enforceRateLimits(db, null, request.rawRequest, 'pilot:');

  const invite = await liveInvite(db, token);
  if (!invite) return { state: 'unavailable' as const };
  const firstName = firstNameOf(str(invite.data.name));
  const maskedEmail = maskEmail(str(invite.data.email));
  const { lockAt, arrivesBy } = await boxConfig(db);
  const dates = { lockAt, arrivesBy, surveyDueLabel: PILOT_SURVEY_DUE_LABEL };

  if (str(invite.data.status) === 'invited') {
    await invite.ref.update({ status: 'opened', openedAt: new Date().toISOString() }).catch(() => undefined);
  }

  if (!request.auth?.uid) {
    if (isPast(lockAt) || isPast(str(invite.data.expiresAt) || null)) return { state: 'closed' as const, firstName };
    return { state: 'sign_in' as const, firstName, maskedEmail, dates };
  }
  if (!inviteMatches(invite.data, request.auth as { uid: string; token: Record<string, unknown> })) {
    return { state: 'wrong_account' as const, firstName, maskedEmail };
  }

  const householdId = await householdOf(db, request.auth.uid);
  const [enrollment, box, approved] = await Promise.all([
    db.doc(`pilotEnrollments/${householdId}`).get(),
    loadBox(db, householdId),
    approvedItems(db),
  ]);
  const boxLines = box.order ? linesOf(box.order.data.lineItems) : box.draftLines;
  const rows = await catalogRows(db, [...approved.map((a) => a.id), ...boxLines.map((l) => str(l.itemId))]);
  const hh = (await db.doc(`households/${householdId}`).get()).data() ?? {};
  const boxView = {
    kind: box.order ? ('order' as const) : boxLines.some((l) => !isPilotLine(l)) ? ('draft' as const) : ('none' as const),
    items: boxItemsView(boxLines, rows),
    address: addressLine(box.order?.data),
    cardOnFile: !!hh.cardOnFileAt,
  };

  const e = enrollment.data();
  if (e && JOINED_STATUSES.has(str(e.status))) {
    return { state: 'joined' as const, firstName, dates, box: boxView, enrollment: joinedView(e, rows) };
  }
  if (isPast(lockAt) || isPast(str(invite.data.expiresAt) || null)) return { state: 'closed' as const, firstName };

  const inBox = new Set(boxLines.filter((l) => !isPilotLine(l)).map((l) => str(l.itemId)));
  const items = approved
    .map((a) => ({ a, row: rows.get(a.id) }))
    .filter(({ row }) => row && row.memberPriceCents > 0 && (row.remaining == null || row.remaining > 0))
    .map(({ a, row }) => ({
      id: a.id,
      name: a.name || row!.name,
      memberPriceCents: row!.memberPriceCents,
      imageUrl: row!.imageUrl,
      inBox: inBox.has(a.id),
    }));
  return { state: 'ready' as const, firstName, dates, box: boxView, items, pickCount: PILOT_PICK_COUNT };
});

/**
 * Join: three approved picks, the agreement as shown, a typed name. Adds the pilot lines to the
 * committed order (and draft) when there is one, else to the draft for checkout. No backing out.
 */
export const enrollPilot = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to join.');
  const db = getFirestore();
  const input = (request.data ?? {}) as Record<string, unknown>;
  const token = str(input.token).trim();
  const invite = await liveInvite(db, token);
  if (!invite) throw new HttpsError('not-found', 'This invitation isn’t available.');
  if (!inviteMatches(invite.data, request.auth as { uid: string; token: Record<string, unknown> })) {
    throw new HttpsError('permission-denied', `This invitation is for ${maskEmail(str(invite.data.email))}. Sign in with that email to continue.`);
  }
  const { lockAt } = await boxConfig(db);
  if (isPast(lockAt) || isPast(str(invite.data.expiresAt) || null)) {
    throw new HttpsError('failed-precondition', 'Sign-up closed when boxes locked.');
  }

  const typedName = typeof input.typedName === 'string' ? input.typedName.trim().slice(0, 120) : '';
  if (typedName.length < 2) throw new HttpsError('invalid-argument', 'Type your full name to sign.');
  if (input.agreed !== true) throw new HttpsError('invalid-argument', 'Check “I agree” to join.');
  const pickIds = Array.isArray(input.itemIds) ? input.itemIds.map((v) => str(v)).filter(Boolean) : [];

  const householdId = await householdOf(db, uid);
  const enrollmentRef = db.doc(`pilotEnrollments/${householdId}`);
  if ((await enrollmentRef.get()).exists) {
    throw new HttpsError('already-exists', 'Your household has already joined the pilot.');
  }

  const [box, approved] = await Promise.all([loadBox(db, householdId), approvedItems(db)]);
  const boxLines = box.order ? linesOf(box.order.data.lineItems) : box.draftLines;
  if (!box.order && !box.draftLines.some((l) => !isPilotLine(l))) {
    throw new HttpsError('failed-precondition', 'You’ll need a Hanukkah box to join, since your picks ship inside it.');
  }
  if (box.order && isPast(str(box.order.data.lockAt) || lockAt)) {
    throw new HttpsError('failed-precondition', 'Your box has locked, so it can’t take new items.');
  }
  const rows = await catalogRows(db, approved.map((a) => a.id));
  const nameOf = (id: string) => approved.find((a) => a.id === id)?.name || rows.get(id)?.name || id;
  const problem = pickProblem(pickIds, approved.map((a) => a.id), [...boxLines, ...box.draftLines], nameOf);
  if (problem) throw new HttpsError('invalid-argument', problem);

  const picks: PilotPick[] = pickIds.map((id) => {
    const row = rows.get(id);
    if (!row || row.memberPriceCents <= 0) throw new HttpsError('invalid-argument', `${nameOf(id)} isn’t available. Pick something else.`);
    return { itemId: id, name: nameOf(id), deferredChargeCents: row.memberPriceCents };
  });
  const text = pilotAgreementText(picks);
  if (str(input.agreementText) !== text) {
    throw new HttpsError('failed-precondition', 'The agreement changed while you were reading. Refresh the page and sign again.');
  }
  const pilotLines = picks.map(pilotLineFor);

  const playthrough = box.order?.data.playthrough === true;
  if (box.order && !playthrough) {
    const prior = linesOf(box.order.data.lineItems);
    await assertBoxLinesWithinInventory(db, mergePilotLines(prior, pilotLines).lines, { creditLines: prior });
  } else if (!box.order) {
    await assertBoxLinesWithinInventory(db, pilotLines);
  }

  const now = new Date().toISOString();
  const status = box.order ? 'enrolled' : 'awaiting_checkout';
  const deferredTotalCents = picks.reduce((s, p) => s + p.deferredChargeCents, 0);
  const headers = (request.rawRequest as { headers?: Record<string, unknown> } | undefined)?.headers ?? {};

  await db.runTransaction(async (tx) => {
    const [existing, draftSnap, orderSnap] = await Promise.all([
      tx.get(enrollmentRef),
      tx.get(box.draftRef),
      box.order ? tx.get(box.order.ref) : Promise.resolve(null),
    ]);
    if (existing.exists) throw new HttpsError('already-exists', 'Your household has already joined the pilot.');
    if (orderSnap && !OPEN_ORDER_STATUSES.has(str(orderSnap.data()?.status))) {
      throw new HttpsError('failed-precondition', 'Your box order changed. Refresh and try again.');
    }
    tx.create(enrollmentRef, {
      householdId,
      uid,
      email: str(invite.data.email),
      name: str(invite.data.name),
      inviteToken: token,
      status,
      orderId: box.order?.ref.id ?? null,
      picks,
      deferredTotalCents,
      surveyDueAt: PILOT_SURVEY_DUE_AT,
      agreement: {
        text,
        hash: agreementHash(text),
        version: PILOT_AGREEMENT_VERSION,
        typedName,
        agreedAt: now,
        ip: requestIp(request.rawRequest) ?? null,
        userAgent: str(headers['user-agent']).slice(0, 300) || null,
      },
      quoteConsent: input.quoteConsent === true,
      createdAt: now,
      enrolledAt: box.order ? now : null,
      updatedAt: now,
    });
    tx.update(invite.ref, { status: box.order ? 'enrolled' : 'joined', householdId, joinedAt: now, ...(box.order ? { enrolledAt: now } : {}) });
    if (draftSnap.exists) {
      tx.update(box.draftRef, {
        lineItems: mergePilotLines(linesOf(draftSnap.data()?.lineItems), pilotLines).lines,
        updatedAt: now,
        lastChangeSource: 'pilot',
      });
    }
    if (orderSnap) {
      tx.update(orderSnap.ref, {
        lineItems: mergePilotLines(linesOf(orderSnap.data()?.lineItems), pilotLines).lines,
        updatedAt: now,
      });
    }
  });

  if (box.order && !playthrough) {
    try {
      await recomputeBoxAllocations(db);
    } catch (err) {
      logger.error('enrollPilot recomputeBoxAllocations failed', { householdId, err });
    }
  }
  logger.info('pilot enrolled', { householdId, status, deferredTotalCents });
  return { status, picks, totalCents: deferredTotalCents };
});

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** A draft save that dropped or edited pilot lines gets them back (skips empty and deleted drafts). */
export const healPilotDraftLines = onDocumentWritten(
  { document: `households/{householdId}/boxDrafts/${HOLIDAY_ID}`, memory: '256MiB' },
  withSentry(async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const lines = linesOf(after.data()?.lineItems);
    if (!lines.some((l) => !isPilotLine(l))) return;
    const db = getFirestore();
    const merged = await withPilotLines(db, event.params.householdId, lines);
    if (!merged.changed) return;
    await after.ref.update({ lineItems: merged.lines, lastChangeSource: 'pilot', updatedAt: new Date().toISOString() });
    logger.info('pilot lines restored on draft', { householdId: event.params.householdId });
  })
);

/** "You're in" email, once, when an enrollment reaches `enrolled`. */
export const sendPilotJoinedEmail = onDocumentWritten(
  { document: 'pilotEnrollments/{householdId}', memory: '512MiB' },
  withSentry(async (event) => {
    const after = event.data?.after;
    const e = after?.exists ? after.data() : undefined;
    if (!after || !e || str(e.status) !== 'enrolled' || e.confirmationEmail) return;
    const db = getFirestore();
    const { lockAt, arrivesBy } = await boxConfig(db);
    const picks = Array.isArray(e.picks) ? (e.picks as PilotPick[]) : [];
    const rows = await catalogRows(db, picks.map((p) => p.itemId));
    let result: 'sent' | 'skipped' | 'failed' = 'skipped';
    try {
      const items = await Promise.all(
        picks.map(async (p) => {
          const cat = (await db.doc(`catalog/${CATALOG_HOLIDAY}/items/${p.itemId}`).get()).data() ?? {};
          const image = await catalogEmailImage(p.itemId, cat, 'primary').catch(() => null);
          return {
            name: p.name,
            value: formatPilotDollars(p.deferredChargeCents),
            image_url: image ?? rows.get(p.itemId)?.imageUrl ?? null,
            caption: str(cat.category),
            url: `${appOrigin()}/product/${encodeURIComponent(p.itemId)}?utm_source=email&utm_medium=transactional&utm_campaign=pilot_joined`,
          };
        })
      );
      result = await sendEmail({
        to: str(e.email),
        template: 'pilot-joined',
        data: {
          first_name: firstNameOf(str(e.name)),
          items,
          total: formatPilotDollars(Number(e.deferredTotalCents) || 0),
          lock_date: lockAt,
          arrives_by: arrivesBy,
          lock_label: formatPilotDay(lockAt) || 'Nov 7',
          arrives_label: formatPilotDay(arrivesBy) || 'Nov 21',
          survey_date: 'December 13',
          survey_due: PILOT_SURVEY_DUE_LABEL,
          agreement_text: str(e.agreement?.text),
          pilot_url: str(e.inviteToken) ? pilotLink(str(e.inviteToken)) : appOrigin(),
        },
      });
    } catch (err) {
      result = 'failed';
      logger.error('pilot joined email failed', { householdId: event.params.householdId, err: String(err) });
    }
    await after.ref.update({ confirmationEmail: result, confirmationEmailAt: new Date().toISOString() });
  })
);
