import { deleteDoc, doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { BoxChangeSource, BoxDraft, BoxLineItem, InventorySwapNotice, SlotVotes } from '../../types/pilot';
import { HOLIDAY_ID } from '../../types/pilot';
import { ensureAuthTokenReady } from './token';
import { mergeBoxLines } from '../box/mergeBoxLines';

function parseSlotVotes(raw: unknown): SlotVotes {
  if (!raw || typeof raw !== 'object') return {};
  return raw as SlotVotes;
}

function toDraft(data: Record<string, unknown>): BoxDraft {
  return {
    holidayId: String(data.holidayId ?? HOLIDAY_ID),
    lineItems: Array.isArray(data.lineItems) ? (data.lineItems as BoxLineItem[]) : [],
    slotVotes: parseSlotVotes(data.slotVotes),
    familiarityLevel: data.familiarityLevel as BoxDraft['familiarityLevel'],
    childInterests: Array.isArray(data.childInterests) ? (data.childInterests as string[]) : undefined,
    sealedSectionIds: Array.isArray(data.sealedSectionIds)
      ? (data.sealedSectionIds as BoxDraft['sealedSectionIds'])
      : undefined,
    wrapSelectedItemIds: Array.isArray(data.wrapSelectedItemIds)
      ? (data.wrapSelectedItemIds as string[])
      : undefined,
    updatedAt: String(data.updatedAt ?? ''),
    updatedBy: String(data.updatedBy ?? ''),
    lockedAt: (data.lockedAt as string | null) ?? null,
    inventorySwapNotices: parseSwapNotices(data.inventorySwapNotices),
  };
}

export function parseSwapNotices(raw: unknown): InventorySwapNotice[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((n) => {
    if (!n || typeof n !== 'object') return [];
    const r = n as Record<string, unknown>;
    if (typeof r.fromItemId !== 'string' || !r.fromItemId) return [];
    return [
      {
        fromItemId: r.fromItemId,
        fromName: typeof r.fromName === 'string' ? r.fromName : r.fromItemId,
        toItemId: typeof r.toItemId === 'string' ? r.toItemId : null,
        toName: typeof r.toName === 'string' ? r.toName : null,
        at: typeof r.at === 'string' ? r.at : '',
      },
    ];
  });
}

/** Firestore rejects `undefined` anywhere in a document — drop those keys. */
function omitUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeLineItem(li: BoxLineItem): Record<string, unknown> {
  return omitUndefined({
    slotId: li.slotId,
    itemId: li.itemId,
    quantity: li.quantity,
    unitCents: li.unitCents,
    childId: li.childId,
    label: li.label,
    keepOrToss: li.keepOrToss,
    isSurprise: li.isSurprise,
    includedQty: li.includedQty,
    displaySectionId: li.displaySectionId,
    curationNote: li.curationNote,
    program: li.program,
    deferredChargeCents: li.deferredChargeCents,
  });
}

export const boxDraftService = {
  draftPath(householdId: string) {
    return `households/${householdId}/boxDrafts/${HOLIDAY_ID}`;
  },

  async get(householdId: string): Promise<BoxDraft | null> {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'households', householdId, 'boxDrafts', HOLIDAY_ID));
    if (!snap.exists()) return null;
    return toDraft(snap.data() as Record<string, unknown>);
  },

  async save(
    householdId: string,
    uid: string,
    lineItems: BoxLineItem[],
    extra?: Partial<
      Pick<
        BoxDraft,
        | 'familiarityLevel'
        | 'lockedAt'
        | 'slotVotes'
        | 'childInterests'
        | 'sealedSectionIds'
        | 'wrapSelectedItemIds'
      >
    > & {
      source?: BoxChangeSource;
      /**
       * The lines this edit started from. When the saved box has changed since (a repair or
       * another tab), only the slots this edit touched are written over it.
       */
      base?: BoxLineItem[];
    }
  ): Promise<BoxDraft> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(uid);
    const ref = doc(db, 'households', householdId, 'boxDrafts', HOLIDAY_ID);
    const now = new Date().toISOString();
    const mine = lineItems.map(sanitizeLineItem) as BoxLineItem[];
    const base = extra?.base?.map(sanitizeLineItem) as BoxLineItem[] | undefined;
    const fields = (lines: BoxLineItem[]) => omitUndefined({
      holidayId: HOLIDAY_ID,
      lineItems: lines,
      updatedAt: now,
      updatedBy: uid,
      lastChangeSource: extra?.source ?? 'customer',
      familiarityLevel: extra?.familiarityLevel,
      lockedAt: extra?.lockedAt,
      slotVotes: extra?.slotVotes,
      childInterests: extra?.childInterests,
      sealedSectionIds: extra?.sealedSectionIds,
      wrapSelectedItemIds: extra?.wrapSelectedItemIds,
    });
    if (!base) {
      await setDoc(ref, fields(mine), { merge: true });
    } else {
      await runTransaction(db, async (tx) => {
        const current = await tx.get(ref);
        const theirs = current.exists() ? toDraft(current.data() as Record<string, unknown>).lineItems : [];
        tx.set(ref, fields(current.exists() ? mergeBoxLines(base, mine, theirs) : mine), { merge: true });
      });
    }
    const snap = await getDoc(ref);
    return toDraft(snap.data() as Record<string, unknown>);
  },

  async saveSlotVotes(householdId: string, uid: string, slotVotes: SlotVotes): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(uid);
    const ref = doc(db, 'households', householdId, 'boxDrafts', HOLIDAY_ID);
    const now = new Date().toISOString();
    await setDoc(ref, { slotVotes, updatedAt: now, updatedBy: uid }, { merge: true });
  },

  async saveWrapSelection(
    householdId: string,
    uid: string,
    wrapSelectedItemIds: string[]
  ): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(uid);
    const ref = doc(db, 'households', householdId, 'boxDrafts', HOLIDAY_ID);
    const now = new Date().toISOString();
    await setDoc(ref, { wrapSelectedItemIds, updatedAt: now, updatedBy: uid }, { merge: true });
  },

  async saveSwapNotices(householdId: string, uid: string, notices: InventorySwapNotice[]): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(uid);
    const ref = doc(db, 'households', householdId, 'boxDrafts', HOLIDAY_ID);
    await setDoc(ref, { inventorySwapNotices: notices }, { merge: true });
  },

  /** Admin/tester helper — remove the holiday draft so curation can restart. */
  async clear(householdId: string, uid: string): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(uid);
    await deleteDoc(doc(db, 'households', householdId, 'boxDrafts', HOLIDAY_ID));
  },
};
