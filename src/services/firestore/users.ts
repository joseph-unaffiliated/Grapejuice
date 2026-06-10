import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { AccountRole, FamiliarityLevel, UpcomingBeamMilestone, UserProfile } from '../../types/pilot';
import { ensureAuthTokenReady } from './token';

function parseUpcomingBeamMilestone(value: unknown): UpcomingBeamMilestone | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  if (typeof o.childId !== 'string' || typeof o.childName !== 'string') return undefined;
  if (o.milestoneType !== 'bat_mitzvah' && o.milestoneType !== 'bar_mitzvah') return undefined;
  return {
    childId: o.childId,
    childName: o.childName,
    milestoneType: o.milestoneType,
    monthsUntil: typeof o.monthsUntil === 'number' ? o.monthsUntil : 0,
    triggeredAt: typeof o.triggeredAt === 'string' ? o.triggeredAt : '',
  };
}

function toProfile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    email: (data.email as string) ?? null,
    displayName: (data.displayName as string) ?? null,
    role: (data.role as AccountRole) ?? 'parent',
    householdId: (data.householdId as string) ?? null,
    familiarityLevel: data.familiarityLevel as FamiliarityLevel | undefined,
    onboardingComplete: Boolean(data.onboardingComplete),
    boxRevealComplete: Boolean(data.boxRevealComplete),
    notificationsOptIn: data.notificationsOptIn as boolean | undefined,
    hiddenHolidays: Array.isArray(data.hiddenHolidays) ? (data.hiddenHolidays as string[]) : [],
    collaborationName: (data.collaborationName as string | undefined) ?? undefined,
    upcomingBeamMilestone: parseUpcomingBeamMilestone(data.upcomingBeamMilestone),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

export const usersService = {
  async get(uid: string): Promise<UserProfile | null> {
    if (!db) return null;
    await ensureAuthTokenReady(uid);
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return toProfile(snap.id, snap.data() as Record<string, unknown>);
  },

  async upsert(
    uid: string,
    data: Partial<Omit<UserProfile, 'uid' | 'createdAt'>> & { email?: string | null; displayName?: string | null }
  ): Promise<UserProfile> {
    if (!db) throw new Error('Firestore not configured');
    await ensureAuthTokenReady(uid);
    const ref = doc(db, 'users', uid);
    const existing = await getDoc(ref);
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      ...data,
      updatedAt: now,
    };
    if (!existing.exists()) {
      payload.createdAt = now;
      payload.role = data.role ?? 'parent';
      payload.onboardingComplete = data.onboardingComplete ?? false;
    }
    await setDoc(ref, payload, { merge: true });
    const snap = await getDoc(ref);
    return toProfile(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },
};
