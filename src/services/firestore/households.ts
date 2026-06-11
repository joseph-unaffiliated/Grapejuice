import { collection, doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Household } from '../../types/pilot';
import { ensureAuthTokenReady } from './token';

function toHousehold(id: string, data: Record<string, unknown>): Household {
  return {
    id,
    name: String(data.name ?? 'Our household'),
    ownerId: String(data.ownerId ?? ''),
    memberIds: Array.isArray(data.memberIds) ? (data.memberIds as string[]) : [],
    childUserIds: Array.isArray(data.childUserIds) ? (data.childUserIds as string[]) : [],
    stripeCustomerId: data.stripeCustomerId ? String(data.stripeCustomerId) : undefined,
    stripeDefaultPaymentMethodId: data.stripeDefaultPaymentMethodId
      ? String(data.stripeDefaultPaymentMethodId)
      : undefined,
    cardOnFileAt: data.cardOnFileAt ? String(data.cardOnFileAt) : undefined,
    giftCreditCents:
      typeof data.giftCreditCents === 'number' ? data.giftCreditCents : undefined,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

export const householdsService = {
  async get(householdId: string): Promise<Household | null> {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'households', householdId));
    if (!snap.exists()) return null;
    return toHousehold(snap.id, snap.data() as Record<string, unknown>);
  },

  async createForOwner(ownerId: string, name = 'Our household'): Promise<Household> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(ownerId);
    const ref = doc(collection(db, 'households'));
    const now = new Date().toISOString();
    const household: Household = {
      id: ref.id,
      name,
      ownerId,
      memberIds: [ownerId],
      childUserIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(ref, {
      name: household.name,
      ownerId,
      memberIds: household.memberIds,
      childUserIds: household.childUserIds,
      createdAt: now,
      updatedAt: now,
    });
    return household;
  },

  async addMember(householdId: string, uid: string): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await updateDoc(doc(db, 'households', householdId), {
      memberIds: arrayUnion(uid),
      updatedAt: new Date().toISOString(),
    });
  },
};
