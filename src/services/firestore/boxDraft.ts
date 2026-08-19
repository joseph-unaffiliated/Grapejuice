import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { BoxDraft, BoxLineItem, SlotVotes } from '../../types/pilot';
import { HOLIDAY_ID } from '../../types/pilot';
import { ensureAuthTokenReady } from './token';

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
  };
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
    >
  ): Promise<BoxDraft> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(uid);
    const ref = doc(db, 'households', householdId, 'boxDrafts', HOLIDAY_ID);
    const now = new Date().toISOString();
    const payload = omitUndefined({
      holidayId: HOLIDAY_ID,
      lineItems: lineItems.map(sanitizeLineItem),
      updatedAt: now,
      updatedBy: uid,
      familiarityLevel: extra?.familiarityLevel,
      lockedAt: extra?.lockedAt,
      slotVotes: extra?.slotVotes,
      childInterests: extra?.childInterests,
      sealedSectionIds: extra?.sealedSectionIds,
      wrapSelectedItemIds: extra?.wrapSelectedItemIds,
    });
    await setDoc(ref, payload, { merge: true });
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

  /** Admin/tester helper — remove the holiday draft so curation can restart. */
  async clear(householdId: string, uid: string): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(uid);
    await deleteDoc(doc(db, 'households', householdId, 'boxDrafts', HOLIDAY_ID));
  },
};
