import { doc, getDoc, setDoc } from 'firebase/firestore';
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
    updatedAt: String(data.updatedAt ?? ''),
    updatedBy: String(data.updatedBy ?? ''),
    lockedAt: (data.lockedAt as string | null) ?? null,
  };
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
    extra?: Partial<Pick<BoxDraft, 'familiarityLevel' | 'lockedAt' | 'slotVotes' | 'childInterests'>>
  ): Promise<BoxDraft> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(uid);
    const ref = doc(db, 'households', householdId, 'boxDrafts', HOLIDAY_ID);
    const now = new Date().toISOString();
    const payload = {
      holidayId: HOLIDAY_ID,
      lineItems,
      updatedAt: now,
      updatedBy: uid,
      ...extra,
    };
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
};
