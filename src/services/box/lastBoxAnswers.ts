import {
  childProfilesToDrafts,
  normalizeFamilyDraft,
  type ChildDraft,
} from '../../components/family/familyDraft';
import {
  familiarityLevelToScore,
  useGuestSessionStore,
} from '../../stores/guestSessionStore';
import { childrenService } from '../firestore/children';
import { usersService } from '../firestore/users';
import type { LastBoxAnswers, UserProfile } from '../../types/pilot';

/** Firestore rejects nested `undefined` — JSON round-trip drops those keys. */
function firestoreSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Snapshot the questionnaire answers onto `users/{uid}.lastBoxAnswers`.
 * Reads the guest store (the onboarding flow's working copy); `overrides` win.
 * `onlyOverrides` writes just the given fields (e.g. family edits from Account, where the
 * store's slider / notes may be untouched defaults).
 * Skips when there is no family yet so a blank store never clobbers a good snapshot.
 * setDoc merge keeps sub-fields not included here.
 */
export async function saveLastBoxAnswers(
  uid: string | null | undefined,
  overrides: Partial<Omit<LastBoxAnswers, 'savedAt'>> = {},
  opts: { onlyOverrides?: boolean } = {}
): Promise<void> {
  if (!uid) return;
  const s = useGuestSessionStore.getState();
  const fromStore: LastBoxAnswers = opts.onlyOverrides
    ? {}
    : {
        childDrafts: s.childDrafts as unknown as LastBoxAnswers['childDrafts'],
        childInterests: s.childInterests,
        familiarityScore: s.familiarityScore,
        familiarityLevel: s.familiarityLevel,
        practiceFrequencyScore: s.practiceFrequencyScore,
        ravNotes: s.ravNotes,
      };
  const snapshot: LastBoxAnswers = {
    ...fromStore,
    ...overrides,
    savedAt: new Date().toISOString(),
  };
  if (!snapshot.childDrafts?.length) return;
  try {
    await usersService.upsert(uid, { lastBoxAnswers: firestoreSafe(snapshot) });
  } catch (e) {
    console.warn('[box] failed to save last box answers', e);
  }
}

/**
 * Prefill the onboarding questionnaire for a signed-in parent whose local store is empty
 * (e.g. new device, or the store was wiped at sign-in). Prefers the last snapshot,
 * then saved kids + profile fields. Returns true when the guest store was seeded.
 */
export async function seedOnboardingFromAccount(
  uid: string,
  profile: UserProfile | null | undefined,
  displayName?: string | null
): Promise<boolean> {
  const store = useGuestSessionStore.getState();
  if (store.childDrafts.length) return false;

  const last = profile?.lastBoxAnswers;
  if (last?.childDrafts?.length) {
    const drafts = (last.childDrafts as unknown as ChildDraft[]).map(normalizeFamilyDraft);
    const score =
      typeof last.familiarityScore === 'number'
        ? last.familiarityScore
        : last.familiarityLevel
          ? familiarityLevelToScore(last.familiarityLevel)
          : undefined;
    store.setChildDrafts(drafts);
    if (last.childInterests) store.setChildInterests(last.childInterests);
    if (typeof score === 'number') store.setFamiliarityScore(score);
    if (typeof last.practiceFrequencyScore === 'number') {
      store.setPracticeFrequencyScore(last.practiceFrequencyScore);
    }
    if (typeof last.ravNotes === 'string') store.setRavNotes(last.ravNotes);
    return true;
  }

  let kids: Awaited<ReturnType<typeof childrenService.list>> = [];
  try {
    kids = await childrenService.list(uid);
  } catch (e) {
    console.warn('[box] could not load saved kids for onboarding prefill', e);
  }
  if (!kids.length && !profile?.familiarityLevel && !profile?.ravNotes) return false;
  // Re-check: the user may have started typing while kids loaded.
  if (useGuestSessionStore.getState().childDrafts.length) return false;

  if (kids.length) store.setChildDrafts(childProfilesToDrafts(kids, [], displayName));
  if (profile?.familiarityLevel) {
    store.setFamiliarityScore(familiarityLevelToScore(profile.familiarityLevel));
  }
  if (profile?.ravNotes) store.setRavNotes(profile.ravNotes);
  return true;
}
