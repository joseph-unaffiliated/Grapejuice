import type { AgeGroup, ShippingAddress } from '../../types/pilot';
import { ageGroupForNumericAge } from '../../services/box/boxRules';

export type GiftPath = 'customize' | 'credit_only';

export type GiftGiveFormValues = {
  recipientEmail: string;
  giverName: string;
  /** Signed-out givers only: receipt address, and the account the gift is filed under. */
  giverEmail?: string;
  message: string;
  /** Starts on the curated box (or credit once boxes have locked). */
  giftPath: GiftPath | null;
  /** Curated box only, optional: lets the recipient keep it a surprise without entering an address. */
  shippingAddress?: ShippingAddress;
  /** Credit only: kids in their family, so the credit covers a box for all of them. */
  creditKids?: number;
  /** Optional label for their household, shown on the box and the note preview. */
  familyName?: string;
  /** Adults in their household. Dreidels and gelt are one per person. Defaults to 1. */
  giftAdults?: number;
};

export const MAX_GIFT_CREDIT_KIDS = 8;

/**
 * Web gift flow, one screen per step (`/gift/give?step=`). The curated box editor sits
 * between `email` and `note` on its own route (`/gift/customize`).
 */
export type GiftStep = 'type' | 'kids' | 'email' | 'note' | 'send' | 'pay';

export const GIFT_STEPS: readonly GiftStep[] = ['type', 'kids', 'email', 'note', 'send', 'pay'];

export function parseGiftStep(raw: unknown): GiftStep | undefined {
  return typeof raw === 'string' && (GIFT_STEPS as readonly string[]).includes(raw)
    ? (raw as GiftStep)
    : undefined;
}

/** True once the giver has typed anything into the optional address. */
export function hasGiverAddress(address: ShippingAddress | undefined): address is ShippingAddress {
  if (!address) return false;
  return [address.name, address.line1, address.line2, address.city, address.stateProvince, address.postalCode].some(
    (v) => Boolean(v?.trim())
  );
}

export type GiftChildDraft = {
  /** Catalog band — derived from plannerAge. */
  ageGroup: AgeGroup;
  /** Exact age for box planners (0–17). Matches onboarding Age chips. */
  plannerAge: number;
  /** Phone: the giver picked "Not sure" (we plan for the default age). */
  ageUnsure?: boolean;
  /** Optional. The box says "a gift for Maya" when it's set. */
  name?: string;
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
  return drafts.map((d, i) => {
    const name = d.name?.trim();
    return {
      id: `gift-child-${i}`,
      ageGroup: d.ageGroup,
      plannerAge: d.plannerAge,
      ...(name ? { name } : {}),
    };
  });
}

/** What purchasePilotGift stores. Names are optional; ages always go. */
export function giftChildrenForServer(drafts: GiftChildDraft[]) {
  return drafts.map((d) => {
    const name = d.name?.trim().slice(0, 40);
    return {
      ageGroup: d.ageGroup,
      plannerAge: d.plannerAge,
      ...(name ? { name } : {}),
    };
  });
}
