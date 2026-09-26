import type { AgeGroup } from '../../types/pilot';
import type { ChildInterestId } from '../../constants/childInterests';
import { ageGroupForNumericAge } from '../../services/box/boxRules';
import { firstNameFromDisplayName } from '../../utils/personName';

export type FamilyMemberRole = 'kid' | 'adult';

/** @deprecated Prefer plannerAge — kept for legacy guest drafts. */
export type FamilyAgeBand = '0-12' | '13-17' | '18+';

const LEGACY_BAND_AGE: Record<FamilyAgeBand, number> = {
  '0-12': 6,
  '13-17': 15,
  '18+': 18,
};

export type ChildDraft = {
  name: string;
  /** Defaults to kid when missing (legacy guest drafts). */
  role?: FamilyMemberRole;
  /** @deprecated Prefer plannerAge. */
  ageBand?: FamilyAgeBand;
  /** Mapped band for catalog / persistence. */
  ageGroup: AgeGroup;
  /** ISO date YYYY-MM-DD (optional — enables Beam age trigger). */
  birthdate?: string;
  /**
   * Exact age for box planners / Age chips (0–17). Use 18 for 18+.
   * See ChildProfile.plannerAge.
   */
  plannerAge?: number;
  /** Kid interest tags from What We Do. */
  interests?: ChildInterestId[];
  /** Free-text interests from the Other chip. */
  customInterests?: string[];
};

function profileForAge(age: number): { ageGroup: AgeGroup; plannerAge: number } {
  const n = Math.max(0, Math.floor(age));
  return {
    ageGroup: ageGroupForNumericAge(Math.min(n, 12)),
    plannerAge: n,
  };
}

export function makeAdultDraft(name = ''): ChildDraft {
  return { name, role: 'adult', ageGroup: '9-12' };
}

export function makeKidDraft(name = '', age = 5): ChildDraft {
  const mapped = profileForAge(age);
  return {
    name,
    role: 'kid',
    ageGroup: mapped.ageGroup,
    plannerAge: mapped.plannerAge,
  };
}

/** Normalize legacy drafts (no role / fine age bands) for the new form. */
export function normalizeFamilyDraft(d: ChildDraft): ChildDraft {
  if (d.role === 'adult') {
    return { ...d, role: 'adult', ageBand: undefined, plannerAge: undefined };
  }
  if (typeof d.plannerAge === 'number' && Number.isFinite(d.plannerAge)) {
    const mapped = profileForAge(d.plannerAge);
    return {
      ...d,
      role: 'kid',
      ageBand: d.ageBand,
      ageGroup: mapped.ageGroup,
      plannerAge: mapped.plannerAge,
    };
  }
  if (d.ageBand && d.ageBand in LEGACY_BAND_AGE) {
    return makeKidDraft(d.name, LEGACY_BAND_AGE[d.ageBand]);
  }
  const kid = makeKidDraft(d.name, 5);
  return {
    ...kid,
    name: d.name,
    birthdate: d.birthdate,
    ageGroup: d.ageGroup || kid.ageGroup,
  };
}

export function ensureAdultLead(members: ChildDraft[], defaultName?: string): ChildDraft[] {
  const adultName = firstNameFromDisplayName(defaultName) || 'Joseph';
  const normalized = members.map(normalizeFamilyDraft);
  if (normalized[0]?.role === 'adult') {
    if (!normalized[0].name.trim()) {
      return [{ ...normalized[0], name: adultName }, ...normalized.slice(1)];
    }
    return normalized;
  }
  return [makeAdultDraft(adultName), ...normalized];
}

export function defaultFamilyMembers(defaultName?: string): ChildDraft[] {
  const adultName = firstNameFromDisplayName(defaultName) || 'Joseph';
  return [makeAdultDraft(adultName), makeKidDraft('Sam', 5)];
}

export function familyMembersComplete(members: ChildDraft[]): boolean {
  return members.every((m) => m.name.trim().length > 0);
}

/** Stable fingerprint for dirty-checking family edits. */
export function familyMembersFingerprint(members: ChildDraft[]): string {
  return members
    .map((m) =>
      [
        m.role ?? 'kid',
        m.name.trim(),
        m.ageGroup,
        m.plannerAge ?? '',
        m.ageBand ?? '',
        m.birthdate ?? '',
      ].join(':')
    )
    .join('|');
}
