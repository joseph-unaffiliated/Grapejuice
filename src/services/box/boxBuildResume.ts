import type { ChildDraft } from '../../components/family/familyDraft';
import type { BoxLineItem } from '../../types/pilot';

type ResumeStep = 'family' | 'details' | 'email' | 'building' | 'reveal';

const KEY = 'gj-box-build-resume';

/** Answers and the built box, kept in sessionStorage so a remount can resume. */
export type BoxBuildResume = {
  step: ResumeStep;
  childDrafts: ChildDraft[];
  childInterests: string[];
  familiarityScore: number;
  practiceFrequencyScore: number;
  ravNotes: string;
  lineItems: BoxLineItem[];
  /**
   * Draft is written (or being written) and we are leaving for My Box.
   * While this is set, auth must not wipe the guest box, and the root gate
   * must not reopen the questionnaire.
   */
  handingOff: boolean;
  householdId?: string | null;
  savedAt: number;
};

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function readBoxBuildResume(): BoxBuildResume | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<BoxBuildResume>;
    if (!data || typeof data !== 'object') return null;
    const step = data.step;
    if (step !== 'family' && step !== 'details' && step !== 'email' && step !== 'building' && step !== 'reveal') {
      return null;
    }
    return {
      step,
      childDrafts: Array.isArray(data.childDrafts) ? data.childDrafts : [],
      childInterests: Array.isArray(data.childInterests) ? data.childInterests.filter((x) => typeof x === 'string') : [],
      familiarityScore: typeof data.familiarityScore === 'number' ? data.familiarityScore : 50,
      practiceFrequencyScore: typeof data.practiceFrequencyScore === 'number' ? data.practiceFrequencyScore : 50,
      ravNotes: typeof data.ravNotes === 'string' ? data.ravNotes : '',
      lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
      handingOff: data.handingOff === true,
      householdId: typeof data.householdId === 'string' ? data.householdId : null,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeBoxBuildResume(data: BoxBuildResume): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — the guest store still has the answers */
  }
}

export function clearBoxBuildResume(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** A reveal is in flight or just finished and the gate must not reopen step 1. */
export function boxRevealHandoffActive(): boolean {
  return readBoxBuildResume()?.handingOff === true;
}
