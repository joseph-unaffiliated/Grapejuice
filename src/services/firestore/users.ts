import { doc, getDoc, setDoc, type DocumentSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type {
  AccountRole,
  FamiliarityLevel,
  LastBoxAnswers,
  UpcomingBeamMilestone,
  UserProfile,
} from '../../types/pilot';
import { ensureAuthTokenReady } from './token';
import { attributionForServer } from '../analytics/metaPixel';
import { trackRegistration } from '../analytics/metaServerEvents';

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

function parseLastBoxAnswers(value: unknown): LastBoxAnswers | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  const level = o.familiarityLevel;
  return {
    childDrafts: Array.isArray(o.childDrafts)
      ? (o.childDrafts.filter((d) => d && typeof d === 'object') as Array<Record<string, unknown>>)
      : undefined,
    childInterests: Array.isArray(o.childInterests)
      ? o.childInterests.filter((i): i is string => typeof i === 'string')
      : undefined,
    familiarityScore: typeof o.familiarityScore === 'number' ? o.familiarityScore : undefined,
    familiarityLevel:
      level === 'minimal' || level === 'moderate' || level === 'all-in' ? level : undefined,
    ravNotes: typeof o.ravNotes === 'string' ? o.ravNotes : undefined,
    savedAt: typeof o.savedAt === 'string' ? o.savedAt : undefined,
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
    ravNotes: typeof data.ravNotes === 'string' ? data.ravNotes : undefined,
    onboardingComplete: Boolean(data.onboardingComplete),
    boxRevealComplete: Boolean(data.boxRevealComplete),
    notificationsOptIn: data.notificationsOptIn as boolean | undefined,
    storefrontInterests: Array.isArray(data.storefrontInterests)
      ? (data.storefrontInterests as string[])
      : undefined,
    hiddenHolidays: Array.isArray(data.hiddenHolidays) ? (data.hiddenHolidays as string[]) : [],
    collaborationName: (data.collaborationName as string | undefined) ?? undefined,
    upcomingBeamMilestone: parseUpcomingBeamMilestone(data.upcomingBeamMilestone),
    lastBoxAnswers: parseLastBoxAnswers(data.lastBoxAnswers),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

/** Firestore rejects `undefined` anywhere in a document — drop those keys. */
function omitUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/** Server-side merges (ipGeo, householdId) can create users/{uid} before the profile exists. */
function hasProfile(snap: DocumentSnapshot): boolean {
  if (!snap.exists()) return false;
  const d = snap.data();
  return Boolean(d.createdAt || d.role) || d.onboardingComplete !== undefined;
}

export const usersService = {
  async get(uid: string): Promise<UserProfile | null> {
    if (!db) return null;
    await ensureAuthTokenReady(uid);
    const snap = await getDoc(doc(db, 'users', uid));
    if (!hasProfile(snap)) return null;
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
    const payload: Record<string, unknown> = omitUndefined({
      ...data,
      updatedAt: now,
    });
    const isNewProfile = !hasProfile(existing);
    if (isNewProfile) {
      payload.createdAt = now;
      payload.role = data.role ?? 'parent';
      payload.onboardingComplete = data.onboardingComplete ?? false;
      const attribution = attributionForServer();
      // JSON round-trip drops undefined utm keys (Firestore rejects undefined).
      if (attribution) payload.attribution = JSON.parse(JSON.stringify(attribution));
    }
    await setDoc(ref, payload, { merge: true });
    if (isNewProfile) trackRegistration(uid);
    const snap = await getDoc(ref);
    return toProfile(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },
};
