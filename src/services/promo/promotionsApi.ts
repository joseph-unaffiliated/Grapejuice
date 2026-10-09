import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

/** Callables in functions/src/promotions.ts. Admin calls are rejected server-side for non-admins. */

function callable<Req, Res>(name: string) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable<Req, Res>(functions, name);
}

export async function awardDebriefCredit(): Promise<{ awardedCents: number }> {
  const { data } = await callable<Record<string, never>, { awardedCents: number }>('awardDebriefCredit')({});
  return data;
}

export type InfluencerPurchase = { date: string; kind: string; netCents: number; commissionCents: number };

export type InfluencerStatsView = {
  slug: string;
  name: string;
  link: string;
  active: boolean;
  discountLabel: string;
  commissionPercent: number;
  purchases: number;
  salesCents: number;
  earningsCents: number;
  paidOutCents: number;
  owedCents: number;
  recent: InfluencerPurchase[];
};

export async function getMyInfluencerStats(): Promise<InfluencerStatsView[]> {
  const { data } = await callable<Record<string, never>, { influencers: InfluencerStatsView[] }>(
    'getMyInfluencerStats'
  )({});
  return data.influencers ?? [];
}

// ---------------------------------------------------------------------------
// Admin (Account → Boxes and gifts → Discounts / Credit / Influencers)
// ---------------------------------------------------------------------------

export type AdminDiscountCode = {
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  label: string;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  onePerAccount: boolean;
  active: boolean;
  note: string | null;
  status: string;
  used: number;
  pending: number;
  remaining: number | null;
  discountGivenCents: number;
  salesCents: number;
  createdAt: string;
  createdByEmail: string;
};

export type SaveDiscountCodeInput = {
  isNew: boolean;
  generate?: boolean;
  code?: string;
  percentOff?: number | null;
  amountOffCents?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  onePerAccount?: boolean;
  active?: boolean;
  note?: string | null;
};

export type AdminCreditGrant = {
  id: string;
  email: string;
  amountCents: number;
  note: string | null;
  createdAt: string;
  grantedByEmail: string;
  accountCreated: boolean;
  status: 'unused' | 'partly used' | 'used' | 'revoked';
  usedCents: number;
  revokedAt: string | null;
};

export type AdminInfluencerPayout = {
  id: string;
  amountCents: number;
  note: string | null;
  paidAt: string;
  recordedByEmail: string;
};

export type AdminInfluencer = InfluencerStatsView & {
  email: string;
  percentOff: number | null;
  amountOffCents: number | null;
  note: string | null;
  accountCreated: boolean;
  visitCount: number;
  uniqueVisitorCount: number;
  createdAt: string;
  payouts: AdminInfluencerPayout[];
};

export type SaveInfluencerInput = {
  isNew: boolean;
  slug: string;
  name: string;
  email: string;
  percentOff?: number | null;
  amountOffCents?: number | null;
  commissionPercent: number;
  active: boolean;
  note?: string | null;
};

async function admin<Res>(payload: Record<string, unknown>): Promise<Res> {
  const { data } = await callable<Record<string, unknown>, Res>('adminPromotions')(payload);
  return data;
}

export const adminPromotions = {
  listCodes: () => admin<{ codes: AdminDiscountCode[] }>({ action: 'listCodes' }).then((d) => d.codes),
  saveCode: (input: SaveDiscountCodeInput) => admin<{ code: string }>({ action: 'saveCode', ...input }),
  listCredits: () => admin<{ grants: AdminCreditGrant[] }>({ action: 'listCredits' }).then((d) => d.grants),
  grantCredit: (input: { email: string; amountCents: number; note?: string; name?: string }) =>
    admin<{ id: string; accountCreated: boolean }>({ action: 'grantCredit', ...input }),
  revokeCredit: (grantId: string) => admin<{ ok: true }>({ action: 'revokeCredit', grantId }),
  listInfluencers: () =>
    admin<{ influencers: AdminInfluencer[] }>({ action: 'listInfluencers' }).then((d) => d.influencers),
  saveInfluencer: (input: SaveInfluencerInput) =>
    admin<{ slug: string; link: string; accountCreated: boolean }>({ action: 'saveInfluencer', ...input }),
  recordPayout: (input: { slug: string; amountCents: number; note?: string; paidAt?: string }) =>
    admin<{ id: string }>({ action: 'recordPayout', ...input }),
  deletePayout: (payoutId: string) => admin<{ ok: true }>({ action: 'deletePayout', payoutId }),
};
