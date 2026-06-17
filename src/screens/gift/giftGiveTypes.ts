import type { AgeGroup } from '../../types/pilot';

export type GiftPath = 'customize' | 'credit_only';

export type GiftGiveFormValues = {
  recipientEmail: string;
  giverName: string;
  message: string;
  giftPath: GiftPath;
};

export type GiftChildDraft = {
  ageGroup: AgeGroup;
};

export const DEFAULT_GIFT_CHILDREN: GiftChildDraft[] = [{ ageGroup: '6-8' }];

export function giftChildrenToProfiles(drafts: GiftChildDraft[]) {
  return drafts.map((d, i) => ({
    id: `gift-child-${i}`,
    ageGroup: d.ageGroup,
  }));
}
