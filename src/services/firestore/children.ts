import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { AgeGroup, ChildProfile } from '../../types/pilot';
import { ensureAuthTokenReady } from './token';

function toChild(id: string, data: Record<string, unknown>): ChildProfile {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : undefined,
    ageGroup: (data.ageGroup as AgeGroup) ?? '3-5',
    birthday: typeof data.birthday === 'string' ? data.birthday : undefined,
  };
}

export const childrenService = {
  async list(userId: string): Promise<ChildProfile[]> {
    if (!db) return [];
    await ensureAuthTokenReady(userId);
    const snap = await getDocs(collection(db, 'users', userId, 'children'));
    return snap.docs.map((d) => toChild(d.id, d.data() as Record<string, unknown>));
  },

  async replaceAll(userId: string, children: Omit<ChildProfile, 'id'>[]): Promise<ChildProfile[]> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(userId);
    const col = collection(db, 'users', userId, 'children');
    const existing = await getDocs(col);
    await Promise.all(existing.docs.map((d) => deleteDoc(d.ref)));
    const saved: ChildProfile[] = [];
    for (const child of children) {
      const ref = doc(col);
      const payload = {
        name: child.name ?? null,
        ageGroup: child.ageGroup,
        birthday: child.birthday ?? null,
      };
      await setDoc(ref, payload);
      saved.push({ id: ref.id, ...child });
    }
    return saved;
  },
};
