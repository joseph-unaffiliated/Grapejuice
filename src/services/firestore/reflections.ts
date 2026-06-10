import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { HolidayReflection } from '../../types/pilot';

export const reflectionsService = {
  async get(uid: string, holidayId: string): Promise<HolidayReflection | null> {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'users', uid, 'reflection', holidayId));
    if (!snap.exists()) return null;
    return snap.data() as HolidayReflection;
  },

  async save(uid: string, reflection: HolidayReflection): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await setDoc(doc(db, 'users', uid, 'reflection', reflection.holidayId), reflection, { merge: true });
  },
};
