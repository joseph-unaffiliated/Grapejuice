import type { Firestore } from 'firebase-admin/firestore';
import { emailHash } from '../guestSessions';
import { isTest } from '../testAccounts';
import {
  FACELIFT_CUTOFF,
  type DecideInput,
  type ProgramSend,
  type ProgramStage,
  type Track,
} from './decideNext';

const HOLIDAY = 'hanukkah-2026';
const LAUNCH = '2026-10-22T14:00:00.000Z';
const JOINED = new Set(['enrolled', 'awaiting_checkout']);
const COMMITTED = new Set(['committed', 'confirmed', 'shipped', 'delivered']);

export type ProgramPerson = DecideInput & {
  personKey: string;
  email: string;
  householdId: string | null;
  inviteToken: string | null;
  segment: 'pilot' | 's1' | 's6' | 's2' | 's3';
  /** Saved box lines (household draft or signed-out box), for email thumbnails. */
  boxLines: unknown[];
  /** inventorySwaps key: `hh_<householdId>` or `guest_<visitorId>`. */
  draftKey: string | null;
};

function iso(v: unknown): string | null {
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return v;
  if (v && typeof v === 'object' && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    const d = (v as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (v && typeof v === 'object' && typeof (v as { _seconds?: number })._seconds === 'number') {
    return new Date((v as { _seconds: number })._seconds * 1000).toISOString();
  }
  return null;
}

function itemCount(lineItems: unknown): number {
  if (!Array.isArray(lineItems)) return 0;
  return lineItems.reduce<number>((sum, line) => {
    const qty = line && typeof line === 'object' ? (line as { quantity?: unknown }).quantity : 0;
    return sum + (typeof qty === 'number' && qty > 0 ? qty : 0);
  }, 0);
}

function asSends(raw: unknown): ProgramSend[] {
  if (!Array.isArray(raw)) return [];
  const stages = new Set<ProgramStage>([
    'swap', 'lock_t7', 'lock_t3', 'lock_t1', 'abandoner', 'pilot_invite', 'pilot_d3', 'pilot_d7',
    'd1', 'd4', 'd8', 'wave2', 'low_stock', 'survey',
  ]);
  return raw.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const stage = (row as { stage?: unknown }).stage;
    const at = (row as { at?: unknown }).at;
    if (typeof stage !== 'string' || !stages.has(stage as ProgramStage) || typeof at !== 'string') return [];
    return [{
      stage: stage as ProgramStage,
      at,
      marketing: (row as { marketing?: unknown }).marketing === true,
      ...((row as { skipped?: unknown }).skipped === true ? { skipped: true } : {}),
    }];
  });
}

export async function loadProgramPeople(
  db: Firestore,
  now: Date,
  opts: { unsubscribed?: Set<string>; leadEmails?: Map<string, string> } = {}
): Promise<ProgramPerson[]> {
  const [users, households, drafts, invites, enrollments, orders, logs, overrides, funnels, guests] = await Promise.all([
    db.collection('users').select('email', 'householdId').get(),
    db.collection('households').select('ownerId', 'stripeCustomerId', 'cardOnFileAt', 'stripeDefaultPaymentMethodId').get(),
    db.collectionGroup('boxDrafts').select('lineItems', 'updatedAt', 'createdAt').get(),
    db.collection('pilotInvites').select('email', 'status', 'householdId', 'emailedAt', 'followUpAt', 'd7At').get(),
    db.collection('pilotEnrollments').select('status').get(),
    db.collectionGroup('orders').select('status', 'holidayId').get(),
    db.collection('messageLog').select('sends').get(),
    db.collection('programOverrides').select('trackOverride', 'stopped').get(),
    db.collection('checkoutFunnel').select('steps', 'uid', 'householdId').get(),
    db.collection('guestSessions').select('gateEmailHash', 'lastLeadEmailHash', 'lineItems', 'updatedAt', 'createdAt').get(),
  ]);

  const userById = new Map(users.docs.map((d) => [d.id, d.data()]));
  const emailByHousehold = new Map<string, string>();
  for (const h of households.docs) {
    const ownerId = h.data().ownerId;
    const email = typeof ownerId === 'string' ? userById.get(ownerId)?.email : null;
    if (typeof email === 'string' && email.includes('@')) emailByHousehold.set(h.id, email.trim().toLowerCase());
  }
  for (const u of users.docs) {
    const hid = u.data().householdId;
    const email = u.data().email;
    if (typeof hid === 'string' && typeof email === 'string' && email.includes('@') && !emailByHousehold.has(hid)) {
      emailByHousehold.set(hid, email.trim().toLowerCase());
    }
  }

  const committed = new Set<string>();
  for (const o of orders.docs) {
    const hh = o.ref.parent.parent;
    if (hh?.parent.id !== 'households') continue;
    const status = o.data().status;
    const holiday = o.data().holidayId;
    if (holiday === HOLIDAY && typeof status === 'string' && COMMITTED.has(status)) committed.add(hh.id);
  }

  const paymentHouseholds = new Set<string>();
  for (const h of households.docs) {
    const d = h.data();
    if (d.stripeCustomerId || d.cardOnFileAt || d.stripeDefaultPaymentMethodId) paymentHouseholds.add(h.id);
  }
  for (const f of funnels.docs) {
    const steps = f.data().steps;
    const reached = steps && typeof steps === 'object' && ('payment' in (steps as object) || 'card' in (steps as object));
    const bought = steps && typeof steps === 'object' && 'purchased' in (steps as object);
    if (!reached || bought) continue;
    const hid = f.data().householdId;
    if (typeof hid === 'string') paymentHouseholds.add(hid);
  }
  const recentAbandon = new Set<string>();
  const nowMs = now.getTime();
  for (const f of funnels.docs) {
    const steps = f.data().steps as Record<string, string> | undefined;
    const at = steps?.payment ?? steps?.card;
    const bought = Boolean(steps?.purchased);
    if (!at || bought) continue;
    const age = nowMs - Date.parse(at);
    if (age >= 2 * 60 * 60 * 1000 && age <= 24 * 60 * 60 * 1000) {
      const hid = f.data().householdId;
      if (typeof hid === 'string') recentAbandon.add(hid);
    }
  }

  const inviteByEmail = new Map<string, { token: string; status: string; emailedAt: string | null; followUpAt: string | null; d7At: string | null; householdId: string | null }>();
  for (const inv of invites.docs) {
    const email = typeof inv.data().email === 'string' ? inv.data().email.trim().toLowerCase() : '';
    if (!email.includes('@')) continue;
    inviteByEmail.set(email, {
      token: inv.id,
      status: typeof inv.data().status === 'string' ? inv.data().status : '',
      emailedAt: iso(inv.data().emailedAt),
      followUpAt: iso(inv.data().followUpAt),
      d7At: iso(inv.data().d7At),
      householdId: typeof inv.data().householdId === 'string' ? inv.data().householdId : null,
    });
  }

  const enrolledHouseholds = new Set<string>();
  for (const e of enrollments.docs) {
    const status = e.data().status;
    if (typeof status === 'string' && JOINED.has(status)) enrolledHouseholds.add(e.id);
  }

  const sendsByKey = new Map(logs.docs.map((d) => [d.id, asSends(d.data().sends)]));
  const overrideByKey = new Map(overrides.docs.map((d) => [d.id, d.data()]));

  const people = new Map<string, ProgramPerson>();
  const linesByHousehold = new Map<string, unknown[]>();
  for (const d of drafts.docs) {
    const hh = d.ref.parent.parent;
    if (d.id !== HOLIDAY || hh?.parent.id !== 'households') continue;
    const lines = d.data().lineItems;
    if (Array.isArray(lines)) linesByHousehold.set(hh.id, lines);
  }

  const consider = (
    email: string,
    householdId: string | null,
    draftUpdated: string | null,
    draftCreated: string | null,
    fromGuest: boolean,
    guest?: { visitorId: string; lines: unknown[] }
  ) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@') || isTest(normalized)) return;
    const personKey = emailHash(normalized);
    if (people.has(personKey)) return;
    const invite = inviteByEmail.get(normalized);
    const enrolled = Boolean(householdId && enrolledHouseholds.has(householdId));
    const override = overrideByKey.get(personKey);
    const stopped =
      Boolean(householdId && committed.has(householdId)) ||
      override?.stopped === true ||
      opts.unsubscribed?.has(personKey) === true ||
      invite?.status === 'cancelled';
    let track: Track = invite && invite.status !== 'cancelled' ? 'pilot' : 'coupon';
    if (override?.trackOverride === 'coupon') track = 'coupon';
    if (enrolled) track = 'pilot';
    const touched = draftUpdated;
    const created = draftCreated ?? touched;
    const preFacelift = Boolean(created && created < FACELIFT_CUTOFF && (!touched || touched < FACELIFT_CUTOFF));
    const reachedPayment = Boolean(householdId && paymentHouseholds.has(householdId));
    const anchorAt = touched && touched > LAUNCH ? touched : LAUNCH;
    const segment = track === 'pilot' ? 'pilot' : preFacelift ? 's6' : reachedPayment ? 's1' : fromGuest ? 's3' : 's2';
    const base: DecideInput = {
      now: now.toISOString(),
      lockAt: '2026-11-07T15:00:00.000Z',
      stopped,
      track,
      preFacelift,
      reachedPayment,
      anchorAt,
      draftTouchedAt: touched,
      enrolled,
      pilotEmailedAt: invite?.emailedAt ?? null,
      pilotFollowUpAt: invite?.followUpAt ?? null,
      pilotD7At: invite?.d7At ?? null,
      sends: sendsByKey.get(personKey) ?? [],
      swapDue: false,
      lowStockDue: false,
      liveAbandonerDue: Boolean(householdId && recentAbandon.has(householdId)),
      surveyDue: false,
    };
    people.set(personKey, {
      ...base,
      personKey,
      email: normalized,
      householdId,
      inviteToken: invite?.token ?? null,
      segment,
      boxLines: guest ? guest.lines : (householdId && linesByHousehold.get(householdId)) || [],
      draftKey: guest ? `guest_${guest.visitorId}` : householdId ? `hh_${householdId}` : null,
    });
  };

  for (const d of drafts.docs) {
    const hh = d.ref.parent.parent;
    if (d.id !== HOLIDAY || hh?.parent.id !== 'households') continue;
    if (itemCount(d.data().lineItems) === 0) continue;
    const email = emailByHousehold.get(hh.id);
    if (!email) continue;
    consider(email, hh.id, iso(d.data().updatedAt), iso(d.data().createdAt), false);
  }

  for (const g of guests.docs) {
    if (itemCount(g.data().lineItems) === 0) continue;
    const hash = g.data().gateEmailHash ?? g.data().lastLeadEmailHash;
    if (typeof hash !== 'string') continue;
    const email = opts.leadEmails?.get(hash);
    if (!email) continue;
    const lines = g.data().lineItems;
    consider(email, null, iso(g.data().updatedAt), iso(g.data().createdAt), true, {
      visitorId: g.id,
      lines: Array.isArray(lines) ? lines : [],
    });
  }

  for (const [email, invite] of inviteByEmail) {
    if (invite.status === 'cancelled') continue;
    consider(email, invite.householdId, invite.emailedAt, null, false);
  }

  return [...people.values()];
}
