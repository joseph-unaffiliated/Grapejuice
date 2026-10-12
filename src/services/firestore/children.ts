import { collection, doc, getDocs, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { AgeGroup, BeamStatus, ChildProfile } from '../../types/pilot';
import { ensureAuthTokenReady, withAuthRetry } from './token';

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
    plannerAge: typeof data.plannerAge === 'number' ? data.plannerAge : undefined,
    birthdate,
    birthday: birthdate,
    hebrewName: typeof data.hebrewName === 'string' ? data.hebrewName : undefined,
    barMitzvahDate: typeof data.barMitzvahDate === 'string' ? data.barMitzvahDate : undefined,
    beamStatus: parseBeamStatus(data.beamStatus),
    ravEnabled: data.ravEnabled === true,
  };
}

export type ChildInput = Omit<ChildProfile, 'id'>;

const inflightChildLists = new Map<string, Promise<ChildProfile[]>>();

async function fetchChildList(userId: string): Promise<ChildProfile[]> {
  if (!db) return [];
  const firestore = db;
  const snap = await withAuthRetry(userId, () =>
    getDocs(collection(firestore, 'users', userId, 'children'))
  );
  return snap.docs.map((d) => toChild(d.id, d.data() as Record<string, unknown>));
}

export const childrenService = {
  /** Concurrent callers for the same user share one read. */
  list(userId: string): Promise<ChildProfile[]> {
    const existing = inflightChildLists.get(userId);
    if (existing) return existing;
    const promise = fetchChildList(userId).finally(() => {
      if (inflightChildLists.get(userId) === promise) inflightChildLists.delete(userId);
    });
    inflightChildLists.set(userId, promise);
    return promise;
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
        plannerAge: typeof child.plannerAge === 'number' ? child.plannerAge : null,
        hebrewName: child.hebrewName ?? null,
        barMitzvahDate: child.barMitzvahDate ?? null,
        beamStatus: child.beamStatus ?? 'not_eligible',
        ravEnabled: child.ravEnabled === true,
      };
      await setDoc(ref, payload);
      saved.push({
        id: ref.id,
        ...child,
        birthdate: birthdate ?? undefined,
        beamStatus: child.beamStatus ?? 'not_eligible',
        ravEnabled: child.ravEnabled === true,
      });
    }
    return saved;
  },

  async updateRavEnabled(userId: string, childId: string, ravEnabled: boolean): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(userId);
    await updateDoc(doc(db, 'users', userId, 'children', childId), { ravEnabled });
  },
};
