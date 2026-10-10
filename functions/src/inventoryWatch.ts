import { Timestamp, getFirestore, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';
import { CATALOG_HOLIDAY, HOLIDAY_ID, inventoryDocRef } from './catalogInventory';
import { loadCatalogRows, toBoxRulesRows } from './rav/context';
import {
  isLowWithDrafts,
  isSoldOutForBoxes,
  plannerAgeOf,
  rowRemainingWithDrafts,
  swapSoldOutLines,
  type BoxRulesCatalogRow,
  type SoldOutSwap,
} from './rav/boxRules';
import { isTest } from './testAccounts';

/**
 * Inventory watch (every 30 minutes):
 *  1. Counts units sitting in account drafts without a box order (signed-out boxes and gift
 *     drafts don't count) into
 *     catalog/hanukkah/inventory/{itemId}.draftHeldQty. Drafts hold no stock; the count only
 *     feeds the "low" rule (defaults + the low-stock email).
 *  2. Swaps truly sold-out items (every unit held by a real order) out of those drafts using the
 *     box rules, and records each swap in inventorySwaps/{draftKey}_{itemId} for the swapped email.
 * Secured boxes (pending/committed/... orders) are never touched.
 * Off unless GJ_INVENTORY_WATCH_ENABLED=true. scripts/inventory-alerts-preview.mjs runs it dry.
 */

export const INVENTORY_SWAPS = 'inventorySwaps';
const DRAFT_STATUSES_SECURED = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const MAX_NOTICES = 10;

export type DraftLine = {
  slotId: string;
  itemId: string;
  quantity: number;
  unitCents?: number;
  childId?: string;
  label?: string;
  curationNote?: string;
  [key: string]: unknown;
};

export type UnsecuredDraft = {
  /** Stable id for swap / email records: `hh_<householdId>` or `guest_<visitorId>`. */
  key: string;
  kind: 'household' | 'guest';
  ref: DocumentReference;
  /** Box lines (household lineItems, or the signed-out box). */
  lines: DraftLine[];
  /** Signed-out gift draft lines (status incomplete). */
  giftLines: DraftLine[];
  householdId?: string;
  ownerId?: string;
  ownerEmail?: string | null;
  /** Guest: hash of the Retention lead email linked to this visitor. */
  leadEmailHash?: string | null;
  /** Guest: kid id → planner age (box `guest-N`, gift `gift-child-N`). */
  guestKidAges?: Map<string, number>;
  test: boolean;
};

export type SwapNotice = {
  fromItemId: string;
  fromName: string;
  toItemId: string | null;
  toName: string | null;
  at: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function toDraftLines(raw: unknown): DraftLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is DraftLine =>
      isRecord(l) && typeof l.itemId === 'string' && l.itemId.length > 0 && typeof l.slotId === 'string'
  );
}

function lineQty(line: DraftLine): number {
  return typeof line.quantity === 'number' && Number.isFinite(line.quantity) ? Math.max(0, Math.floor(line.quantity)) : 0;
}

/**
 * Units per item across unsecured account drafts (test accounts excluded). Signed-out boxes
 * and gift drafts rarely check out, so they don't count toward "low".
 */
export function countDraftHolds(drafts: UnsecuredDraft[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const d of drafts) {
    if (d.test || d.kind !== 'household') continue;
    for (const line of [...d.lines, ...d.giftLines]) {
      const qty = lineQty(line);
      if (qty > 0) totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + qty);
    }
  }
  return totals;
}

/** Guest kid ids the client assigns: non-adult box kids `guest-N`, gift kids `gift-child-N`. */
export function guestKidAges(snapshot: Record<string, unknown>): Map<string, number> {
  const ages = new Map<string, number>();
  const guest = isRecord(snapshot.guest) ? snapshot.guest : {};
  const kids = Array.isArray(guest.childDrafts) ? guest.childDrafts.filter((c) => isRecord(c) && c.role !== 'adult') : [];
  kids.forEach((kid, i) => {
    const age = plannerAgeOf(kid as Record<string, unknown>);
    if (age != null) ages.set(`guest-${i}`, age);
  });
  const gift = isRecord(snapshot.gift) ? snapshot.gift : null;
  const giftKids = gift && isRecord(gift.draft) && Array.isArray(gift.draft.childDrafts) ? gift.draft.childDrafts : [];
  giftKids.forEach((kid, i) => {
    const age = isRecord(kid) ? plannerAgeOf(kid) : undefined;
    if (age != null) ages.set(`gift-child-${i}`, age);
  });
  return ages;
}

export function guestDraftLines(snapshot: Record<string, unknown>): { lines: DraftLine[]; giftLines: DraftLine[] } {
  const guest = isRecord(snapshot.guest) ? snapshot.guest : {};
  const hasBox = guest.onboardingComplete === true || guest.boxRevealComplete === true;
  const gift = isRecord(snapshot.gift) ? snapshot.gift : null;
  const giftDraft = gift?.status === 'incomplete' && isRecord(gift.draft) ? gift.draft : null;
  return {
    lines: hasBox ? toDraftLines(guest.lineItems) : [],
    giftLines: giftDraft ? toDraftLines(giftDraft.lineItems) : [],
  };
}

async function householdsWithSecuredBox(db: Firestore): Promise<Set<string>> {
  const secured = new Set<string>();
  for (const status of DRAFT_STATUSES_SECURED) {
    const snap = await db
      .collectionGroup('orders')
      .where('holidayId', '==', HOLIDAY_ID)
      .where('status', '==', status)
      .select('orderType', 'playthrough')
      .get();
    for (const d of snap.docs) {
      const o = d.data();
      if (o.orderType === 'marketplace' || o.orderType === 'received_gift' || o.playthrough === true) continue;
      const hh = d.ref.parent.parent;
      if (hh?.parent.id === 'households') secured.add(hh.id);
    }
  }
  return secured;
}

/** Every draft that could still hold an item without reserving it. Read-only. */
export async function loadUnsecuredDrafts(db: Firestore): Promise<UnsecuredDraft[]> {
  const [secured, draftSnap, householdSnap, userSnap, guestBoxSnap, guestGiftSnap] = await Promise.all([
    householdsWithSecuredBox(db),
    db.collectionGroup('boxDrafts').get(),
    db.collection('households').select('ownerId').get(),
    db.collection('users').select('email').get(),
    db.collection('guestSessions').where('hasBox', '==', true).get(),
    db.collection('guestSessions').where('hasGiftDraft', '==', true).get(),
  ]);
  const owners = new Map(householdSnap.docs.map((d) => [d.id, d.data().ownerId as unknown]));
  const emails = new Map(userSnap.docs.map((d) => [d.id, d.data().email as unknown]));

  const drafts: UnsecuredDraft[] = [];
  for (const d of draftSnap.docs) {
    const hh = d.ref.parent.parent;
    if (d.id !== HOLIDAY_ID || hh?.parent.id !== 'households' || secured.has(hh.id)) continue;
    const lines = toDraftLines(d.data().lineItems);
    if (!lines.length) continue;
    const ownerId = typeof owners.get(hh.id) === 'string' ? (owners.get(hh.id) as string) : undefined;
    const email = ownerId && typeof emails.get(ownerId) === 'string' ? (emails.get(ownerId) as string) : null;
    drafts.push({
      key: `hh_${hh.id}`,
      kind: 'household',
      ref: d.ref,
      lines,
      giftLines: [],
      householdId: hh.id,
      ownerId,
      ownerEmail: email,
      test: isTest(email),
    });
  }

  const seen = new Set<string>();
  for (const d of [...guestBoxSnap.docs, ...guestGiftSnap.docs]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    const data = d.data();
    if (typeof data.convertedUid === 'string' && data.convertedUid) continue;
    const snapshot = isRecord(data.snapshot) ? data.snapshot : {};
    const { lines, giftLines } = guestDraftLines(snapshot);
    if (!lines.length && !giftLines.length) continue;
    drafts.push({
      key: `guest_${d.id}`,
      kind: 'guest',
      ref: d.ref,
      lines,
      giftLines,
      leadEmailHash: typeof data.lastLeadEmailHash === 'string' ? data.lastLeadEmailHash : null,
      guestKidAges: guestKidAges(snapshot),
      test: false,
    });
  }
  return drafts;
}

/** Write draftHeldQty for every tracked counter doc (zeroing items no longer in drafts). */
export async function writeDraftHolds(db: Firestore, totals: Map<string, number>): Promise<number> {
  const invSnap = await db.collection(`catalog/${CATALOG_HOLIDAY}/inventory`).select().get();
  const ids = [...new Set([...totals.keys(), ...invSnap.docs.map((d) => d.id)])];
  const nowIso = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + 400)) {
      batch.set(inventoryDocRef(db, id), { draftHeldQty: totals.get(id) ?? 0, draftHeldAt: nowIso }, { merge: true });
    }
    await batch.commit();
  }
  return ids.length;
}

function nameOf(catalog: BoxRulesCatalogRow[], id: string | null): string | null {
  if (!id) return null;
  return catalog.find((r) => r.id === id)?.name ?? id;
}

export function swapNotices(swaps: SoldOutSwap[], catalog: BoxRulesCatalogRow[], at: string): SwapNotice[] {
  return swaps.map((s) => ({
    fromItemId: s.fromItemId,
    fromName: nameOf(catalog, s.fromItemId) ?? s.fromItemId,
    toItemId: s.toItemId,
    toName: nameOf(catalog, s.toItemId),
    at,
  }));
}

function mergeNotices(existing: unknown, added: SwapNotice[]): SwapNotice[] {
  const prior = Array.isArray(existing) ? existing.filter(isRecord) as SwapNotice[] : [];
  const fresh = new Set(added.map((n) => n.fromItemId));
  return [...prior.filter((n) => !fresh.has(n.fromItemId)), ...added].slice(-MAX_NOTICES);
}

async function householdKidAges(db: Firestore, ownerId: string | undefined): Promise<Map<string, number>> {
  const ages = new Map<string, number>();
  if (!ownerId) return ages;
  const snap = await db.collection(`users/${ownerId}/children`).get();
  for (const d of snap.docs) {
    const age = plannerAgeOf(d.data());
    if (age != null) ages.set(d.id, age);
  }
  return ages;
}

export type SwapRunResult = {
  draftsSwapped: number;
  swapsByItem: Record<string, { drafts: number; replacements: Record<string, number> }>;
};

function countSwaps(result: SwapRunResult, swaps: SoldOutSwap[]) {
  if (swaps.length) result.draftsSwapped += 1;
  for (const s of swaps) {
    const entry = (result.swapsByItem[s.fromItemId] ??= { drafts: 0, replacements: {} });
    entry.drafts += 1;
    const to = s.toItemId ?? '(removed)';
    entry.replacements[to] = (entry.replacements[to] ?? 0) + 1;
  }
}

async function recordSwaps(db: Firestore, draft: UnsecuredDraft, notices: SwapNotice[]) {
  const batch = db.batch();
  for (const n of notices) {
    batch.set(
      db.doc(`${INVENTORY_SWAPS}/${draft.key}_${n.fromItemId}`),
      {
        draftKey: draft.key,
        kind: draft.kind,
        householdId: draft.householdId ?? null,
        visitorId: draft.kind === 'guest' ? draft.ref.id : null,
        fromItemId: n.fromItemId,
        toItemId: n.toItemId,
        swappedAt: Timestamp.now(),
        emailed: false,
      },
      { merge: true }
    );
  }
  await batch.commit();
}

/**
 * Swap sold-out lines out of each unsecured draft. Each write re-reads the draft in a
 * transaction so a shopper's concurrent edit is never clobbered with stale lines.
 */
export async function applySoldOutSwaps(
  db: Firestore,
  drafts: UnsecuredDraft[],
  catalog: BoxRulesCatalogRow[],
  options: { dryRun?: boolean } = {}
): Promise<SwapRunResult> {
  const result: SwapRunResult = { draftsSwapped: 0, swapsByItem: {} };
  const soldOutIds = new Set(catalog.filter(isSoldOutForBoxes).map((r) => r.id));
  if (!soldOutIds.size) return result;
  const at = new Date().toISOString();

  for (const draft of drafts) {
    if (![...draft.lines, ...draft.giftLines].some((l) => soldOutIds.has(l.itemId))) continue;

    if (draft.kind === 'household') {
      const ages = await householdKidAges(db, draft.ownerId);
      const ageFor = (id: string | undefined) => (id ? ages.get(id) : undefined);
      if (options.dryRun) {
        countSwaps(result, swapSoldOutLines(draft.lines, catalog, ageFor).swaps);
        continue;
      }
      const swaps = await db.runTransaction(async (tx) => {
        const snap = await tx.get(draft.ref);
        const data = snap.data() ?? {};
        const next = swapSoldOutLines(toDraftLines(data.lineItems), catalog, ageFor);
        if (!next.swaps.length) return [];
        tx.set(
          draft.ref,
          {
            lineItems: next.lines,
            inventorySwapNotices: mergeNotices(data.inventorySwapNotices, swapNotices(next.swaps, catalog, at)),
            updatedAt: at,
            updatedBy: 'inventory-swap',
          },
          { merge: true }
        );
        return next.swaps;
      });
      countSwaps(result, swaps);
      if (swaps.length) await recordSwaps(db, draft, swapNotices(swaps, catalog, at));
      continue;
    }

    const ages = draft.guestKidAges ?? new Map<string, number>();
    const ageFor = (id: string | undefined) => (id ? ages.get(id) : undefined);
    if (options.dryRun) {
      const box = swapSoldOutLines(draft.lines, catalog, ageFor).swaps;
      const gift = swapSoldOutLines(draft.giftLines, catalog, ageFor).swaps;
      countSwaps(result, [...box, ...gift.filter((g) => !box.some((b) => b.fromItemId === g.fromItemId))]);
      continue;
    }
    const swaps = await db.runTransaction(async (tx) => {
      const snap = await tx.get(draft.ref);
      const data = snap.data() ?? {};
      if (typeof data.convertedUid === 'string' && data.convertedUid) return [];
      const snapshot = isRecord(data.snapshot) ? data.snapshot : {};
      const current = guestDraftLines(snapshot);
      const box = swapSoldOutLines(current.lines, catalog, ageFor);
      const gift = swapSoldOutLines(current.giftLines, catalog, ageFor);
      const all = [...box.swaps, ...gift.swaps.filter((g) => !box.swaps.some((b) => b.fromItemId === g.fromItemId))];
      if (!all.length) return [];
      const guest = isRecord(snapshot.guest) ? snapshot.guest : {};
      const update: Record<string, unknown> = {};
      if (box.swaps.length) {
        update['snapshot.guest.lineItems'] = box.lines;
        update['snapshot.guest.inventorySwapNotices'] = mergeNotices(
          guest.inventorySwapNotices,
          swapNotices(box.swaps, catalog, at)
        );
      }
      if (gift.swaps.length) update['snapshot.gift.draft.lineItems'] = gift.lines;
      tx.update(draft.ref, update);
      return all;
    });
    countSwaps(result, swaps);
    if (swaps.length) await recordSwaps(db, draft, swapNotices(swaps, catalog, at));
  }
  return result;
}

export type LowItem = { id: string; name: string; inventory: number | null; stockLeft: number | null; draftHeld: number; remaining: number | null };

export function lowItemsReport(catalog: BoxRulesCatalogRow[]): { low: LowItem[]; soldOut: LowItem[] } {
  const item = (r: BoxRulesCatalogRow): LowItem => ({
    id: r.id,
    name: r.name,
    inventory: typeof r.inventory === 'number' ? r.inventory : null,
    stockLeft: typeof r.stockLeft === 'number' ? r.stockLeft : null,
    draftHeld: typeof r.draftHeld === 'number' ? r.draftHeld : 0,
    remaining: rowRemainingWithDrafts(r),
  });
  return {
    low: catalog.filter((r) => isLowWithDrafts(r) && !isSoldOutForBoxes(r)).map(item),
    soldOut: catalog.filter(isSoldOutForBoxes).map(item),
  };
}

export async function lockPassed(db: Firestore): Promise<boolean> {
  const lockAt = (await db.doc(`config/${HOLIDAY_ID}`).get()).data()?.lockAt;
  return typeof lockAt === 'string' && Date.now() >= new Date(lockAt).getTime();
}

export type InventoryWatchResult = {
  drafts: { household: number; guest: number; test: number };
  heldItems: number;
  low: LowItem[];
  soldOut: LowItem[];
  swaps: SwapRunResult;
  locked: boolean;
};

/** Count draft holds, write them (unless dry), then swap sold-out lines (unless dry or locked). */
export async function runInventoryWatch(db: Firestore, options: { dryRun?: boolean } = {}): Promise<InventoryWatchResult> {
  const drafts = await loadUnsecuredDrafts(db);
  const totals = countDraftHolds(drafts);
  if (!options.dryRun) await writeDraftHolds(db, totals);
  const catalog = toBoxRulesRows(await loadCatalogRows(db)).map((r) =>
    options.dryRun ? { ...r, draftHeld: totals.get(r.id) ?? 0 } : r
  );
  const locked = await lockPassed(db);
  const { low, soldOut } = lowItemsReport(catalog);
  const swaps = locked
    ? { draftsSwapped: 0, swapsByItem: {} }
    : await applySoldOutSwaps(db, drafts, catalog, options);
  return {
    drafts: {
      household: drafts.filter((d) => d.kind === 'household' && !d.test).length,
      guest: drafts.filter((d) => d.kind === 'guest').length,
      test: drafts.filter((d) => d.test).length,
    },
    heldItems: totals.size,
    low,
    soldOut,
    swaps,
    locked,
  };
}

export const scheduledInventoryWatch = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'America/New_York', memory: '1GiB', timeoutSeconds: 540 },
  async () => {
    if (process.env.GJ_INVENTORY_WATCH_ENABLED !== 'true') return;
    const result = await runInventoryWatch(getFirestore());
    logger.info('scheduledInventoryWatch', {
      drafts: result.drafts,
      heldItems: result.heldItems,
      low: result.low.map((i) => `${i.id}:${i.remaining}`),
      soldOut: result.soldOut.map((i) => i.id),
      swaps: result.swaps,
      locked: result.locked,
    });
  }
);
