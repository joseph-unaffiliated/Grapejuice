/**
 * Dated notes around the lock. Nothing customer-facing goes out until the matching
 * piece is approved AND its Customer.io template id is set. Template id 0 skips the send
 * and leaves the person eligible for the next run.
 *
 * Audience for the sorry note and the Nov 9 notes: Grapejuice only
 * (an account, a guest draft, a pilot invite, or a checkout we can tie to one of those),
 * not unsubscribed, and not a household that already locked a Hanukkah box.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import * as logger from '../logger';
import { sendEmail, getCustomerioAppApiKey } from '../email';
import { leadEmailsByHash, unsubscribedHashes } from '../cioPeople';
import { emailHash, appOrigin } from '../guestSessions';
import { isTest } from '../testAccounts';
import { enabledStageSet } from './config';
import { etDate, etHour } from './time';
import { recomputeBoxAllocations } from '../catalogInventory';
import { CARD_FIX_DEADLINE, EXTENSION_END, EXTENSION_START } from './lockWindow';
import { boxThumbFields, lineItemsEmailItems, pickEmailItems, suggestEmailItems } from '../emailItems';
import { loadCatalogRows, toBoxRulesRows } from '../rav/context';
import { isSoldOutForBoxes } from '../rav/boxRules';

const HOLIDAY = 'hanukkah-2026';
const COMMITTED = new Set(['committed', 'confirmed', 'shipped', 'delivered']);

type Recipient = {
  email: string;
  personKey: string;
  hasDraft: boolean;
  committed: boolean;
  /** Saved box lines, or the committed order's lines once committed. */
  lines: unknown[];
};

function itemCount(lineItems: unknown): number {
  if (!Array.isArray(lineItems)) return 0;
  return lineItems.reduce<number>((sum, line) => {
    const qty = line && typeof line === 'object' ? (line as { quantity?: unknown }).quantity : 0;
    return sum + (typeof qty === 'number' && qty > 0 ? qty : 0);
  }, 0);
}

async function suppression(db: Firestore): Promise<{ unsubscribed: Set<string>; leads: Map<string, string>; ok: boolean }> {
  const apiKey = getCustomerioAppApiKey();
  if (!apiKey) return { unsubscribed: new Set(), leads: new Map(), ok: false };
  try {
    const [leads, unsubscribed] = await Promise.all([leadEmailsByHash(apiKey), unsubscribedHashes([apiKey])]);
    return { unsubscribed, leads, ok: true };
  } catch (err) {
    logger.warn('lockNotes: customer.io lookup failed', { err: String(err).slice(0, 200) });
    return { unsubscribed: new Set(), leads: new Map(), ok: false };
  }
}

async function recipients(db: Firestore, unsubscribed: Set<string>, leads: Map<string, string>): Promise<Recipient[]> {
  const [users, drafts, orders, guests, invites] = await Promise.all([
    db.collection('users').select('email', 'householdId').get(),
    db.collectionGroup('boxDrafts').select('lineItems').get(),
    db.collectionGroup('orders').select('status', 'holidayId', 'lineItems', 'orderType').get(),
    db.collection('guestSessions').select('gateEmailHash', 'lastLeadEmailHash', 'lineItems').get(),
    db.collection('pilotInvites').select('email', 'householdId').get(),
  ]);

  const committedLines = new Map<string, unknown[]>();
  for (const o of orders.docs) {
    const hh = o.ref.parent.parent;
    if (hh?.parent.id !== 'households') continue;
    const status = o.data().status;
    if (o.data().orderType === 'marketplace') continue;
    if (o.data().holidayId === HOLIDAY && typeof status === 'string' && COMMITTED.has(status)) {
      const lines = o.data().lineItems;
      committedLines.set(hh.id, Array.isArray(lines) ? lines : []);
    }
  }

  const draftLines = new Map<string, unknown[]>();
  for (const d of drafts.docs) {
    const hh = d.ref.parent.parent;
    if (d.id !== HOLIDAY || hh?.parent.id !== 'households') continue;
    if (itemCount(d.data().lineItems) > 0) draftLines.set(hh.id, d.data().lineItems);
  }

  const byEmail = new Map<string, Recipient>();
  const add = (email: string, householdId: string | null, guestLines: unknown[] | null) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@') || isTest(normalized)) return;
    const personKey = emailHash(normalized);
    if (unsubscribed.has(personKey)) return;
    const orderLines = householdId ? committedLines.get(householdId) : undefined;
    const boxLines = guestLines ?? (householdId ? draftLines.get(householdId) : undefined);
    const prev = byEmail.get(normalized);
    if (prev) {
      if (orderLines) {
        prev.committed = true;
        prev.lines = orderLines;
      } else if (!prev.committed && !prev.hasDraft && boxLines) {
        prev.lines = boxLines;
      }
      prev.hasDraft = prev.hasDraft || Boolean(boxLines);
      return;
    }
    byEmail.set(normalized, {
      email: normalized,
      personKey,
      hasDraft: Boolean(boxLines),
      committed: Boolean(orderLines),
      lines: orderLines ?? boxLines ?? [],
    });
  };

  for (const u of users.docs) {
    const email = u.data().email;
    const hid = u.data().householdId;
    if (typeof email !== 'string') continue;
    add(email, typeof hid === 'string' ? hid : null, null);
  }
  for (const inv of invites.docs) {
    const email = inv.data().email;
    const hid = inv.data().householdId;
    if (typeof email !== 'string') continue;
    add(email, typeof hid === 'string' ? hid : null, null);
  }
  for (const g of guests.docs) {
    const hash = g.data().gateEmailHash ?? g.data().lastLeadEmailHash;
    if (typeof hash !== 'string') continue;
    const email = leads.get(hash);
    if (!email) continue;
    add(email, null, itemCount(g.data().lineItems) > 0 ? g.data().lineItems : null);
  }
  return [...byEmail.values()];
}

async function sendOnce(
  db: Firestore,
  person: Recipient,
  stage: string,
  template: string,
  data: Record<string, unknown>
): Promise<'sent' | 'skipped' | 'already'> {
  const ref = db.doc(`messageLog/${person.personKey}`);
  const snap = await ref.get();
  const sends = snap.data()?.sends;
  if (Array.isArray(sends) && sends.some((s) => s && typeof s === 'object' && (s as { stage?: string }).stage === stage && (s as { skipped?: boolean }).skipped !== true)) {
    return 'already';
  }
  const status = await sendEmail({ to: person.email, template, data });
  if (status !== 'sent') return 'skipped';
  await ref.set(
    { sends: FieldValue.arrayUnion({ stage, at: new Date().toISOString(), marketing: true, skipped: false }) },
    { merge: true }
  );
  return 'sent';
}

function link(stage: string): string {
  return `${appOrigin()}/box?utm_source=lifecycle&utm_medium=email&utm_campaign=${stage}`;
}

async function emailForHousehold(db: Firestore, householdId: string, userId: unknown): Promise<string | null> {
  if (typeof userId === 'string' && userId) {
    const user = await db.doc(`users/${userId}`).get();
    const email = user.data()?.email;
    if (typeof email === 'string' && email.includes('@')) return email.trim().toLowerCase();
  }
  const hh = await db.doc(`households/${householdId}`).get();
  const ownerId = hh.data()?.ownerId;
  if (typeof ownerId !== 'string') return null;
  const owner = await db.doc(`users/${ownerId}`).get();
  const email = owner.data()?.email;
  return typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null;
}

/** Receipt after a successful charge. Quiet hours hold it for the 9am pass. */
export async function notifyBoxChargedIfAwake(db: Firestore, householdId: string, orderId: string, now = new Date()): Promise<void> {
  const hour = etHour(now.toISOString());
  if (hour < 9 || hour >= 20) return;
  await sendChargeReceipt(db, householdId, orderId);
}

async function sendChargeReceipt(db: Firestore, householdId: string, orderId: string): Promise<void> {
  const enabled = await enabledStageSet(db);
  if (!enabled.has('lock_charged')) return;
  const ref = db.doc(`households/${householdId}/orders/${orderId}`);
  const snap = await ref.get();
  const order = snap.data() ?? {};
  if (order.lockChargedNotifiedAt) return;
  if (order.holidayId !== HOLIDAY) return;
  if (order.status !== 'confirmed' && order.status !== 'shipped' && order.status !== 'delivered') return;
  const email = await emailForHousehold(db, householdId, order.userId);
  if (!email || isTest(email)) return;
  const status = await sendEmail({
    to: email,
    template: 'program-lock-charged',
    data: {
      cta_url: `${appOrigin()}/orders?utm_source=lifecycle&utm_medium=email&utm_campaign=lock_charged`,
      total_cents: typeof order.totalCents === 'number' ? order.totalCents : 0,
      ...boxThumbFields(await lineItemsEmailItems(db, Array.isArray(order.lineItems) ? order.lineItems : [], `${appOrigin()}/orders`)),
    },
  });
  if (status !== 'sent') return;
  await ref.set({ lockChargedNotifiedAt: new Date().toISOString() }, { merge: true });
}

async function sendUnnotifiedReceipts(db: Firestore, now: Date): Promise<number> {
  const day = etDate(now.toISOString());
  const hour = etHour(now.toISOString());
  if (day < '2026-11-08' || day > '2026-11-30' || hour < 9 || hour >= 20) return 0;
  const enabled = await enabledStageSet(db);
  if (!enabled.has('lock_charged')) return 0;
  const snap = await db.collectionGroup('orders').where('status', '==', 'confirmed').where('holidayId', '==', HOLIDAY).get();
  let sent = 0;
  for (const doc of snap.docs) {
    if (doc.data().lockChargedNotifiedAt) continue;
    const householdId = doc.ref.parent.parent?.id;
    if (!householdId || doc.ref.parent.parent?.parent.id !== 'households') continue;
    const before = doc.data().lockChargedNotifiedAt;
    await sendChargeReceipt(db, householdId, doc.id);
    const after = (await doc.ref.get()).data()?.lockChargedNotifiedAt;
    if (!before && after) sent += 1;
  }
  return sent;
}

/** Noon ET Nov 9 through noon ET Nov 10 the public lock is the end of the extra day. */
export async function maybeOpenExtension(db: Firestore, now = new Date()): Promise<boolean> {
  const t = now.getTime();
  if (t < Date.parse(EXTENSION_START) || t >= Date.parse(EXTENSION_END)) return false;
  const ref = db.doc('config/hanukkah-2026');
  const snap = await ref.get();
  const lockAt = snap.data()?.lockAt;
  if (typeof lockAt === 'string' && Date.parse(lockAt) >= Date.parse(EXTENSION_END)) return false;
  await ref.set({ lockAt: EXTENSION_END, extensionOpenedAt: now.toISOString() }, { merge: true });
  logger.info('extension window opened', { lockAt: EXTENSION_END });
  return true;
}

/** Still-unpaid committed boxes are cancelled at noon ET Nov 12. The note waits on approval. */
export async function cancelUnpaidAfterDeadline(db: Firestore, now = new Date()): Promise<number> {
  if (now.getTime() < Date.parse(CARD_FIX_DEADLINE)) return 0;
  const snap = await db.collectionGroup('orders').where('status', '==', 'committed').where('holidayId', '==', HOLIDAY).get();
  const enabled = await enabledStageSet(db);
  const tell = enabled.has('order_cancelled');
  let cancelled = 0;
  for (const doc of snap.docs) {
    const order = doc.data();
    if (order.playthrough === true) continue;
    const message = typeof order.chargeFailureMessage === 'string' ? order.chargeFailureMessage : '';
    if (!message || message === 'Stripe is not configured') continue;
    const householdId = doc.ref.parent.parent?.id;
    if (!householdId || doc.ref.parent.parent?.parent.id !== 'households') continue;
    const giftRestore = typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
    const platformRestore = typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
    const fresh = await db.runTransaction(async (tx) => {
      const current = await tx.get(doc.ref);
      if (current.data()?.status !== 'committed') return false;
      tx.update(doc.ref, {
        status: 'cancelled',
        cancelledAt: FieldValue.serverTimestamp(),
        cancelReason: 'unpaid_after_nov_12',
      });
      if (giftRestore > 0 || platformRestore > 0) {
        tx.update(db.doc(`households/${householdId}`), {
          ...(giftRestore > 0 ? { giftCreditCents: FieldValue.increment(giftRestore) } : {}),
          ...(platformRestore > 0 ? { platformCreditCents: FieldValue.increment(platformRestore) } : {}),
          updatedAt: new Date().toISOString(),
        });
      }
      return true;
    });
    if (!fresh) continue;
    cancelled += 1;
    if (!tell) continue;
    const email = await emailForHousehold(db, householdId, order.userId);
    if (!email || isTest(email)) continue;
    const status = await sendEmail({
      to: email,
      template: 'program-order-cancelled',
      data: { cta_url: link('order_cancelled') },
    });
    if (status === 'sent') {
      await doc.ref.set({ cancelNotifiedAt: new Date().toISOString() }, { merge: true });
    }
  }
  if (cancelled > 0) {
    try {
      await recomputeBoxAllocations(db);
    } catch (err) {
      logger.error('cancelUnpaidAfterDeadline allocations', err instanceof Error ? err : new Error(String(err)));
    }
    await db.doc('programJobs/cancelUnpaid').set({ at: now.toISOString(), ok: true, cancelled });
  }
  return cancelled;
}

async function sendTo(
  db: Firestore,
  people: Recipient[],
  stage: string,
  template: string,
  pick: (person: Recipient) => boolean,
  extra: (person: Recipient) => Promise<Record<string, unknown>> = async () => ({})
): Promise<number> {
  let sent = 0;
  for (const person of people) {
    if (!pick(person)) continue;
    const data = { cta_url: link(stage), ...(await extra(person)) };
    const result = await sendOnce(db, person, stage, template, data);
    if (result === 'sent') sent += 1;
  }
  return sent;
}

async function soldOutIds(db: Firestore): Promise<Set<string>> {
  const rows = toBoxRulesRows(await loadCatalogRows(db));
  return new Set(rows.filter(isSoldOutForBoxes).map((r) => r.id));
}

function lineItemIds(lines: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    const id = line && typeof line === 'object' ? (line as { itemId?: unknown }).itemId : null;
    if (typeof id === 'string') ids.add(id);
  }
  return ids;
}

/** Hourly from the charge job. Each note fires on its day, after its hour, and only once per person. */
export async function runLockNotes(db: Firestore, now = new Date()): Promise<void> {
  const day = etDate(now.toISOString());
  const hour = etHour(now.toISOString());
  if (day >= '2026-11-08') {
    await sendUnnotifiedReceipts(db, now);
  }
  const marketing =
    (day === '2026-11-06' && hour >= 9) ||
    (day === '2026-11-08' && hour >= 9) ||
    (day === '2026-11-09' && hour >= 12);
  if (!marketing) return;

  const enabled = await enabledStageSet(db);
  const wantCommitted = day === '2026-11-06' && enabled.has('lock_t1_committed');
  const wantSorry = day === '2026-11-08' && enabled.has('lock_sorry');
  const wantExtend = day === '2026-11-09' && (enabled.has('extend_draft') || enabled.has('extend_new'));
  if (!wantCommitted && !wantSorry && !wantExtend) {
    await db.doc('programJobs/lockNotes').set({ at: now.toISOString(), ok: true, skipped: 'not_approved', day });
    return;
  }
  const lists = await suppression(db);
  if (!lists.ok) {
    await db.doc('programJobs/lockNotes').set({ at: now.toISOString(), ok: true, skipped: 'unsubscribe_list_unavailable', day });
    return;
  }
  const people = await recipients(db, lists.unsubscribed, lists.leads);
  const counts: Record<string, number> = {};
  if (wantCommitted) {
    const soldOut = await soldOutIds(db);
    counts.lock_t1_committed = await sendTo(db, people, 'lock_t1_committed', 'program-lock-t1-committed', (p) => p.committed, async (p) => ({
      suggestions: await suggestEmailItems(db, lineItemIds(p.lines), soldOut, 'utm_source=lifecycle&utm_medium=email&utm_campaign=lock_t1_committed'),
    }));
  }
  if (wantSorry) {
    counts.lock_sorry = await sendTo(db, people, 'lock_sorry', 'program-lock-sorry', (p) => !p.committed);
  }
  if (wantExtend && enabled.has('extend_draft')) {
    counts.extend_draft = await sendTo(db, people, 'extend_draft', 'program-extend-draft', (p) => !p.committed && p.hasDraft, async (p) => ({
      ...boxThumbFields(await lineItemsEmailItems(db, p.lines, link('extend_draft'))),
    }));
  }
  if (wantExtend && enabled.has('extend_new')) {
    const popular = await pickEmailItems(db, 'utm_source=lifecycle&utm_medium=email&utm_campaign=extend_new');
    counts.extend_new = await sendTo(db, people, 'extend_new', 'program-extend-new', (p) => !p.committed && !p.hasDraft, async () => ({
      popular,
    }));
  }
  await db.doc('programJobs/lockNotes').set({ at: now.toISOString(), ok: true, day, ...counts });
}
