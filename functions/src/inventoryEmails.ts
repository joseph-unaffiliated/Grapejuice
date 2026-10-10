import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';
import { getCustomerioAppApiKey, sendEmail } from './email';
import { catalogEmailImage } from './emailItems';
import { emailHash, mintResumeToken } from './guestSessions';
import { mintInventoryAlertUrl } from './loginLinks';
import { leadEmailsByHash, unsubscribedHashes } from './cioPeople';
import { CATALOG_HOLIDAY } from './catalogInventory';
import { loadCatalogRows, toBoxRulesRows } from './rav/context';
import {
  INVENTORY_SWAPS,
  countDraftHolds,
  loadUnsecuredDrafts,
  lockPassed,
  lowItemsReport,
  type UnsecuredDraft,
} from './inventoryWatch';

/**
 * Daily 10am ET inventory emails to people whose unsecured draft box is affected:
 *   inventory-swapped  a sold-out item was swapped out (once per swap, inventorySwaps/{id}.emailed)
 *   inventory-low      an item in their box is almost sold out (once per person per item,
 *                      inventoryLowSent/{emailHash}_{itemId})
 * At most one email per person per ET day (inventoryEmailLog/{emailHash}_{yyyy-mm-dd}, claimed in a
 * transaction). Swapped emails go first, then low-stock; the Lego Menorah leads each group.
 * Accounts get a signed checkout link; signed-out visitors (matched through their Retention lead in
 * Customer.io) get a resume link. Unsubscribed people and secured boxes are skipped.
 * Off unless GJ_INVENTORY_EMAILS_ENABLED=true; GJ_INVENTORY_EMAILS_START (yyyy-mm-dd, ET) holds the
 * first send. scripts/inventory-alerts-preview.mjs runs it dry.
 */

export const INVENTORY_EMAIL_LOG = 'inventoryEmailLog';
export const INVENTORY_LOW_SENT = 'inventoryLowSent';
export const INVENTORY_ALERT_CONTACTS = 'inventoryAlertContacts';
/** Matches the guest session lifetime. */
const CONTACT_TTL_MS = 60 * 24 * 60 * 60 * 1000;
/** Sent first within each group. */
export const PRIORITY_ITEM_IDS = ['lego-menorah'];
/** Swaps older than this without a reachable recipient stop being considered. */
const SWAP_EMAIL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type Recipient = {
  hash: string;
  email: string;
  kind: 'household' | 'guest';
  uid?: string;
  visitorId?: string;
  itemIds: Set<string>;
  draftKeys: Set<string>;
};

export type PendingSwap = { id: string; draftKey: string; fromItemId: string; toItemId: string | null };

export type EmailPick =
  | { kind: 'swapped'; hash: string; swap: PendingSwap }
  | { kind: 'low'; hash: string; itemId: string };

export type PlanInput = {
  recipients: Recipient[];
  /** Low items, most urgent first. */
  lowItemIds: string[];
  swaps: PendingSwap[];
  /** `${hash}_${itemId}` already sent a low-stock email. */
  lowAlreadySent: Set<string>;
  /** Hashes that already got an inventory email today. */
  sentToday: Set<string>;
  unsubscribed: Set<string>;
};

export type PlanResult = {
  picks: EmailPick[];
  skipped: { unsubscribed: number; alreadyToday: number; nothingNew: number };
  /** Swaps whose draft no longer belongs to anyone we can email (secured, converted, no lead). */
  unreachableSwapIds: string[];
};

function itemRank(itemId: string, order: string[]): number {
  const p = PRIORITY_ITEM_IDS.indexOf(itemId);
  if (p >= 0) return p;
  const o = order.indexOf(itemId);
  return PRIORITY_ITEM_IDS.length + (o >= 0 ? o : order.length);
}

/** One pick per person: their highest-priority unsent email. Pure. */
export function planInventoryEmails(input: PlanInput): PlanResult {
  const byDraft = new Map<string, Recipient>();
  for (const r of input.recipients) for (const key of r.draftKeys) byDraft.set(key, r);

  const candidates = new Map<string, EmailPick[]>();
  const add = (pick: EmailPick) => candidates.set(pick.hash, [...(candidates.get(pick.hash) ?? []), pick]);
  const unreachableSwapIds: string[] = [];
  for (const swap of input.swaps) {
    const r = byDraft.get(swap.draftKey);
    if (!r) unreachableSwapIds.push(swap.id);
    else add({ kind: 'swapped', hash: r.hash, swap });
  }
  const swappedFor = new Set(input.swaps.map((s) => `${byDraft.get(s.draftKey)?.hash}_${s.fromItemId}`));
  for (const r of input.recipients) {
    for (const itemId of input.lowItemIds) {
      if (!r.itemIds.has(itemId)) continue;
      const key = `${r.hash}_${itemId}`;
      if (input.lowAlreadySent.has(key) || swappedFor.has(key)) continue;
      add({ kind: 'low', hash: r.hash, itemId });
    }
  }

  const order = input.lowItemIds;
  const rank = (p: EmailPick) =>
    (p.kind === 'swapped' ? 0 : 1000) + itemRank(p.kind === 'swapped' ? p.swap.fromItemId : p.itemId, order);
  const skipped = { unsubscribed: 0, alreadyToday: 0, nothingNew: 0 };
  const picks: EmailPick[] = [];
  const seen = new Set<string>();
  for (const r of input.recipients) {
    if (seen.has(r.hash)) continue;
    seen.add(r.hash);
    const mine = candidates.get(r.hash) ?? [];
    if (!mine.length) {
      skipped.nothingNew += 1;
      continue;
    }
    if (input.unsubscribed.has(r.hash)) {
      skipped.unsubscribed += 1;
      continue;
    }
    if (input.sentToday.has(r.hash)) {
      skipped.alreadyToday += 1;
      continue;
    }
    picks.push([...mine].sort((a, b) => rank(a) - rank(b))[0]);
  }
  picks.sort((a, b) => rank(a) - rank(b));
  return { picks, skipped, unreachableSwapIds };
}

/** Accounts win over signed-out sessions for the same address (signed link beats resume link). */
export function buildRecipients(drafts: UnsecuredDraft[], leadEmails: Map<string, string>): Recipient[] {
  const byHash = new Map<string, Recipient>();
  const ordered = [...drafts.filter((d) => d.kind === 'household'), ...drafts.filter((d) => d.kind === 'guest')];
  for (const d of ordered) {
    if (d.test) continue;
    const email =
      d.kind === 'household' ? d.ownerEmail?.trim().toLowerCase() : d.leadEmailHash ? leadEmails.get(d.leadEmailHash) : undefined;
    if (!email || !email.includes('@')) continue;
    if (d.kind === 'household' && !d.ownerId) continue;
    const hash = emailHash(email);
    const existing = byHash.get(hash);
    const r =
      existing ??
      ({
        hash,
        email,
        kind: d.kind,
        uid: d.kind === 'household' ? d.ownerId : undefined,
        visitorId: d.kind === 'guest' ? d.ref.id : undefined,
        itemIds: new Set<string>(),
        draftKeys: new Set<string>(),
      } satisfies Recipient);
    r.draftKeys.add(d.key);
    for (const line of [...d.lines, ...d.giftLines]) r.itemIds.add(line.itemId);
    byHash.set(hash, r);
  }
  return [...byHash.values()];
}

/** A secured box counts toward an email when it was secured within this long after the send. */
export const CONVERSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type SentInventoryEmail = {
  emailHash: string;
  kind: EmailPick['kind'];
  sentMs: number;
  clicked: boolean;
  uid: string | null;
  visitorId: string | null;
  draftKeys: string[];
};

type KindStats = { sends: number; clicked: number; secured: number; securedAfterClick: number };

export type InventoryEmailStats = {
  sends: number;
  people: number;
  clickedPeople: number;
  /** People whose box was secured within CONVERSION_WINDOW_MS of an inventory email. */
  securedPeople: number;
  /** ...of a send whose link they opened. */
  securedAfterClickPeople: number;
  /** Each secured person is credited to the latest send before it (last touch). */
  byKind: Record<EmailPick['kind'], KindStats>;
  windowDays: number;
};

/**
 * Draft → secured conversions after inventory emails. A person's households: draft keys
 * (`hh_<id>`), their account, and the account their signed-out session later became. Pure.
 */
export function inventoryEmailStats(input: {
  sends: SentInventoryEmail[];
  /** Committed (non-pending, non-test) Hanukkah box orders. */
  securedBoxes: Array<{ householdId: string; securedMs: number }>;
  householdsByOwner: Map<string, string[]>;
  convertedUidByVisitor: Map<string, string>;
}): InventoryEmailStats {
  const emptyKind = (): KindStats => ({ sends: 0, clicked: 0, secured: 0, securedAfterClick: 0 });
  const stats: InventoryEmailStats = {
    sends: input.sends.length,
    people: 0,
    clickedPeople: 0,
    securedPeople: 0,
    securedAfterClickPeople: 0,
    byKind: { low: emptyKind(), swapped: emptyKind() },
    windowDays: CONVERSION_WINDOW_MS / (24 * 60 * 60 * 1000),
  };
  const securedByHousehold = new Map<string, number[]>();
  for (const b of input.securedBoxes) {
    securedByHousehold.set(b.householdId, [...(securedByHousehold.get(b.householdId) ?? []), b.securedMs]);
  }
  const byPerson = new Map<string, SentInventoryEmail[]>();
  for (const s of input.sends) {
    byPerson.set(s.emailHash, [...(byPerson.get(s.emailHash) ?? []), s]);
    stats.byKind[s.kind].sends += 1;
    if (s.clicked) stats.byKind[s.kind].clicked += 1;
  }
  stats.people = byPerson.size;

  for (const sends of byPerson.values()) {
    sends.sort((a, b) => a.sentMs - b.sentMs);
    if (sends.some((s) => s.clicked)) stats.clickedPeople += 1;
    const households = new Set<string>();
    const uids = new Set<string>();
    for (const s of sends) {
      for (const key of s.draftKeys) if (key.startsWith('hh_')) households.add(key.slice(3));
      if (s.uid) uids.add(s.uid);
      const converted = s.visitorId ? input.convertedUidByVisitor.get(s.visitorId) : undefined;
      if (converted) uids.add(converted);
    }
    for (const uid of uids) for (const hid of input.householdsByOwner.get(uid) ?? []) households.add(hid);
    const firstSent = sends[0].sentMs;
    const securedMs = [...households]
      .flatMap((hid) => securedByHousehold.get(hid) ?? [])
      .filter((t) => t >= firstSent)
      .sort((a, b) => a - b)[0];
    if (securedMs == null) continue;
    const credited = [...sends].reverse().find((s) => s.sentMs <= securedMs && securedMs - s.sentMs <= CONVERSION_WINDOW_MS);
    if (!credited) continue;
    stats.securedPeople += 1;
    stats.byKind[credited.kind].secured += 1;
    const clickedSend = sends.some((s) => s.clicked && s.sentMs <= securedMs && securedMs - s.sentMs <= CONVERSION_WINDOW_MS);
    if (clickedSend) {
      stats.securedAfterClickPeople += 1;
      stats.byKind[credited.kind].securedAfterClick += 1;
    }
  }
  return stats;
}

/**
 * Retention lead email per signed-out visitor, keyed by email hash. Matches are cached in
 * inventoryAlertContacts/{visitorId} (functions only) and used when Customer.io can't be reached.
 */
async function guestLeadEmails(
  db: Firestore,
  apiKey: string,
  guests: UnsecuredDraft[],
  writeCache: boolean
): Promise<Map<string, string>> {
  try {
    const leads = await leadEmailsByHash(apiKey);
    if (writeCache) {
      const now = Date.now();
      const matched = guests.filter((d) => d.leadEmailHash && leads.has(d.leadEmailHash));
      for (let i = 0; i < matched.length; i += 400) {
        const batch = db.batch();
        for (const d of matched.slice(i, i + 400)) {
          batch.set(db.doc(`${INVENTORY_ALERT_CONTACTS}/${d.ref.id}`), {
            emailHash: d.leadEmailHash,
            email: leads.get(d.leadEmailHash!),
            matchedAt: Timestamp.fromMillis(now),
            expireAt: Timestamp.fromMillis(now + CONTACT_TTL_MS),
          });
        }
        await batch.commit();
      }
    }
    return leads;
  } catch (err) {
    logger.warn('inventoryEmails: lead lookup failed, using cached contacts', { err: String(err).slice(0, 200) });
    const snaps = await db.getAll(...guests.map((d) => db.doc(`${INVENTORY_ALERT_CONTACTS}/${d.ref.id}`)));
    return new Map(
      snaps.flatMap((s) => {
        const c = s.data();
        return typeof c?.emailHash === 'string' && typeof c.email === 'string' ? [[c.emailHash, c.email] as [string, string]] : [];
      })
    );
  }
}

export function etDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

/** Catalog names carry quotes for brand words ("Lego" Menorah); emails drop them. */
export function displayName(name: string): string {
  return name.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
}

/** "The Lego Menorah is" / "The Roll Your Own Beeswax Candles are". */
export function subjectWords(name: string): { item_title: string; is_are: string; it_they: string; it_them: string } {
  const clean = displayName(name);
  const plural = /s$/i.test(clean) && !/ss$/i.test(clean);
  return {
    item_title: `The ${clean}`,
    is_are: plural ? 'are' : 'is',
    it_they: plural ? 'they' : 'it',
    it_them: plural ? 'them' : 'it',
  };
}

type CatalogDocs = Map<string, FirebaseFirestore.DocumentData>;

async function loadCatalogDocs(db: Firestore, ids: string[]): Promise<CatalogDocs> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const snaps = await db.getAll(...unique.map((id) => db.doc(`catalog/${CATALOG_HOLIDAY}/items/${id}`)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));
}

export type EmailData = Record<string, unknown>;
export type CtaLinks = { secure: string; customize?: string };

/** Trigger data for one pick (see docs/customerio-inventory-*.html). */
export async function emailDataFor(
  pick: EmailPick,
  catalog: CatalogDocs,
  links: CtaLinks,
  imageFor: (id: string, prefer: 'primary' | 'secondary') => Promise<string | null>
): Promise<{ template: 'inventory-low' | 'inventory-swapped'; data: EmailData }> {
  const name = (id: string) => String(catalog.get(id)?.name ?? id);
  if (pick.kind === 'low') {
    return {
      template: 'inventory-low',
      data: {
        ...subjectWords(name(pick.itemId)),
        item_id: pick.itemId,
        item_name: displayName(name(pick.itemId)),
        image_url: (await imageFor(pick.itemId, 'secondary')) ?? '',
        cta_url: links.secure,
      },
    };
  }
  const { fromItemId, toItemId } = pick.swap;
  return {
    template: 'inventory-swapped',
    data: {
      ...subjectWords(name(fromItemId)),
      item_id: fromItemId,
      item_name: displayName(name(fromItemId)),
      image_url: (await imageFor(fromItemId, 'primary')) ?? '',
      has_replacement: !!toItemId,
      replacement_id: toItemId ?? '',
      replacement_name: toItemId ? displayName(name(toItemId)) : '',
      replacement_image_url: toItemId ? (await imageFor(toItemId, 'primary')) ?? '' : '',
      cta_url: links.secure,
      customize_url: links.customize ?? '',
    },
  };
}

/** UTMs on every link so the order's client attribution (lastTouch) names the email. */
export function inventoryUtm(kind: EmailPick['kind'], button: 'secure' | 'customize'): Record<string, string> {
  return {
    utm_source: 'grapejuice',
    utm_medium: 'email',
    utm_campaign: kind === 'low' ? 'inventory_low' : 'inventory_swapped',
    utm_content: button,
  };
}

/**
 * "Secure my box" opens checkout; "Customize my box" (swapped email only) opens My Box. Each link's
 * token carries the log id so a click is recorded on that send (recordInventoryEmailClick).
 */
async function ctaLinksFor(
  db: Firestore,
  r: Recipient,
  kind: EmailPick['kind'],
  emailLogId: string
): Promise<CtaLinks> {
  const withCustomize = kind === 'swapped';
  if (r.kind === 'household' && r.uid) {
    const account = { uid: r.uid, email: r.email, emailLogId };
    return {
      secure: await mintInventoryAlertUrl(db, { ...account, next: '/checkout', query: inventoryUtm(kind, 'secure') }),
      customize: withCustomize
        ? await mintInventoryAlertUrl(db, { ...account, next: '/box', query: inventoryUtm(kind, 'customize') })
        : undefined,
    };
  }
  if (r.visitorId) {
    const { url } = await mintResumeToken(db, r.visitorId, r.email, new Date(), emailLogId);
    const withUtm = (button: 'secure' | 'customize') => `${url}&${new URLSearchParams(inventoryUtm(kind, button))}`;
    return {
      secure: `${withUtm('secure')}&next=checkout`,
      customize: withCustomize ? withUtm('customize') : undefined,
    };
  }
  throw new Error('recipient has no account or visitor id');
}

/** Claim today's slot for this person; false when someone (or an earlier run) already did. */
async function claimDailySlot(db: Firestore, r: Recipient, date: string, pick: EmailPick): Promise<boolean> {
  const ref = db.doc(`${INVENTORY_EMAIL_LOG}/${r.hash}_${date}`);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.set(ref, {
      emailHash: r.hash,
      date,
      kind: pick.kind,
      itemId: pick.kind === 'low' ? pick.itemId : pick.swap.fromItemId,
      // Who got it, so dashboard conversion stats can find the box they later secured.
      uid: r.uid ?? null,
      visitorId: r.visitorId ?? null,
      draftKeys: [...r.draftKeys],
      clicks: 0,
      status: 'sending',
      createdAt: Timestamp.now(),
    });
    return true;
  });
}

export type InventoryEmailsResult = {
  locked: boolean;
  recipients: { household: number; guest: number };
  guestsWithoutLead: number;
  lowItems: Array<{ id: string; remaining: number | null }>;
  pendingSwaps: number;
  /** Swapped boxes since secured or converted; marked done without an email. */
  swapsNoLongerDraft: number;
  picks: Record<string, number>;
  skipped: PlanResult['skipped'];
  sent: number;
  failed: number;
};

function pickKey(p: EmailPick): string {
  return p.kind === 'low' ? `low:${p.itemId}` : `swapped:${p.swap.fromItemId}->${p.swap.toItemId ?? 'removed'}`;
}

export async function runInventoryEmails(
  db: Firestore,
  options: { dryRun?: boolean; now?: Date; extraUnsubKeys?: string[] } = {}
): Promise<InventoryEmailsResult> {
  const now = options.now ?? new Date();
  const result: InventoryEmailsResult = {
    locked: await lockPassed(db),
    recipients: { household: 0, guest: 0 },
    guestsWithoutLead: 0,
    lowItems: [],
    pendingSwaps: 0,
    swapsNoLongerDraft: 0,
    picks: {},
    skipped: { unsubscribed: 0, alreadyToday: 0, nothingNew: 0 },
    sent: 0,
    failed: 0,
  };
  if (result.locked) return result;

  const apiKey = getCustomerioAppApiKey();
  if (!apiKey) throw new Error('CUSTOMERIO_APP_API_KEY not set');
  const date = etDate(now);
  const [drafts, rows, swapSnap, lowSentSnap, todaySnap] = await Promise.all([
    loadUnsecuredDrafts(db),
    loadCatalogRows(db).then(toBoxRulesRows),
    db.collection(INVENTORY_SWAPS).where('emailed', '==', false).get(),
    db.collection(INVENTORY_LOW_SENT).select().get(),
    db.collection(INVENTORY_EMAIL_LOG).where('date', '==', date).select('emailHash').get(),
  ]);

  const guestDrafts = drafts.filter((d) => d.kind === 'guest' && d.leadEmailHash);
  const [leadEmails, unsubscribed] = await Promise.all([
    guestDrafts.length ? guestLeadEmails(db, apiKey, guestDrafts, !options.dryRun) : Promise.resolve(new Map<string, string>()),
    unsubscribedHashes([apiKey, ...(options.extraUnsubKeys ?? [])]),
  ]);
  const recipients = buildRecipients(drafts, leadEmails);
  result.recipients = {
    household: recipients.filter((r) => r.kind === 'household').length,
    guest: recipients.filter((r) => r.kind === 'guest').length,
  };
  result.guestsWithoutLead = drafts.filter((d) => d.kind === 'guest' && (!d.leadEmailHash || !leadEmails.has(d.leadEmailHash))).length;

  const held = countDraftHolds(drafts);
  const catalogRows = rows.map((r) => ({ ...r, draftHeld: held.get(r.id) ?? 0 }));
  const low = lowItemsReport(catalogRows).low.sort(
    (a, b) => itemRank(a.id, []) - itemRank(b.id, []) || (a.remaining ?? 0) - (b.remaining ?? 0)
  );
  result.lowItems = low.map((i) => ({ id: i.id, remaining: i.remaining }));

  const swaps: PendingSwap[] = swapSnap.docs.flatMap((d) => {
    const s = d.data();
    const at = s.swappedAt instanceof Timestamp ? s.swappedAt.toMillis() : 0;
    if (!at || now.getTime() - at > SWAP_EMAIL_MAX_AGE_MS) return [];
    return [{ id: d.id, draftKey: String(s.draftKey), fromItemId: String(s.fromItemId), toItemId: typeof s.toItemId === 'string' ? s.toItemId : null }];
  });
  result.pendingSwaps = swaps.length;

  const plan = planInventoryEmails({
    recipients,
    lowItemIds: low.map((i) => i.id),
    swaps,
    lowAlreadySent: new Set(lowSentSnap.docs.map((d) => d.id)),
    sentToday: new Set(todaySnap.docs.map((d) => String(d.data().emailHash))),
    unsubscribed,
  });
  result.skipped = plan.skipped;
  for (const p of plan.picks) result.picks[pickKey(p)] = (result.picks[pickKey(p)] ?? 0) + 1;
  const liveDraftKeys = new Set(drafts.map((d) => d.key));
  const securedSwapIds = plan.unreachableSwapIds.filter((id) => {
    const swap = swaps.find((s) => s.id === id);
    return swap && !liveDraftKeys.has(swap.draftKey);
  });
  result.swapsNoLongerDraft = securedSwapIds.length;
  if (options.dryRun) return result;

  for (const id of securedSwapIds) {
    await db.doc(`${INVENTORY_SWAPS}/${id}`).set({ emailed: true, emailSkipped: 'no-longer-draft' }, { merge: true });
  }

  const catalog = await loadCatalogDocs(
    db,
    plan.picks.flatMap((p) => (p.kind === 'low' ? [p.itemId] : [p.swap.fromItemId, ...(p.swap.toItemId ? [p.swap.toItemId] : [])]))
  );
  const images = new Map<string, Promise<string | null>>();
  const imageFor = (id: string, prefer: 'primary' | 'secondary') => {
    const key = `${id}:${prefer}`;
    if (!images.has(key)) {
      const cat = catalog.get(id);
      images.set(key, cat ? catalogEmailImage(id, cat, prefer).catch(() => null) : Promise.resolve(null));
    }
    return images.get(key)!;
  };
  const byHash = new Map(recipients.map((r) => [r.hash, r]));

  for (const pick of plan.picks) {
    const r = byHash.get(pick.hash)!;
    if (!(await claimDailySlot(db, r, date, pick))) continue;
    const logRef = db.doc(`${INVENTORY_EMAIL_LOG}/${r.hash}_${date}`);
    try {
      const links = await ctaLinksFor(db, r, pick.kind, logRef.id);
      const { template, data } = await emailDataFor(pick, catalog, links, imageFor);
      const status = await sendEmail({ to: r.email, template, data });
      if (status !== 'sent') throw new Error(`sendEmail ${status}`);
      if (pick.kind === 'low') {
        await db.doc(`${INVENTORY_LOW_SENT}/${r.hash}_${pick.itemId}`).set({
          emailHash: r.hash,
          itemId: pick.itemId,
          sentAt: Timestamp.now(),
        });
      } else {
        await db.doc(`${INVENTORY_SWAPS}/${pick.swap.id}`).set({ emailed: true, emailedAt: Timestamp.now() }, { merge: true });
      }
      await logRef.set({ status: 'sent', sentAt: Timestamp.now() }, { merge: true });
      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      await logRef.delete().catch(() => undefined);
      logger.error('inventoryEmails: send failed', { kind: pick.kind, err: String(err).slice(0, 300) });
    }
  }
  return result;
}

export const scheduledInventoryEmails = onSchedule(
  {
    schedule: 'every day 10:00',
    timeZone: 'America/New_York',
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async () => {
    if (process.env.GJ_INVENTORY_EMAILS_ENABLED !== 'true') return;
    const start = process.env.GJ_INVENTORY_EMAILS_START?.trim();
    if (start && etDate(new Date()) < start) return;
    const extra = (process.env.CUSTOMERIO_UNSUB_EXTRA_APP_API_KEYS ?? '')
      .split(',')
      .map((k: string) => k.trim())
      .filter(Boolean);
    const result = await runInventoryEmails(getFirestore(), { extraUnsubKeys: extra });
    logger.info('scheduledInventoryEmails', result);
  }
);
