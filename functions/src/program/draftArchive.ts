/**
 * Point-in-time copies of unfinished Hanukkah boxes.
 *
 * `boxDraftArchives/{captureId}__account__{householdId}` and
 * `...__guest__{visitorId}` hold the line items. The live draft is never
 * deleted. To put a box back, copy `lineItems` and `wrapSelectedItemIds`
 * onto `households/{householdId}/boxDrafts/hanukkah-2026` (or the guest
 * session snapshot). A later capture does not overwrite an earlier one.
 *
 * Favorites are a separate write: at Monday noon the same items are unioned
 * into `households.wishlistItemIds` for households that never placed a box.
 * Their draft stays, so a friends-and-family link can keep editing it.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { EXTENSION_END } from './lockWindow';

export const PRE_LOCK_CAPTURE_ID = 'pre-lock-2026-11-07';
export const RETIRE_CAPTURE_ID = 'retire-2026-11-09';

const HOLIDAY_ID = 'hanukkah-2026';
const LIVE_BOX = new Set(['pending', 'committed', 'confirmed', 'shipped', 'delivered']);
const BATCH = 400;

export function retireAllowed(now: Date): boolean {
  return now.getTime() >= Date.parse(EXTENSION_END);
}

export function itemIdsFromLines(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  const ids: string[] = [];
  for (const line of lines) {
    if (!line || typeof line !== 'object') continue;
    const itemId = (line as { itemId?: unknown }).itemId;
    const quantity = (line as { quantity?: unknown }).quantity;
    if (typeof itemId !== 'string' || !itemId) continue;
    if (typeof quantity === 'number' && quantity <= 0) continue;
    ids.push(itemId);
  }
  return [...new Set(ids)];
}

function iso(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function linesOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

type PendingWrite = { path: string; data: Record<string, unknown> };

async function commitWrites(db: Firestore, writes: PendingWrite[]): Promise<void> {
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + BATCH)) {
      batch.set(db.doc(write.path), write.data);
    }
    await batch.commit();
  }
}

async function liveBoxHouseholds(db: Firestore): Promise<Set<string>> {
  const ids = new Set<string>();
  const snap = await db.collectionGroup('orders').select('status', 'holidayId', 'playthrough').get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.holidayId !== HOLIDAY_ID || data.playthrough === true) continue;
    if (!LIVE_BOX.has(String(data.status ?? ''))) continue;
    const householdId = doc.ref.parent.parent?.id;
    if (householdId) ids.add(householdId);
  }
  return ids;
}

export type DraftArchiveResult = {
  captureId: string;
  accountDrafts: number;
  guestDrafts: number;
  wishlisted: number;
  skippedLiveBoxes: number;
};

/**
 * Copy every account draft and every guest box that still has items.
 * When `wishlist` is set, also union those item ids into favorites for
 * households that do not already have a live Hanukkah box order.
 */
export async function archiveDraftBoxes(
  db: Firestore,
  options: { captureId: string; wishlist: boolean; now?: Date }
): Promise<DraftArchiveResult> {
  const now = options.now ?? new Date();
  const capturedAt = now.toISOString();
  const live = options.wishlist ? await liveBoxHouseholds(db) : new Set<string>();
  const writes: PendingWrite[] = [];
  const wishlistWrites: PendingWrite[] = [];
  let accountDrafts = 0;
  let guestDrafts = 0;
  let skippedLiveBoxes = 0;

  const drafts = await db.collectionGroup('boxDrafts').get();
  for (const doc of drafts.docs) {
    if (doc.id !== HOLIDAY_ID) continue;
    const householdId = doc.ref.parent.parent?.id;
    if (!householdId) continue;
    const data = doc.data();
    const lineItems = linesOf(data.lineItems);
    if (lineItems.length === 0) continue;
    accountDrafts += 1;
    const hasLiveBox = live.has(householdId);
    if (hasLiveBox) skippedLiveBoxes += 1;
    writes.push({
      path: `boxDraftArchives/${options.captureId}__account__${householdId}`,
      data: {
        captureId: options.captureId,
        kind: 'account',
        sourcePath: doc.ref.path,
        householdId,
        visitorId: null,
        lineItems,
        wrapSelectedItemIds: stringList(data.wrapSelectedItemIds),
        updatedAt: iso(data.updatedAt),
        updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null,
        lineCount: lineItems.length,
        capturedAt,
        hasLiveBox,
        wishlisted: options.wishlist && !hasLiveBox,
      },
    });
    if (!options.wishlist || hasLiveBox) continue;
    const add = itemIdsFromLines(lineItems);
    if (add.length === 0) continue;
    wishlistWrites.push({
      path: `households/${householdId}`,
      data: { wishlistItemIds: FieldValue.arrayUnion(...add) },
    });
  }

  const [flagged, counted] = await Promise.all([
    db.collection('guestSessions').where('hasBox', '==', true).get(),
    db.collection('guestSessions').where('boxItemCount', '>', 0).get(),
  ]);
  const guests = new Map<string, (typeof flagged.docs)[number]>();
  for (const doc of [...flagged.docs, ...counted.docs]) guests.set(doc.id, doc);
  for (const doc of guests.values()) {
    const data = doc.data();
    const snapshot = data.snapshot && typeof data.snapshot === 'object' ? data.snapshot : {};
    const guest =
      (snapshot as { guest?: unknown }).guest && typeof (snapshot as { guest?: unknown }).guest === 'object'
        ? ((snapshot as { guest: Record<string, unknown> }).guest)
        : {};
    const lineItems = linesOf(guest.lineItems);
    if (lineItems.length === 0) continue;
    guestDrafts += 1;
    writes.push({
      path: `boxDraftArchives/${options.captureId}__guest__${doc.id}`,
      data: {
        captureId: options.captureId,
        kind: 'guest',
        sourcePath: doc.ref.path,
        householdId: null,
        visitorId: doc.id,
        lineItems,
        wrapSelectedItemIds: stringList(guest.wrapSelectedItemIds),
        updatedAt: iso(data.updatedAt),
        updatedBy: null,
        lineCount: lineItems.length,
        capturedAt,
        hasLiveBox: false,
        wishlisted: false,
      },
    });
  }

  await commitWrites(db, writes);
  if (wishlistWrites.length) {
    for (let i = 0; i < wishlistWrites.length; i += BATCH) {
      const batch = db.batch();
      for (const write of wishlistWrites.slice(i, i + BATCH)) {
        batch.set(db.doc(write.path), write.data, { merge: true });
      }
      await batch.commit();
    }
  }

  return {
    captureId: options.captureId,
    accountDrafts,
    guestDrafts,
    wishlisted: wishlistWrites.length,
    skippedLiveBoxes,
  };
}

export type RetireDraftsResult =
  | { skipped: 'before-monday-noon' | 'already-retired' }
  | DraftArchiveResult;

/** Monday noon: archive again, then copy unfinished boxes into favorites. */
export async function retireUnsecuredDrafts(
  db: Firestore,
  now: Date = new Date()
): Promise<RetireDraftsResult> {
  if (!retireAllowed(now)) return { skipped: 'before-monday-noon' };
  const configRef = db.doc('config/hanukkah-2026');
  const config = await configRef.get();
  if (config.data()?.draftsRetiredAt) return { skipped: 'already-retired' };
  const result = await archiveDraftBoxes(db, {
    captureId: RETIRE_CAPTURE_ID,
    wishlist: true,
    now,
  });
  await configRef.set(
    { draftsRetiredAt: now.toISOString(), draftsRetiredCaptureId: RETIRE_CAPTURE_ID },
    { merge: true }
  );
  return result;
}
