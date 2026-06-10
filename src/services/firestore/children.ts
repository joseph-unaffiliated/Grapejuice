import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { AgeGroup, BeamStatus, ChildProfile } from '../../types/pilot';
import { ensureAuthTokenReady } from './token';

function parseBeamStatus(value: unknown): BeamStatus {
  if (value === 'eligible' || value === 'enrolled' || value === 'completed') return value;
  return 'not_eligible';
}

function toChild(id: string, data: Record<string, unknown>): ChildProfile {
  const birthdate =
    typeof data.birthdate === 'string'
      ? data.birthdate
      : typeof data.birthday === 'string'
        ? data.birthday
        : undefined;
  return {
    id,
    name: typeof data.name === 'string' ? data.name : undefined,
    ageGroup: (data.ageGroup as AgeGroup) ?? '3-5',
    birthdate,
    birthday: birthdate,
    hebrewName: typeof data.hebrewName === 'string' ? data.hebrewName : undefined,
    barMitzvahDate: typeof data.barMitzvahDate === 'string' ? data.barMitzvahDate : undefined,
    beamStatus: parseBeamStatus(data.beamStatus),
  };
}

export type ChildInput = Omit<ChildProfile, 'id'>;

export const childrenService = {
  async list(userId: string): Promise<ChildProfile[]> {
    if (!db) return [];
    await ensureAuthTokenReady(userId);
    const snap = await getDocs(collection(db, 'users', userId, 'children'));
    return snap.docs.map((d) => toChild(d.id, d.data() as Record<string, unknown>));
  },

  async replaceAll(userId: string, children: ChildInput[]): Promise<ChildProfile[]> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(userId);
    const col = collection(db, 'users', userId, 'children');
    const existing = await getDocs(col);
    await Promise.all(existing.docs.map((d) => deleteDoc(d.ref)));
    const saved: ChildProfile[] = [];
    for (const child of children) {
      const ref = doc(col);
      const birthdate = child.birthdate ?? child.birthday ?? null;
      const payload = {
        name: child.name ?? null,
        ageGroup: child.ageGroup,
        birthdate,
        birthday: birthdate,
        hebrewName: child.hebrewName ?? null,
        barMitzvahDate: child.barMitzvahDate ?? null,
        beamStatus: child.beamStatus ?? 'not_eligible',
      };
      await setDoc(ref, payload);
      saved.push({ id: ref.id, ...child, birthdate: birthdate ?? undefined, beamStatus: child.beamStatus ?? 'not_eligible' });
    }
    return saved;
  },
};
