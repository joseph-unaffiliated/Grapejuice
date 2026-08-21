import type { AgeGroup } from '../../types/pilot';
import { ageGroupForNumericAge } from '../../services/box/boxRules';

export type GiftPath = 'customize' | 'credit_only';

export type GiftGiveFormValues = {
  recipientEmail: string;
  giverName: string;
  message: string;
  giftPath: GiftPath;
};

export type GiftChildDraft = {
  /** Catalog band — derived from plannerAge. */
  ageGroup: AgeGroup;
  /** Exact age for box planners (0–17). Matches onboarding Age chips. */
  plannerAge: number;
};

export const DEFAULT_GIFT_CHILDREN: GiftChildDraft[] = [
  { ageGroup: ageGroupForNumericAge(6), plannerAge: 6 },
];

export function giftChildFromAge(age: number): GiftChildDraft {
  const n = Math.max(0, Math.min(17, Math.floor(age)));
  return {
    ageGroup: ageGroupForNumericAge(Math.min(n, 12)),
    plannerAge: n,
  };
}

export function giftChildrenToProfiles(drafts: GiftChildDraft[]) {
  return drafts.map((d, i) => ({
    id: `gift-child-${i}`,
    ageGroup: d.ageGroup,
    plannerAge: d.plannerAge,
  }));
}
