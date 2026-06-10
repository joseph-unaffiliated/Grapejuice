import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

import { DEFAULT_BOX_PRICE_CENTS } from '../box/pricing';

export type HanukkahConfig = {
  lockAt: string | null;
  estimatedDeliveryBy: string | null;
  startsOn: string | null;
  boxPriceCents: number;
};

export async function getHanukkahConfig(): Promise<HanukkahConfig> {
  if (!db) {
    return { lockAt: null, estimatedDeliveryBy: null, startsOn: null, boxPriceCents: DEFAULT_BOX_PRICE_CENTS };
  }
  const snap = await getDoc(doc(db, 'config', 'hanukkah-2026'));
  const d = snap.data() ?? {};
  return {
    lockAt: (d.lockAt as string) ?? null,
    estimatedDeliveryBy: (d.estimatedDeliveryBy as string) ?? null,
    startsOn: (d.startsOn as string) ?? null,
    boxPriceCents: typeof d.boxPriceCents === 'number' ? d.boxPriceCents : DEFAULT_BOX_PRICE_CENTS,
  };
}

export function isBoxLocked(lockAt: string | null): boolean {
  if (!lockAt) return false;
  return Date.now() >= new Date(lockAt).getTime();
}

export type PassoverWaitlistConfig = {
  capacityPercent: number;
  active: boolean;
};

const DEFAULT_PASSOVER_CAPACITY = 39;

export async function getPassoverWaitlistConfig(): Promise<PassoverWaitlistConfig> {
  if (!db) {
    return { capacityPercent: DEFAULT_PASSOVER_CAPACITY, active: true };
  }
  const snap = await getDoc(doc(db, 'config', 'passover-2027-waitlist'));
  const d = snap.data() ?? {};
  const raw =
    typeof d.capacityPercent === 'number'
      ? d.capacityPercent
      : typeof d.filledPercent === 'number'
        ? d.filledPercent
        : DEFAULT_PASSOVER_CAPACITY;
  return {
    capacityPercent: Math.min(100, Math.max(0, Math.round(raw))),
    active: d.active !== false,
  };
}
